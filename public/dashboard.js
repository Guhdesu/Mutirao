// Painel do projetor. Também é o "Host (A)": calcula blocos com 1 thread,
// como um processador central sequencial.
const $ = (id) => document.getElementById(id);
const isViewer = new URLSearchParams(location.search).has('view');
if (isViewer) document.body.classList.add('viewer');

const socket = io({ transports: ['websocket', 'polling'] });
const pool = isViewer ? null : new WorkerPool(socket, 1);

const W = 1600, H = 900;
const cv = $('img'), ctx = cv.getContext('2d');
const off = document.createElement('canvas'); off.width = W; off.height = H;
const octx = off.getContext('2d');

let job = null;          // info do trabalho atual
let clockOffset = 0;     // relógio do servidor - relógio local
let owners = [];         // owners[i] = {index, label}
let tilesInfo = [];      // geometria dos blocos
let spans = new Map();   // index -> {label, name, items: [[start,end]]}
let view = 'mix';
let runs = [];
let roster = { clients: [] };
let lastRun = null;

const fmt = (v, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const secs = (ms) => fmt(ms / 1000) + ' s';

// ---------- QR e URL ----------
const joinUrl = location.origin + '/join';
$('joinUrl').textContent = joinUrl.replace(/^https?:\/\//, '');
$('qr').src = '/qr.svg?u=' + encodeURIComponent(joinUrl);
if (/^(localhost|127\.)/.test(location.hostname)) {
  fetch('/api/info').then(r => r.json()).then(info => {
    if (info.lan.length) {
      $('lan').textContent = 'Na rede local: ' + info.lan.join('  ');
      $('qr').src = '/qr.svg?u=' + encodeURIComponent(info.lan[0]);
      $('joinUrl').textContent = info.lan[0].replace(/^https?:\/\//, '');
    }
  }).catch(() => {});
}

// ---------- conexão ----------
socket.on('connect', () => {
  $('conn').textContent = 'conectado';
  if (isViewer) socket.emit('viewer');
  else socket.emit('hello', { role: 'host', ua: navigator.userAgent });
});
socket.on('disconnect', () => { $('conn').textContent = 'desconectado, tentando de novo…'; });
socket.on('role', (m) => {
  if (m.role === 'viewer') {
    document.body.classList.add('viewer');
    $('conn').textContent = 'outro painel assumiu como host';
  }
});

socket.on('runs', (r) => { runs = r || []; renderResults(); });

socket.on('job', (j) => {
  job = j;
  if (!j) { clearImage(); updateHeader(); renderTimeline(); return; }
  clockOffset = j.serverNow - Date.now();
  tilesInfo = buildTiles(j.params);
  owners = new Array(tilesInfo.length).fill(null);
  spans = new Map();
  lastRun = null;
  $('total').textContent = tilesInfo.length;
  clearImage();
  setLoadUI(j.params.load, j.params.tileMs);
  updateHeader();
  renderTimeline();
});

socket.on('tile', (m) => {
  if (!job || m.jobId !== job.id) return;
  const t = tilesInfo[m.i];
  if (!t) return;
  const iters = new Uint16Array(m.data);
  const imgData = octx.createImageData(t.w, t.h);
  colorize(iters, job.params.maxIter, imgData.data);
  octx.putImageData(imgData, t.x, t.y);
  owners[m.i] = { index: m.index, label: m.label };
  if (!spans.has(m.index)) spans.set(m.index, { label: m.label, items: [] });
  spans.get(m.index).items.push([m.start, m.end]);
  drawTile(m.i);
  job.doneCount = owners.filter(Boolean).length;
  scheduleUI();
});

socket.on('jobDone', (run) => {
  if (!run) return;
  if (!runs.find(r => r.id === run.id)) runs.push(run);
  if (job && run.id === job.id) { job.finishedAt = 1; lastRun = run; }
  updateHeader();
  renderResults();
  renderTimeline();
});

socket.on('roster', (r) => { roster = r; renderRoster(); });

// ---------- imagem ----------
function buildTiles(p) {
  const out = [];
  for (let y = 0; y < p.height; y += p.tile)
    for (let x = 0; x < p.width; x += p.tile)
      out.push({ i: out.length, x, y, w: Math.min(p.tile, p.width - x), h: Math.min(p.tile, p.height - y) });
  return out;
}

function clearImage() {
  octx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0A1013';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 50; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
  for (let y = 50; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
  $('trackFill').style.width = '0%';
  $('done').textContent = '0';
}

function drawTile(i) {
  const t = tilesInfo[i], o = owners[i];
  if (!t || !o) return;
  const col = deviceColor(o.index);
  if (view === 'img') {
    ctx.drawImage(off, t.x, t.y, t.w, t.h, t.x, t.y, t.w, t.h);
    return;
  }
  if (view === 'who') {
    ctx.fillStyle = '#0A1013';
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = col;
    ctx.fillRect(t.x + 1, t.y + 1, t.w - 2, t.h - 2);
  } else {
    ctx.drawImage(off, t.x, t.y, t.w, t.h, t.x, t.y, t.w, t.h);
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = col;
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(10,16,19,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(t.x + .5, t.y + .5, t.w - 1, t.h - 1);
  }
  const size = o.label.length > 1 ? 17 : 21;
  ctx.font = `500 ${size}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(10,16,19,0.9)';
  ctx.fillText(o.label, t.x + t.w / 2, t.y + t.h / 2 + 1);
}

function redrawAll() {
  const keep = owners.slice();
  clearImage();
  owners = keep;
  for (let i = 0; i < owners.length; i++) if (owners[i]) drawTile(i);
  updateProgress();
}

document.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => {
  view = r.value;
  redrawAll();
}));

// ---------- controles ----------
function currentLoad() { return document.querySelector('input[name=load]:checked').value; }
function setLoadUI(load, tileMs) {
  document.querySelector(`input[name=load][value=${load}]`).checked = true;
  if (tileMs) {
    if (![...$('tileMs').options].some(o => o.value === String(tileMs))) $('tileMs').add(new Option(tileMs + ' ms', tileMs));
    $('tileMs').value = String(tileMs);
  }
  loadHint();
}
function loadHint() {
  const l = currentLoad();
  $('tileMsRow').style.display = l === 'calibrada' ? '' : 'none';
  const ms = +$('tileMs').value;
  $('loadHint').textContent = l === 'calibrada'
    ? `Carga sintética: cada um dos 576 blocos custa ${ms} ms de CPU em qualquer aparelho. Sozinho ≈ ${fmt(576 * ms / 1000, 0)} s.`
    : 'Carga real: fractal 1600×900 com 16 amostras por pixel. O ganho depende da CPU de cada aparelho.';
  renderResults();
}
document.querySelectorAll('input[name=load]').forEach(r => r.addEventListener('change', loadHint));
$('tileMs').addEventListener('change', loadHint);

function start(mode) {
  socket.emit('start', { mode, load: currentLoad(), tileMs: +$('tileMs').value });
}
$('soloBtn').onclick = () => start('sozinho');
$('mutiraoBtn').onclick = () => start('mutirao');
$('resetBtn').onclick = (e) => { e.preventDefault(); socket.emit('reset'); };

// ---------- números ----------
function elapsed() {
  if (!job) return 0;
  if (job.finishedAt && lastRun) return lastRun.durationMs;
  return Math.max(0, Date.now() + clockOffset - job.startedAt);
}

function updateHeader() {
  const running = job && !job.finishedAt;
  $('modeLabel').textContent = !job ? 'Aguardando'
    : running ? (job.mode === 'mutirao' ? 'Renderizando em mutirão' : 'Renderizando sozinho (host A)')
    : (job.mode === 'mutirao' ? 'Mutirão concluído' : 'Sozinho concluído');
  $('clock').textContent = secs(elapsed());
  $('soloBtn').disabled = $('mutiraoBtn').disabled = false;
}

function updateProgress() {
  const n = tilesInfo.length || 576;
  const d = owners.filter(Boolean).length;
  $('done').textContent = d;
  $('trackFill').style.width = (d / n * 100) + '%';
}

let uiPending = false;
function scheduleUI() {
  if (uiPending) return;
  uiPending = true;
  requestAnimationFrame(() => {
    uiPending = false;
    updateProgress();
    renderTimeline();
    renderLegend();
  });
}

function tick() {
  if (job && !job.finishedAt) $('clock').textContent = secs(elapsed());
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function lastOf(mode, load, tileMs) {
  for (let k = runs.length - 1; k >= 0; k--) {
    const r = runs[k];
    if (r.mode === mode && r.load === load && (load !== 'calibrada' || r.tileMs === tileMs)) return r;
  }
  return null;
}

function renderResults() {
  const load = job ? job.params.load : currentLoad();
  const tileMs = job ? job.params.tileMs : +$('tileMs').value;
  const solo = lastOf('sozinho', load, tileMs), mut = lastOf('mutirao', load, tileMs);
  $('tSolo').textContent = solo ? secs(solo.durationMs) : '—';
  $('tMut').textContent = mut ? secs(mut.durationMs) : '—';
  if (solo && mut) {
    const s = solo.durationMs / mut.durationMs;
    $('speedup').textContent = fmt(s) + '×';
    $('dEff').textContent = fmt(s / Math.max(1, mut.threads) * 100, 0) + '%';
    const same = solo.hash === mut.hash;
    $('dHash').textContent = same ? 'sim · ' + mut.hash : 'não';
    $('dHash').classList.toggle('ok', same);
  } else {
    $('speedup').textContent = '—';
    $('dEff').textContent = '—';
    $('dHash').textContent = '—';
    $('dHash').classList.remove('ok');
  }
  $('dDev').textContent = mut ? `${mut.devices} / ${mut.threads}` : '—';
  $('dRe').textContent = mut ? String(mut.reassigned) : '—';
}

function renderRoster() {
  const vols = roster.clients || [];
  $('nVol').textContent = roster.activeVolunteers || 0;
  $('nThr').textContent = roster.threads || 0;
  const rows = vols.slice().sort((a, b) => (b.jobTiles - a.jobTiles) || (a.index - b.index));
  $('vbody').innerHTML = rows.map(c => `
    <tr class="${c.active && !c.stalled ? '' : 'off'}">
      <td><span class="chip" style="background:${deviceColor(c.index)}">${c.label}</span></td>
      <td>${esc(c.role === 'host' ? (c.name || 'Notebook (host)') : (c.name || '—'))}</td>
      <td class="muted">${esc(c.type)}${c.stalled ? ' · sem resposta' : (!c.active ? ' · pausado' : '')}</td>
      <td class="n num">${c.threads}</td>
      <td class="n num">${c.jobTiles}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted">Ninguém entrou ainda. Aponte a câmera para o QR code.</td></tr>';
  renderLegend();
}

function renderLegend() {
  const counts = new Map();
  for (const o of owners) if (o) counts.set(o.index, (counts.get(o.index) || 0) + 1);
  const names = new Map((roster.clients || []).map(c => [c.index, c.name]));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const shown = top.slice(0, 14);
  $('legend').innerHTML = shown.map(([idx, n]) => {
    const lbl = owners.find(o => o && o.index === idx).label;
    const nm = idx === 0 ? 'host' : (names.get(idx) || '');
    return `<span><i style="background:${deviceColor(idx)}"></i>${lbl}${nm ? ' · ' + esc(nm) : ''} <b class="num" style="color:var(--ink)">${n}</b></span>`;
  }).join('') + (top.length > shown.length ? `<span>+${top.length - shown.length} dispositivos</span>` : '');
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- linha do tempo ----------
const tl = $('tl'), tctx = tl.getContext('2d');
function renderTimeline() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = tl.clientWidth || 600;
  const rowsData = [...spans.entries()].sort((a, b) => a[0] - b[0]);
  const load = job ? job.params.load : currentLoad();
  const tileMs = job ? job.params.tileMs : +$('tileMs').value;
  const solo = lastOf('sozinho', load, tileMs);
  const showSolo = solo && job && job.mode === 'mutirao';
  const nRows = rowsData.length + (showSolo ? 1 : 0);
  const rowH = Math.max(8, Math.min(24, Math.floor(250 / Math.max(1, nRows))));
  const labelW = 92, top = 4, axisH = 22;
  const cssH = Math.max(120, top + nRows * (rowH + 4) + axisH + 6);
  tl.style.height = cssH + 'px';
  tl.width = Math.round(cssW * dpr); tl.height = Math.round(cssH * dpr);
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tctx.clearRect(0, 0, cssW, cssH);
  const now = elapsed();
  const maxT = Math.max(1000, now, showSolo ? solo.durationMs : 0);
  const plotW = cssW - labelW - 8;
  const X = (t) => labelW + (t / maxT) * plotW;
  tctx.font = '400 12px Lexend, sans-serif';
  tctx.textBaseline = 'middle';
  let y = top;
  if (showSolo) {
    tctx.fillStyle = '#9AA6A6';
    tctx.fillText('Sozinho', 0, y + rowH / 2);
    tctx.fillStyle = '#2E3E3F';
    tctx.fillRect(labelW, y, X(solo.durationMs) - labelW, rowH);
    tctx.fillStyle = '#F1F4F3';
    tctx.font = '500 12px "IBM Plex Mono", monospace';
    if (rowH >= 12) tctx.fillText(secs(solo.durationMs), labelW + 6, y + rowH / 2 + 1);
    tctx.font = '400 12px Lexend, sans-serif';
    y += rowH + 4;
  }
  for (const [idx, r] of rowsData) {
    tctx.fillStyle = '#9AA6A6';
    if (rowH >= 10) tctx.fillText(idx === 0 ? 'A · host' : r.label, 0, y + rowH / 2);
    tctx.fillStyle = 'rgba(255,255,255,0.03)';
    tctx.fillRect(labelW, y, plotW, rowH);
    tctx.fillStyle = deviceColor(idx);
    for (const [s, e] of r.items) {
      const x0 = X(s), x1 = Math.max(x0 + 1, X(e) - 0.5);
      tctx.fillRect(x0, y, x1 - x0, rowH);
    }
    y += rowH + 4;
  }
  // eixo
  tctx.strokeStyle = '#22302F';
  tctx.beginPath(); tctx.moveTo(labelW, y + 2.5); tctx.lineTo(labelW + plotW, y + 2.5); tctx.stroke();
  const step = niceStep(maxT / 1000);
  tctx.fillStyle = '#66736F';
  tctx.font = '500 11px "IBM Plex Mono", monospace';
  tctx.textAlign = 'center';
  for (let s = 0; s * 1000 <= maxT + 1; s += step) tctx.fillText(fmt(s, step < 1 ? 1 : 0) + ' s', Math.min(X(s * 1000), cssW - 16), y + 14);
  tctx.textAlign = 'left';
  if (!nRows) {
    tctx.fillStyle = '#66736F';
    tctx.font = '400 13px Lexend, sans-serif';
    tctx.fillText('Cada faixa vai mostrar quando cada dispositivo estava calculando.', labelW, 40);
  }
}
function niceStep(totalS) {
  const raw = totalS / 6;
  for (const s of [0.5, 1, 2, 5, 10, 15, 20, 30, 60]) if (s >= raw) return s;
  return 120;
}
window.addEventListener('resize', renderTimeline);
setInterval(() => { if (job && !job.finishedAt) renderTimeline(); }, 250);

loadHint();
clearImage();
renderTimeline();
