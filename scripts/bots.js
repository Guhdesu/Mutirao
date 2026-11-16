// Ensaio: abre N "celulares" headless que entram como voluntários.
// Uso: node scripts/bots.js --url https://seu-app.onrender.com --n 8 --threads 2
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map(s => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? true]));
const url = (args.url || 'http://localhost:3000').replace(/\/$/, '');
const n = +args.n || 5;
const threads = +args.threads || 2;

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { console.error('Instale o Playwright: npm i -D playwright && npx playwright install chromium'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14) HeadlessChrome Bot Mobile' });
  for (let k = 1; k <= n; k++) {
    const page = await ctx.newPage();
    await page.goto(`${url}/join?auto=1&threads=${threads}&name=bot-${k}`);
    console.log(`bot-${k} conectado`);
  }
  console.log(`${n} bots ativos (${n * threads} threads). Ctrl+C para sair.`);
  process.on('SIGINT', async () => { await browser.close(); process.exit(0); });
})();
