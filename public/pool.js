// Pool de Web Workers compartilhado pelo painel (host) e pela página do celular.
// Recebe blocos do coordenador, calcula e devolve os pixels (contagem de iterações).
class WorkerPool {
  constructor(socket, threads, onTile) {
    this.socket = socket;
    this.threads = threads;
    this.onTile = onTile || (() => {});
    this.job = null;
    this.queue = [];
    this.workers = [];
    this.idle = [];
    for (let k = 0; k < threads; k++) {
      const w = new Worker('render-worker.js');
      w.onmessage = (e) => this.done(w, e.data);
      this.workers.push(w);
      this.idle.push(w);
    }
    socket.on('job', (j) => { this.job = j; this.queue = []; });
    socket.on('cancel', () => { this.queue = []; });
    socket.on('tasks', (m) => {
      if (!this.job || m.jobId !== this.job.id) return;
      this.queue.push(...m.tiles);
      this.pump();
    });
  }
  get busy() { return this.threads - this.idle.length; }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop();
      const tile = this.queue.shift();
      w.postMessage({ jobId: this.job.id, params: this.job.params, tile });
    }
  }
  done(w, m) {
    this.idle.push(w);
    if (this.job && m.jobId === this.job.id) {
      this.socket.emit('result', { jobId: m.jobId, i: m.i, ms: m.ms, data: m.buf });
      this.onTile(m, this.job);
    }
    this.pump();
  }
  clear() { this.queue = []; }
}
