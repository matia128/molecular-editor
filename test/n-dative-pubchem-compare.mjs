/**
 * Compare PubChem InChI vs SMILES lookup for N→O dative amine oxides.
 * Run: node test/n-dative-pubchem-compare.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startServer(port = 3492) {
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

async function pubchemLookup(inchi, smiles) {
  async function lookup(via, query) {
    const r = await fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${via}/cids/JSON?${via}=` +
      encodeURIComponent(query),
    );
    const cid = (await r.json()).IdentifierList?.CID?.[0];
    if (!cid) return { cid: null };
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
  }
  return {
    inchi: inchi ? await lookup('inchi', inchi) : null,
    smiles: smiles ? await lookup('smiles', smiles) : null,
  };
}

function usableName(entry) {
  if (!entry || !entry.cid) return false;
  const name = entry.title || entry.iupac;
  if (!name || name === 'Unknown') return false;
  if (/^CID\s+\d+$/i.test(name)) return false;
  return true;
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app && window.__chemTest?.generateMolfile);

  const built = await page.evaluate(() => {
    const app = window.app;
    const resolver = app.snapEngine.electronResolver;
    const SLOT_PARTNER = { left: 'right', right: 'left', up: 'down', down: 'up' };
    const SLOT_POS = {
      left: [-80, 0], right: [80, 0], up: [0, -80], down: [0, 80],
    };

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
      if (!layout) return { ok: false, error: 'unknown C bond slot ' + cBondSlot };
      for (var i = 0; i < layout.length; i++) {
        var spec = layout[i];
        var h = app.createAtom('H', c.x + spec.dx, c.y + spec.dy);
        atoms.push(h);
        if (!resolver.formBond(c, spec.cSlot, h, spec.hSlot)) {
          return { ok: false, error: 'methyl H bond failed on ' + spec.cSlot };
        }
        bonds.push({
          id: idPrefix + '-h' + i,
          atomA: c, atomB: h,
          slotA: spec.cSlot, slotB: spec.hSlot,
          order: 'single',
        });
      }
      return { ok: true };
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
        if (!resolver.formBond(n, hSlot, h, SLOT_PARTNER[hSlot])) {
          return { ok: false, error: label + ': H bond failed on ' + hSlot };
        }
        bonds.push({
          id: label + '-h' + hi,
          atomA: n, atomB: h,
          slotA: hSlot, slotB: SLOT_PARTNER[hSlot],
          order: 'single',
        });
      }

      for (var mi = 0; mi < methylCount; mi++) {
        var cSlot = substSlots[slotIdx++];
        var cPos = SLOT_POS[cSlot];
        var c = app.createAtom('C', n.x + cPos[0], n.y + cPos[1]);
        atoms.push(c);
        if (!resolver.formBond(n, cSlot, c, SLOT_PARTNER[cSlot])) {
          return { ok: false, error: label + ': methyl bond failed on ' + cSlot };
        }
        bonds.push({
          id: label + '-c' + mi,
          atomA: n, atomB: c,
          slotA: cSlot, slotB: SLOT_PARTNER[cSlot],
          order: 'single',
        });
        var methylH = attachMethylHydrogens(c, SLOT_PARTNER[cSlot], atoms, bonds, label + '-c' + mi);
        if (!methylH.ok) return methylH;
      }

      var compound = app.createCompound(atoms);
      compound.bonds = bonds;

      if (!resolver.formNDativeBond(n, 'up', o, 'down')) {
        return { ok: false, error: label + ': formNDativeBond failed', orbitals: { ...n.orbitals } };
      }
      compound.bonds.push({
        id: label + '-dative',
        atomA: n, atomB: o,
        slotA: 'up', slotB: 'down',
        order: 'n_dative',
      });

      if (!compound.isFullyBalanced()) {
        return {
          ok: false,
          error: label + ': not fully balanced',
          free: compound.atoms.map(function (a) {
            return { el: a.element, free: a.countFreeElectrons() };
          }),
        };
      }

      var molfile = window.__chemTest.generateMolfile(compound);
      return new Promise(function (resolve, reject) {
        window.initRDKitModule().then(function (RDKit) {
          var mol = RDKit.get_mol(molfile);
          if (!mol) {
            reject(new Error(label + ': RDKit could not parse molfile'));
            return;
          }
          try {
            resolve({
              ok: true,
              label: label,
              inchi: mol.get_inchi(),
              smiles: mol.get_smiles(),
              balanced: true,
            });
          } finally {
            mol.delete();
          }
        }).catch(reject);
      });
    }

    return Promise.all([
      buildAmineOxide('Methylamine oxide', 1, 2),
      buildAmineOxide('Dimethylamine oxide', 2, 1),
      buildAmineOxide('Trimethylamine oxide', 3, 0),
    ]);
  });

  await browser.close();
  server.close();

  const failures = built.filter((r) => !r.ok);
  if (failures.length) {
    console.error('Build failures:', failures);
    process.exit(1);
  }

  console.log('N→O dative amine oxides: PubChem InChI vs SMILES\n');
  console.log('(H3NO / HNO2 excluded — tested separately)\n');

  var rows = [];
  for (var i = 0; i < built.length; i++) {
    var item = built[i];
    var pub = await pubchemLookup(item.inchi, item.smiles);
    var row = {
      label: item.label,
      inchi: item.inchi,
      smiles: item.smiles,
      inchiPub: pub.inchi,
      smilesPub: pub.smiles,
      sameCid: pub.inchi.cid && pub.smiles.cid && pub.inchi.cid === pub.smiles.cid,
      inchiUsable: usableName(pub.inchi),
      smilesUsable: usableName(pub.smiles),
    };
    rows.push(row);

    console.log('--- ' + item.label + ' ---');
    console.log('InChI:  ', item.inchi);
    console.log('SMILES: ', item.smiles);
    console.log('PubChem via InChI:  ',
      pub.inchi.cid || 'none',
      pub.inchi.title || pub.inchi.iupac || '(no name)',
      '|', pub.inchi.formula || '');
    console.log('PubChem via SMILES: ',
      pub.smiles.cid || 'none',
      pub.smiles.title || pub.smiles.iupac || '(no name)',
      '|', pub.smiles.formula || '');
    console.log('Same CID:', row.sameCid ? 'yes' : 'NO');
    console.log('Usable name via InChI:', row.inchiUsable ? 'yes' : 'no');
    console.log('Usable name via SMILES:', row.smilesUsable ? 'yes' : 'no');
    if (row.smilesUsable && !row.inchiUsable) {
      console.log('→ SMILES works where InChI does not');
    } else if (row.inchiUsable && !row.smilesUsable) {
      console.log('→ InChI works where SMILES does not');
    } else if (!row.inchiUsable && !row.smilesUsable) {
      console.log('→ Neither lookup gives a usable name');
    }
    console.log('');
  }

  console.log('=== Summary ===');
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    console.log(
      r.label + ':',
      'InChI=' + (r.inchiUsable ? (r.inchiPub.title || r.inchiPub.iupac) : '—'),
      '| SMILES=' + (r.smilesUsable ? (r.smilesPub.title || r.smilesPub.iupac) : '—'),
      '| same CID=' + (r.sameCid ? 'yes' : 'no'),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
