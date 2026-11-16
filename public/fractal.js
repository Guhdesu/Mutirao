// Mandelbrot de um bloco. Só usa + - * e comparações em double, então o
// resultado é idêntico em qualquer navegador (é isso que permite conferir o hash).
// ss = supersampling: ss*ss amostras por pixel (usado na carga real para pesar).
function renderTile(p, t) {
  const out = new Uint16Array(t.w * t.h);
  const ss = p.ss || 1;
  const ratio = p.height / p.width;
  const x0 = p.cx - p.span / 2, y0 = p.cy - (p.span * ratio) / 2;
  const dx = p.span / p.width, sub = dx / ss;
  const maxIter = p.maxIter;
  let k = 0;
  for (let py = t.y; py < t.y + t.h; py++) {
    for (let px = t.x; px < t.x + t.w; px++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++) {
        const ci = y0 + py * dx + sy * sub;
        for (let sx = 0; sx < ss; sx++) {
          const cr = x0 + px * dx + sx * sub;
          let zr = 0, zi = 0, zr2 = 0, zi2 = 0, i = 0;
          while (i < maxIter && zr2 + zi2 <= 4) {
            zi = 2 * zr * zi + ci;
            zr = zr2 - zi2 + cr;
            zr2 = zr * zr; zi2 = zi * zi;
            i++;
          }
          acc += i;
        }
      }
      out[k++] = Math.floor(acc / (ss * ss));
    }
  }
  return out;
}

// Paleta do fractal: azuis e âmbar sobre preto (não compete com a cor de acento).
const FRACTAL_STOPS = [[8,14,30],[30,70,140],[90,150,210],[235,240,230],[230,170,70],[120,50,20],[8,14,30]];
function colorize(iters, maxIter, rgba) {
  for (let i = 0; i < iters.length; i++) {
    const v = iters[i], o = i * 4;
    if (v >= maxIter) { rgba[o] = rgba[o+1] = rgba[o+2] = 0; }
    else {
      const t = ((Math.sqrt(v) * 0.18) % 1) * 6, a = Math.floor(t), f = t - a;
      const s0 = FRACTAL_STOPS[a], s1 = FRACTAL_STOPS[a + 1];
      rgba[o] = s0[0] + (s1[0] - s0[0]) * f;
      rgba[o+1] = s0[1] + (s1[1] - s0[1]) * f;
      rgba[o+2] = s0[2] + (s1[2] - s0[2]) * f;
    }
    rgba[o+3] = 255;
  }
  return rgba;
}

if (typeof module !== 'undefined') module.exports = { renderTile, colorize };
