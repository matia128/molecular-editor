/**
 * Deep encoding investigation + extensive InChI vs SMILES PubChem comparison.
 * Run: node test/pubchem-encoding-survey.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startServer(port = 3495) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      try {
        res.writeHead(200);
        res.end(readFileSync(join(ROOT, path)));
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolve({ server, url: `http://127.0.0.1:${port}` }));
  });
}

function mol(atoms, bonds, chargeLine) {
  const lines = ['', '     probe', '', ` ${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0  0999 V2000`];
  for (const [x, y, el] of atoms) {
    const sym = el.length === 1 ? ` ${el} ` : ` ${el}`;
    lines.push(`${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${'0.0000'.padStart(10)}${sym}  0  0  0  0  0  0  0  0  0  0  0  0`);
  }
  for (const [a, b, order] of bonds) {
    lines.push(`${String(a).padStart(3)}${String(b).padStart(3)}${String(order).padStart(3)}  0  0  0  0`);
  }
  if (chargeLine) lines.push(chargeLine);
  lines.push('M  END', '');
  return lines.join('\n');
}

async function pubchemLookup(inchi, smiles) {
  async function lookup(via, query) {
    try {
      const r = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${via}/cids/JSON?${via}=` +
        encodeURIComponent(query),
      );
      const cid = (await r.json()).IdentifierList?.CID?.[0];
      if (!cid) return { cid: null, title: null, iupac: null, formula: null };
      const p = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,IUPACName,MolecularFormula/JSON`,
      );
      const props = (await p.json()).PropertyTable?.Properties?.[0] || {};
      return {
        cid,
        title: props.Title || null,
        iupac: props.IUPACName || null,
        formula: props.MolecularFormula || null,
      };
    } catch {
      return { cid: null, title: null, iupac: null, formula: null };
    }
  }
  return {
    inchi: inchi ? await lookup('inchi', inchi) : null,
    smiles: smiles ? await lookup('smiles', smiles) : null,
  };
}

function label(entry) {
  if (!entry || !entry.cid) return '—';
  return entry.title || entry.iupac || `CID ${entry.cid}`;
}

function usable(entry) {
  if (!entry || !entry.cid) return false;
  const n = entry.title || entry.iupac;
  return n && n !== 'Unknown' && !/^CID\s+\d+$/i.test(n);
}

function outcome(inchiPub, smilesPub, expectedHint) {
  const iOk = usable(inchiPub);
  const sOk = usable(smilesPub);
  const same = inchiPub.cid && smilesPub.cid && inchiPub.cid === smilesPub.cid;
  const iName = label(inchiPub);
  const sName = label(smilesPub);
  let category;
  if (iOk && sOk && same && iName.toLowerCase().includes(expectedHint?.toLowerCase?.() || 'xxx')) {
    category = 'both-agree-correct';
  } else if (iOk && sOk && same) {
    category = 'both-agree-different-name';
  } else if (iOk && sOk && !same) {
    category = 'both-usable-different-cid';
  } else if (!iOk && sOk) {
    category = 'smiles-only';
  } else if (iOk && !sOk) {
    category = 'inchi-only';
  } else {
    category = 'neither';
  }
  return { category, iOk, sOk, same };
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app && window.__chemTest?.generateMolfile);

  const encodingVariants = {
    'H3NO: app export (single+N+O-)': null,
    'H3NO: N=O double neutral': mol(
      [[5, -5, 'N'], [3, -5, 'H'], [5, -7, 'H'], [7, -5, 'H'], [5, -2, 'O']],
      [[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 2]], null),
    'H3NO: single+N+O- (reference)': mol(
      [[5, -5, 'N'], [3, -5, 'H'], [5, -7, 'H'], [7, -5, 'H'], [5, -2, 'O']],
      [[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 1]], 'M  CHG  2   1   1   5  -1'),
    'H3NO: hydroxylamine HO-NH2': mol(
      [[5, -5, 'N'], [3, -5, 'H'], [5, -7, 'H'], [7, -5, 'O'], [9, -5, 'H']],
      [[1, 2, 1], [1, 3, 1], [1, 4, 1], [4, 5, 1]], null),
    'CH5NO: N=O double + CH3 + 2H': mol(
      [[5, -5, 'N'], [3, -5, 'C'], [5, -7, 'H'], [7, -5, 'H'], [5, -2, 'O'],
        [1, -5, 'H'], [3, -7, 'H'], [3, -3, 'H']],
      [[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 2], [2, 6, 1], [2, 7, 1], [2, 8, 1]], null),
    'CH5NO: single+N+O- + CH3 + 2H': mol(
      [[5, -5, 'N'], [3, -5, 'C'], [5, -7, 'H'], [7, -5, 'H'], [5, -2, 'O'],
        [1, -5, 'H'], [3, -7, 'H'], [3, -3, 'H']],
      [[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 1], [2, 6, 1], [2, 7, 1], [2, 8, 1]],
      'M  CHG  2   1   1   5  -1'),
    'C3H9NO: N=O double + 3CH3': mol(
      [[5, -5, 'N'], [3, -5, 'C'], [5, -7, 'C'], [7, -5, 'C'], [5, -2, 'O'],
        [1, -5, 'H'], [1, -7, 'H'], [1, -3, 'H'], [3, -9, 'H'], [3, -11, 'H'], [3, -7, 'H'],
        [7, -7, 'H'], [7, -3, 'H'], [9, -5, 'H']],
      [[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 2],
        [2, 6, 1], [2, 7, 1], [2, 8, 1], [3, 9, 1], [3, 10, 1], [3, 11, 1],
        [4, 12, 1], [4, 13, 1], [4, 14, 1]], null),
    'C3H9NO: single+N+O- + 3CH3': mol(
      [[5, -5, 'N'], [3, -5, 'C'], [5, -7, 'C'], [7, -5, 'C'], [5, -2, 'O'],
        [1, -5, 'H'], [1, -7, 'H'], [1, -3, 'H'], [3, -9, 'H'], [3, -11, 'H'], [3, -7, 'H'],
        [7, -7, 'H'], [7, -3, 'H'], [9, -5, 'H']],
      [[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 1],
        [2, 6, 1], [2, 7, 1], [2, 8, 1], [3, 9, 1], [3, 10, 1], [3, 11, 1],
        [4, 12, 1], [4, 13, 1], [4, 14, 1]],
      'M  CHG  2   1   1   5  -1'),
  };

  const staticMolfiles = Object.fromEntries(
    Object.entries(encodingVariants).filter(([, v]) => v),
  );

  const appResults = await page.evaluate(async (encInput) => {
    const app = window.app;
    const resolver = app.snapEngine.electronResolver;
    const SLOT_PARTNER = { left: 'right', right: 'left', up: 'down', down: 'up' };
    const SLOT_POS = { left: [-80, 0], right: [80, 0], up: [0, -80], down: [0, 80] };

    function rdkitFromMolfile(molfile) {
      return window.initRDKitModule().then(function (RDKit) {
        var mol = RDKit.get_mol(molfile);
        if (!mol) return { ok: false };
        try {
          return { ok: true, inchi: mol.get_inchi(), smiles: mol.get_smiles() };
        } finally {
          mol.delete();
        }
      });
    }

    function attachMethylHydrogens(c, cBondSlot, atoms, bonds, idPrefix) {
      var hLayouts = {
        left: [
          { cSlot: 'up', dx: 0, dy: -80, hSlot: 'down' },
          { cSlot: 'down', dx: 0, dy: 80, hSlot: 'up' },
          { cSlot: 'right', dx: 80, dy: 0, hSlot: 'left' },
        ],
        right: [
          { cSlot: 'up', dx: 0, dy: -80, hSlot: 'down' },
          { cSlot: 'down', dx: 0, dy: 80, hSlot: 'up' },
          { cSlot: 'left', dx: -80, dy: 0, hSlot: 'right' },
        ],
        up: [
          { cSlot: 'left', dx: -80, dy: 0, hSlot: 'right' },
          { cSlot: 'right', dx: 80, dy: 0, hSlot: 'left' },
          { cSlot: 'down', dx: 0, dy: 80, hSlot: 'up' },
        ],
        down: [
          { cSlot: 'left', dx: -80, dy: 0, hSlot: 'right' },
          { cSlot: 'right', dx: 80, dy: 0, hSlot: 'left' },
          { cSlot: 'up', dx: 0, dy: -80, hSlot: 'down' },
        ],
      };
      var layout = hLayouts[cBondSlot];
      for (var i = 0; i < layout.length; i++) {
        var spec = layout[i];
        var h = app.createAtom('H', c.x + spec.dx, c.y + spec.dy);
        atoms.push(h);
        resolver.formBond(c, spec.cSlot, h, spec.hSlot);
        bonds.push({
          id: idPrefix + '-h' + i,
          atomA: c, atomB: h, slotA: spec.cSlot, slotB: spec.hSlot, order: 'single',
        });
      }
    }

    function buildAmineOxide(label, methylCount, hydrogenCount) {
      app.compounds.length = 0;
      var n = app.createAtom('N', 200, 200);
      var o = app.createAtom('O', 200, 80);
      var atoms = [n, o];
      var bonds = [];
      var substSlots = ['left', 'down', 'right'];
      var slotIdx = 0;
      for (var hi = 0; hi < hydrogenCount; hi++) {
        var hSlot = substSlots[slotIdx++];
        var hPos = SLOT_POS[hSlot];
        var h = app.createAtom('H', n.x + hPos[0], n.y + hPos[1]);
        atoms.push(h);
        resolver.formBond(n, hSlot, h, SLOT_PARTNER[hSlot]);
        bonds.push({
          id: label + '-h' + hi,
          atomA: n, atomB: h, slotA: hSlot, slotB: SLOT_PARTNER[hSlot], order: 'single',
        });
      }
      for (var mi = 0; mi < methylCount; mi++) {
        var cSlot = substSlots[slotIdx++];
        var cPos = SLOT_POS[cSlot];
        var c = app.createAtom('C', n.x + cPos[0], n.y + cPos[1]);
        atoms.push(c);
        resolver.formBond(n, cSlot, c, SLOT_PARTNER[cSlot]);
        bonds.push({
          id: label + '-c' + mi,
          atomA: n, atomB: c, slotA: cSlot, slotB: SLOT_PARTNER[cSlot], order: 'single',
        });
        attachMethylHydrogens(c, SLOT_PARTNER[cSlot], atoms, bonds, label + '-c' + mi);
      }
      var compound = app.createCompound(atoms);
      compound.bonds = bonds;
      if (!resolver.formNDativeBond(n, 'up', o, 'down')) {
        return { ok: false, error: label + ': dative failed' };
      }
      compound.bonds.push({
        id: label + '-d', atomA: n, atomB: o, slotA: 'up', slotB: 'down', order: 'n_dative',
      });
      return window.__chemTest.generateMolfile(compound);
    }

    function buildHno2Resonance() {
      app.compounds.length = 0;
      var n = app.createAtom('N', 200, 200);
      var h = app.createAtom('H', 120, 200);
      var oType2 = app.createAtom('O', 280, 200);
      var oRecv = app.createAtom('O', 200, 80);
      n.orbitals = { up: 2, left: 'single', right: 'double', down: 0 };
      h.orbitals = { up: 0, down: 0, left: 0, right: 'single' };
      oType2.orbitals = { up: 2, down: 2, left: 'double', right: 0 };
      var compound = app.createCompound([n, h, oType2, oRecv]);
      compound.bonds = [
        { id: 'bh', atomA: n, atomB: h, slotA: 'left', slotB: 'right', order: 'single' },
        { id: 'bo', atomA: n, atomB: oType2, slotA: 'right', slotB: 'left', order: 'double' },
      ];
      resolver.formNDativeBond(n, 'up', oRecv, 'down');
      compound.bonds.push({
        id: 'bd', atomA: n, atomB: oRecv, slotA: 'up', slotB: 'down', order: 'n_dative',
      });
      n.nDativeHub = {
        loneSlot: 'up', receiverBondId: 'bd', type2BondId: 'bo',
        resonanceActive: true, resonanceState: 0,
      };
      return window.__chemTest.generateMolfile(compound);
    }

    function buildSimple(label, builder) {
      try {
        return builder();
      } catch (e) {
        return { error: e.message };
      }
    }

    var specs = [
      ['Azane oxide (app export)', buildAmineOxide('azane', 0, 3)],
      ['Methylamine oxide (app export)', buildAmineOxide('methylamine', 1, 2)],
      ['Dimethylamine oxide (app export)', buildAmineOxide('dimethylamine', 2, 1)],
      ['Trimethylamine oxide (app export)', buildAmineOxide('trimethylamine', 3, 0)],
      ['HNO2 resonance (app export)', buildHno2Resonance()],
      ['Ammonia NH3', buildSimple('nh3', function () {
        app.compounds.length = 0;
        var n = app.createAtom('N', 200, 200);
        var atoms = [n];
        var bonds = [];
        var slots = ['left', 'down', 'right'];
        for (var i = 0; i < 3; i++) {
          var pos = SLOT_POS[slots[i]];
          var h = app.createAtom('H', n.x + pos[0], n.y + pos[1]);
          atoms.push(h);
          resolver.formBond(n, slots[i], h, SLOT_PARTNER[slots[i]]);
          bonds.push({
            id: 'h' + i, atomA: n, atomB: h,
            slotA: slots[i], slotB: SLOT_PARTNER[slots[i]], order: 'single',
          });
        }
        var c = app.createCompound(atoms);
        c.bonds = bonds;
        return window.__chemTest.generateMolfile(c);
      })],
      ['Methylamine CH3NH2', buildSimple('ch3nh2', function () {
        app.compounds.length = 0;
        var n = app.createAtom('N', 200, 200);
        var c = app.createAtom('C', 120, 200);
        var atoms = [n, c];
        var bonds = [];
        resolver.formBond(n, 'left', c, 'right');
        bonds.push({ id: 'nc', atomA: n, atomB: c, slotA: 'left', slotB: 'right', order: 'single' });
        attachMethylHydrogens(c, 'right', atoms, bonds, 'c');
        var hSlots = ['down', 'right'];
        for (var j = 0; j < 2; j++) {
          var hs = hSlots[j];
          var hp = SLOT_POS[hs];
          var h = app.createAtom('H', n.x + hp[0], n.y + hp[1]);
          atoms.push(h);
          resolver.formBond(n, hs, h, SLOT_PARTNER[hs]);
          bonds.push({
            id: 'nh' + j, atomA: n, atomB: h, slotA: hs, slotB: SLOT_PARTNER[hs], order: 'single',
          });
        }
        var c2 = app.createCompound(atoms);
        c2.bonds = bonds;
        return window.__chemTest.generateMolfile(c2);
      })],
      ['Trimethylamine (CH3)3N', buildSimple('tma', function () {
        app.compounds.length = 0;
        var n = app.createAtom('N', 200, 200);
        var atoms = [n];
        var bonds = [];
        var substSlots = ['left', 'down', 'right'];
        for (var mi = 0; mi < 3; mi++) {
          var cSlot = substSlots[mi];
          var cPos = SLOT_POS[cSlot];
          var c = app.createAtom('C', n.x + cPos[0], n.y + cPos[1]);
          atoms.push(c);
          resolver.formBond(n, cSlot, c, SLOT_PARTNER[cSlot]);
          bonds.push({
            id: 'c' + mi, atomA: n, atomB: c,
            slotA: cSlot, slotB: SLOT_PARTNER[cSlot], order: 'single',
          });
          attachMethylHydrogens(c, SLOT_PARTNER[cSlot], atoms, bonds, 'c' + mi);
        }
        var c3 = app.createCompound(atoms);
        c3.bonds = bonds;
        return window.__chemTest.generateMolfile(c3);
      })],
      ['Water H2O', buildSimple('water', function () {
        app.compounds.length = 0;
        var o = app.createAtom('O', 200, 200);
        var h1 = app.createAtom('H', 120, 200);
        var h2 = app.createAtom('H', 200, 120);
        var c = app.createCompound([o, h1, h2]);
        resolver.formBond(o, 'left', h1, 'right');
        resolver.formBond(o, 'up', h2, 'down');
        c.bonds = [
          { id: 'a', atomA: o, atomB: h1, slotA: 'left', slotB: 'right', order: 'single' },
          { id: 'b', atomA: o, atomB: h2, slotA: 'up', slotB: 'down', order: 'single' },
        ];
        return window.__chemTest.generateMolfile(c);
      })],
      ['Hydroxylamine H2NOH (no dative)', buildSimple('h2noh', function () {
        app.compounds.length = 0;
        var n = app.createAtom('N', 200, 200);
        var o = app.createAtom('O', 280, 200);
        var h1 = app.createAtom('H', 120, 200);
        var h2 = app.createAtom('H', 200, 280);
        var h3 = app.createAtom('H', 280, 120);
        var c = app.createCompound([n, o, h1, h2, h3]);
        resolver.formBond(n, 'left', h1, 'right');
        resolver.formBond(n, 'down', h2, 'left');
        resolver.formBond(n, 'right', o, 'left');
        resolver.formBond(o, 'up', h3, 'down');
        c.bonds = [
          { id: 'a', atomA: n, atomB: h1, slotA: 'left', slotB: 'right', order: 'single' },
          { id: 'b', atomA: n, atomB: h2, slotA: 'down', slotB: 'left', order: 'single' },
          { id: 'c', atomA: n, atomB: o, slotA: 'right', slotB: 'left', order: 'single' },
          { id: 'd', atomA: o, atomB: h3, slotA: 'up', slotB: 'down', order: 'single' },
        ];
        return window.__chemTest.generateMolfile(c);
      })],
    ];

    var out = {};
    for (var si = 0; si < specs.length; si++) {
      var name = specs[si][0];
      var mf = specs[si][1];
      if (!mf || mf.error) {
        out[name] = { ok: false, error: mf && mf.error ? mf.error : 'build failed' };
        continue;
      }
      out[name] = await rdkitFromMolfile(mf);
      out[name].molfileHasCharges = mf.includes('M  CHG');
    }

    var enc = {};
    for (var key in encInput) {
      enc[key] = await rdkitFromMolfile(encInput[key]);
    }
    out.__encodingVariants = enc;
    return out;
  }, staticMolfiles);

  await browser.close();
  server.close();

  const rows = [];
  console.log('=== ENCODING VARIANT COMPARISON (is our charge export the problem?) ===\n');
  for (const [name, r] of Object.entries(appResults.__encodingVariants || {})) {
    if (!r.ok) {
      console.log(name + ': RDKit PARSE FAIL');
      continue;
    }
    const pub = await pubchemLookup(r.inchi, r.smiles);
    console.log(name);
    console.log('  InChI:', r.inchi);
    console.log('  SMILES:', r.smiles);
    console.log('  InChI→PubChem:', label(pub.inchi), pub.inchi.formula);
    console.log('  SMILES→PubChem:', label(pub.smiles), pub.smiles.formula);
    console.log('  Same CID:', pub.inchi.cid === pub.smiles.cid ? 'yes' : 'NO');
    console.log('');
  }

  console.log('\n=== APP EXPORT PIPELINE (generateMolfile → RDKit → PubChem) ===\n');

  const expected = {
    'Azane oxide (app export)': 'azane',
    'Methylamine oxide (app export)': 'methylamine',
    'Dimethylamine oxide (app export)': 'dimethylamine',
    'Trimethylamine oxide (app export)': 'trimethylamine',
    'HNO2 resonance (app export)': 'nitrous',
    'Ammonia NH3': 'ammonia',
    'Methylamine CH3NH2': 'methylamine',
    'Trimethylamine (CH3)3N': 'trimethylamine',
    'Water H2O': 'water',
    'Hydroxylamine H2NOH (no dative)': 'hydroxylamine',
  };

  for (const [name, r] of Object.entries(appResults)) {
    if (name === '__encodingVariants') continue;
    if (!r.ok) {
      console.log(name + ': FAILED — ' + (r.error || 'RDKit parse fail'));
      rows.push({ name, category: 'parse-fail' });
      continue;
    }
    const pub = await pubchemLookup(r.inchi, r.smiles);
    const cat = outcome(pub.inchi, pub.smiles, expected[name] || '');
    rows.push({
      name,
      category: cat.category,
      inchi: r.inchi,
      smiles: r.smiles,
      inchiName: label(pub.inchi),
      smilesName: label(pub.smiles),
      inchiFormula: pub.inchi.formula,
      smilesFormula: pub.smiles.formula,
      sameCid: pub.inchi.cid === pub.smiles.cid,
      hasCharges: r.molfileHasCharges,
    });
    console.log(name + (r.molfileHasCharges ? ' [charged export]' : ' [neutral export]'));
    console.log('  InChI:', r.inchi);
    console.log('  SMILES:', r.smiles);
    console.log('  InChI→PubChem:', label(pub.inchi), '|', pub.inchi.formula || '—');
    console.log('  SMILES→PubChem:', label(pub.smiles), '|', pub.smiles.formula || '—');
    console.log('  Category:', cat.category);
    console.log('');
  }

  console.log('\n=== SUMMARY BY CATEGORY ===\n');
  const counts = {};
  for (const r of rows) {
    counts[r.category] = (counts[r.category] || 0) + 1;
  }
  for (const [cat, n] of Object.entries(counts)) {
    console.log(`  ${cat}: ${n}`);
  }

  console.log('\n=== KEY FINDINGS ===\n');
  const enc = appResults.__encodingVariants || {};
  const h3single = enc['H3NO: single+N+O- (reference)'];
  const h3double = enc['H3NO: N=O double neutral'];
  if (h3single?.ok && h3double?.ok) {
    console.log('H3NO single+charges vs N=O double:');
    console.log('  Same InChI?', h3single.inchi === h3double.inchi ? 'YES (RDKit canonicalizes identically)' : 'NO');
    console.log('  Same SMILES?', h3single.smiles === h3double.smiles ? 'YES' : 'NO');
  }

  console.log('\nMolecules where InChI and SMILES disagree on CID:');
  for (const r of rows) {
    if (r.category === 'both-usable-different-cid' || r.category === 'smiles-only' || r.category === 'inchi-only') {
      console.log(`  ${r.name}: InChI=${r.inchiName} (${r.inchiFormula}) | SMILES=${r.smilesName} (${r.smilesFormula})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
