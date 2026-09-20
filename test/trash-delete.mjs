/**
 * Compounds delete when any atom overlaps the trash bin (not just drop pointer).
 * Run: node test/trash-delete.mjs
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

function startServer(port = 3483) {
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
  await page.waitForFunction(() => window.app?.renderer);

  const dragResult = await page.evaluate(() => {
    window.app.compounds.length = 0;
    const ren = window.app.renderer;
    const placed = ren.addAtomAt('C', 500, 400);
    const atom = placed.atom;
    const canvas = ren.canvas;
    const rect = canvas.upperCanvasEl.getBoundingClientRect();
    const trash = ren.trashBinEl.getBoundingClientRect();
    return {
      startX: atom.x,
      startY: atom.y,
      clientX: rect.left + (atom.x / canvas.width) * rect.width,
      clientY: rect.top + (atom.y / canvas.height) * rect.height,
      trashCx: (trash.left + trash.right) / 2,
      trashCy: (trash.top + trash.bottom) / 2,
    };
  });

  await page.mouse.move(dragResult.clientX, dragResult.clientY);
  await page.mouse.down();
  await page.mouse.move(dragResult.trashCx, dragResult.trashCy, { steps: 12 });
  await page.mouse.up();

  const afterDrag = await page.evaluate(() => window.app.compounds.length);

  const overlapResult = await page.evaluate(() => {
    window.app.compounds.length = 0;
    const ren = window.app.renderer;
    const trashRect = ren.getTrashBinCanvasRect();
    const atomX = trashRect.left - 10;
    const atomY = (trashRect.top + trashRect.bottom) / 2;
    ren.addAtomAt('C', atomX, atomY);
    const compound = window.app.compounds[0];
    const overlaps = ren.compoundHasAtomInTrashBin(compound);
    const deleted = ren.deleteCompoundsWithAtomsInTrash();
    return { overlaps, deleted, remaining: window.app.compounds.length };
  });

  await browser.close();
  server.close();

  const dragDeleted = afterDrag === 0;
  const overlapDeleted = overlapResult.overlaps && overlapResult.deleted && overlapResult.remaining === 0;

  console.log(JSON.stringify({ dragDeleted, overlapResult }, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Drag-to-trash deletes compound:', dragDeleted);
  console.log('Partial overlap deletes compound:', overlapDeleted);
  process.exit(dragDeleted && overlapDeleted ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
