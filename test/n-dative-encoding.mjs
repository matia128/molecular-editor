/**
 * Compare molfile encodings for n_dative → InChI
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startServer(port = 3481) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      try {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(readFileSync(join(ROOT, path)));
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolve({ server, url: `http://127.0.0.1:${port}` }));
  });
}

function buildMolfile(noBondOrder, chargeLine) {
  const lines = [
    '',
    '     test',
    '',
    '  5  4  0  0  0  0  0  0  0  0  0999 V2000',
    '    5.0000   -5.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0',
    '    3.0000   -5.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
    '    5.0000   -7.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
    '    7.0000   -5.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
    '    5.0000   -2.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0  0  0  0',
    '  1  3  1  0  0  0  0',
    '  1  4  1  0  0  0  0',
    `  1  5  ${noBondOrder}  0  0  0  0`,
  ];
  if (chargeLine) lines.push(chargeLine);
  lines.push('M  END');
  return lines.join('\n') + '\n';
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });

  const variants = [
    ['single N+ O-', buildMolfile(1, 'M  CHG  2   1   1   5  -1')],
    ['double N+', buildMolfile(2, 'M  CHG  1   1   1')],
    ['double neutral', buildMolfile(2, null)],
    ['single neutral', buildMolfile(1, null)],
  ];

  const results = await page.evaluate(async (pairs) => {
    const RDKit = await window.initRDKitModule();
    return pairs.map(([name, molfile]) => {
      const mol = RDKit.get_mol(molfile);
      const out = {
        name,
        ok: !!mol,
        inchi: mol ? mol.get_inchi() : null,
        smiles: mol ? mol.get_smiles() : null,
      };
      if (mol) mol.delete();
      return out;
    });
  }, variants);

  for (const r of results) {
    console.log(r.name, r.ok ? r.inchi : 'PARSE FAIL', r.smiles || '');
  }

  for (const r of results.filter((x) => x.inchi)) {
    const res = await fetch(
      'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchi/cids/JSON?inchi=' +
      encodeURIComponent(r.inchi),
    );
    const data = await res.json();
    const cid = data.IdentifierList?.CID?.[0];
    if (!cid) {
      console.log(r.name, 'PubChem: no CID');
      continue;
    }
    const propRes = await fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,MolecularFormula/JSON`,
    );
    const props = (await propRes.json()).PropertyTable?.Properties?.[0];
    console.log(r.name, 'PubChem CID', cid, props?.Title, props?.MolecularFormula);
  }

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
