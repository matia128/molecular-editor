/**
 * Palette atoms can be dragged onto the canvas.
 * Run: node test/palette-drag.mjs
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

function startServer(port = 3477) {
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

  const result = await page.evaluate(async () => {
    const workspace = document.querySelector('.workspace');
    const rect = workspace.getBoundingClientRect();
    const startX = rect.left + 40;
    const startY = rect.top + 40;
    const endX = rect.left + rect.width / 2;
    const endY = rect.top + rect.height / 2;

    const btn = document.querySelector('.atom-btn[data-element="C"]');
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: startY, button: 0 }));

    await new Promise((resolve) => {
      let steps = 0;
      function step() {
        steps += 1;
        const t = steps / 8;
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t;
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y, button: 0 }));
        if (steps < 8) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: endX, clientY: endY, button: 0 }));

    return {
      compoundCount: window.app.compounds.length,
      atomCount: window.app.compounds.reduce((sum, c) => sum + c.atoms.length, 0),
    };
  });

  await browser.close();
  server.close();

  const placed = result.compoundCount >= 1 && result.atomCount >= 1;
  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Palette drag places atom on canvas:', placed);
  process.exit(placed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
