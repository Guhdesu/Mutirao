// Web Worker: calcula um bloco por vez fora da thread da interface.
importScripts('fractal.js');

self.onmessage = (e) => {
  const { jobId, params, tile } = e.data;
  const t0 = performance.now();
  const iters = renderTile(params, tile);
  // Carga calibrada: o bloco "custa" tileMs de trabalho de CPU de verdade
  // (laço ocupado), simulando uma tarefa pesada de tamanho fixo.
  if (params.tileMs > 0) {
    let x = 0;
    while (performance.now() - t0 < params.tileMs) x = (x + Math.sqrt(x + 1)) % 1e6;
  }
  const ms = performance.now() - t0;
  self.postMessage({ jobId, i: tile.i, ms, buf: iters.buffer }, [iters.buffer]);
};
