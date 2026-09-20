/**
 * Verify N→O coordination bond, hub tracking, and resonance with type-2 oxygen.
 * Run: node test/n-dative-bond.mjs
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

function startServer(port = 3477) {
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
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.app?.snapEngine?.electronResolver?.formNDativeBond);

  const result = await page.evaluate(async () => {
    function countLonePairs(atom) {
      return ['up', 'down', 'left', 'right'].filter((s) => atom.orbitals[s] === 2).length;
    }

    const app = window.app;
    app.compounds.length = 0;
    const resolver = app.snapEngine.electronResolver;

    const n = app.createAtom('N', 200, 200);
    const o1 = app.createAtom('O', 120, 200);
    const o2 = app.createAtom('O', 200, 280);
    const o3 = app.createAtom('O', 280, 200);
    const oRecv = app.createAtom('O', 200, 80);
    const compound = app.createCompound([n, o1, o2, o3, oRecv]);

    function fail(msg, extra) {
      return { ok: false, error: msg, extra };
    }

    if (!resolver.formBond(n, 'left', o1, 'right')) return fail('bond o1');
    if (!resolver.formBond(n, 'down', o2, 'left')) return fail('bond o2');
    if (!resolver.formBond(n, 'right', o3, 'left')) return fail('bond o3');

    compound.bonds.push(
      { id: 'b1', atomA: n, atomB: o1, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 'b2', atomA: n, atomB: o2, slotA: 'down', slotB: 'left', order: 'single' },
      { id: 'b3', atomA: n, atomB: o3, slotA: 'right', slotB: 'left', order: 'single' },
    );

    if (!n.isBalanced() || n.orbitals.up !== 2) {
      return fail('N hub not ready', { orbitals: { ...n.orbitals } });
    }

    if (resolver.formNDativeBond(n, 'down', oRecv, 'down')) {
      return fail('should reject wrong approach direction');
    }

    if (!resolver.formNDativeBond(n, 'up', oRecv, 'down')) {
      return fail('formNDativeBond failed from lone-pair direction');
    }

    const recvBond = {
      id: 'recv',
      atomA: n,
      atomB: oRecv,
      slotA: 'up',
      slotB: 'down',
      order: 'n_dative',
    };
    compound.bonds.push(recvBond);
    n.nDativeHub = {
      loneSlot: 'up',
      receiverBondId: recvBond.id,
      type2BondId: null,
      resonanceActive: false,
      resonanceState: 0,
    };

    if (countLonePairs(oRecv) !== 3) {
      return fail('receiver O should have 3 lone pairs', { orbitals: { ...oRecv.orbitals } });
    }
    if (oRecv.orbitals.down !== 'n_dative') {
      return fail('receiver O bond should face nitrogen', { orbitals: { ...oRecv.orbitals } });
    }
    if (oRecv.orbitals.up !== 2 || oRecv.orbitals.left !== 2 || oRecv.orbitals.right !== 2) {
      return fail('receiver O should have lone pairs on non-bond directions', { orbitals: { ...oRecv.orbitals } });
    }
    if (!n.isValenceConsistent() || !oRecv.isValenceConsistent()) {
      return fail('unbalanced after n_dative');
    }

    const type2Bond = compound.bonds[0];
    if (!app.snapEngine.cycleBondOrder(type2Bond, compound)) {
      return fail('cycle type1 to double failed');
    }
    if (type2Bond.order !== 'double') {
      return fail('expected double on type2 bond');
    }

  // refreshNDativeHub is called by cycleBondOrder
    const hub = n.nDativeHub;
    if (!hub.resonanceActive) {
      return fail('resonance should be active after type2 appears', { hub });
    }

    if (recvBond.order !== 'single' || type2Bond.order !== 'double') {
      return fail('resonance state 0 bond orders wrong', {
        recv: recvBond.order,
        type2: type2Bond.order,
      });
    }
    if (countLonePairs(oRecv) !== 3 || countLonePairs(o1) !== 2) {
      return fail('resonance state 0 lone pair counts wrong', {
        recv: countLonePairs(oRecv),
        type2: countLonePairs(o1),
      });
    }

    app.renderer.ensureNDativeResonanceTimer();
    await new Promise((r) => setTimeout(r, 1100));

    if (recvBond.order !== 'double' || type2Bond.order !== 'single') {
      return fail('resonance state 1 bond orders wrong after timer', {
        recv: recvBond.order,
        type2: type2Bond.order,
      });
    }
    if (countLonePairs(oRecv) !== 2 || countLonePairs(o1) !== 3) {
      return fail('resonance state 1 lone pair counts wrong after timer', {
        recv: countLonePairs(oRecv),
        type2: countLonePairs(o1),
      });
    }

    await new Promise((r) => setTimeout(r, 1100));

    if (recvBond.order !== 'single' || type2Bond.order !== 'double') {
      return fail('resonance should flip back to state 0 after 2s', {
        recv: recvBond.order,
        type2: type2Bond.order,
        hub: n.nDativeHub,
      });
    }
    if (!n.nDativeHub || !n.nDativeHub.resonanceActive) {
      return fail('resonance hub deactivated after second flip', { hub: n.nDativeHub });
    }

    app.snapEngine.breakBond(recvBond, compound);
    if (n.nDativeHub) return fail('hub should be cleared after receiver break');
    if (type2Bond.order !== 'double') {
      return fail('type2 should remain doubly bonded after receiver break', { order: type2Bond.order });
    }
    if (n.totalOrbitalElectrons() !== 5 || !n.isValenceConsistent()) {
      return fail('N valence inconsistent after receiver break during resonance', {
        orbitals: { ...n.orbitals },
        total: n.totalOrbitalElectrons(),
      });
    }

    // Break coordination bond during active resonance (N slot may be single, not n_dative).
    app.compounds.length = 0;
    const nRes = app.createAtom('N', 200, 200);
    const oLeftRes = app.createAtom('O', 120, 200);
    const cRes = app.createAtom('C', 280, 200);
    const oTopRes = app.createAtom('O', 200, 80);
    const cmpRes = app.createCompound([nRes, oLeftRes, cRes, oTopRes]);
    nRes.orbitals = { up: 'n_dative', left: 'single', right: 'single', down: 0 };
    const bLeftRes = { id: 'blr', atomA: nRes, atomB: oLeftRes, slotA: 'left', slotB: 'right', order: 'single' };
    const bCRes = { id: 'bcr', atomA: nRes, atomB: cRes, slotA: 'right', slotB: 'left', order: 'single' };
    const bRecvRes = { id: 'brr', atomA: nRes, atomB: oTopRes, slotA: 'up', slotB: 'down', order: 'n_dative' };
    cmpRes.bonds.push(bLeftRes, bCRes, bRecvRes);
    nRes.nDativeHub = {
      loneSlot: 'up', receiverBondId: bRecvRes.id, type2BondId: null,
      resonanceActive: false, resonanceState: 0,
    };
    if (!app.snapEngine.cycleBondOrder(bLeftRes, cmpRes)) return fail('resonance setup failed');
    bRecvRes.order = 'single';
    nRes.orbitals.up = 'single';
    if (!app.snapEngine.breakBond(bRecvRes, cmpRes)) return fail('resonance receiver break failed');
    if (nRes.orbitals.up !== 2) {
      return fail('breaking resonance coordination bond should restore lone pair (2e)', {
        orbitals: { ...nRes.orbitals },
      });
    }

    // Snap path: buildBondSnapStep must work when N lone pair is the partner slot.
    app.compounds.length = 0;
    const n2 = app.createAtom('N', 200, 200);
    const oA = app.createAtom('O', 120, 200);
    const oB = app.createAtom('O', 200, 280);
    const oC = app.createAtom('O', 280, 200);
    const oSnap = app.createAtom('O', 200, 40);
    const cmp2 = app.createCompound([n2, oA, oB, oC]);
    const cmpO = app.createCompound([oSnap]);
    resolver.formBond(n2, 'left', oA, 'right');
    resolver.formBond(n2, 'down', oB, 'left');
    resolver.formBond(n2, 'right', oC, 'left');
    cmp2.bonds.push(
      { id: 'b1', atomA: n2, atomB: oA, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 'b2', atomA: n2, atomB: oB, slotA: 'down', slotB: 'left', order: 'single' },
      { id: 'b3', atomA: n2, atomB: oC, slotA: 'right', slotB: 'left', order: 'single' },
    );
    const snapStep = app.snapEngine.buildBondSnapStep(
      oSnap, n2, cmp2, cmpO, app.compounds);
    if (!snapStep) return fail('buildBondSnapStep returned null for dative snap');
    const snapBond = app.snapEngine.executeOneBondStep(Object.assign({ isNDative: true }, snapStep));
    if (!snapBond || snapBond.order !== 'n_dative') {
      return fail('executeOneBondStep dative snap failed', { snapBond });
    }
    if (oSnap.orbitals.down !== 'n_dative') {
      return fail('snapped receiver O bond should face nitrogen', { orbitals: { ...oSnap.orbitals } });
    }
    if (countLonePairs(oSnap) !== 3) {
      return fail('snapped receiver O should have 3 lone pairs on other directions', {
        orbitals: { ...oSnap.orbitals },
      });
    }

    // User scenario: 2 bonds + lone pair (e.g. double + single + lone) should show pink / accept dative.
    app.compounds.length = 0;
    const n2b = app.createAtom('N', 100, 100);
    const oDouble = app.createAtom('O', 20, 100);
    const cSingle = app.createAtom('C', 180, 100);
    const oRecv2 = app.createAtom('O', 100, 20);
    const cmp2b = app.createCompound([n2b, oDouble, cSingle, oRecv2]);
    n2b.orbitals = { up: 2, left: 'double', right: 'single', down: 0 };
    oDouble.orbitals = { up: 2, down: 2, left: 'double', right: 0 };
    cSingle.orbitals = { up: 1, down: 1, left: 1, right: 'single' };
    cmp2b.bonds.push(
      { id: 'bd', atomA: n2b, atomB: oDouble, slotA: 'left', slotB: 'right', order: 'double' },
      { id: 'bc', atomA: n2b, atomB: cSingle, slotA: 'right', slotB: 'left', order: 'single' },
    );
    if (!n2b.isValenceConsistent()) return fail('2-bond N setup invalid');
    if (!resolver.formNDativeBond(n2b, 'up', oRecv2, 'down')) {
      return fail('dative on 2-bond + lone N failed', { orbitals: { ...n2b.orbitals } });
    }

    const nFree = app.createAtom('N', 300, 100);
    const oFreeA = app.createAtom('O', 220, 100);
    const oFreeB = app.createAtom('O', 380, 100);
    const oRecvFree = app.createAtom('O', 300, 20);
    app.createCompound([nFree, oFreeA, oFreeB, oRecvFree]);
    nFree.orbitals = { up: 2, left: 'single', right: 'single', down: 1 };
    if (resolver.formNDativeBond(nFree, 'up', oRecvFree, 'down')) {
      return fail('should reject N with free electron even if lone pair present');
    }

    // 3-bond hub with stray free electron: resonance should clear it.
    app.compounds.length = 0;
    const n3 = app.createAtom('N', 200, 200);
    const oLeft = app.createAtom('O', 120, 200);
    const cR = app.createAtom('C', 280, 200);
    const oTop = app.createAtom('O', 200, 80);
    const cmp3 = app.createCompound([n3, oLeft, cR, oTop]);
    n3.orbitals = { up: 'n_dative', left: 'single', right: 'single', down: 1 };
    oLeft.orbitals = { up: 2, down: 2, left: 2, right: 'single' };
    cR.orbitals = { up: 1, down: 1, left: 'single', right: 1 };
    oTop.orbitals = { up: 2, down: 'n_dative', left: 2, right: 2 };
    const bLeft = { id: 'bl', atomA: n3, atomB: oLeft, slotA: 'left', slotB: 'right', order: 'single' };
    const bC = { id: 'bc2', atomA: n3, atomB: cR, slotA: 'right', slotB: 'left', order: 'single' };
    const bRecv3 = { id: 'br', atomA: n3, atomB: oTop, slotA: 'up', slotB: 'down', order: 'n_dative' };
    cmp3.bonds.push(bLeft, bC, bRecv3);
    n3.nDativeHub = {
      loneSlot: 'up',
      receiverBondId: bRecv3.id,
      type2BondId: null,
      resonanceActive: false,
      resonanceState: 0,
    };
    if (n3.countFreeElectrons() !== 1) return fail('setup should have one free electron on N');
    if (!app.snapEngine.cycleBondOrder(bLeft, cmp3)) return fail('resonance activation failed');
    if (n3.countFreeElectrons() !== 0) {
      return fail('resonance should remove stray free electron on N', { orbitals: { ...n3.orbitals } });
    }

    app.snapEngine.breakBond(bLeft, cmp3);
    if (n3.nDativeHub && n3.nDativeHub.resonanceActive) {
      return fail('breaking type2 should deactivate resonance', { hub: n3.nDativeHub });
    }
    if (!n3.isValenceConsistent()) {
      return fail('N electrons not restored after breaking hub bond', { orbitals: { ...n3.orbitals } });
    }
    const hubBreakNonBond = ['up', 'down', 'left', 'right'].filter((s) => {
      const v = n3.orbitals[s];
      return v === 0 || v === 1 || v === 2;
    });
    if (hubBreakNonBond.some((s) => n3.orbitals[s] === 2) &&
        hubBreakNonBond.some((s) => n3.orbitals[s] === 0)) {
      return fail('N should not pair electrons while an orbital is still empty', {
        orbitals: { ...n3.orbitals },
      });
    }
    if (n3.orbitals.up !== 'n_dative') {
      return fail('receiver slot should return to n_dative after type2 break', { orbitals: { ...n3.orbitals } });
    }

    // Breaking two substituent bonds on a dative donor N should spread electrons (Hund's rule).
    app.compounds.length = 0;
    const nHub = app.createAtom('N', 200, 200);
    const hA = app.createAtom('H', 120, 200);
    const hB = app.createAtom('H', 200, 280);
    const hC = app.createAtom('H', 280, 200);
    const oDative = app.createAtom('O', 200, 80);
    const cmpHub = app.createCompound([nHub, hA, hB, hC, oDative]);
    resolver.formBond(nHub, 'left', hA, 'right');
    resolver.formBond(nHub, 'down', hB, 'left');
    resolver.formBond(nHub, 'right', hC, 'left');
    cmpHub.bonds.push(
      { id: 'hb1', atomA: nHub, atomB: hA, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 'hb2', atomA: nHub, atomB: hB, slotA: 'down', slotB: 'left', order: 'single' },
      { id: 'hb3', atomA: nHub, atomB: hC, slotA: 'right', slotB: 'left', order: 'single' },
    );
    if (!resolver.formNDativeBond(nHub, 'up', oDative, 'down')) return fail('dative setup for Hund test');
    cmpHub.addBond({
      id: 'hb4', atomA: nHub, atomB: oDative, slotA: 'up', slotB: 'down', order: 'n_dative',
    });
    app.snapEngine.breakBond(cmpHub.bonds.find((b) => b.id === 'hb1'), cmpHub);
    app.snapEngine.breakBond(cmpHub.bonds.find((b) => b.id === 'hb2'), cmpHub);
    const nonBondSlots = ['up', 'down', 'left', 'right'].filter((s) => {
      const v = nHub.orbitals[s];
      return v !== 'single' && v !== 'n_dative' && v !== 'double' && v !== 'triple';
    });
    const paired = nonBondSlots.filter((s) => nHub.orbitals[s] === 2);
    const singles = nonBondSlots.filter((s) => nHub.orbitals[s] === 1);
    const empty = nonBondSlots.filter((s) => nHub.orbitals[s] === 0);
    if (paired.length > 0 && empty.length > 0) {
      return fail('donor N should not pair electrons while an orbital is still empty', {
        orbitals: { ...nHub.orbitals },
        paired,
        singles,
        empty,
      });
    }
    if (singles.length !== 2) {
      return fail('donor N should have two unpaired electrons after two bond breaks', {
        orbitals: { ...nHub.orbitals },
        singles,
      });
    }

    function oxygenSnapshot(atom) {
      return {
        orbitals: { ...atom.orbitals },
        free: atom.countFreeElectrons(),
        consistent: atom.isValenceConsistent(),
        total: atom.totalOrbitalElectrons(),
      };
    }

    function snapshotsMatch(a, b) {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    function buildResonanceHub() {
      app.compounds.length = 0;
      const nR = app.createAtom('N', 200, 200);
      const oType2 = app.createAtom('O', 120, 200);
      const oOther = app.createAtom('O', 200, 280);
      const oThird = app.createAtom('O', 280, 200);
      const oRecv = app.createAtom('O', 200, 80);
      const cmpR = app.createCompound([nR, oType2, oOther, oThird, oRecv]);
      resolver.formBond(nR, 'left', oType2, 'right');
      resolver.formBond(nR, 'down', oOther, 'left');
      resolver.formBond(nR, 'right', oThird, 'left');
      cmpR.bonds.push(
        { id: 't2', atomA: nR, atomB: oType2, slotA: 'left', slotB: 'right', order: 'single' },
        { id: 'oo', atomA: nR, atomB: oOther, slotA: 'down', slotB: 'left', order: 'single' },
        { id: 'ot', atomA: nR, atomB: oThird, slotA: 'right', slotB: 'left', order: 'single' },
      );
      if (!resolver.formNDativeBond(nR, 'up', oRecv, 'down')) return null;
      cmpR.bonds.push({
        id: 'recv', atomA: nR, atomB: oRecv, slotA: 'up', slotB: 'down', order: 'n_dative',
      });
      nR.nDativeHub = {
        loneSlot: 'up',
        receiverBondId: 'recv',
        type2BondId: null,
        resonanceActive: false,
        resonanceState: 0,
      };
      const type2Bond = cmpR.bonds.find((b) => b.id === 't2');
      if (!app.snapEngine.cycleBondOrder(type2Bond, cmpR)) return null;
      return {
        compound: cmpR,
        n: nR,
        oType2,
        oRecv,
        type2Bond,
        recvBond: cmpR.bonds.find((b) => b.id === 'recv'),
      };
    }

    const refO = app.createAtom('O', 0, 0);
    const isolatedOxygenRef = oxygenSnapshot(refO);

    const hubState0 = buildResonanceHub();
    if (!hubState0) return fail('resonance hub setup failed');
    app.snapEngine.breakBond(hubState0.type2Bond, hubState0.compound);
    const freedType2State0 = oxygenSnapshot(hubState0.oType2);
    if (!snapshotsMatch(freedType2State0, isolatedOxygenRef)) {
      return fail('type2 break at resonance state 0 should leave normal isolated O', {
        freedType2State0,
        isolatedOxygenRef,
      });
    }

    const hubState1 = buildResonanceHub();
    if (!hubState1) return fail('resonance hub setup for state 1 failed');
    app.renderer.ensureNDativeResonanceTimer();
    await new Promise((r) => setTimeout(r, 1100));
    if (hubState1.n.nDativeHub.resonanceState !== 1) {
      return fail('expected resonance state 1 before type2 break');
    }
    app.snapEngine.breakBond(hubState1.type2Bond, hubState1.compound);
    const freedType2State1 = oxygenSnapshot(hubState1.oType2);
    if (!snapshotsMatch(freedType2State1, isolatedOxygenRef)) {
      return fail('type2 break at resonance state 1 should leave normal isolated O', {
        freedType2State1,
        isolatedOxygenRef,
      });
    }
    if (!snapshotsMatch(freedType2State0, freedType2State1)) {
      return fail('type2 break should not depend on resonance timing', {
        freedType2State0,
        freedType2State1,
      });
    }

    const recvState0 = buildResonanceHub();
    if (!recvState0) return fail('receiver break setup state 0 failed');
    app.snapEngine.breakBond(recvState0.recvBond, recvState0.compound);
    const freedRecvState0 = oxygenSnapshot(recvState0.oRecv);
    const remainingType1State0 = oxygenSnapshot(recvState0.oType2);
    if (!snapshotsMatch(freedRecvState0, isolatedOxygenRef)) {
      return fail('receiver break at resonance state 0 should leave normal isolated O', {
        freedRecvState0,
        isolatedOxygenRef,
      });
    }
    if (recvState0.oType2.orbitals.right !== 'double' || countLonePairs(recvState0.oType2) !== 2) {
      return fail('remaining type2 O should be doubly bonded with 2 lone pairs (state 0 break)', {
        orbitals: { ...recvState0.oType2.orbitals },
      });
    }

    const recvState1 = buildResonanceHub();
    if (!recvState1) return fail('receiver break setup state 1 failed');
    app.renderer.ensureNDativeResonanceTimer();
    await new Promise((r) => setTimeout(r, 1100));
    app.snapEngine.breakBond(recvState1.recvBond, recvState1.compound);
    const freedRecvState1 = oxygenSnapshot(recvState1.oRecv);
    const remainingType1State1 = oxygenSnapshot(recvState1.oType2);
    if (!snapshotsMatch(freedRecvState1, isolatedOxygenRef)) {
      return fail('receiver break at resonance state 1 should leave normal isolated O', {
        freedRecvState1,
        isolatedOxygenRef,
      });
    }
    if (!snapshotsMatch(freedRecvState0, freedRecvState1)) {
      return fail('receiver break should not depend on resonance timing', {
        freedRecvState0,
        freedRecvState1,
      });
    }
    if (!snapshotsMatch(remainingType1State0, remainingType1State1)) {
      return fail('remaining type2 O should match regardless of resonance timing', {
        remainingType1State0,
        remainingType1State1,
      });
    }
    if (recvState0.type2Bond.order !== 'double' || recvState1.type2Bond.order !== 'double') {
      return fail('receiver break should leave type2 bond as double', {
        state0: recvState0.type2Bond.order,
        state1: recvState1.type2Bond.order,
      });
    }

    // Type-1 oxygens stay normal single-bonded (2 lone pairs), not receiver-style (3 lone pairs).
    app.compounds.length = 0;
    const nT1 = app.createAtom('N', 200, 200);
    const oType2T1 = app.createAtom('O', 120, 200);
    const oType1A = app.createAtom('O', 200, 280);
    const oType1B = app.createAtom('O', 280, 200);
    const oRecvT1 = app.createAtom('O', 200, 80);
    const cmpT1 = app.createCompound([nT1, oType2T1, oType1A, oType1B, oRecvT1]);
    resolver.formBond(nT1, 'left', oType2T1, 'right');
    resolver.formBond(nT1, 'down', oType1A, 'left');
    resolver.formBond(nT1, 'right', oType1B, 'left');
    cmpT1.bonds.push(
      { id: 't2o', atomA: nT1, atomB: oType2T1, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 't1a', atomA: nT1, atomB: oType1A, slotA: 'down', slotB: 'left', order: 'single' },
      { id: 't1b', atomA: nT1, atomB: oType1B, slotA: 'right', slotB: 'left', order: 'single' },
    );
    if (!resolver.formNDativeBond(nT1, 'up', oRecvT1, 'down')) return fail('type1 setup dative failed');
    cmpT1.bonds.push({
      id: 'recvT1', atomA: nT1, atomB: oRecvT1, slotA: 'up', slotB: 'down', order: 'n_dative',
    });
    nT1.nDativeHub = {
      loneSlot: 'up', receiverBondId: 'recvT1', type2BondId: null,
      resonanceActive: false, resonanceState: 0,
    };
    if (!app.snapEngine.cycleBondOrder(cmpT1.bonds.find((b) => b.id === 't2o'), cmpT1)) {
      return fail('type1 resonance activation failed');
    }
    // Type-1 oxygens should not have their orbitals rewritten by resonance bookkeeping.
    // We only require they remain valence-consistent and keep single bond order.
    for (const oType1 of [oType1A, oType1B]) {
      if (!oType1.isValenceConsistent()) {
        return fail('type-1 O should stay valence-consistent during resonance', {
          orbitals: { ...oType1.orbitals },
        });
      }
    }

    // Breaking a non-resonance substituent (H) during resonance keeps resonance and adds 1e⁻ on N.
    app.compounds.length = 0;
    const nH = app.createAtom('N', 200, 200);
    const hLeft = app.createAtom('H', 120, 200);
    const hDown = app.createAtom('H', 200, 280);
    const oType2H = app.createAtom('O', 280, 200);
    const oRecvH = app.createAtom('O', 200, 80);
    const cmpH = app.createCompound([nH, hLeft, hDown, oType2H, oRecvH]);
    resolver.formBond(nH, 'left', hLeft, 'right');
    resolver.formBond(nH, 'down', hDown, 'left');
    resolver.formBond(nH, 'right', oType2H, 'left');
    cmpH.bonds.push(
      { id: 'hl', atomA: nH, atomB: hLeft, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 'hd', atomA: nH, atomB: hDown, slotA: 'down', slotB: 'left', order: 'single' },
      { id: 'ot2', atomA: nH, atomB: oType2H, slotA: 'right', slotB: 'left', order: 'single' },
    );
    if (!resolver.formNDativeBond(nH, 'up', oRecvH, 'down')) return fail('H-hub dative setup failed');
    cmpH.bonds.push({
      id: 'orh', atomA: nH, atomB: oRecvH, slotA: 'up', slotB: 'down', order: 'n_dative',
    });
    nH.nDativeHub = {
      loneSlot: 'up', receiverBondId: 'orh', type2BondId: null,
      resonanceActive: false, resonanceState: 0,
    };
    const type2BondH = cmpH.bonds.find((b) => b.id === 'ot2');
    if (!app.snapEngine.cycleBondOrder(type2BondH, cmpH)) return fail('H-hub resonance activation failed');
    app.renderer.ensureNDativeResonanceTimer();
    await new Promise((r) => setTimeout(r, 1100));
    if (!nH.nDativeHub.resonanceActive) return fail('H-hub resonance not active');
    app.snapEngine.breakBond(cmpH.bonds.find((b) => b.id === 'hl'), cmpH);
    if (!nH.nDativeHub.resonanceActive) {
      return fail('resonance should stay active after peripheral H break', { hub: nH.nDativeHub });
    }
    if (nH.countFreeElectrons() !== 1) {
      return fail('N should gain one electron when peripheral substituent breaks during resonance', {
        orbitals: { ...nH.orbitals },
        free: nH.countFreeElectrons(),
      });
    }
    if (!nH.isValenceConsistent()) {
      return fail('N should stay valence-consistent after peripheral H break', {
        orbitals: { ...nH.orbitals },
      });
    }
    const ordersAfterBreak = {
      recv: cmpH.bonds.find((b) => b.id === 'orh').order,
      type2: cmpH.bonds.find((b) => b.id === 'ot2').order,
      state: nH.nDativeHub.resonanceState,
    };
    app.renderer.ensureNDativeResonanceTimer();
    await new Promise((r) => setTimeout(r, 1100));
    if (!nH.nDativeHub.resonanceActive) {
      return fail('resonance should stay active after timer flip with peripheral electron');
    }
    if (nH.countFreeElectrons() !== 1) {
      return fail('peripheral electron should survive resonance flip', {
        orbitals: { ...nH.orbitals },
        free: nH.countFreeElectrons(),
      });
    }
    const recvBondAfter = cmpH.bonds.find((b) => b.id === 'orh');
    const type2BondAfter = cmpH.bonds.find((b) => b.id === 'ot2');
    if (recvBondAfter.order === ordersAfterBreak.recv &&
        type2BondAfter.order === ordersAfterBreak.type2) {
      return fail('resonance bond orders should flip after timer with peripheral electron', {
        afterBreak: ordersAfterBreak,
        afterTimer: {
          recv: recvBondAfter.order,
          type2: type2BondAfter.order,
          state: nH.nDativeHub.resonanceState,
        },
      });
    }

    // Full UI path: app.breakBond splits the fragment, refresh() restarts the timer.
    app.compounds.length = 0;
    const nFull = app.createAtom('N', 200, 200);
    const hSep = app.createAtom('H', 120, 200);
    const hKeep = app.createAtom('H', 200, 280);
    const oT2 = app.createAtom('O', 280, 200);
    const oR = app.createAtom('O', 200, 80);
    const cmpFull = app.createCompound([nFull, hSep, hKeep, oT2, oR]);
    resolver.formBond(nFull, 'left', hSep, 'right');
    resolver.formBond(nFull, 'down', hKeep, 'left');
    resolver.formBond(nFull, 'right', oT2, 'left');
    const bSep = { id: 'bsep', atomA: nFull, atomB: hSep, slotA: 'left', slotB: 'right', order: 'single' };
    cmpFull.bonds.push(
      bSep,
      { id: 'bk', atomA: nFull, atomB: hKeep, slotA: 'down', slotB: 'left', order: 'single' },
      { id: 'bt2', atomA: nFull, atomB: oT2, slotA: 'right', slotB: 'left', order: 'single' },
    );
    if (!resolver.formNDativeBond(nFull, 'up', oR, 'down')) return fail('full-path dative setup failed');
    cmpFull.bonds.push({
      id: 'br', atomA: nFull, atomB: oR, slotA: 'up', slotB: 'down', order: 'n_dative',
    });
    nFull.nDativeHub = {
      loneSlot: 'up', receiverBondId: 'br', type2BondId: null,
      resonanceActive: false, resonanceState: 0,
    };
    if (!app.snapEngine.cycleBondOrder(cmpFull.bonds.find((b) => b.id === 'bt2'), cmpFull)) {
      return fail('full-path resonance activation failed');
    }
    app.renderer.ensureNDativeResonanceTimer();
    await new Promise((r) => setTimeout(r, 1100));
    app.breakBond(bSep, cmpFull);
    app.renderer.refresh();
    const hubCompound = app.compounds.find((c) => c.atoms.some((a) => a.id === nFull.id));
    const hCompound = app.compounds.find((c) => c.atoms.some((a) => a.id === hSep.id));
    if (!hubCompound || !hCompound || hubCompound.id === hCompound.id) {
      return fail('peripheral break should split into separate compounds', {
        compounds: app.compounds.length,
      });
    }
    if (hubCompound.id !== cmpFull.id) {
      return fail('N hub should remain on the original compound after split');
    }
    if (!hSep.isValenceConsistent() || hSep.countFreeElectrons() !== 1) {
      return fail('separated atom should be a normal isolated H', {
        orbitals: { ...hSep.orbitals },
        free: hSep.countFreeElectrons(),
        consistent: hSep.isValenceConsistent(),
      });
    }
    if (!nFull.nDativeHub.resonanceActive) {
      return fail('resonance should stay active after full break path', { hub: nFull.nDativeHub });
    }
    if (nFull.countFreeElectrons() !== 1) {
      return fail('N should keep peripheral electron after full break path', {
        orbitals: { ...nFull.orbitals },
      });
    }
    const ordersFullBreak = {
      recv: hubCompound.bonds.find((b) => b.id === 'br').order,
      type2: hubCompound.bonds.find((b) => b.id === 'bt2').order,
    };
    await new Promise((r) => setTimeout(r, 1100));
    if (!nFull.nDativeHub.resonanceActive) {
      return fail('resonance should continue after refresh + timer');
    }
    const recvFull = hubCompound.bonds.find((b) => b.id === 'br');
    const type2Full = hubCompound.bonds.find((b) => b.id === 'bt2');
    if (recvFull.order === ordersFullBreak.recv && type2Full.order === ordersFullBreak.type2) {
      return fail('resonance should animate after full break + refresh path', {
        afterBreak: ordersFullBreak,
        afterTimer: { recv: recvFull.order, type2: type2Full.order },
      });
    }

    // User scenario: N–CH3 + N=O (type2) + N→O (receiver), resonance active, break N–C.
    app.compounds.length = 0;
    const nMe = app.createAtom('N', 200, 200);
    const cMe = app.createAtom('C', 120, 200);
    const oDoubleMe = app.createAtom('O', 280, 200);
    const oDativeMe = app.createAtom('O', 200, 80);
    const cmpMe = app.createCompound([nMe, cMe, oDoubleMe, oDativeMe]);
    nMe.orbitals = { up: 2, left: 'single', right: 'double', down: 0 };
    cMe.orbitals = { up: 1, down: 1, left: 1, right: 'single' };
    oDoubleMe.orbitals = { up: 2, down: 2, left: 'double', right: 0 };
    const bMeC = { id: 'bme', atomA: nMe, atomB: cMe, slotA: 'left', slotB: 'right', order: 'single' };
    const bType2Me = {
      id: 'bod', atomA: nMe, atomB: oDoubleMe, slotA: 'right', slotB: 'left', order: 'double',
    };
    cmpMe.bonds.push(bMeC, bType2Me);
    if (!nMe.isValenceConsistent()) return fail('methyl-hub N setup invalid', { orbitals: { ...nMe.orbitals } });
    if (!resolver.formNDativeBond(nMe, 'up', oDativeMe, 'down')) return fail('methyl-hub dative setup failed');
    cmpMe.bonds.push({
      id: 'bor', atomA: nMe, atomB: oDativeMe, slotA: 'up', slotB: 'down', order: 'n_dative',
    });
    nMe.nDativeHub = {
      loneSlot: 'up', receiverBondId: 'bor', type2BondId: 'bod',
      resonanceActive: true, resonanceState: 0,
    };
    app.renderer.refresh();
    if (!nMe.nDativeHub.resonanceActive) return fail('methyl-hub resonance not active before break');
    const ordersBeforeMeBreak = {
      recv: cmpMe.bonds.find((b) => b.id === 'bor').order,
      type2: cmpMe.bonds.find((b) => b.id === 'bod').order,
      state: nMe.nDativeHub.resonanceState,
    };
    const oDoubleOrbitalsBeforeBreak = { ...oDoubleMe.orbitals };
    app.breakBond(bMeC, cmpMe);
    if (!nMe.nDativeHub.resonanceActive) {
      return fail('resonance must stay active after breaking N–CH3', { hub: nMe.nDativeHub });
    }
    if (nMe.countFreeElectrons() !== 1) {
      return fail('N should have one free electron after breaking N–CH3', {
        orbitals: { ...nMe.orbitals },
      });
    }
    if (JSON.stringify(oDoubleMe.orbitals) !== JSON.stringify(oDoubleOrbitalsBeforeBreak)) {
      return fail('type-2 O orbitals should not change when breaking N–CH3', {
        before: oDoubleOrbitalsBeforeBreak,
        after: { ...oDoubleMe.orbitals },
      });
    }
    app.renderer.refresh();
    await new Promise((r) => setTimeout(r, 1100));
    if (!nMe.nDativeHub.resonanceActive) {
      return fail('resonance must keep running after N–CH3 break + timer');
    }
    const recvMe = cmpMe.bonds.find((b) => b.id === 'bor');
    const type2Me = cmpMe.bonds.find((b) => b.id === 'bod');
    if (recvMe.order === ordersBeforeMeBreak.recv && type2Me.order === ordersBeforeMeBreak.type2) {
      return fail('resonance pair should still flip after N–CH3 break', {
        before: ordersBeforeMeBreak,
        after: { recv: recvMe.order, type2: type2Me.order, state: nMe.nDativeHub.resonanceState },
      });
    }
    if (cmpMe.isFullyBalanced()) {
      return fail('compound with a free electron on N should not be fully balanced');
    }

    // Re-bond methyl: should consume the free electron and leave resonance intact.
    cMe.orbitals = { up: 1, down: 1, left: 1, right: 1 };
    if (!resolver.formBond(nMe, 'left', cMe, 'right')) {
      return fail('re-bonding N–CH3 should consume the free electron', {
        nOrbitals: { ...nMe.orbitals },
        cOrbitals: { ...cMe.orbitals },
      });
    }
    cmpMe.bonds.push({
      id: 'bme2', atomA: nMe, atomB: cMe, slotA: 'left', slotB: 'right', order: 'single',
    });
    if (nMe.countFreeElectrons() !== 0) {
      return fail('N should have no free electron after re-bonding methyl', {
        orbitals: { ...nMe.orbitals },
      });
    }
    app.renderer.refresh();
    await new Promise((r) => setTimeout(r, 1100));
    if (nMe.countFreeElectrons() !== 0) {
      return fail('refresh should not restore a free electron after re-bond', {
        orbitals: { ...nMe.orbitals },
      });
    }
    if (!nMe.nDativeHub.resonanceActive) {
      return fail('resonance must stay active after re-bonding methyl', { hub: nMe.nDativeHub });
    }
    if (nMe.orbitals.left !== 'single') {
      return fail('re-bonded methyl slot should stay a single bond on N', {
        orbitals: { ...nMe.orbitals },
      });
    }
    if (!cmpMe.isFullyBalanced()) {
      return fail('compound should be balanced again after re-bonding methyl');
    }

    // Type-1 O (H–O–N) on resonating hub: breaking N–O must leave normal H–O, not wipe O.
    app.compounds.length = 0;
    const nT1b = app.createAtom('N', 200, 200);
    const hOnN = app.createAtom('H', 120, 200);
    const hOnO = app.createAtom('H', 120, 280);
    const oType1 = app.createAtom('O', 200, 280);
    const oType2b = app.createAtom('O', 280, 200);
    const oRecvT1b = app.createAtom('O', 200, 80);
    const cmpT1b = app.createCompound([nT1b, hOnN, hOnO, oType1, oType2b, oRecvT1b]);
    resolver.formBond(nT1b, 'left', hOnN, 'right');
    resolver.formBond(nT1b, 'right', oType2b, 'left');
    resolver.formBond(nT1b, 'down', oType1, 'left');
    cmpT1b.bonds.push(
      { id: 'nh', atomA: nT1b, atomB: hOnN, slotA: 'left', slotB: 'right', order: 'single' },
      { id: 'ot2b', atomA: nT1b, atomB: oType2b, slotA: 'right', slotB: 'left', order: 'single' },
      { id: 'ont1', atomA: nT1b, atomB: oType1, slotA: 'down', slotB: 'left', order: 'single' },
    );
    resolver.formBond(hOnO, 'right', oType1, 'left');
    cmpT1b.bonds.push(
      { id: 'ho', atomA: hOnO, atomB: oType1, slotA: 'right', slotB: 'left', order: 'single' },
    );
    if (!resolver.formNDativeBond(nT1b, 'up', oRecvT1b, 'down')) return fail('type1 HO-N dative setup failed');
    cmpT1b.bonds.push({
      id: 'recvT1b', atomA: nT1b, atomB: oRecvT1b, slotA: 'up', slotB: 'down', order: 'n_dative',
    });
    nT1b.nDativeHub = {
      loneSlot: 'up', receiverBondId: 'recvT1b', type2BondId: null,
      resonanceActive: false, resonanceState: 0,
    };
    if (!app.snapEngine.cycleBondOrder(cmpT1b.bonds.find((b) => b.id === 'ot2b'), cmpT1b)) {
      return fail('type1 HO-N resonance activation failed');
    }
    if (!nT1b.nDativeHub.resonanceActive) return fail('HO-N hub resonance not active');
    const labelBoundsT1 = cmpT1b.getLabelPlacementBounds();
    const resBounds0 = window.__chemTest.getBoundsForNDativeResonanceState(cmpT1b, 0);
    const resBounds1 = window.__chemTest.getBoundsForNDativeResonanceState(cmpT1b, 1);
    if (labelBoundsT1.left > Math.min(resBounds0.left, resBounds1.left) ||
        labelBoundsT1.top > Math.min(resBounds0.top, resBounds1.top) ||
        labelBoundsT1.right < Math.max(resBounds0.right, resBounds1.right) ||
        labelBoundsT1.bottom < Math.max(resBounds0.bottom, resBounds1.bottom)) {
      return fail('label bounds should envelope both resonance structures', {
        state0: resBounds0,
        state1: resBounds1,
        label: labelBoundsT1,
      });
    }
    const type1Bond = cmpT1b.bonds.find((b) => b.id === 'ont1');
    if (app.snapEngine.cycleBondOrder(type1Bond, cmpT1b)) {
      return fail('type-1 N–O should not cycle to double while resonance is active');
    }
    app.snapEngine.breakBond(type1Bond, cmpT1b);
    if (!nT1b.nDativeHub.resonanceActive) {
      return fail('resonance should stay active after type-1 O break', { hub: nT1b.nDativeHub });
    }
    if (!oType1.isValenceConsistent()) {
      return fail('type-1 O should remain normal single-bonded H–O after N–O break', {
        orbitals: { ...oType1.orbitals },
        free: oType1.countFreeElectrons(),
      });
    }
    const hoBond = cmpT1b.bonds.find((b) => b.id === 'ho');
    if (!hoBond || hoBond.order !== 'single') {
      return fail('H–O bond should remain after type-1 N–O break');
    }
    if (hOnO.countFreeElectrons() !== 1) {
      return fail('H should not pick up spurious electron after type-1 O break', {
        orbitals: { ...hOnO.orbitals },
      });
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

  console.log('PASS: N→O coordination bond and resonance');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
