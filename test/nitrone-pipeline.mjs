/**
 * Methylene nitrone vs formaldoxime — same CH3NO formula, PubChem maps both to CID 6350.
 * Run: node test/nitrone-pipeline.mjs
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
    const resolver = app.snapEngine.electronResolver;

    async function validateCompound(label, setup) {
      app.compounds.length = 0;
      const compound = setup();
      app.renderer.refresh();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout ' + label)), 60000);
        const original = app.validationPipeline.onStatusChange;
        app.validationPipeline.onStatusChange = function (msg) {
          if (msg.startsWith('Identified:') || msg.includes('not recognized')) {
            clearTimeout(timeout);
            app.validationPipeline.onStatusChange = original;
            resolve(msg);
          }
        };
        app.validationPipeline.validate(compound);
      });
      return {
        label,
        name: compound.name,
        iupacName: compound.metadata?.iupacName,
        state: compound.validationState,
        localOverride: compound.metadata?.localOverride,
        hasSdf3d: !!compound.metadata?.sdf3d,
        description: compound.metadata?.description,
        hasDative: compound.bonds.some((b) => b.order === 'n_dative'),
      };
    }

    const nitrone = await validateCompound('nitrone', () => {
      const n = app.createAtom('N', 200, 200);
      const h = app.createAtom('H', 120, 200);
      const c = app.createAtom('C', 280, 200);
      const h1 = app.createAtom('H', 320, 280);
      const h2 = app.createAtom('H', 320, 120);
      const o = app.createAtom('O', 200, 80);
      const compound = app.createCompound([n, h, c, h1, h2, o]);
      resolver.formBond(n, 'left', h, 'right');
      resolver.formBond(n, 'right', c, 'left');
      resolver.formBond(c, 'down', h1, 'left');
      resolver.formBond(c, 'up', h2, 'left');
      compound.bonds.push(
        { id: 'bh', atomA: n, atomB: h, slotA: 'left', slotB: 'right', order: 'single' },
        { id: 'bc', atomA: n, atomB: c, slotA: 'right', slotB: 'left', order: 'single' },
        { id: 'c1', atomA: c, atomB: h1, slotA: 'down', slotB: 'left', order: 'single' },
        { id: 'c2', atomA: c, atomB: h2, slotA: 'up', slotB: 'left', order: 'single' },
      );
      app.snapEngine.cycleBondOrder(compound.bonds.find((b) => b.id === 'bc'), compound);
      resolver.formNDativeBond(n, 'up', o, 'down');
      compound.bonds.push({ id: 'bd', atomA: n, atomB: o, slotA: 'up', slotB: 'down', order: 'n_dative' });
      return compound;
    });

    const oxime = await validateCompound('oxime', () => {
      const h = app.createAtom('H', 80, 200);
      const o = app.createAtom('O', 160, 200);
      const n = app.createAtom('N', 240, 200);
      const c = app.createAtom('C', 320, 200);
      const h1 = app.createAtom('H', 360, 280);
      const h2 = app.createAtom('H', 360, 120);
      const compound = app.createCompound([h, o, n, c, h1, h2]);
      resolver.formBond(h, 'right', o, 'left');
      resolver.formBond(o, 'right', n, 'left');
      resolver.formBond(n, 'right', c, 'left');
      resolver.formBond(c, 'down', h1, 'left');
      resolver.formBond(c, 'up', h2, 'left');
      compound.bonds.push(
        { id: 'ho', atomA: h, atomB: o, slotA: 'right', slotB: 'left', order: 'single' },
        { id: 'on', atomA: o, atomB: n, slotA: 'right', slotB: 'left', order: 'single' },
        { id: 'nc', atomA: n, atomB: c, slotA: 'right', slotB: 'left', order: 'single' },
        { id: 'c1', atomA: c, atomB: h1, slotA: 'down', slotB: 'left', order: 'single' },
        { id: 'c2', atomA: c, atomB: h2, slotA: 'up', slotB: 'left', order: 'single' },
      );
      app.snapEngine.cycleBondOrder(compound.bonds.find((b) => b.id === 'nc'), compound);
      return compound;
    });

    return { nitrone, oxime };
  });

  await browser.close();
  server.close();

  const ok = result.nitrone.state === 'validated' &&
    result.nitrone.name === 'Nitrone' &&
    result.nitrone.localOverride &&
    result.nitrone.hasDative &&
    result.oxime.state === 'validated' &&
    result.oxime.name === 'Formaldoxime' &&
    result.oxime.localOverride &&
    !result.oxime.hasDative;

  if (!ok) {
    console.error('FAIL:', result);
    process.exit(1);
  }

  console.log('PASS: nitrone and formaldoxime distinguished');
  console.log('Nitrone:', result.nitrone.name, '|', result.nitrone.iupacName);
  console.log('Oxime:', result.oxime.name, '|', result.oxime.iupacName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
