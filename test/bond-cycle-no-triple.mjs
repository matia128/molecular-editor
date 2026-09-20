/**
 * Bond click cycles single↔double when triple isn't achievable (not stuck at double).
 * Run: node test/bond-cycle-no-triple.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function startServer(port = 3475) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const file = join(ROOT, path);
      try {
        const data = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[file.slice(file.lastIndexOf('.'))] || 'text/plain' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolve({ server, url: `http://127.0.0.1:${port}` }));
  });
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app?.renderer?.handleDrop);

  const result = await page.evaluate(() => {
    const app = window.app;
    app.compounds.length = 0;

    const c1 = app.createAtom('C', 300, 300);
    const c2 = app.createAtom('C', 400, 300);
    c1.orbitals = { up: 2, down: 0, left: 0, right: 'double' };
    c2.orbitals = { up: 0, down: 0, left: 'double', right: 2 };

    const compound = app.createCompound([c1, c2]);
    const bond = {
      id: 'cc', atomA: c1, atomB: c2, slotA: 'right', slotB: 'left', order: 'double',
    };
    compound.addBond(bond);

    const maxPair = app.snapEngine.electronResolver.maxPairBondOrder(
      c1, 'right', c2, 'left');
    const achievable = app.snapEngine.electronResolver.achievableBondOrders(
      c1, 'right', c2, 'left');

    const fromDouble = app.snapEngine.cycleBondOrder(bond);
    const afterFirst = bond.order;
    const fromSingle = app.snapEngine.cycleBondOrder(bond);
    const afterSecond = bond.order;

    return {
      maxPair,
      achievable,
      fromDouble,
      afterFirst,
      fromSingle,
      afterSecond,
    };
  });

  await browser.close();
  server.close();

  const skipsTriple = result.maxPair === 2 && result.achievable.join(',') === 'single,double';
  const doubleToSingle = result.fromDouble && result.afterFirst === 'single';
  const singleToDouble = result.fromSingle && result.afterSecond === 'double';

  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Triple excluded from cycle:', skipsTriple);
  console.log('Double click downgrades to single:', doubleToSingle);
  console.log('Single click upgrades back to double:', singleToDouble);

  process.exit(skipsTriple && doubleToSingle && singleToDouble ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
