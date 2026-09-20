/**
 * Identical bonded substituents (e.g. two H) swapping slots is a structural no-op.
 * Run: node test/swap-skip-identical-atoms.mjs
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

function startServer(port = 3473) {
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
    const bondDist = (22 * 1.2 * (76 / 66)) + 36 + (22 * 1.2 * (31 / 66));
    const c = app.createAtom('C', cx, cy);
    const hUp = app.createAtom('H', cx, cy - bondDist);
    const hRight = app.createAtom('H', cx + bondDist, cy);

    c.orbitals = { up: 'single', down: 1, left: 1, right: 'single' };
    hUp.orbitals = { up: 0, down: 'single', left: 0, right: 0 };
    hRight.orbitals = { up: 0, down: 0, left: 'single', right: 0 };

    const compound = app.createCompound([c, hUp, hRight]);
    compound.addBond({
      id: 'c-h-up', atomA: c, atomB: hUp, slotA: 'up', slotB: 'down', order: 'single',
    });
    compound.addBond({
      id: 'c-h-right', atomA: c, atomB: hRight, slotA: 'right', slotB: 'left', order: 'single',
    });

    const before = {
      hUpX: hUp.x,
      hUpY: hUp.y,
      hRightX: hRight.x,
      hRightY: hRight.y,
    };
    const upRightNoOp = !compound.simulateNucleusPairSwap(c, 'up', 'right', true);

    app.renderer.nucleusSwapAtomId = c.id;
    app.renderer.nucleusSwapPhase = 0;
    app.renderer.cycleNucleusOrbitalSwap(c, compound);

    return {
      upRightNoOp,
      phaseAfter: app.renderer.nucleusSwapPhase,
      hUpX: hUp.x,
      hUpY: hUp.y,
      hRightX: hRight.x,
      hRightY: hRight.y,
      moved: hUp.x !== before.hUpX || hUp.y !== before.hUpY ||
        hRight.x !== before.hRightX || hRight.y !== before.hRightY,
    };
  });

  await browser.close();
  server.close();

  const skippedIdenticalH = result.upRightNoOp;
  const appliedNextPair = result.phaseAfter === 1 && result.moved;

  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('up↔right with two identical H is a no-op:', skippedIdenticalH);
  console.log('right-click advanced to next pair that moves atoms:', appliedNextPair);

  process.exit(skippedIdenticalH && appliedNextPair ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
