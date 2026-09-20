/**
 * Canvas atoms remain draggable with toolbox below the atom layer.
 * Run: node test/canvas-atom-drag.mjs
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

function startServer(port = 3478) {
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
    window.app.compounds.length = 0;
    const placed = window.app.renderer.addAtomAt('C', 500, 400);
    const atom = placed.atom;
    const canvas = window.app.renderer.canvas;
    const rect = canvas.upperCanvasEl.getBoundingClientRect();
    return {
      startX: atom.x,
      startY: atom.y,
      clientX: rect.left + (atom.x / canvas.width) * rect.width,
      clientY: rect.top + (atom.y / canvas.height) * rect.height,
    };
  });

  await page.mouse.move(result.clientX, result.clientY);
  await page.mouse.down();
  await page.mouse.move(result.clientX + 120, result.clientY + 80, { steps: 10 });
  await page.mouse.up();

  const end = await page.evaluate(({ startX, startY }) => {
    const atom = window.app.compounds[0]?.atoms[0];
    return {
      startX,
      startY,
      endX: atom?.x,
      endY: atom?.y,
      moved: atom ? Math.hypot(atom.x - startX, atom.y - startY) > 40 : false,
    };
  }, { startX: result.startX, startY: result.startY });

  await browser.close();
  server.close();

  console.log(JSON.stringify(end, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Canvas atom drag moves atom:', end.moved);
  process.exit(end.moved ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
