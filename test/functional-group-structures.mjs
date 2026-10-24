/**
 * Verify functional group clue structures render with atoms, bonds, and edge stubs.
 * Run: node test/functional-group-structures.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function startServer(port = 3461) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const file = join(ROOT, path);
      try {
        const data = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'text/plain' });
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

  try {
    await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__chemTest && window.__chemTest.functionalGroupIds, { timeout: 15000 });

    const results = await page.evaluate(() => {
      const ids = window.__chemTest.functionalGroupIds;
      return ids.map((id) => {
        const scene = window.__chemTest.buildFunctionalGroupScene(id);
        const svg = window.__chemTest.renderFunctionalGroupSceneSvg(id);
        return {
          id,
          atomCount: scene ? scene.atoms.length : 0,
          bondCount: scene ? scene.bonds.length : 0,
          stubCount: scene ? scene.stubs.length : 0,
          svgLength: svg.length,
          hasSvg: svg.includes('<svg') && svg.includes('<circle'),
          hasStubLine: svg.split('<line').length - 1 >= (scene ? scene.stubs.length : 0),
        };
      });
    });

    let failed = 0;
    for (const row of results) {
      const ok = row.atomCount > 0 && row.stubCount > 0 && row.hasSvg && row.hasStubLine;
      console.log(`${ok ? 'OK' : 'FAIL'} ${row.id}: atoms=${row.atomCount} bonds=${row.bondCount} stubs=${row.stubCount}`);
      if (!ok) failed += 1;
    }

    if (failed) {
      process.exitCode = 1;
      console.error(`\n${failed} functional group structure(s) failed validation.`);
    } else {
      console.log(`\nAll ${results.length} functional group structures validated.`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
