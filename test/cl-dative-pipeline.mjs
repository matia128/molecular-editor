/**
 * End-to-end: H–Cl→O (cl_dative) should validate without curated override.
 * Run: node test/cl-dative-pipeline.mjs
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

function startServer(port = 3484) {
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

    const cl = app.createAtom('Cl', 200, 200);
    const h = app.createAtom('H', 280, 200);
    const o = app.createAtom('O', 200, 80);
    const compound = app.createCompound([cl, h, o]);

    if (!resolver.formBond(cl, 'right', h, 'left')) {
      return { ok: false, error: 'Cl–H bond failed' };
    }
    compound.addBond({
      id: 'b1', atomA: cl, atomB: h, slotA: 'right', slotB: 'left', order: 'single',
    });

    if (!resolver.formClDativeBond(cl, 'up', o, 'down', compound, compound)) {
      return { ok: false, error: 'formClDativeBond failed' };
    }
    compound.addBond({
      id: 'b2', atomA: cl, atomB: o, slotA: 'up', slotB: 'down', order: 'cl_dative',
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
        !compound.metadata?.localOverride &&
        compound.metadata?.molecularFormula === 'ClHO',
      name: compound.name,
      smiles: compound.metadata?.smiles,
      formula: compound.metadata?.molecularFormula,
      validationState: compound.validationState,
      localOverride: compound.metadata?.localOverride,
      cid: compound.metadata?.cid,
    };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result);
    process.exit(1);
  }
  console.log('PASS: H–Cl→O validated as', result.name);
  console.log('SMILES:', result.smiles);
  console.log('Formula:', result.formula);
  console.log('PubChem CID:', result.cid);
  console.log('Local override:', result.localOverride);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
