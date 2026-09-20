/**
 * Compare molfile encodings for cl_dative export variants.
 * Run: node test/cl-dative-encoding.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startServer(port = 3485) {
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

function buildHClOMolfile(clOBondOrder, chargeLine) {
  const lines = [
    '',
    '     test',
    '',
    '  3  2  0  0  0  0  0  0  0  0  0999 V2000',
    '    5.0000   -5.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0',
    '    7.0000   -5.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
    '    5.0000   -2.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0  0  0  0',
    `  1  3  ${clOBondOrder}  0  0  0  0`,
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
    ['single Cl+ O- (export path)', buildHClOMolfile(1, 'M  CHG  2   1   1   3  -1')],
    ['double Cl+ only', buildHClOMolfile(2, 'M  CHG  1   1   1')],
    ['double neutral', buildHClOMolfile(2, null)],
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

  const exportVariant = results[0];
  if (!exportVariant.ok || exportVariant.smiles !== '[H][Cl+][O-]') {
    console.error('FAIL: export-path HClO encoding unexpected', exportVariant);
    process.exit(1);
  }

  await browser.close();
  server.close();
  console.log('PASS: cl_dative encoding variants parsed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
