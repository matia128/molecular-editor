/**
 * End-to-end debug: methane molfile → SMILES → PubChem
 * Run: node test/debug-methane.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const METHANE_SMILES = 'C';
const SLOT_OFFSET = 80;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function startServer(port = 3457) {
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

async function testBrowser(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.initRDKitModule === 'function', { timeout: 30000 });
  await page.waitForFunction(() => window.app && window.__chemTest?.generateMolfile, { timeout: 10000 });

  const result = await page.evaluate(async (slotOffset) => {
    const resolver = window.app.snapEngine.electronResolver;
    const app = window.app;

    function buildMethaneManual() {
      const c = app.createAtom('C', 200, 200);
      const layouts = [
        { cSlot: 'up', dx: 0, dy: -slotOffset, hSlot: 'down' },
        { cSlot: 'down', dx: 0, dy: slotOffset, hSlot: 'up' },
        { cSlot: 'left', dx: -slotOffset, dy: 0, hSlot: 'right' },
        { cSlot: 'right', dx: slotOffset, dy: 0, hSlot: 'left' },
      ];
      const atoms = [c];
      const bonds = [];
      for (let i = 0; i < layouts.length; i++) {
        const spec = layouts[i];
        const h = app.createAtom('H', c.x + spec.dx, c.y + spec.dy);
        atoms.push(h);
        resolver.formBond(c, spec.cSlot, h, spec.hSlot);
        bonds.push({
          id: 'h' + i,
          atomA: c,
          atomB: h,
          slotA: spec.cSlot,
          slotB: spec.hSlot,
          order: 'single',
        });
      }
      const compound = app.createCompound(atoms);
      compound.bonds = bonds;
      return compound;
    }

    async function runCase(label, compound) {
      const molfile = window.__chemTest.generateMolfile(compound);
      let lookupSmiles = null;
      let rdkitError = null;
      try {
        lookupSmiles = await window.__chemTest.molfileToSmiles(molfile);
      } catch (e) {
        rdkitError = e.message;
      }

      app.validationPipeline.checkAndValidate([compound]);
      await new Promise((r) => setTimeout(r, 10000));

      return {
        label,
        checks: {
          multiAtom: compound.isMultiAtom(),
          fullyBalanced: compound.isFullyBalanced(),
          noFree: compound.hasNoFreeElectrons(),
          canValidate: window.__chemTest.canValidateCompound
            ? window.__chemTest.canValidateCompound(compound)
            : null,
          atomStates: compound.atoms.map((a) => ({
            el: a.element,
            free: a.countFreeElectrons(),
            empty: a.countEmptySlots(),
            balanced: a.isBalanced(),
            orbitals: { ...a.orbitals },
          })),
        },
        molfile,
        lookupSmiles,
        rdkitError,
        validationState: compound.validationState,
        compoundName: compound.name,
        metadata: compound.metadata,
      };
    }

    app.compounds.length = 0;
    const manual = buildMethaneManual();
    app.compounds.push(manual);
    const manualResult = await runCase('manual CH4', manual);

    app.compounds.length = 0;
    const loneC = app.createAtom('C', 200, 200);
    const cCompound = app.createCompound([loneC]);
    app.compounds.push(cCompound);
    const filled = app.fillFreeElectronsWithHydrogen();
    const fillCompound = app.compounds.find((c) => c.atoms.some((a) => a.element === 'C'));
    const fillResult = await runCase('H-fill from lone C (filled=' + filled + ')', fillCompound);

    return { manualResult, fillResult };
  }, SLOT_OFFSET);

  await browser.close();
  return { result, logs };
}

async function main() {
  const { server, url } = await startServer();
  try {
    const { result, logs } = await testBrowser(url);
    for (const key of ['manualResult', 'fillResult']) {
      const r = result[key];
      console.log('\n=== ' + r.label + ' ===');
      console.log('Balance:', JSON.stringify(r.checks, null, 2));
      console.log('Lookup SMILES:', r.lookupSmiles, r.rdkitError || '');
      console.log('Validation:', r.validationState, r.compoundName || '');
      if (r.metadata) console.log('Metadata name/title:', r.metadata.name, r.metadata.iupacName);
    }
    if (logs.length) {
      console.log('\nBrowser logs:');
      logs.forEach((l) => console.log(' ', l));
    }

    const smilesOk = result.manualResult.lookupSmiles === METHANE_SMILES;
    const validated = result.manualResult.validationState === 'validated' &&
      /methane/i.test(result.manualResult.compoundName || '');

    console.log('\n=== SUMMARY ===');
    console.log('Canonical lookup SMILES is C:', smilesOk);
    console.log('Manual build validated as methane:', validated);
    console.log('Lookup SMILES:', result.manualResult.metadata?.smiles);
    console.log('H-fill build validated:', result.fillResult.validationState, result.fillResult.compoundName || '');

    if (!smilesOk) process.exit(1);
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
