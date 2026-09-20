/**
 * End-to-end: CO co_dative → molfile → RDKit → SMILES → PubChem validation
 * Run: node test/co-dative-pipeline.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CO_SMILES = '[C-]#[O+]';
const CO_CID = 281;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function startServer(port = 3472) {
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
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.initRDKitModule === 'function', { timeout: 30000 });
  await page.waitForFunction(() => window.app?.validationPipeline?.validate, { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const app = window.app;
    app.compounds.length = 0;

    const c = app.createAtom('C', 200, 200);
    const o = app.createAtom('O', 280, 200);
    const compound = app.createCompound([c, o]);
    const resolver = app.snapEngine.electronResolver;

    if (!resolver.formBond(c, 'right', o, 'left')) {
      return { ok: false, error: 'formBond failed' };
    }

    const bond = { id: 'co-bond', atomA: c, atomB: o, slotA: 'right', slotB: 'left', order: 'single' };
    compound.addBond(bond);

    for (const step of ['double', 'co_dative']) {
      if (!app.snapEngine.cycleBondOrder(bond, compound)) {
        return { ok: false, error: `cycle to ${step} failed`, order: bond.order };
      }
    }

    const balanced = compound.isFullyBalanced();
    const odx = c.x - o.x;
    const ody = c.y - o.y;
    const oLen = Math.hypot(odx, ody) || 1;
    const opy = odx / oLen;
    const coLineOffsets = [-6, 0, 6];
    const arrowOff = opy >= 0 ? 6 : -6;
    const plainOffsets = coLineOffsets.filter((o) => o !== arrowOff);
    const arrowOverlapsPlain = plainOffsets.includes(arrowOff);
    const arrowPointsDown = opy * arrowOff >= 0;

    // Build molfile the same way the app does (inline replicate)
    const atoms = compound.atoms;
    const bonds = compound.bonds;
    const atomIndex = new Map(atoms.map((a, i) => [a.id, i + 1]));
    const molSymbol = (el) => (el.length === 1 ? ' ' + el + ' ' : ' ' + el);
    let block = '\n     Chemical Discovery Sandbox 2D\n\n';
    block += String(atoms.length).padStart(3) + String(bonds.length).padStart(3) +
      '  0  0  0  0  0  0  0  0  0999 V2000\n';
    for (const atom of atoms) {
      const x = (atom.x / 40).toFixed(4);
      const y = (-atom.y / 40).toFixed(4);
      block += x.padStart(10) + y.padStart(10) + '0.0000'.padStart(10) + molSymbol(atom.element) +
        '  0  0  0  0  0  0  0  0  0  0  0  0\n';
    }
    for (const b of bonds) {
      const order = b.order === 'co_dative' ? 3 : (b.order === 'double' ? 2 : 1);
      block += String(atomIndex.get(b.atomA.id)).padStart(3) +
        String(atomIndex.get(b.atomB.id)).padStart(3) +
        String(order).padStart(3) + '  0  0  0  0\n';
      if (b.order === 'co_dative') {
        const cIdx = atomIndex.get(c.id);
        const oIdx = atomIndex.get(o.id);
        block += 'M  CHG  2' +
          String(cIdx).padStart(4) + String(-1).padStart(4) +
          String(oIdx).padStart(4) + String(1).padStart(4) + '\n';
      }
    }
    const molfile = block + 'M  END\n';
    const molfileHasTriple = /\n\s+\d+\s+\d+\s+3\s+/.test(molfile);
    const molfileHasCharges = molfile.includes('M  CHG');

    let smiles = null;
    let rdkitError = null;
    try {
      const RDKit = await window.initRDKitModule();
      const mol = RDKit.get_mol(molfile);
      if (!mol) throw new Error('RDKit.get_mol returned null');
      smiles = mol.get_smiles();
      mol.delete();
    } catch (e) {
      rdkitError = e.message;
    }

    let pubchem = null;
    if (smiles) {
      const encoded = encodeURIComponent(smiles);
      const cidRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/cids/JSON?smiles=${encoded}`);
      const cidData = await cidRes.json();
      const cid = cidData.IdentifierList?.CID?.[0];
      let name = null;
      if (cid) {
        const propRes = await fetch(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IUPACName/JSON`);
        const propData = await propRes.json();
        name = propData.PropertyTable?.Properties?.[0]?.IUPACName;
      }
      pubchem = { cid, name };
    }

    app.validationPipeline.checkAndValidate([compound]);
    await new Promise((r) => setTimeout(r, 5000));

    return {
      ok: true,
      bondOrder: bond.order,
      balanced,
      arrowOff,
      plainOffsets,
      arrowOverlapsPlain,
      arrowPointsDown,
      molfile,
      molfileHasTriple,
      molfileHasCharges,
      smiles,
      rdkitError,
      pubchem,
      validationState: compound.validationState,
      compoundName: compound.name,
      compoundSmiles: compound.metadata?.smiles,
      cOrbitals: { ...c.orbitals },
      oOrbitals: { ...o.orbitals },
    };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result.error, result);
    process.exit(1);
  }

  console.log('Bond order:', result.bondOrder);
  console.log('Fully balanced:', result.balanced);
  console.log('Arrow layout:', { plainOffsets: result.plainOffsets, arrowOff: result.arrowOff, overlaps: result.arrowOverlapsPlain, pointsDown: result.arrowPointsDown });
  console.log('Molfile triple bond:', result.molfileHasTriple);
  console.log('Molfile formal charges:', result.molfileHasCharges);
  console.log('Molfile:\n', result.molfile);
  console.log('RDKit SMILES:', result.smiles, result.rdkitError || '');
  console.log('PubChem:', result.pubchem);
  console.log('Validation:', {
    state: result.validationState,
    name: result.compoundName,
    smiles: result.compoundSmiles,
  });

  if (logs.length) {
    console.log('\nBrowser logs:');
    logs.forEach((l) => console.log(' ', l));
  }

  const smilesOk = result.smiles === CO_SMILES;
  const pubchemOk = result.pubchem?.cid === CO_CID;
  const validated = result.validationState === 'validated';
  const nameOk = result.compoundName && /carbon monoxide/i.test(result.compoundName);
  const layoutOk = !result.arrowOverlapsPlain && result.arrowPointsDown;

  console.log('\n=== SUMMARY ===');
  console.log('SMILES correct:', smilesOk);
  console.log('PubChem CID 281:', pubchemOk);
  console.log('Validated:', validated, result.compoundName || '');
  console.log('Name recognized:', nameOk);
  console.log('Arrow on screen bottom:', result.arrowPointsDown);

  if (!smilesOk || !pubchemOk || !validated || !layoutOk) process.exit(1);
  console.log('\nPASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
