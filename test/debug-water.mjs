/**
 * End-to-end debug: water molfile → SMILES → PubChem
 * Run: node test/debug-water.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const WATER_SMILES = 'O';
const O_RADIUS = 22 * 1.2;
const H_RADIUS = O_RADIUS * (31 / 66);
const BOND_GAP = 36;
const H_O_CENTER_DIST = H_RADIUS + BOND_GAP + O_RADIUS;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function startServer(port = 3456) {
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

function buildWaterMolfile() {
  return `\n     Chemical Discovery Sandbox 2D\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n   -2.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n    2.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\n  1  3  1  0  0  0  0\nM  END\n`;
}

async function testPubChemDirect() {
  const encoded = encodeURIComponent(WATER_SMILES);
  const cidRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/cids/JSON?smiles=${encoded}`);
  const cidData = await cidRes.json();
  const cid = cidData.IdentifierList?.CID?.[0];
  const propRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IUPACName/JSON`);
  const propData = await propRes.json();
  const name = propData.PropertyTable?.Properties?.[0]?.IUPACName;
  console.log('PubChem direct:', { cid, name, ok: cid === 962 && !!name });
  return { cid, name };
}

async function testBrowser(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.initRDKitModule === 'function', { timeout: 30000 });
  await page.waitForFunction(() => window.app && window.app.compounds !== undefined, { timeout: 10000 });

  const result = await page.evaluate(async (hDist) => {
    const resolver = window.app.snapEngine.electronResolver;

    // Build water: O center, H left & right (center distance matches snap bonding)
    const o = window.app.createAtom('O', 0, 0);
    const h1 = window.app.createAtom('H', -hDist, 0);
    const h2 = window.app.createAtom('H', hDist, 0);

    resolver.formBond(o, 'left', h1, 'right');
    resolver.formBond(o, 'right', h2, 'left');

    const bond1 = { id: 'b1', atomA: o, atomB: h1, slotA: 'left', slotB: 'right', order: 'single' };
    const bond2 = { id: 'b2', atomA: o, atomB: h2, slotA: 'right', slotB: 'left', order: 'single' };
    const compound = window.app.createCompound([o, h1, h2]);
    compound.addBond(bond1);
    compound.addBond(bond2);

    const atomStates = compound.atoms.map((a) => ({
      el: a.element,
      free: a.countFreeElectrons(),
      empty: a.countEmptySlots(),
      balanced: a.isBalanced(),
      orbitals: { ...a.orbitals },
    }));

    const checks = {
      multiAtom: compound.isMultiAtom(),
      fullyBalanced: compound.isFullyBalanced(),
      noFree: compound.hasNoFreeElectrons(),
      atomStates,
    };

    // Generate molfile via exposed logic - replicate generateMolfile inline
    const atoms = compound.atoms;
    const bonds = compound.bonds;
    const atomIndex = new Map(atoms.map((a, i) => [a.id, i + 1]));
    const ELEMENT_TO_ATOMIC_NUM = { H: 1, C: 6, N: 7, O: 8 };
    const molSymbol = (el) => (el.length === 1 ? ' ' + el + ' ' : el.padEnd(3));
    let block = '\n     Chemical Discovery Sandbox 2D\n\n';
    block += String(atoms.length).padStart(3) + String(bonds.length).padStart(3) +
      '  0  0  0  0  0  0  0  0  0999 V2000\n';
    for (const atom of atoms) {
      const x = (atom.x / 40).toFixed(4);
      const y = (-atom.y / 40).toFixed(4);
      block += x.padStart(10) + y.padStart(10) + '0.0000'.padStart(10) + molSymbol(atom.element) +
        '  0  0  0  0  0  0  0  0  0  0  0  0\n';
    }
    for (const bond of bonds) {
      const order = bond.order === 'single' ? 1 : bond.order === 'double' ? 2 : 3;
      block += String(atomIndex.get(bond.atomA.id)).padStart(3) +
        String(atomIndex.get(bond.atomB.id)).padStart(3) +
        String(order).padStart(3) + '  0  0  0  0\n';
    }
    const molfile = block + 'M  END\n';

    // RDKit SMILES
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

    // PubChem
    let pubchem = null;
    if (smiles) {
      const encoded = encodeURIComponent(smiles);
      const cidRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/cids/JSON?smiles=${encoded}`);
      const cidData = await cidRes.json();
      const cid = cidData.IdentifierList?.CID?.[0];
      pubchem = { cid, cidOk: cid === 962 };
    }

    // Run validation pipeline
    window.app.validationPipeline.checkAndValidate([compound]);
    await new Promise((r) => setTimeout(r, 3000));

    return {
      checks,
      molfile,
      smiles,
      rdkitError,
      pubchem,
      compoundName: compound.name,
      validationState: compound.validationState,
      compoundSmiles: compound.metadata?.smiles,
    };
  }, H_O_CENTER_DIST);

  await browser.close();
  return { result, logs };
}

async function testRDKitMolfile(baseUrl, molfile) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));
  page.on('pageerror', (err) => logs.push(`pageerror: ${err.message}`));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.initRDKitModule === 'function', { timeout: 30000 });
  const result = await page.evaluate(async (mf) => {
    const RDKit = await window.initRDKitModule();
    const info = { hasGetMol: typeof RDKit.get_mol === 'function' };

    const smilesMol = RDKit.get_mol('O');
    info.smilesWorks = !!smilesMol;
    if (smilesMol) {
      info.smilesInchi = smilesMol.get_inchi();
      smilesMol.delete();
    }

    const mol = RDKit.get_mol(mf);
    info.molfileWorks = !!mol;
    if (mol) {
      info.inchi = mol.get_inchi();
      mol.delete();
    } else {
      info.molfileError = 'null mol';
      const mol2 = RDKit.get_mol(mf, '{"sanitize":false}');
      info.sanitizeFalseWorks = !!mol2;
      if (mol2) {
        info.inchiNoSanitize = mol2.get_inchi();
        mol2.delete();
      }
    }

    // Round-trip: SMILES → molblock → get_mol
    const ref = RDKit.get_mol('O');
    if (ref) {
      info.referenceMolblock = ref.get_molblock();
      const roundTrip = RDKit.get_mol(info.referenceMolblock);
      info.roundTripWorks = !!roundTrip;
      if (roundTrip) {
        info.roundTripInchi = roundTrip.get_inchi();
        roundTrip.delete();
      }
      ref.delete();
    }

    return info;
  }, molfile);
  await browser.close();
  return { result, logs };
}

async function main() {
  console.log('=== PubChem direct test ===');
  await testPubChemDirect();

  console.log('\n=== Starting local server ===');
  const { server, url } = await startServer();
  try {
    console.log('\n=== Standard water molfile → RDKit ===');
    const stdMol = buildWaterMolfile();
    const rdkitStd = await testRDKitMolfile(url, stdMol);
    console.log('Standard molfile InChI:', JSON.stringify(rdkitStd.result, null, 2));
    if (rdkitStd.result.referenceMolblock) {
      console.log('RDKit reference molblock:\n' + rdkitStd.result.referenceMolblock);
      const refTest = await testRDKitMolfile(url, rdkitStd.result.referenceMolblock);
      console.log('Reference molblock parse:', refTest.result.molfileWorks, refTest.result.inchi);
    }

    console.log('\n=== Editor water compound test ===');
    const { result, logs } = await testBrowser(url);
    console.log('Balance checks:', JSON.stringify(result.checks, null, 2));
    console.log('Molfile:\n', result.molfile);
    console.log('SMILES:', result.smiles, result.rdkitError || '');
    console.log('PubChem:', result.pubchem);
    console.log('Validation:', { state: result.validationState, name: result.compoundName, smiles: result.compoundSmiles });

    if (logs.length) {
      console.log('\nBrowser logs:');
      logs.forEach((l) => console.log(' ', l));
    }

    const smilesOk = result.smiles === WATER_SMILES;
    const pubchemOk = result.pubchem?.cidOk;
    const validated = result.validationState === 'validated' && /water/i.test(result.compoundName || '');

    console.log('\n=== SUMMARY ===');
    console.log('SMILES correct:', smilesOk);
    console.log('PubChem CID 962:', pubchemOk);
    console.log('Validation showed name:', validated, result.compoundName || result.validationState);

    if (!result.checks.fullyBalanced) {
      console.log('\n>>> ROOT CAUSE: isFullyBalanced() is false');
    }

    if (!smilesOk || !pubchemOk || !validated) process.exit(1);
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
