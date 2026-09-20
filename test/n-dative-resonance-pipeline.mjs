/**
 * End-to-end: resonating N→O hub validation (RDKit or local fallback).
 * Run: node test/n-dative-resonance-pipeline.mjs
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

function startServer(port = 3482) {
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

    function buildResonanceCompound() {
      app.compounds.length = 0;
      const n = app.createAtom('N', 200, 200);
      const h1 = app.createAtom('H', 120, 200);
      const h2 = app.createAtom('H', 200, 280);
      const oType2 = app.createAtom('O', 280, 200);
      const oRecv = app.createAtom('O', 200, 80);
      const compound = app.createCompound([n, h1, h2, oType2, oRecv]);
      resolver.formBond(n, 'left', h1, 'right');
      resolver.formBond(n, 'down', h2, 'left');
      resolver.formBond(n, 'right', oType2, 'left');
      compound.bonds.push(
        { id: 'h1', atomA: n, atomB: h1, slotA: 'left', slotB: 'right', order: 'single' },
        { id: 'h2', atomA: n, atomB: h2, slotA: 'down', slotB: 'left', order: 'single' },
        { id: 't2', atomA: n, atomB: oType2, slotA: 'right', slotB: 'left', order: 'single' },
      );
      if (!resolver.formNDativeBond(n, 'up', oRecv, 'down')) return null;
      compound.bonds.push({
        id: 'recv', atomA: n, atomB: oRecv, slotA: 'up', slotB: 'down', order: 'n_dative',
      });
      n.nDativeHub = {
        loneSlot: 'up',
        receiverBondId: 'recv',
        type2BondId: null,
        resonanceActive: false,
        resonanceState: 0,
      };
      const type2Bond = compound.bonds.find((b) => b.id === 't2');
      if (!app.snapEngine.cycleBondOrder(type2Bond, compound)) return null;
      app.renderer.refresh();
      if (!compound.isFullyBalanced()) return null;
      return compound;
    }

    async function validateCompound(compound) {
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
        smiles: compound.metadata?.smiles,
        name: compound.name,
        state: compound.validationState,
        msg: app.validationPipeline.onStatusChange,
      };
    }

    const compound = buildResonanceCompound();
    if (!compound) return { ok: false, error: 'resonance setup failed' };
    if (!compound.isFullyBalanced()) {
      return {
        ok: false,
        error: 'resonance compound not fully balanced',
        free: compound.atoms.map((a) => ({ el: a.element, free: a.countFreeElectrons() })),
      };
    }

    const RDKit = await window.initRDKitModule();
    const canonicalMolfile = [
      '',
      '     probe',
      '',
      '  4  3  0  0  0  0  0  0  0  0  0999 V2000',
      '    5.0000   -5.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0',
      '    3.0000   -5.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
      '    7.0000   -5.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    5.0000   -2.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  3  1  0  0  0  0',
      '  1  2  1  0  0  0  0',
      '  1  4  1  0  0  0  0',
      'M  CHG  2   1   1   4  -1',
      'M  END',
      '',
    ].join('\n');
    const probeMol = RDKit.get_mol(canonicalMolfile);
    const probeInchi = probeMol ? probeMol.get_inchi() : null;
    if (probeMol) probeMol.delete();
    if (!probeInchi) return { ok: false, error: 'canonical resonance encoding should parse in RDKit' };

    const state0 = await validateCompound(compound);
    if (state0.state === 'error') {
      return { ok: false, error: 'validation error at state 0', state0 };
    }
    if (state0.name === 'Amine oxide (resonance)' || state0.name === 'Unknown') {
      return { ok: false, error: 'bogus identification label at state 0', state0 };
    }

    app.renderer.ensureNDativeResonanceTimer();
    await new Promise((r) => setTimeout(r, 1100));
    compound.invalidateIdentification();
    const state1 = await validateCompound(compound);
    if (state1.state === 'error') {
      return { ok: false, error: 'validation error at state 1', state1 };
    }
    if (state1.name === 'Amine oxide (resonance)' || state1.name === 'Unknown') {
      return { ok: false, error: 'bogus identification label at state 1', state1 };
    }

    return {
      ok: (state0.state === 'validated' || state0.state === 'unrecognized') &&
        (state1.state === 'validated' || state1.state === 'unrecognized') &&
        state0.name === state1.name,
      probeInchi,
      state0,
      state1,
    };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result);
    process.exit(1);
  }
  console.log('PASS: resonating N-O validates without RDKit errors');
  console.log('Canonical probe InChI:', result.probeInchi);
  console.log('Name:', result.state0.name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
