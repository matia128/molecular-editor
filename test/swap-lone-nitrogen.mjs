/**
 * Lone N: swapping up lone pair with right electron must rotate orbitals.
 * Run: node test/swap-lone-nitrogen.mjs
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

function startServer(port = 3474) {
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

    const n = app.createAtom('N', 400, 300);
    n.orbitals = { up: 2, down: 1, left: 1, right: 1 };
    const compound = app.createCompound([n]);

    app.renderer.cycleNucleusOrbitalSwap(n, compound);

    return {
      orbitals: { ...n.orbitals },
      changed: n.orbitals.up === 1 && n.orbitals.right === 2,
    };
  });

  await browser.close();
  server.close();

  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Lone N up↔right swap applied:', result.changed);

  process.exit(result.changed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
