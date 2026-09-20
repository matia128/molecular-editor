/**
 * Verify Cl→O dative bond via lone pairs after free electron is used in a normal bond.
 * Run: node test/cl-dative-bond.mjs
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

function startServer(port = 3483) {
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
  await page.goto(`${url}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.app?.snapEngine?.electronResolver?.formClDativeBond);

  const result = await page.evaluate(async () => {
    function countLonePairs(atom) {
      return ['up', 'down', 'left', 'right'].filter((s) => atom.orbitals[s] === 2).length;
    }

    function fail(msg, extra) {
      return { ok: false, error: msg, extra };
    }

    const app = window.app;
    app.compounds.length = 0;
    const resolver = app.snapEngine.electronResolver;

    const cl = app.createAtom('Cl', 200, 200);
    const h = app.createAtom('H', 280, 200);
    const oRecv = app.createAtom('O', 200, 80);
    const compound = app.createCompound([cl, h, oRecv]);

    const freeSlot = ['up', 'down', 'left', 'right'].find((s) => cl.orbitals[s] === 1);
    if (freeSlot !== 'right') {
      return fail('expected default free electron on right slot', { orbitals: { ...cl.orbitals } });
    }

    if (resolver.formClDativeBond(cl, 'up', oRecv, 'down', compound, compound)) {
      return fail('should reject dative before free electron is bonded');
    }

    if (!resolver.formBond(cl, 'right', h, 'left')) {
      return fail('Cl–H bond via free electron failed');
    }
    compound.bonds.push({
      id: 'clh', atomA: cl, atomB: h, slotA: 'right', slotB: 'left', order: 'single',
    });

    if (cl.countFreeElectrons() !== 0) {
      return fail('Cl should have no free electron after bonding H', { orbitals: { ...cl.orbitals } });
    }
    if (!window.__chemTest.chlorineIsDativeDonor(cl)) {
      return fail('Cl should enter dative-donor state after using free electron');
    }
    if (countLonePairs(cl) !== 3) {
      return fail('Cl should still have three lone pairs after Cl–H bond', { orbitals: { ...cl.orbitals } });
    }

    if (resolver.formClDativeBond(cl, 'right', oRecv, 'down', compound, compound)) {
      return fail('should reject dative from the normal-bond slot');
    }

    if (!resolver.formClDativeBond(cl, 'up', oRecv, 'down', compound, compound)) {
      return fail('formClDativeBond failed from lone-pair slot');
    }

    compound.bonds.push({
      id: 'clo',
      atomA: cl,
      atomB: oRecv,
      slotA: 'up',
      slotB: 'down',
      order: 'cl_dative',
    });

    if (cl.orbitals.up !== 'cl_dative') {
      return fail('Cl bond slot should be cl_dative', { orbitals: { ...cl.orbitals } });
    }
    if (countLonePairs(cl) !== 2) {
      return fail('Cl should have two remaining lone pairs after first dative bond', { orbitals: { ...cl.orbitals } });
    }

    const oLeft = app.createAtom('O', 120, 200);
    compound.addAtom(oLeft);

    if (!resolver.formClDativeBond(cl, 'left', oLeft, 'right', compound, compound)) {
      return fail('second formClDativeBond failed');
    }
    compound.bonds.push({
      id: 'clo2', atomA: cl, atomB: oLeft, slotA: 'left', slotB: 'right', order: 'cl_dative',
    });

    const oDown = app.createAtom('O', 200, 280);
    compound.addAtom(oDown);
    if (!resolver.formClDativeBond(cl, 'down', oDown, 'up', compound, compound)) {
      return fail('third formClDativeBond failed');
    }
    compound.bonds.push({
      id: 'clo3', atomA: cl, atomB: oDown, slotA: 'down', slotB: 'up', order: 'cl_dative',
    });

    if (countLonePairs(cl) !== 0) {
      return fail('all three pink lone pairs should be consumed by dative bonds', { orbitals: { ...cl.orbitals } });
    }
    const dativeSlots = ['up', 'down', 'left'].filter((s) => cl.orbitals[s] === 'cl_dative');
    if (dativeSlots.length !== 3) {
      return fail('Cl should have three cl_dative slots', { orbitals: { ...cl.orbitals } });
    }
    if (!cl.isValenceConsistent() || !compound.isFullyBalanced()) {
      return fail('three simultaneous cl_dative bonds should stay valence-consistent');
    }

    const dativeBond = compound.bonds.find((b) => b.id === 'clo');
    if (app.snapEngine.cycleBondOrder(dativeBond, compound)) {
      return fail('cl_dative bond should not cycle');
    }

    app.snapEngine.breakBond(dativeBond, compound);
    if (cl.orbitals.up !== 2) {
      return fail('breaking cl_dative should restore lone pair on Cl', { orbitals: { ...cl.orbitals } });
    }
    if (!window.__chemTest.chlorineIsDativeDonor(cl)) {
      return fail('Cl should stay in dative-donor state after breaking only one dative bond');
    }
    if (countLonePairs(cl) !== 1) {
      return fail('two cl_dative bonds should remain after breaking one', { orbitals: { ...cl.orbitals } });
    }
    if (!oRecv.isValenceConsistent() || oRecv.countFreeElectrons() !== 2) {
      return fail('breaking cl_dative should restore isolated O', { orbitals: { ...oRecv.orbitals } });
    }

    // Free-electron Cl + O → normal single bond, not dative.
    app.compounds.length = 0;
    const clFree = app.createAtom('Cl', 200, 200);
    const oNorm = app.createAtom('O', 320, 200);
    const cmpFree = app.createCompound([clFree, oNorm]);
    const step = app.snapEngine.buildBondSnapStep(oNorm, clFree, cmpFree, cmpFree, app.compounds);
    if (!step) return fail('buildBondSnapStep returned null for normal Cl–O');
    const normalBond = app.snapEngine.executeOneBondStep(step);
    if (!normalBond || normalBond.order !== 'single') {
      return fail('Cl free electron + O should form a normal single bond', { normalBond });
    }
    if (!window.__chemTest.chlorineIsDativeDonor(clFree)) {
      return fail('normal Cl–O via free electron should activate pink lone-pair donor state');
    }

    // Snap path: Cl–H first, then O dative.
    app.compounds.length = 0;
    const clSnap = app.createAtom('Cl', 200, 200);
    const hSnap = app.createAtom('H', 280, 200);
    const oSnap = app.createAtom('O', 200, 80);
    const cmpSnap = app.createCompound([clSnap, hSnap]);
    const cmpO = app.createCompound([oSnap]);
    resolver.formBond(clSnap, 'right', hSnap, 'left');
    cmpSnap.bonds.push({
      id: 'hs', atomA: clSnap, atomB: hSnap, slotA: 'right', slotB: 'left', order: 'single',
    });
    const snapStep = app.snapEngine.buildBondSnapStep(oSnap, clSnap, cmpSnap, cmpO, app.compounds);
    if (!snapStep) return fail('buildBondSnapStep returned null for Cl dative snap');
    const snapBond = app.snapEngine.executeOneBondStep(Object.assign({ isClDative: true }, snapStep));
    if (!snapBond || snapBond.order !== 'cl_dative') {
      return fail('executeOneBondStep cl dative snap failed', { snapBond });
    }

    // Oxygen already bonded should reject dative receiver.
    app.compounds.length = 0;
    const cl2 = app.createAtom('Cl', 200, 200);
    const h2 = app.createAtom('H', 280, 200);
    const oBusy = app.createAtom('O', 200, 280);
    const oRecv2 = app.createAtom('O', 200, 80);
    const cmpBusy = app.createCompound([cl2, h2, oBusy, oRecv2]);
    resolver.formBond(cl2, 'right', h2, 'left');
    resolver.formBond(oBusy, 'down', oRecv2, 'up');
    cmpBusy.bonds.push(
      { id: 'clh2', atomA: cl2, atomB: h2, slotA: 'right', slotB: 'left', order: 'single' },
      { id: 'oo', atomA: oBusy, atomB: oRecv2, slotA: 'down', slotB: 'up', order: 'single' },
    );
    if (resolver.formClDativeBond(cl2, 'up', oRecv2, 'down', cmpBusy, cmpBusy)) {
      return fail('should reject dative to oxygen that is already bonded');
    }

    // Molfile export: double bond + Cl+ for cheminformatics.
    app.compounds.length = 0;
    const clExp = app.createAtom('Cl', 200, 200);
    const hExp = app.createAtom('H', 280, 200);
    const oExp = app.createAtom('O', 200, 80);
    const cmpExp = app.createCompound([clExp, hExp, oExp]);
    resolver.formBond(clExp, 'right', hExp, 'left');
    resolver.formClDativeBond(clExp, 'up', oExp, 'down', cmpExp, cmpExp);
    cmpExp.bonds.push(
      { id: 'eh', atomA: clExp, atomB: hExp, slotA: 'right', slotB: 'left', order: 'single' },
      { id: 'eo', atomA: clExp, atomB: oExp, slotA: 'up', slotB: 'down', order: 'cl_dative' },
    );
    const molfile = window.__chemTest.generateMolfile(cmpExp);
    const dativeLine = molfile.split('\n').find((l) => /^\s+1\s+3\s+1/.test(l) || /^\s+3\s+1\s+1/.test(l));
    if (!dativeLine) {
      return fail('molfile should export cl_dative as bond order 1 with charges', { molfile });
    }

    return { ok: true };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result.error);
    if (result.extra) console.error(JSON.stringify(result.extra, null, 2));
    process.exit(1);
  }

  console.log('PASS: Cl→O dative bond (lone-pair donor)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
