// Coordenador: mantém a fila de blocos, entrega sob demanda, reatribui quando
// alguém some (lease) e junta os resultados. É o "Host (A)" do slide.
const { buildTiles, buildParams } = require('./job');

const PREFETCH = 2;          // blocos em andamento por thread (esconde a latência da rede)
const LEASE_BASE_MS = Number(process.env.MUTIRAO_LEASE_MS) || 5000; // prazo para um bloco voltar antes de ser reatribuído
const STALL_MS = 5000;       // quem estourou um prazo fica de fora por este tempo

function label(index) {
  let s = '', i = index + 1;
  while (i > 0) { i--; s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26); }
  return s;
}

function deviceType(ua = '') {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android' : 'Android (tablet)';
  if (/HeadlessChrome/i.test(ua)) return 'Bot';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Outro';
}

function fnv1a(hash, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

class Coordinator {
  constructor(io) {
    this.io = io;
    this.clients = new Map();   // socket.id -> cliente
    this.keyIndex = new Map();  // chave persistente do aparelho -> índice (letra)
    this.nextIndex = 1;         // 0 é sempre o host (A)
    this.job = null;
    this.runs = [];
    this.rosterTimer = null;
    this.stateTimer = null;
    setInterval(() => this.checkLeases(), 500);
  }

  // ---------- clientes ----------
  hello(socket, msg = {}) {
    let role = msg.role === 'host' ? 'host' : 'vol';
    const key = String(msg.key || socket.id).slice(0, 64);
    let index;
    if (role === 'host') {
      index = 0;
      // Só existe um painel principal. Um painel novo NÃO toma o lugar de quem já
      // está no controle (antes, abrir o link principal em outro aparelho roubava o
      // host e a rodada "sozinho" travava). Exceção: o mesmo navegador reconectando.
      const current = this.host();
      if (current && current.sid !== socket.id && current.key !== key && !msg.claim) role = 'standby';
      else if (current && current.sid !== socket.id) this.demote(current);
    } else {
      if (!this.keyIndex.has(key)) this.keyIndex.set(key, this.nextIndex++);
      index = this.keyIndex.get(key);
    }
    const prev = this.clients.get(socket.id);
    const c = {
      sid: socket.id, key, role, index, label: label(index),
      name: String(msg.name || '').trim().slice(0, 24),
      type: deviceType(msg.ua || socket.handshake.headers['user-agent']),
      threads: role === 'vol' ? Math.max(1, Math.min(16, msg.threads | 0 || 1)) : 1,
      active: role === 'vol' ? !!msg.active : true,
      inflight: new Set(), stalledUntil: 0,
      totalTiles: prev ? prev.totalTiles : 0,
      joinedAt: Date.now(),
    };
    if (role === 'vol' && c.name.length < 2) c.name = 'Voluntário ' + c.label;
    this.clients.set(socket.id, c);
    socket.join(role === 'vol' ? 'vol' : 'dash');
    socket.emit('welcome', { role, index, label: c.label, threads: c.threads });
    if (role !== 'vol') this.sendSnapshot(socket);
    this.sendJobTo(socket, c);
    this.roster();
    this.dispatch();
  }

  host() {
    for (const c of this.clients.values()) if (c.role === 'host') return c;
    return null;
  }

  demote(c) {
    c.role = 'standby';
    this.requeueAll(c);
    this.io.to(c.sid).emit('role', { role: 'standby' });
  }

  promote(c) {
    c.role = 'host';
    c.stalledUntil = 0;
    this.io.to(c.sid).emit('role', { role: 'host' });
    this.roster();
    this.dispatch();
  }

  // Um painel em espera pede para virar o principal (botão "Assumir").
  claim(sid) {
    const c = this.clients.get(sid);
    if (!c || c.role !== 'standby') return;
    const current = this.host();
    if (current) this.demote(current);
    this.promote(c);
  }

  viewer(socket) {
    socket.join('dash');
    this.sendSnapshot(socket);
  }

  setActive(sid, active) {
    const c = this.clients.get(sid);
    if (!c) return;
    c.active = !!active;
    if (!c.active) this.requeueAll(c);
    else c.stalledUntil = 0;
    this.roster();
    this.dispatch();
  }

  setName(sid, name) {
    const c = this.clients.get(sid);
    if (c) { c.name = String(name || '').trim().slice(0, 24); this.roster(); }
  }

  disconnect(sid) {
    const c = this.clients.get(sid);
    if (!c) return;
    this.requeueAll(c);
    this.clients.delete(sid);
    if (c.role === 'host') {
      const next = [...this.clients.values()].filter(x => x.role === 'standby').sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) this.promote(next);
    }
    this.roster();
    this.dispatch();
  }

  requeueAll(c) {
    const j = this.job;
    if (j && !j.finishedAt) {
      for (const id of c.inflight) {
        if (!j.done[id]) { j.queue.unshift(id); j.assigned.delete(id); j.reassigned++; }
      }
    }
    c.inflight.clear();
  }

  // ---------- trabalho ----------
  start({ mode, load, tileMs }) {
    this.cancel();
    const tiles = buildTiles();
    const params = buildParams(load === 'real' ? 'real' : 'calibrada',
      Math.max(20, Math.min(1000, Number(tileMs) || 150)));
    this.job = {
      id: Date.now().toString(36),
      mode: mode === 'mutirao' ? 'mutirao' : 'sozinho',
      params, tiles,
      queue: tiles.map(t => t.i),
      assigned: new Map(),
      done: new Array(tiles.length).fill(null),
      data: new Array(tiles.length).fill(null),
      doneCount: 0, reassigned: 0,
      startedAt: Date.now(), finishedAt: 0,
      participants: new Map(),
    };
    for (const c of this.clients.values()) { c.inflight.clear(); c.stalledUntil = 0; }
    const j = this.job;
    this.io.emit('job', this.jobInfo());
    this.roster();
    this.dispatch();
    return j.id;
  }

  cancel() {
    if (this.job && !this.job.finishedAt) this.io.emit('cancel', { jobId: this.job.id });
    for (const c of this.clients.values()) c.inflight.clear();
  }

  reset() {
    this.cancel();
    this.job = null;
    this.io.emit('job', null);
    this.roster();
  }

  jobInfo() {
    const j = this.job;
    if (!j) return null;
    return {
      id: j.id, mode: j.mode, params: j.params, n: j.tiles.length,
      doneCount: j.doneCount, startedAt: j.startedAt, finishedAt: j.finishedAt,
      serverNow: Date.now(),
    };
  }

  eligible(c, now) {
    const j = this.job;
    if (!j || j.finishedAt || !c.active || c.role === 'viewer' || c.role === 'standby') return false;
    if (c.stalledUntil > now) return false;
    return j.mode === 'mutirao' || c.role === 'host';
  }

  dispatch() {
    const j = this.job;
    if (!j || j.finishedAt) return;
    const now = Date.now();
    const list = [...this.clients.values()].filter(c => this.eligible(c, now));
    const batches = new Map();
    // distribui um bloco por vez, em rodízio, até encher a capacidade de cada um
    let progress = true;
    while (j.queue.length && progress) {
      progress = false;
      for (const c of list) {
        if (!j.queue.length) break;
        if (c.inflight.size >= c.threads * PREFETCH) continue;
        let id;
        do { id = j.queue.shift(); } while (id !== undefined && j.done[id]);
        if (id === undefined) break;
        c.inflight.add(id);
        j.assigned.set(id, { sid: c.sid, at: now });
        if (!batches.has(c.sid)) batches.set(c.sid, []);
        batches.get(c.sid).push(j.tiles[id]);
        progress = true;
      }
    }
    for (const [sid, tiles] of batches) this.io.to(sid).emit('tasks', { jobId: j.id, tiles });
  }

  result(sid, msg) {
    const j = this.job;
    const c = this.clients.get(sid);
    if (!j || !c || !msg || msg.jobId !== j.id) return;
    const id = msg.i | 0;
    c.inflight.delete(id);
    c.stalledUntil = 0;
    const a = j.assigned.get(id);
    if (a && a.sid === sid) j.assigned.delete(id);
    if (id < 0 || id >= j.tiles.length || j.done[id] || j.finishedAt) { this.dispatch(); return; }
    const t = j.tiles[id];
    const buf = Buffer.isBuffer(msg.data) ? msg.data : Buffer.from(msg.data || []);
    if (buf.length !== t.w * t.h * 2) { this.dispatch(); return; }

    const end = Date.now() - j.startedAt;
    const ms = Math.max(0, Math.min(60000, Number(msg.ms) || 0));
    j.done[id] = { index: c.index, label: c.label, start: Math.max(0, end - ms), end, ms };
    j.data[id] = buf;
    j.doneCount++;
    c.totalTiles++;
    let p = j.participants.get(c.index);
    if (!p) {
      p = { index: c.index, label: c.label, name: c.name, type: c.type, threads: c.threads, tiles: 0, computeMs: 0 };
      j.participants.set(c.index, p);
    }
    p.tiles++; p.computeMs += ms; p.name = c.name; p.threads = c.threads;

    this.io.to('dash').emit('tile', { jobId: j.id, i: id, index: c.index, label: c.label, start: j.done[id].start, end, data: buf });
    this.io.to(sid).emit('ack', { i: id, tiles: p.tiles, total: c.totalTiles });

    if (j.doneCount === j.tiles.length) this.finish();
    else { this.dispatch(); this.jobState(); this.roster(); }
  }

  checkLeases() {
    const j = this.job;
    if (!j || j.finishedAt) return;
    const now = Date.now();
    const lease = Number(process.env.MUTIRAO_LEASE_TOTAL_MS) || (LEASE_BASE_MS + j.params.tileMs * PREFETCH * 2);
    let changed = false;
    for (const [id, a] of j.assigned) {
      if (now - a.at < lease || j.done[id]) continue;
      j.assigned.delete(id);
      const c = this.clients.get(a.sid);
      if (c) { c.inflight.delete(id); if (c.role === 'vol') c.stalledUntil = now + STALL_MS; }
      j.queue.unshift(id);
      j.reassigned++;
      changed = true;
    }
    if (changed) this.roster();
    this.dispatch();
  }

  finish() {
    const j = this.job;
    j.finishedAt = Date.now();
    let h = 0x811c9dc5;
    for (const d of j.data) h = fnv1a(h, d);
    const parts = [...j.participants.values()].sort((a, b) => b.tiles - a.tiles);
    const run = {
      id: j.id,
      mode: j.mode,
      load: j.params.load,
      tileMs: j.params.tileMs,
      at: new Date(j.startedAt).toISOString(),
      durationMs: j.finishedAt - j.startedAt,
      tiles: j.tiles.length,
      devices: parts.length,
      threads: parts.reduce((s, p) => s + p.threads, 0),
      computeMs: parts.reduce((s, p) => s + p.computeMs, 0),
      reassigned: j.reassigned,
      hash: h.toString(16).padStart(8, '0'),
      perDevice: parts,
    };
    this.runs.push(run);
    if (this.runs.length > 200) this.runs.shift();
    this.io.emit('jobDone', run);
    this.jobState(true);
    this.roster();
  }

  // ---------- difusão de estado ----------
  sendSnapshot(socket) {
    socket.emit('runs', this.runs);
    const j = this.job;
    if (!j) return;
    socket.emit('job', this.jobInfo());
    for (let i = 0; i < j.tiles.length; i++) {
      const d = j.done[i];
      if (d) socket.emit('tile', { jobId: j.id, i, index: d.index, label: d.label, start: d.start, end: d.end, data: j.data[i] });
    }
    if (j.finishedAt) socket.emit('jobDone', this.runs.find(r => r.id === j.id));
  }

  sendJobTo(socket, c) {
    if (this.job) socket.emit('job', this.jobInfo());
  }

  jobState(now) {
    if (this.stateTimer && !now) return;
    const send = () => {
      this.stateTimer = null;
      const j = this.job;
      this.io.to('vol').emit('state', j ? {
        id: j.id, mode: j.mode, n: j.tiles.length, doneCount: j.doneCount, finished: !!j.finishedAt,
      } : null);
    };
    if (now) { clearTimeout(this.stateTimer); send(); }
    else this.stateTimer = setTimeout(send, 300);
  }

  roster() {
    if (this.rosterTimer) return;
    this.rosterTimer = setTimeout(() => {
      this.rosterTimer = null;
      const j = this.job;
      const list = [...this.clients.values()]
        .filter(c => c.role === 'host' || c.role === 'vol')
        .map(c => {
          const p = j && j.participants.get(c.index);
          return {
            index: c.index, label: c.label, name: c.name, type: c.type, role: c.role,
            threads: c.threads, active: c.active, stalled: c.stalledUntil > Date.now(),
            jobTiles: p ? p.tiles : 0, totalTiles: c.totalTiles,
          };
        })
        .sort((a, b) => a.index - b.index);
      const vols = list.filter(c => c.role === 'vol');
      this.io.to('dash').emit('roster', {
        clients: list,
        volunteers: vols.length,
        activeVolunteers: vols.filter(c => c.active).length,
        threads: vols.filter(c => c.active).reduce((s, c) => s + c.threads, 0),
      });
      this.io.to('vol').emit('count', { volunteers: vols.filter(c => c.active).length });
    }, 200);
  }
}

module.exports = { Coordinator, label };
