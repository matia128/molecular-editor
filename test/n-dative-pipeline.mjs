/**
 * End-to-end: H3N→O n_dative should identify as Azane oxide (curated override).
 * Run: node test/n-dative-pipeline.mjs
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

function startServer(port = 3479) {
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
    app.compounds.length = 0;
    const resolver = app.snapEngine.electronResolver;

    const n = app.createAtom('N', 200, 200);
    const h1 = app.createAtom('H', 120, 200);
    const h2 = app.createAtom('H', 200, 280);
    const h3 = app.createAtom('H', 280, 200);
    const o = app.createAtom('O', 200, 80);
    const compound = app.createCompound([n, h1, h2, h3, o]);

    resolver.formBond(n, 'left', h1, 'right');
    resolver.formBond(n, 'down', h2, 'left');
    resolver.formBond(n, 'right', h3, 'left');
    compound.bonds.push(
      { id: 'b1', atomA: n, atomB: h1, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 'b2', atomA: n, atomB: h2, slotA: 'down', slotB: 'left', order: 'single' },
      { id: 'b3', atomA: n, atomB: h3, slotA: 'right', slotB: 'left', order: 'single' },
    );

    if (!resolver.formNDativeBond(n, 'up', o, 'down')) {
      return { ok: false, error: 'formNDativeBond failed' };
    }
    compound.addBond({
      id: 'b4', atomA: n, atomB: o, slotA: 'up', slotB: 'down', order: 'n_dative',
    });

    await new Promise((resolve, reject) => {
      const original = app.validationPipeline.onStatusChange;
      const timeout = setTimeout(() => reject(new Error('validation timeout')), 60000);
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
        compound.name === 'Azane oxide' &&
        compound.metadata?.localOverride === true &&
        !!compound.metadata?.description &&
        !!compound.metadata?.sdf3d &&
        compound.metadata?.cid == null,
      name: compound.name,
      smiles: compound.metadata?.smiles,
      formula: compound.metadata?.molecularFormula,
      validationState: compound.validationState,
      localOverride: compound.metadata?.localOverride,
      description: compound.metadata?.description,
      molecularWeight: compound.metadata?.molecularWeight,
      hasSdf3d: !!compound.metadata?.sdf3d,
      pubchemCid: compound.metadata?.cid,
    };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result);
    process.exit(1);
  }
  console.log('PASS: H3N→O identified as', result.name);
  console.log('SMILES:', result.smiles);
  console.log('Formula:', result.formula);
  console.log('Molecular weight:', result.molecularWeight);
  console.log('Has custom 3D:', result.hasSdf3d);
  console.log('PubChem CID (cleared):', result.pubchemCid);
  console.log('Local override:', result.localOverride);
  console.log('Description starts with:', (result.description || '').slice(0, 60) + '...');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
