/**
 * Verify CO-only diatomic bond cycle including co_dative electron balance.
 * Run: node test/co-dative-bond.mjs
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

function startServer(port = 3471) {
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
  await page.waitForFunction(() => window.app?.snapEngine?.cycleBondOrder);

  const result = await page.evaluate(() => {
    const app = window.app;
    app.compounds.length = 0;

    const c = app.createAtom('C', 200, 200);
    const o = app.createAtom('O', 280, 200);
    const compound = app.createCompound([c, o]);
    const resolver = app.snapEngine.electronResolver;

    if (!resolver.formBond(c, 'right', o, 'left')) {
      return { ok: false, error: 'formBond failed' };
    }

    const bond = { id: 'test-bond', atomA: c, atomB: o, slotA: 'right', slotB: 'left', order: 'single' };
    compound.bonds.push(bond);

    const snap = (label) => ({
      label,
      order: bond.order,
      cOrbitals: Object.assign({}, c.orbitals),
      oOrbitals: Object.assign({}, o.orbitals),
      cBalanced: c.isValenceConsistent(),
      oBalanced: o.isValenceConsistent(),
      cTotal: c.totalOrbitalElectrons(),
      oTotal: o.totalOrbitalElectrons(),
    });

    const history = [snap('start')];
    const expected = ['double', 'co_dative', 'single'];

    for (const next of expected) {
      if (!app.snapEngine.cycleBondOrder(bond, compound)) {
        return { ok: false, error: `cycle to ${next} failed`, history, bondOrder: bond.order };
      }
      if (bond.order !== next) {
        return { ok: false, error: `expected ${next}, got ${bond.order}`, history };
      }
      history.push(snap(next));
      if (!c.isValenceConsistent() || !o.isValenceConsistent()) {
        return { ok: false, error: `unbalanced after ${next}`, history };
      }
      if (next === 'co_dative') {
        if (c.orbitals.left !== 2 || o.orbitals.right !== 2) {
          return {
            ok: false,
            error: `co_dative lone pairs not opposite bond (C.left=${c.orbitals.left}, O.right=${o.orbitals.right})`,
            history,
          };
        }
        if (c.countFreeElectrons() !== 0 || o.countFreeElectrons() !== 0) {
          return {
            ok: false,
            error: `co_dative has free electrons (C:${c.countFreeElectrons()}, O:${o.countFreeElectrons()})`,
            history,
          };
        }
      }
      if (next === 'single' && history[history.length - 1].order === 'co_dative') {
        var cSingles = ['up', 'down', 'left', 'right'].filter(function (s) {
          return s !== 'right' && c.orbitals[s] === 1;
        }).length;
        if (cSingles !== 3) {
          return { ok: false, error: `C should have 3 free singles after co_dative→single, got ${cSingles}`, history };
        }
      }
    }

    function freshOrbitals(el) {
      var a = app.createAtom(el, 0, 0);
      var o = Object.assign({}, a.orbitals);
      return o;
    }
    const freshC = freshOrbitals('C');
    const freshO = freshOrbitals('O');

    app.snapEngine.breakBond(bond, compound);
    history.push({
      label: 'after break',
      cOrbitals: Object.assign({}, c.orbitals),
      oOrbitals: Object.assign({}, o.orbitals),
      cBalanced: c.isValenceConsistent(),
      oBalanced: o.isValenceConsistent(),
      bondCount: compound.bonds.length,
      cMatchesFresh: JSON.stringify(c.orbitals) === JSON.stringify(freshC),
      oMatchesFresh: JSON.stringify(o.orbitals) === JSON.stringify(freshO),
    });

    if (compound.bonds.length !== 0) {
      return { ok: false, error: 'bond not removed', history };
    }
    if (!c.isValenceConsistent() || !o.isValenceConsistent()) {
      return { ok: false, error: 'unbalanced after break', history };
    }
    if (!history[history.length - 1].cMatchesFresh || !history[history.length - 1].oMatchesFresh) {
      return { ok: false, error: 'atoms not reset to fresh state after break', history };
    }

    return { ok: true, history };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result.error);
    console.error(JSON.stringify(result.history, null, 2));
    process.exit(1);
  }

  console.log('PASS: CO bond cycle and break');
  console.log(JSON.stringify(result.history, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
