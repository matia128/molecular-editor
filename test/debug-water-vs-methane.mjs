/**
 * Compare water vs methane through exact app pipeline
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function startServer(port = 3466) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      try { res.writeHead(200); res.end(readFileSync(join(ROOT, p))); } catch { res.writeHead(404); res.end(); }
    });
    server.listen(port, () => resolve({ server, url: `http://127.0.0.1:${port}` }));
  });
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const network = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('pubchem.ncbi.nlm.nih.gov')) {
      let body = '';
      try { body = (await res.text()).slice(0, 200); } catch {}
      network.push({ url: u.split('?')[0] + (u.includes('smiles=') ? '?smiles=...' : ''), status: res.status(), body });
    }
  });

  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__chemTest?.molfileToSmiles);

  const r = await page.evaluate(async () => {
    const app = window.app;
    const resolver = app.snapEngine.electronResolver;

    async function diagnose(label, build) {
      app.compounds.length = 0;
      const compound = build();
      app.compounds.push(compound);
      const molfile = window.__chemTest.generateMolfile(compound);
      const t0 = performance.now();
      let lookupSmiles = null;
      let smilesErr = null;
      try {
        lookupSmiles = await window.__chemTest.molfileToSmiles(molfile);
      } catch (e) {
        smilesErr = e.message;
      }
      const tSmiles = performance.now();

      let pubchemDirect = null;
      if (lookupSmiles) {
        const cidUrl = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/cids/JSON?smiles=' +
          encodeURIComponent(lookupSmiles);
        const cidRes = await fetch(cidUrl);
        pubchemDirect = { status: cidRes.status, ok: cidRes.ok };
        if (cidRes.ok) {
          const cidData = await cidRes.json();
          pubchemDirect.cid = cidData.IdentifierList?.CID?.[0];
          if (pubchemDirect.cid) {
            const propRes = await fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' +
              pubchemDirect.cid + '/property/Title,IUPACName/JSON');
            pubchemDirect.propStatus = propRes.status;
            if (propRes.ok) {
              const propData = await propRes.json();
              const props = propData.PropertyTable?.Properties?.[0] || {};
              pubchemDirect.title = props.Title;
              pubchemDirect.iupac = props.IUPACName;
            }
          }
        } else {
          pubchemDirect.body = await cidRes.text();
        }
      }
      const tPubchem = performance.now();

      app.validationPipeline.validate(compound);
      while (compound.validationState === 'validating' && performance.now() - t0 < 15000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const tDone = performance.now();

      return {
        label,
        balanced: compound.isFullyBalanced(),
        freeElectrons: compound.atoms.reduce((n, a) => n + a.countFreeElectrons(), 0),
        lookupSmiles,
        smilesErr,
        pubchemDirect,
        validationState: compound.validationState,
        name: compound.name,
        metadata: compound.metadata,
        ms: {
          smiles: Math.round(tSmiles - t0),
          pubchemDirect: Math.round(tPubchem - tSmiles),
          total: Math.round(tDone - t0),
        },
      };
    }

    const water = await diagnose('water', () => {
      const o = app.createAtom('O', 200, 200);
      const h1 = app.createAtom('H', 120, 200);
      const h2 = app.createAtom('H', 280, 200);
      resolver.formBond(o, 'left', h1, 'right');
      resolver.formBond(o, 'right', h2, 'left');
      const c = app.createCompound([o, h1, h2]);
      c.bonds = [
        { id: 'a', atomA: o, atomB: h1, slotA: 'left', slotB: 'right', order: 'single' },
        { id: 'b', atomA: o, atomB: h2, slotA: 'right', slotB: 'left', order: 'single' },
      ];
      return c;
    });

    const methane = await diagnose('methane H-fill', () => {
      const c = app.createAtom('C', 200, 200);
      const cmp = app.createCompound([c]);
      app.compounds.length = 0;
      app.compounds.push(cmp);
      app.fillFreeElectronsWithHydrogen();
      return app.compounds[0];
    });

    const methaneManual = await diagnose('methane manual', () => {
      const c = app.createAtom('C', 200, 200);
      const layouts = [
        { cSlot: 'up', dx: 0, dy: -80, hSlot: 'down' },
        { cSlot: 'down', dx: 0, dy: 80, hSlot: 'up' },
        { cSlot: 'left', dx: -80, dy: 0, hSlot: 'right' },
        { cSlot: 'right', dx: 80, dy: 0, hSlot: 'left' },
      ];
      const atoms = [c];
      const bonds = [];
      for (let i = 0; i < layouts.length; i++) {
        const spec = layouts[i];
        const h = app.createAtom('H', c.x + spec.dx, c.y + spec.dy);
        atoms.push(h);
        resolver.formBond(c, spec.cSlot, h, spec.hSlot);
        bonds.push({
          id: 'h' + i, atomA: c, atomB: h, slotA: spec.cSlot, slotB: spec.hSlot, order: 'single',
        });
      }
      const cmp = app.createCompound(atoms);
      cmp.bonds = bonds;
      return cmp;
    });

    return { water, methane, methaneManual };
  });

  console.log(JSON.stringify(r, null, 2));
  console.log('\nPubChem network:');
  network.forEach((n) => console.log(n.status, n.url, n.body?.slice(0, 120) || ''));

  await browser.close();
  server.close();
}

main().catch(console.error);
