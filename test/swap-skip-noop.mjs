/**
 * No-op swap pairs are skipped; first pair that changes state is applied.
 * Run: node test/swap-skip-noop.mjs
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

function startServer(port = 3472) {
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
    app.renderer.resetNucleusOrbitalSwap();

    const cx = 400;
    const cy = 300;
    const c = app.createAtom('C', cx, cy);
    const bondDist = (22 * 1.2 * (76 / 66)) + 36 + (22 * 1.2);
    const o = app.createAtom('O', cx, cy + bondDist);

    c.orbitals = { up: 1, down: 'single', left: 1, right: 1 };
    o.orbitals = { up: 2, down: 1, left: 1, right: 'single' };

    const compound = app.createCompound([c, o]);
    compound.addBond({
      id: 'co', atomA: c, atomB: o, slotA: 'down', slotB: 'up', order: 'single',
    });

    const upRightNoOp = !compound.simulateNucleusPairSwap(c, 'up', 'right', true);
    app.renderer.nucleusSwapAtomId = c.id;
    app.renderer.nucleusSwapPhase = 0;

    const before = { oX: o.x, oY: o.y };
    app.renderer.cycleNucleusOrbitalSwap(c, compound);

    return {
      phaseAfter: app.renderer.nucleusSwapPhase,
      oDx: o.x - c.x,
      oDy: o.y - c.y,
      moved: o.x !== before.oX || o.y !== before.oY,
      upRightNoOp,
    };
  });

  await browser.close();
  server.close();

  const skippedUpRight = result.upRightNoOp;
  const appliedRightDown = result.phaseAfter === 1 && result.moved && result.oDx > 50;

  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('up↔right is a no-op for this layout:', skippedUpRight);
  console.log('right-click skipped to right↔down (O moved east):', appliedRightDown);

  process.exit(skippedUpRight && appliedRightDown ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
