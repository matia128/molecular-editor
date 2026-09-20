/**
 * Right-click swap: C with O bonded up → O moves right with correct orbital rotation.
 * Run: node test/swap-c-o.mjs
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

function startServer(port = 3471) {
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

    const cx = 400;
    const cy = 300;
    const c = app.createAtom('C', cx, cy);
    const bondDist = (22 * 1.2 * (76 / 66)) + 36 + (22 * 1.2);
    const o = app.createAtom('O', cx, cy - bondDist);
    const h = app.createAtom('H', cx, cy - bondDist * 2);

    // Demo layout: O above C, lone pair up, singles left/right, bond down
    c.orbitals = { up: 'single', down: 1, left: 1, right: 1 };
    o.orbitals = { up: 2, down: 'single', left: 1, right: 1 };
    h.orbitals = { up: 0, down: 0, left: 0, right: 1 };

    const compound = app.createCompound([c, o, h]);
    const coBond = { id: 'co', atomA: c, atomB: o, slotA: 'up', slotB: 'down', order: 'single' };
    const ohBond = { id: 'oh', atomA: o, atomB: h, slotA: 'up', slotB: 'down', order: 'single' };
    compound.addBond(coBond);
    compound.addBond(ohBond);

    const hBefore = { x: h.x, y: h.y };
    compound.swapAroundAtom(c, 'up', 'right');

    return {
      cOrbitals: { ...c.orbitals },
      oOrbitals: { ...o.orbitals },
      hOrbitals: { ...h.orbitals },
      coBondSlots: { slotA: coBond.slotA, slotB: coBond.slotB },
      ohBondSlots: { slotA: ohBond.slotA, slotB: ohBond.slotB },
      oDx: o.x - c.x,
      oDy: o.y - c.y,
      hDx: h.x - c.x,
      hDy: h.y - c.y,
      hMoved: { dx: h.x - hBefore.x, dy: h.y - hBefore.y },
      cValenceOk: c.isValenceConsistent(),
      oValenceOk: o.isValenceConsistent(),
      hValenceOk: h.isValenceConsistent(),
    };
  });

  await browser.close();
  server.close();

  const oIsRight = result.oDx > 50 && Math.abs(result.oDy) < 20;
  const hIsEastOfO = result.hDx > result.oDx + 40 && Math.abs(result.hDy - result.oDy) < 20;
  const cSwapped = result.cOrbitals.up === 1 && result.cOrbitals.right === 'single'
    && result.cOrbitals.left === 1 && result.cOrbitals.down === 1;
  const oOrbitalsIdeal = result.oOrbitals.up === 1 && result.oOrbitals.right === 2
    && result.oOrbitals.left === 'single' && result.oOrbitals.down === 1;
  const coBondOk = result.coBondSlots.slotA === 'right' && result.coBondSlots.slotB === 'left';
  const ohBondOk = result.ohBondSlots.slotA === 'right' && result.ohBondSlots.slotB === 'left';
  const pass = oIsRight && hIsEastOfO && cSwapped && oOrbitalsIdeal && coBondOk && ohBondOk;
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
