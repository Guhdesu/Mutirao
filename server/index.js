const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { Coordinator } = require('./coordinator');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e6,
  pingInterval: 10000,
  pingTimeout: 8000,
});
const coord = new Coordinator(io);

app.disable('x-powered-by');
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/join', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'join.html')));
app.get('/j', (req, res) => res.redirect('/join'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/qr.svg', async (req, res) => {
  const text = String(req.query.u || '').slice(0, 300);
  if (!/^https?:\/\//.test(text)) return res.status(400).send('url inválida');
  const svg = await QRCode.toString(text, {
    type: 'svg', margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#0E1619', light: '#FFFFFF' },
  });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
});

app.get('/api/info', (req, res) => {
  const lan = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || [])
      if (a.family === 'IPv4' && !a.internal) lan.push(`http://${a.address}:${PORT}/join`);
  res.json({ lan });
});

app.get('/api/runs.json', (req, res) => {
  res.set('Content-Disposition', 'attachment; filename="mutirao-resultados.json"');
  res.json(coord.runs);
});

app.get('/api/runs.csv', (req, res) => {
  const head = ['execucao', 'horario', 'modo', 'carga', 'ms_por_bloco', 'tempo_s', 'dispositivos', 'threads', 'blocos', 'blocos_reatribuidos', 'tempo_calculo_somado_s', 'hash', 'blocos_por_dispositivo'];
  const rows = coord.runs.map((r, k) => [
    k + 1, r.at, r.mode, r.load, r.tileMs || '', (r.durationMs / 1000).toFixed(2), r.devices, r.threads,
    r.tiles, r.reassigned, (r.computeMs / 1000).toFixed(2), r.hash,
    '"' + r.perDevice.map(p => `${p.label}${p.name ? ' (' + p.name.replace(/"/g, '') + ')' : ''} ${p.type}: ${p.tiles}`).join('; ') + '"',
  ].join(','));
  res.set('Content-Disposition', 'attachment; filename="mutirao-resultados.csv"');
  res.type('text/csv').send('﻿' + [head.join(','), ...rows].join('\n'));
});

io.on('connection', socket => {
  socket.on('hello', msg => coord.hello(socket, msg));
  socket.on('viewer', () => coord.viewer(socket));
  socket.on('active', on => coord.setActive(socket.id, on));
  socket.on('name', name => coord.setName(socket.id, name));
  socket.on('result', msg => coord.result(socket.id, msg));
  socket.on('start', msg => {
    const c = coord.clients.get(socket.id);
    if (c && c.role === 'host') coord.start(msg || {});
  });
  socket.on('reset', () => {
    const c = coord.clients.get(socket.id);
    if (c && c.role === 'host') coord.reset();
  });
  socket.on('disconnect', () => coord.disconnect(socket.id));
});

server.listen(PORT, () => {
  console.log(`Mutirão rodando em http://localhost:${PORT}`);
  console.log(`Voluntários entram em http://localhost:${PORT}/join`);
});
