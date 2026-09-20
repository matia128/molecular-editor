/**
 * UI test: place H on grid, drag O from palette to center.
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

function startServer(port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const file = join(ROOT, path);
      try {
        const ext = file.slice(file.lastIndexOf('.'));
        const data = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
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
  const { server, url } = await startServer(3472);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app?.renderer);

  const layout = await page.evaluate(() => ({
    cw: window.app.renderer.canvas.width,
    ch: window.app.renderer.canvas.height,
  }));

  const cx = layout.cw / 2;
  const cy = layout.ch / 2;
  const GRID = 80;
  const bondDist = 74.8;

  // Scenario A: grid-spaced H (typical click placement)
  await page.evaluate(({ cx, cy, g }) => {
    window.app.compounds.length = 0;
    window.app.renderer.clear();
    window.app.renderer.addAtomAt('H', cx - g, cy);
    window.app.renderer.addAtomAt('H', cx + g, cy);
  }, { cx, cy, g: GRID });

  // Drag O from palette
  const oBtn = page.locator('.atom-btn[data-element="O"]');
  const canvasBox = await page.locator('#chemistry-canvas').boundingBox();
  const dropX = canvasBox.x + cx;
  const dropY = canvasBox.y + cy;
  await oBtn.hover();
  const btnBox = await oBtn.boundingBox();
  await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 8 });
  await page.mouse.up();

  const gridResult = await page.evaluate(() => {
    const app = window.app;
    const merged = app.compounds.find((c) => c.atoms.some((a) => a.element === 'O'));
    return {
      compounds: app.compounds.length,
      bonds: merged?.bonds.length ?? 0,
      o: merged?.atoms.find((a) => a.element === 'O'),
    };
  });

  // Scenario B: bond-distance H
  await page.evaluate(({ cx, cy, d }) => {
    window.app.compounds.length = 0;
    window.app.renderer.clear();
    window.app.renderer.addAtomAt('H', cx - d, cy);
    window.app.renderer.addAtomAt('H', cx + d, cy);
  }, { cx, cy, d: bondDist });

  await oBtn.hover();
  await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 8 });
  await page.mouse.up();

  const bondResult = await page.evaluate(() => {
    const app = window.app;
    const merged = app.compounds.find((c) => c.atoms.some((a) => a.element === 'O'));
    return { bonds: merged?.bonds.length ?? 0 };
  });

  await browser.close();
  server.close();

  console.log('Grid H (80px) + O drop:', gridResult);
  console.log('Bond-distance H + O drop:', bondResult);

  if (bondResult.bonds !== 2) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
