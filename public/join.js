// Página do voluntário: conecta, recebe blocos, calcula em Web Workers e devolve.
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
let key = store('mutirao.key');
if (!key) { key = Math.random().toString(36).slice(2) + Date.now().toString(36); store('mutirao.key', key); }
if (qs.get('name')) key += ':' + qs.get('name'); // bots de teste: um id por aba
$('name').value = qs.get('name') || store('mutirao.name') || '';

const cores = navigator.hardwareConcurrency || 4;
const threads = Math.max(1, Math.min(8, +qs.get('threads') || cores));
const socket = io({ transports: ['websocket', 'polling'] });
let pool = null;
let joined = false;
let wakeLock = null;
let me = null;

let connected = false;
const nameValue = () => $('name').value.trim().replace(/\s+/g, ' ');
const nameOk = () => nameValue().length >= 2;
function refreshGo() {
  $('go').disabled = !connected || !nameOk();
  $('go').textContent = connected ? 'Participar' : 'Conectando…';
  if (nameOk()) { $('nameErr').hidden = true; $('name').classList.remove('invalid'); }
}
$('name').addEventListener('input', refreshGo);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); join(); } });

socket.on('connect', () => {
  connected = true;
  refreshGo();
  if (joined) hello();
  else if (qs.get('auto') && nameOk()) join();
});
socket.on('disconnect', () => setState('Conexão perdida, reconectando…', false));

function hello() {
  socket.emit('hello', { role: 'vol', key, name: nameValue(), threads, ua: navigator.userAgent, active: true });
}

function join() {
  if (joined) return;
  if (!nameOk()) {
    $('nameErr').hidden = false;
    $('name').classList.add('invalid');
    $('name').focus();
    return;
  }
  if (!connected) return;
  joined = true;
  store('mutirao.name', nameValue());
  $('hi').textContent = 'Olá, ' + nameValue();
  if (!pool) pool = new WorkerPool(socket, threads, onTileDone);
  hello();
  $('intro').hidden = true;
  $('live').hidden = false;
  keepAwake();
}
$('go').onclick = join;

socket.on('welcome', (m) => {
  me = m;
  $('letter').textContent = m.label;
  $('badge').textContent = m.label;
  $('badge').style.background = deviceColor(m.index);
  $('sub').textContent = `${m.threads} ${m.threads === 1 ? 'thread' : 'threads'} de processamento`;
});

let jobTiles = 0;
socket.on('job', (j) => {
  jobTiles = 0;
  $('jobTiles').textContent = '0';
  if (!j) { setState('Aguardando o host iniciar o mutirão', false); $('bar').style.width = '0%'; return; }
  if (j.mode === 'sozinho') setState('O notebook está renderizando sozinho. Aguarde o mutirão.', false);
  else setState('Mutirão em andamento: calculando blocos', true);
});
socket.on('state', (s) => {
  if (!s) return;
  $('bar').style.width = (s.doneCount / s.n * 100) + '%';
  if (s.finished) setState(s.mode === 'mutirao' ? 'Mutirão concluído. Obrigado!' : 'O notebook terminou sozinho. Agora é a vez do mutirão.', false);
});
socket.on('ack', (a) => {
  jobTiles = a.tiles;
  $('jobTiles').textContent = a.tiles;
  $('allTiles').textContent = a.total;
});

function setState(text, on) {
  $('stateText').textContent = text;
  $('dot').classList.toggle('on', !!on);
}

const lastCtx = $('last').getContext('2d');
let lastDraw = 0;
function onTileDone(m, job) {
  const now = performance.now();
  if (now - lastDraw < 120) return;
  lastDraw = now;
  const it = new Uint16Array(m.buf.byteLength ? m.buf : 0);
  if (!it.length) return;
  const side = Math.round(Math.sqrt(it.length));
  const c = $('last');
  if (c.width !== side) { c.width = side; c.height = side; }
  const img = lastCtx.createImageData(side, side);
  colorize(it, job.params.maxIter, img.data);
  lastCtx.putImageData(img, 0, 0);
}

$('stop').onclick = () => {
  const active = $('stop').dataset.paused === '1';
  socket.emit('active', active);
  $('stop').dataset.paused = active ? '0' : '1';
  $('stop').textContent = active ? 'Parar de doar' : 'Voltar a doar';
  if (!active) { pool && pool.clear(); setState('Pausado', false); }
  else setState('De volta ao mutirão', true);
};

// Mantém a tela acesa (Android e iOS 16.4+) e avisa quando a aba vai para segundo plano.
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* sem suporte */ }
}
document.addEventListener('visibilitychange', () => {
  if (!joined || $('stop').dataset.paused === '1') return;
  if (document.visibilityState === 'hidden') { socket.emit('active', false); pool && pool.clear(); }
  else { socket.emit('active', true); keepAwake(); }
});
