/**
 * Diagnose single-bond vs double-bond outcomes across drop methods.
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
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
        res.end(readFileSync(file));
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolve({ server, url: `http://127.0.0.1:${port}` }));
  });
}

async function dropOFromPalette(page, cx, cy) {
  const oBtn = page.locator('.atom-btn[data-element="O"]');
  const canvasBox = await page.locator('#chemistry-canvas').boundingBox();
  const btnBox = await oBtn.boundingBox();
  const dropX = canvasBox.x + cx;
  const dropY = canvasBox.y + cy;
  await oBtn.hover();
  await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 10 });
  await page.mouse.up();
}

async function dragAtomOnCanvas(page, atomX, atomY, toX, toY) {
  const canvasBox = await page.locator('#chemistry-canvas').boundingBox();
  const sx = canvasBox.x + atomX;
  const sy = canvasBox.y + atomY;
  const tx = canvasBox.x + toX;
  const ty = canvasBox.y + toY;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy, { steps: 2 }); // exceed drag threshold
  await page.mouse.move(tx, ty, { steps: 10 });
  await page.mouse.up();
}

async function bondCount(page) {
  return page.evaluate(() => {
    const merged = window.app.compounds.find((c) => c.atoms.some((a) => a.element === 'O'));
    return merged?.bonds.length ?? 0;
  });
}

async function main() {
  const { server, url } = await startServer(3473);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app?.renderer);

  const { cx, cy, bondDist } = await page.evaluate(() => {
    const cx = window.app.renderer.canvas.width / 2;
    const cy = window.app.renderer.canvas.height / 2;
    const O_RADIUS = 22 * 1.2;
    const H_RADIUS = O_RADIUS * (31 / 66);
    return { cx, cy, bondDist: H_RADIUS + 36 + O_RADIUS };
  });

  const results = [];

  async function scenario(name, setup, dropFn) {
    await page.evaluate(({ cx, cy, d, name }) => {
      window.app.compounds.length = 0;
      window.app.renderer.clear();
      if (name.startsWith('bond-dist')) {
        window.app.renderer.addAtomAt('H', cx - d, cy);
        window.app.renderer.addAtomAt('H', cx + d, cy);
      } else if (name.startsWith('grid')) {
        window.app.renderer.addAtomAt('H', cx - 80, cy);
        window.app.renderer.addAtomAt('H', cx + 80, cy);
      } else if (name.startsWith('same-comp')) {
        const h1 = window.app.createAtom('H', cx - d, cy);
        const h2 = window.app.createAtom('H', cx + d, cy);
        window.app.compounds.push(window.app.createCompound([h1, h2]));
        window.app.renderer.renderCompound(window.app.compounds[0]);
      } else if (name.startsWith('preplaced-o')) {
        window.app.renderer.addAtomAt('H', cx - d, cy);
        window.app.renderer.addAtomAt('H', cx + d, cy);
        window.app.renderer.addAtomAt('O', cx + 15, cy + 10);
      }
    }, { cx, cy, d: bondDist, name });

    await dropFn();
    const bonds = await bondCount(page);
    results.push({ name, bonds });
  }

  await scenario('bond-dist palette center', null, () => dropOFromPalette(page, cx, cy));
  await scenario('bond-dist palette offset', null, () => dropOFromPalette(page, cx + 15, cy + 10));
  await scenario('grid palette center', null, () => dropOFromPalette(page, cx, cy));
  await scenario('same-comp palette center', null, () => dropOFromPalette(page, cx, cy));
  await scenario('preplaced-o drag to center', null, async () => {
    const pos = await page.evaluate(({ cx, cy }) => {
      const o = window.app.compounds.find((c) => c.atoms.some((a) => a.element === 'O'))?.atoms[0];
      return { x: o.x, y: o.y };
    }, { cx, cy });
    await dragAtomOnCanvas(page, pos.x, pos.y, cx, cy);
  });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  server.close();
}

main();
