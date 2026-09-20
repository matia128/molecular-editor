/**
 * Drop O onto two pre-placed H atoms (both within bonding reach) → two bonds at once.
 * Run: node test/snap-two-hydrogens.mjs
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

function startServer(port = 3456) {
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
  const { server, url } = await startServer(3470);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app?.renderer?.handleDrop);

  const result = await page.evaluate(() => {
    window.app.compounds.length = 0;
    const app = window.app;
    const O_RADIUS = 22 * 1.2;
    const H_RADIUS = O_RADIUS * (31 / 66);
    const BOND_GAP = 36;
    const H_BOND_LENGTH_SCALE = 0.75;
    const bondDist = (H_RADIUS + BOND_GAP + O_RADIUS) * H_BOND_LENGTH_SCALE;

    const cx = 400;
    const cy = 300;

    // Two hydrogens in place at water bond spacing
    const h1 = app.createAtom('H', cx - bondDist, cy);
    const h2 = app.createAtom('H', cx + bondDist, cy);
    const hComp1 = app.createCompound([h1]);
    const hComp2 = app.createCompound([h2]);
    app.compounds.push(hComp1, hComp2);

    // Oxygen overlaid at center — within reach of both
    const o = app.createAtom('O', cx, cy);
    const oComp = app.createCompound([o]);
    app.compounds.push(oComp);

    const d1 = Math.hypot(h1.x - o.x, h1.y - o.y);
    const d2 = Math.hypot(h2.x - o.x, h2.y - o.y);

    window.app.renderer.handleDrop(oComp);

    const merged = app.compounds.find((c) => c.atoms.some((a) => a.element === 'O'));
    const bondCount = merged ? merged.bonds.length : 0;
    const oAtom = merged?.atoms.find((a) => a.element === 'O');
    const bondLengths = merged
      ? merged.bonds.map((b) => {
          const a = b.atomA;
          const bAtom = b.atomB;
          return Math.hypot(bAtom.x - a.x, bAtom.y - a.y);
        })
      : [];

    return {
      bondDist,
      d1,
      d2,
      bondCount,
      bondLengths,
      oLeft: oAtom?.orbitals.left,
      oRight: oAtom?.orbitals.right,
      compoundCount: app.compounds.length,
    };
  });

  const clickBonds = await page.evaluate(() => {
    window.app.compounds.length = 0;
    window.app.renderer.clear();
    const cx = 400;
    const cy = 300;
    const bondDist = 74.8 * 0.75;
    window.app.renderer.addAtomAt('H', cx - bondDist, cy);
    window.app.renderer.addAtomAt('H', cx + bondDist, cy);
    window.app.renderer.addAtomAt('O', cx, cy);
    const merged = window.app.compounds.find((c) => c.atoms.some((a) => a.element === 'O'));
    return merged?.bonds.length ?? 0;
  });

  result.clickBonds = clickBonds;

  await browser.close();
  server.close();

  console.log(JSON.stringify(result, null, 2));

  const ok =
    result.bondCount === 2 &&
    result.clickBonds === 2 &&
    result.oLeft === 'single' &&
    result.oRight === 'single' &&
    result.bondLengths.every((len) => Math.abs(len - result.bondDist) < 1);

  console.log('\n=== SUMMARY ===');
  console.log('Two bonds formed (drop):', result.bondCount === 2);
  console.log('Two bonds formed (click):', result.clickBonds === 2);
  console.log('O left/right bonded:', result.oLeft === 'single' && result.oRight === 'single');
  console.log('Bond lengths exact:', result.bondLengths.every((len) => Math.abs(len - result.bondDist) < 1));

  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
