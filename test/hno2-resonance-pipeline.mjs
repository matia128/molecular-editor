/**
 * H-N(=O)→O resonance (nitryl hydride) — PubChem maps its SMILES to nitrous acid,
 * so the app applies a curated override. Run: node test/hno2-resonance-pipeline.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  await page.waitForFunction(() => window.app?.validationPipeline?.validate);

  const result = await page.evaluate(async () => {
    const app = window.app;
    const resolver = app.snapEngine.electronResolver;

    app.compounds.length = 0;
    const n = app.createAtom('N', 200, 200);
    const h = app.createAtom('H', 120, 200);
    const oType2 = app.createAtom('O', 280, 200);
    const oRecv = app.createAtom('O', 200, 80);
    const compound = app.createCompound([n, h, oType2, oRecv]);

    n.orbitals = { up: 2, left: 'single', right: 'double', down: 0 };
    h.orbitals = { up: 0, down: 0, left: 0, right: 'single' };
    oType2.orbitals = { up: 2, down: 2, left: 'double', right: 0 };
    compound.bonds.push(
      { id: 'bh', atomA: n, atomB: h, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 'bo', atomA: n, atomB: oType2, slotA: 'right', slotB: 'left', order: 'double' },
    );
    if (!resolver.formNDativeBond(n, 'up', oRecv, 'down')) {
      return { ok: false, error: 'dative bond failed', orbitals: { ...n.orbitals } };
    }
    compound.bonds.push({
      id: 'bd', atomA: n, atomB: oRecv, slotA: 'up', slotB: 'down', order: 'n_dative',
    });
    n.nDativeHub = {
      loneSlot: 'up',
      receiverBondId: 'bd',
      type2BondId: 'bo',
      resonanceActive: true,
      resonanceState: 0,
    };
    app.renderer.refresh();

    if (!compound.isFullyBalanced()) {
      return {
        ok: false,
        error: 'compound not fully balanced',
        free: compound.atoms.map((a) => ({ el: a.element, free: a.countFreeElectrons() })),
      };
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('validation timeout')), 60000);
      const original = app.validationPipeline.onStatusChange;
      app.validationPipeline.onStatusChange = function (msg) {
        if (msg.startsWith('Identified:') || msg.includes('not recognized') || msg.startsWith('Validation error')) {
          clearTimeout(timeout);
          app.validationPipeline.onStatusChange = original;
          resolve(msg);
        }
      };
      app.validationPipeline.validate(compound);
    });

    return {
      ok: compound.validationState === 'validated' &&
        /nitryl hydride/i.test(compound.name || '') &&
        compound.metadata?.localOverride === true &&
        compound.name !== 'Unknown' &&
        !(compound.name && compound.name.includes('Amine oxide')),
      name: compound.name,
      smiles: compound.metadata?.smiles,
      state: compound.validationState,
      formula: compound.metadata?.molecularFormula,
      description: compound.metadata?.description,
      localOverride: compound.metadata?.localOverride,
      hasSdf3d: !!compound.metadata?.sdf3d,
    };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result);
    process.exit(1);
  }
  console.log('PASS: HNO2 resonating N-hub identified as nitryl hydride (curated override)');
  console.log('State:', result.state);
  console.log('Name:', result.name || '(none)');
  console.log('SMILES:', result.smiles);
  console.log('Formula:', result.formula);
  console.log('Local override:', result.localOverride);
  console.log('Has custom 3D:', result.hasSdf3d);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
