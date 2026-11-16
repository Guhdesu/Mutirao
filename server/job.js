// Definição do trabalho: a imagem, a divisão em blocos e os dois tipos de carga.
const WIDTH = 1600, HEIGHT = 900, TILE = 50;
const VIEW = { cx: -0.7453, cy: 0.1127, span: 0.0065 }; // "vale dos cavalos-marinhos"

const LOADS = {
  // Carga calibrada: cada bloco custa um tempo fixo (cálculo + trabalho sintético).
  calibrada: { maxIter: 3000, ss: 1 },
  // Carga real: Mandelbrot com supersampling 4x4 (16 amostras por pixel), sem simulação.
  real: { maxIter: 3000, ss: 4 },
};

function buildTiles() {
  const tiles = [];
  for (let y = 0; y < HEIGHT; y += TILE)
    for (let x = 0; x < WIDTH; x += TILE)
      tiles.push({ i: tiles.length, x, y, w: Math.min(TILE, WIDTH - x), h: Math.min(TILE, HEIGHT - y) });
  return tiles;
}

function buildParams(load, tileMs) {
  const l = LOADS[load] || LOADS.calibrada;
  return {
    width: WIDTH, height: HEIGHT, tile: TILE, ...VIEW,
    load, maxIter: l.maxIter, ss: l.ss,
    tileMs: load === 'calibrada' ? tileMs : 0,
  };
}

module.exports = { WIDTH, HEIGHT, TILE, buildTiles, buildParams, LOADS };
