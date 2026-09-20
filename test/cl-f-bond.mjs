/**
 * Verify F bonds to Cl pink lone pairs, splitting them and expanding orbital layout.
 * Run: node test/cl-f-bond.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startServer(port = 3486) {
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

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${url}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__chemTest?.formFluorideChlorineLonePairBond);

  const result = await page.evaluate(() => {
    function fail(msg, extra) {
      return { ok: false, error: msg, extra };
    }

    function countLonePairs(atom) {
      return window.__chemTest.getChlorineOrbitalSlots(atom)
        .filter((s) => atom.orbitals[s] === 2).length;
    }

    function countFreeElectrons(atom) {
      return window.__chemTest.getChlorineOrbitalSlots(atom)
        .filter((s) => atom.orbitals[s] === 1).length;
    }

    function findInvalidSplitPair(chlorine) {
      const pairs = chlorine.clExpansionPairs || [];
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (chlorine.orbitals[pair.extSlot] === undefined) return pair;
      }
      return null;
    }

    function angleDiff(a, b) {
      const d = Math.abs(((a - b) % 360 + 360) % 360);
      return d > 180 ? 360 - d : d;
    }

    function checkEvenSpacing(angles, expectedStep, anchorAngle) {
      const sorted = angles.slice().sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        const expected = ((anchorAngle + i * expectedStep) % 360 + 360) % 360;
        const nearest = sorted.reduce((best, ang) => {
          const d = Math.min(Math.abs(ang - expected), 360 - Math.abs(ang - expected));
          return d < best.d ? { ang, d } : best;
        }, { ang: sorted[0], d: Infinity });
        if (nearest.d > 2) {
          return { ok: false, expected, got: sorted, step: expectedStep, anchorAngle };
        }
      }
      return { ok: true };
    }

    function prepFluorineSlot(f, slot) {
      for (let i = 0; i < 4; i++) {
        const free = ['up', 'right', 'down', 'left'].find((s) => f.orbitals[s] === 1);
        if (free === slot) return;
        f.rotateOrbitals90();
      }
    }

    function expectPartnerAtClSlot(cl, partner, clSlot, tolerance = 2) {
      const expected = window.__chemTest.computePartnerPositionForChlorineBond(cl, clSlot, partner);
      const dx = partner.x - expected.x;
      const dy = partner.y - expected.y;
      if (Math.hypot(dx, dy) > tolerance) {
        return {
          ok: false,
          clSlot,
          expected,
          got: { x: partner.x, y: partner.y },
        };
      }
      return { ok: true };
    }

    const app = window.app;
    app.compounds.length = 0;
    const resolver = app.snapEngine.electronResolver;

    const cl = app.createAtom('Cl', 200, 200);
    const h = app.createAtom('H', 280, 200);
    const compound = app.createCompound([cl, h]);

    if (!resolver.formBond(cl, 'right', h, 'left')) return fail('Cl–H setup failed');
    compound.bonds.push({
      id: 'clh', atomA: cl, atomB: h, slotA: 'right', slotB: 'left', order: 'single',
    });

    if (!window.__chemTest.chlorineIsDativeDonor(cl)) return fail('Cl not in donor state');
    if (cl.clOrbitalCount !== 4) return fail('Cl should start with 4 orbitals');

    const hStart = { x: h.x, y: h.y };

    const f1 = app.createAtom('F', 200, 80);
    prepFluorineSlot(f1, 'down');
    compound.addAtom(f1);
    const ext1 = resolver.formFluorideChlorineLonePairBond(f1, 'down', cl, 'up', compound);
    if (!ext1) return fail('first F–Cl lone-pair bond failed');
    compound.bonds.push({
      id: 'cf1', atomA: cl, atomB: f1, slotA: 'up', slotB: 'down', order: 'single', clSplitExtSlot: ext1,
    });

    const f1Pos = expectPartnerAtClSlot(cl, f1, 'up');
    if (!f1Pos.ok) return fail('first F should move to evenly spaced orbital angle', f1Pos);
    const f1Angles = window.__chemTest.getFluorineOrbitalAngles(f1);
    const bondSlot = Object.keys(f1.orbitals).find((s) => f1.orbitals[s] === 'single');
    const fBondAngle = f1Angles[bondSlot];
    const bondToCl = Math.atan2(cl.y - f1.y, cl.x - f1.x) * 180 / Math.PI;
    if (angleDiff(fBondAngle, bondToCl) > 5) {
      return fail('F bond slot should point at chlorine', { fBondAngle, bondToCl, bondSlot });
    }
    const loneSlots = Object.keys(f1.orbitals).filter((s) => f1.orbitals[s] === 2);
    const perpendicular = loneSlots.filter((s) => Math.abs(angleDiff(f1Angles[s], fBondAngle) - 90) <= 5);
    if (perpendicular.length < 2) {
      return fail('at least two F lone pairs should sit 90° from the bond', { f1Angles, loneSlots, fBondAngle });
    }
    for (const loneSlot of loneSlots) {
      const slotAngle = f1Angles[loneSlot];
      const perp = window.__chemTest.getOrbitalPairPerp(f1, loneSlot);
      const perpAngle = Math.atan2(perp.y, perp.x) * 180 / Math.PI;
      if (Math.abs(angleDiff(perpAngle, slotAngle) - 90) > 5) {
        return fail('lone-pair dot axis should be perpendicular to the nucleus-to-pair line', {
          loneSlot, slotAngle, perpAngle,
        });
      }
      const center = window.__chemTest.getOrbitalPosition(loneSlot, 'F', f1);
      const distPlus = Math.hypot(center.x + perp.x, center.y + perp.y);
      const distMinus = Math.hypot(center.x - perp.x, center.y - perp.y);
      if (Math.abs(distPlus - distMinus) > 0.5) {
        return fail('lone-pair electrons should be equidistant from the nucleus', {
          loneSlot, distPlus, distMinus,
        });
      }
    }
    if (Math.hypot(h.x - hStart.x, h.y - hStart.y) > 2) {
      return fail('H bond partner should stay at its original position');
    }

    if (cl.clOrbitalCount !== 5) return fail('Cl should have 5 orbitals after one F bond');
    if (countLonePairs(cl) !== 2) return fail('two pink lone pairs should remain', { orbitals: { ...cl.orbitals } });
    if (countFreeElectrons(cl) !== 1) return fail('split should create one free electron on Cl');
    if (cl.orbitals[ext1] !== 1) return fail('new orbital should hold the free electron');
    if (!window.__chemTest.chlorineIsDativeDonor(cl)) return fail('Cl should stay dative donor after split');
    if (cl.clFixedAnchorSlot !== 'right') return fail('H bond slot should be the fixed redistribution anchor');

    const anchorAngle = window.__chemTest.getChlorineOrbitalAngles(cl).right;
    const angles5 = window.__chemTest.getChlorineOrbitalSlots(cl)
      .map((s) => window.__chemTest.getChlorineOrbitalAngles(cl)[s]);
    const spacing5 = checkEvenSpacing(angles5, 72, anchorAngle);
    if (!spacing5.ok) return fail('5 orbitals should be spaced 72° apart', spacing5);
    if (window.__chemTest.getChlorineOrbitalAngles(cl).right !== 0) {
      return fail('H bond slot should stay at its original angle');
    }

    const f2 = app.createAtom('F', 120, 200);
    const f3 = app.createAtom('F', 200, 320);
    prepFluorineSlot(f2, 'right');
    prepFluorineSlot(f3, 'up');
    compound.addAtom(f2);
    compound.addAtom(f3);

    const ext2 = resolver.formFluorideChlorineLonePairBond(f2, 'right', cl, 'left', compound);
    if (!ext2) return fail('second F–Cl bond failed');
    compound.bonds.push({
      id: 'cf2', atomA: cl, atomB: f2, slotA: 'left', slotB: 'right', order: 'single', clSplitExtSlot: ext2,
    });

    if (countLonePairs(cl) !== 1) {
      return fail('one pink lone pair should remain after two split bonds', { orbitals: { ...cl.orbitals } });
    }
    if (window.__chemTest.chlorineCanSplitDativeLonePair(cl, 'down')) {
      return fail('last pink lone pair should not be splittable');
    }
    if (resolver.formFluorideChlorineLonePairBond(f3, 'up', cl, 'down', compound)) {
      return fail('should reject split bond to the last pink lone pair');
    }

    prepFluorineSlot(f3, 'left');
    if (!resolver.formBond(cl, 'ext0', f3, 'left')) {
      return fail('third F should bond normally to expanded Cl orbital');
    }
    compound.bonds.push({
      id: 'cf3', atomA: cl, atomB: f3, slotA: 'ext0', slotB: 'left', order: 'single',
    });

    for (const check of [
      ['cf1', f1, 'up'],
      ['cf2', f2, 'left'],
    ]) {
      const partnerCheck = expectPartnerAtClSlot(cl, check[1], check[2]);
      if (!partnerCheck.ok) return fail('split F partners should align to redistributed angles', partnerCheck);
    }
    if (Math.hypot(h.x - hStart.x, h.y - hStart.y) > 2) {
      return fail('H bond partner should remain fixed after all F bonds');
    }

    if (cl.clOrbitalCount !== 6) return fail('Cl should have 6 orbitals after two split bonds');
    if (countLonePairs(cl) !== 1) return fail('last pink lone pair should remain unsplit');
    if (countFreeElectrons(cl) !== 1) return fail('one expanded orbital should stay a free electron');
    if (!cl.isValenceConsistent()) {
      return fail('Cl with two split and one normal F bond should stay valence-consistent');
    }

    const angles6 = window.__chemTest.getChlorineOrbitalSlots(cl)
      .map((s) => window.__chemTest.getChlorineOrbitalAngles(cl)[s]);
    const spacing6 = checkEvenSpacing(angles6, 60, anchorAngle);
    if (!spacing6.ok) return fail('6 orbitals should be spaced 60° apart', spacing6);
    if (window.__chemTest.getChlorineOrbitalAngles(cl).right !== 0) {
      return fail('H bond slot should remain fixed after all expansions');
    }

    const isolatedCl = app.createAtom('Cl', 400, 200);
    const isolatedF = app.createAtom('F', 400, 80);
    prepFluorineSlot(isolatedF, 'down');
    if (resolver.formFluorideChlorineLonePairBond(isolatedF, 'down', isolatedCl, 'up')) {
      return fail('should reject F to Cl before free electron is used');
    }

    app.snapEngine.breakBond(compound.bonds.find((b) => b.id === 'cf1'), compound);
    if (cl.countFreeElectrons() > 2) {
      return fail('chlorine should not hold more than two unpaired electrons', {
        free: cl.countFreeElectrons(),
        orbitals: { ...cl.orbitals },
      });
    }
    if (cl.orbitals.up !== 0 && cl.orbitals.up !== 1 && cl.orbitals.up !== 2) {
      return fail('split-slot electron should pair after breaking its F bond', { up: cl.orbitals.up });
    }
    if (cl.orbitals.ext0 !== 'single') {
      return fail('ext orbital should stay bonded after breaking the split partner only', {
        ext0: cl.orbitals.ext0,
      });
    }
    if (!cl.isValenceConsistent()) return fail('chlorine should stay valence-consistent after F bond break');
    if (findInvalidSplitPair(cl)) return fail('remaining split pairs should reference live ext orbitals', findInvalidSplitPair(cl));

    app.compounds.length = 0;
    const clPure = app.createAtom('Cl', 600, 200);
    const compoundPure = app.createCompound([clPure]);
    const fNormal = app.createAtom('F', 680, 200);
    prepFluorineSlot(fNormal, 'left');
    compoundPure.addAtom(fNormal);
    if (!resolver.formBond(clPure, 'right', fNormal, 'left')) return fail('ClF3 normal Cl–F setup failed');
    compoundPure.bonds.push({
      id: 'cf-p0', atomA: clPure, atomB: fNormal, slotA: 'right', slotB: 'left', order: 'single',
    });
    const splitFs = [];
    for (let i = 0; i < 2; i++) {
      const f = app.createAtom('F', 600, 80 + i * 120);
      prepFluorineSlot(f, 'down');
      compoundPure.addAtom(f);
      splitFs.push(f);
      const clSlot = ['up', 'down'][i];
      const ext = resolver.formFluorideChlorineLonePairBond(f, 'down', clPure, clSlot, compoundPure);
      if (!ext) return fail(`ClF3 split bond ${i} failed`);
      compoundPure.bonds.push({
        id: 'cf-p' + (i + 1),
        atomA: clPure,
        atomB: f,
        slotA: clSlot,
        slotB: 'down',
        order: 'single',
        clSplitExtSlot: ext,
      });
    }
    window.__chemTest.orientFluorineToPartner(splitFs[0], 'down', clPure);
    if (!window.__chemTest.getFluorineOrbitalAngles(splitFs[0])) {
      return fail('ClF3 setup should slant bonded F orbitals before break');
    }
    app.snapEngine.breakBond(compoundPure.bonds.find((b) => b.id === 'cf-p1'), compoundPure);
    if (clPure.orbitals.up !== 1 && clPure.orbitals.up !== 2) {
      return fail('ClF3 split break should restore a free electron or lone pair on the split slot', {
        up: clPure.orbitals.up,
      });
    }
    if (countFreeElectrons(clPure) !== 1) {
      return fail('ClF3 should keep one remaining split electron after one break', {
        orbitals: { ...clPure.orbitals },
        pairs: clPure.clExpansionPairs,
      });
    }
    if (findInvalidSplitPair(clPure)) {
      return fail('ClF3 remaining split pair should reference a live ext orbital', findInvalidSplitPair(clPure));
    }
    if (!window.__chemTest.getFluorineOrbitalAngles(splitFs[0])) {
      return fail('broken fluorine should keep its orbital orientation');
    }
    const remainingSplit = compoundPure.bonds.find((b) => b.id === 'cf-p2');
    if (!window.__chemTest.getFluorineChlorineSplitBondInfo(remainingSplit)) {
      return fail('remaining ClF3 split bond should still be recognized after first break');
    }

    app.compounds.length = 0;
    const clMid = app.createAtom('Cl', 500, 200);
    const hMid = app.createAtom('H', 580, 200);
    const compoundMid = app.createCompound([clMid, hMid]);
    if (!resolver.formBond(clMid, 'right', hMid, 'left')) return fail('mid-break Cl–H setup failed');
    compoundMid.bonds.push({
      id: 'clh-mid', atomA: clMid, atomB: hMid, slotA: 'right', slotB: 'left', order: 'single',
    });
    const midBonds = [];
    for (let i = 0; i < 2; i++) {
      const f = app.createAtom('F', 500, 80 + i * 40);
      prepFluorineSlot(f, 'down');
      compoundMid.addAtom(f);
      const clSlot = ['up', 'left'][i];
      const ext = resolver.formFluorideChlorineLonePairBond(f, 'down', clMid, clSlot, compoundMid);
      if (!ext) return fail(`mid-break split bond ${i} failed`);
      const bondId = 'cf-mid-' + i;
      compoundMid.bonds.push({
        id: bondId, atomA: clMid, atomB: f, slotA: clSlot, slotB: 'down', order: 'single', clSplitExtSlot: ext,
      });
      midBonds.push(bondId);
    }
    const fMid3 = app.createAtom('F', 500, 320);
    prepFluorineSlot(fMid3, 'up');
    if (resolver.formFluorideChlorineLonePairBond(fMid3, 'up', clMid, 'down', compoundMid)) {
      return fail('should reject split bond to the last pink lone pair in mid-break setup');
    }
    app.snapEngine.breakBond(compoundMid.bonds.find((b) => b.id === 'cf-mid-1'), compoundMid);
    if (clMid.orbitals.left !== 2) return fail('breaking split bond should restore that lone pair');
    if (!clMid.isValenceConsistent()) return fail('chlorine should stay valence-consistent after split break');
    if (findInvalidSplitPair(clMid)) {
      return fail('split break should keep valid ext-slot references', findInvalidSplitPair(clMid));
    }
    if (countLonePairs(clMid) !== 2) {
      return fail('breaking one split bond should leave two pink lone pairs', { orbitals: { ...clMid.orbitals } });
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
  console.log('PASS: F–Cl pink lone-pair split bonds and orbital expansion');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
