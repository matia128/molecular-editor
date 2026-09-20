/**
 * Released electrons follow Hund's rule: empty slots first, then pair singles.
 * Run: node test/hunds-release.mjs
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

function startServer(port = 3476) {
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
    const resolver = window.app.snapEngine.electronResolver;

    const downgrade = (orbitals, bondSlot, released) => {
      const atom = window.app.createAtom('C', 0, 0);
      atom.orbitals = { ...orbitals };
      resolver.releaseElectrons(atom, bondSlot, released);
      return { ...atom.orbitals };
    };

    const broken = (orbitals, bondSlot, released) => {
      const atom = window.app.createAtom('C', 0, 0);
      atom.orbitals = { ...orbitals };
      resolver.restoreBondElectrons(atom, bondSlot, released);
      return { ...atom.orbitals };
    };

    return {
      downgradeToEmptyFirst: downgrade(
        { up: 0, down: 1, left: 0, right: 'double' },
        'right',
        1
      ),
      downgradePairsWhenFull: downgrade(
        { up: 1, down: 1, left: 1, right: 'double' },
        'right',
        1
      ),
      breakSpreadsSingles: broken(
        { up: 2, down: 0, left: 0, right: 'double' },
        'right',
        2
      ),
    };
  });

  await browser.close();
  server.close();

  const emptyFirst = result.downgradeToEmptyFirst.up === 1 &&
    result.downgradeToEmptyFirst.left === 0 &&
    result.downgradeToEmptyFirst.down === 1;
  const pairsWhenFull = result.downgradePairsWhenFull.up === 2 &&
    result.downgradePairsWhenFull.down === 1 &&
    result.downgradePairsWhenFull.left === 1;
  const breakSingles = result.breakSpreadsSingles.up === 2 &&
    result.breakSpreadsSingles.down === 1 &&
    result.breakSpreadsSingles.left === 1 &&
    result.breakSpreadsSingles.right === 0;

  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log('Downgrade fills empty orbital before pairing:', emptyFirst);
  console.log('Downgrade pairs existing single when no empties:', pairsWhenFull);
  console.log('Bond break fills empty orbitals before pairing:', breakSingles);

  process.exit(emptyFirst && pairsWhenFull && breakSingles ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
