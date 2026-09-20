import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join('img', 'ghs');
const GAP_MS = 5000;
const NEEDED = ['GHS01', 'GHS02', 'GHS03', 'GHS04', 'GHS05', 'GHS06', 'GHS07', 'GHS08', 'GHS09'];

const COMPOUNDS = [
  { name: 'hydrogen cyanide', cid: 768 },
  { name: 'ammonia', cid: 222 },
  { name: 'hydrogen', cid: 783 },
  { name: 'hydrogen peroxide', cid: 784 },
  { name: 'chlorine', cid: 24526 },
  { name: 'sulfuric acid', cid: 1118 },
  { name: 'ethanol', cid: 702 },
  { name: 'benzene', cid: 241 },
  { name: 'trinitrotoluene', cid: 8376 },
  { name: 'potassium permanganate', cid: 516875 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectGhsIcons(node, found) {
  if (!node) return;
  if (node.Information) {
    for (const info of node.Information) {
      const parts = info.Value && info.Value.StringWithMarkup;
      if (!parts) continue;
      const list = Array.isArray(parts) ? parts : [parts];
      for (const part of list) {
        const markup = part.Markup || [];
        for (const item of markup) {
          if (item.Type !== 'Icon' || !item.URL) continue;
          const match = String(item.URL).match(/GHS0[1-9]/i);
          if (!match) continue;
          const code = match[0].toUpperCase();
          if (!found[code]) {
            found[code] = { url: item.URL, label: item.Extra || code };
            console.log('  found', code, item.URL, item.Extra || '');
          }
        }
      }
    }
  }
  if (node.Section) {
    for (const child of node.Section) collectGhsIcons(child, found);
  }
}

async function fetchJson(url, extraHeaders) {
  const res = await fetch(url, {
    headers: Object.assign({
      Accept: 'application/json',
      'Sec-CH-Prefers-Color-Scheme': 'dark',
    }, extraHeaders || {}),
  });
  const text = await res.text();
  console.log(' ', res.status, url, text.slice(0, 80).replace(/\s+/g, ' '));
  if (!res.ok) return { status: res.status, data: null };
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: null };
  }
}

function darkCandidates(url) {
  const code = (String(url).match(/GHS0[1-9]/i) || [''])[0];
  return [
    url,
    url.replace(/\.svg$/i, '_dark.svg'),
    url.replace(/\/ghs\//, '/ghs/dark/'),
    url.replace(/\.svg$/i, '-dark.svg'),
    'https://pubchem.ncbi.nlm.nih.gov/images/ghs/' + code + '.svg',
    'https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?t=ghs&id=' + code,
    'https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?t=ghs&id=' + code + '&theme=dark',
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}

async function downloadBestSvg(code, url) {
  const candidates = darkCandidates(url);
  for (const candidate of candidates) {
    const res = await fetch(candidate, {
      headers: { 'Sec-CH-Prefers-Color-Scheme': 'dark', Accept: 'image/svg+xml,image/*,*/*' },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.slice(0, 200).toString('utf8');
    console.log('   asset', res.status, candidate, head.slice(0, 60).replace(/\s+/g, ' '));
    if (!res.ok) continue;
    if (head.includes('<svg') || head.includes('<?xml')) {
      const out = path.join(OUT_DIR, code + '.svg');
      fs.writeFileSync(out, buf);
      console.log('   saved', out, buf.length, 'bytes');
      return true;
    }
  }
  return false;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const found = {};
  const saved = {};

  for (const compound of COMPOUNDS) {
    const missing = NEEDED.filter((code) => !saved[code]);
    if (!missing.length) break;

    console.log('\nRequesting', compound.name, 'CID', compound.cid);
    const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/' +
      compound.cid + '/JSON/?heading=' + encodeURIComponent('Primary Hazards') +
      '&response_type=display';
    const result = await fetchJson(url);
    if (result.data && result.data.Record) {
      collectGhsIcons(result.data.Record, found);
    }

    for (const code of Object.keys(found)) {
      if (saved[code]) continue;
      await sleep(GAP_MS);
      saved[code] = await downloadBestSvg(code, found[code].url);
    }

    const still = NEEDED.filter((code) => !saved[code]);
    console.log('Still missing:', still.join(', ') || 'none');
    if (still.length) await sleep(GAP_MS);
  }

  console.log('\nSaved:', NEEDED.filter((code) => saved[code]).join(', ') || 'none');
  console.log('Missing:', NEEDED.filter((code) => !saved[code]).join(', ') || 'none');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
