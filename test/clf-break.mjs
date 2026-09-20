/**
 * Comprehensive ClF3 bond-break tests including rotation and UI path.
 * Run: node test/clf-break.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startServer(port = 3490) {
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
  await page.waitForFunction(() => window.app?.breakBond);

  const result = await page.evaluate(() => {
    function fail(msg, extra) {
      return { ok: false, error: msg, extra };
    }

    function prepFluorineSlot(f, slot) {
      for (let i = 0; i < 4; i++) {
        const free = ['up', 'right', 'down', 'left'].find((s) => f.orbitals[s] === 1);
        if (free === slot) return;
        f.rotateOrbitals90();
      }
    }

    function countLonePairs(cl) {
      return window.__chemTest.getChlorineOrbitalSlots(cl)
        .filter((s) => cl.orbitals[s] === 2).length;
    }

    function countFree(cl) {
      return window.__chemTest.getChlorineOrbitalSlots(cl)
        .filter((s) => cl.orbitals[s] === 1).length;
    }

    function invalidPairs(cl) {
      return (cl.clExpansionPairs || []).filter((p) => cl.orbitals[p.extSlot] === undefined);
    }

    function undetectedSplitBonds(cl, compound) {
      return compound.bonds.filter((b) => {
        const isCF = (b.atomA.element === 'Cl' && b.atomB.element === 'F') ||
          (b.atomA.element === 'F' && b.atomB.element === 'Cl');
        if (!isCF) return false;
        const clSlot = b.atomA.element === 'Cl' ? b.slotA : b.slotB;
        const hasPair = (cl.clExpansionPairs || []).some((p) => p.splitSlot === clSlot || p.extSlot === b.clSplitExtSlot);
        return hasPair && !window.__chemTest.getFluorineChlorineSplitBondInfo(b);
      });
    }

    function audit(label, cl, compound) {
      const badPairs = invalidPairs(cl);
      if (badPairs.length) return fail(label + ': invalid expansion pairs', badPairs);
      if (!cl.isValenceConsistent()) {
        return fail(label + ': valence inconsistent', { orbitals: { ...cl.orbitals }, oc: cl.clOrbitalCount });
      }
      const missed = undetectedSplitBonds(cl, compound);
      if (missed.length) return fail(label + ': split bonds not detected', missed.map((b) => b.id));
      return null;
    }

    function checkNoStuckFluorines(cl, compound, label) {
      var minDist = window.__chemTest.getBondCenterDistance('F', 'Cl') * 0.55;
      for (var i = 0; i < compound.atoms.length; i++) {
        var atom = compound.atoms[i];
        if (atom.element !== 'F') continue;
        var dist = Math.hypot(atom.x - cl.x, atom.y - cl.y);
        if (dist < minDist) {
          return fail(label + ': fluorine stuck on chlorine', { id: atom.id, dist: dist });
        }
      }
      return null;
    }

    function assertAtMostOneFreeElectron(cl, label) {
      if (cl.countFreeElectrons() > 2) {
        return fail(label + ': chlorine has too many unpaired electrons', {
          free: cl.countFreeElectrons(),
          orbitals: { ...cl.orbitals },
        });
      }
      return null;
    }

    function buildH3F(app) {
      app.compounds.length = 0;
      const resolver = app.snapEngine.electronResolver;
      const cl = app.createAtom('Cl', 200, 200);
      const h = app.createAtom('H', 280, 200);
      const compound = app.createCompound([cl, h]);
      resolver.formBond(cl, 'right', h, 'left');
      compound.bonds.push({
        id: 'clh', atomA: cl, atomB: h, slotA: 'right', slotB: 'left', order: 'single',
      });
      const splitSlots = ['up', 'left'];
      for (let i = 0; i < 2; i++) {
        const f = app.createAtom('F', 200, 80 + i * 40);
        prepFluorineSlot(f, 'down');
        compound.addAtom(f);
        const clSlot = splitSlots[i];
        const ext = resolver.formFluorideChlorineLonePairBond(f, 'down', cl, clSlot, compound);
        if (!ext) return null;
        compound.bonds.push({
          id: 'cf' + i,
          atomA: cl,
          atomB: f,
          slotA: clSlot,
          slotB: 'down',
          order: 'single',
          clSplitExtSlot: ext,
          clSplitSlot: clSlot,
        });
      }
      const f2 = app.createAtom('F', 200, 160);
      prepFluorineSlot(f2, 'left');
      compound.addAtom(f2);
      if (!resolver.formBond(cl, 'ext0', f2, 'left')) return null;
      compound.bonds.push({
        id: 'cf2', atomA: cl, atomB: f2, slotA: 'ext0', slotB: 'left', order: 'single',
      });
      return { cl, compound };
    }

    function breakUI(compound, bondId) {
      const bond = compound.bonds.find((b) => b.id === bondId);
      window.app.breakBond(bond, compound);
      window.app.renderer.refresh();
    }

    const app = window.app;

    // Rotate then break each split bond
    for (const bid of ['cf0', 'cf1']) {
      const built = buildH3F(app);
      if (!built) return fail('buildH3F failed');
      const { cl, compound } = built;
      compound.rotateAroundAtom(cl);
      let err = audit('after rotate before break ' + bid, cl, compound);
      if (err) return err;
      breakUI(compound, bid);
      err = audit('after rotate+break ' + bid, cl, compound);
      if (err) return err;
      if (bid === 'cf0' && countLonePairs(cl) < 1) {
        return fail('rotate+break cf0 should restore a lone pair', { lp: countLonePairs(cl) });
      }
    }

    // Chained breaks on one molecule — only the two split bonds
    const chained = buildH3F(app);
    if (!chained) return fail('chained buildH3F failed');
    for (const bid of ['cf0', 'cf1']) {
      const bond = chained.compound.bonds.find((b) => b.id === bid);
      if (!bond) break;
      window.app.breakBond(bond, chained.compound);
      window.app.renderer.refresh();
      const err = audit('chained after ' + bid, chained.cl, chained.compound);
      if (err) return err;
    }
    if (chained.cl.orbitals.up !== 1 && chained.cl.orbitals.up !== 2) {
      return fail('first split slot should hold a free electron or lone pair after both split breaks', {
        up: chained.cl.orbitals.up,
      });
    }
    const chainedFree = assertAtMostOneFreeElectron(chained.cl, 'chained split breaks');
    if (chainedFree) return chainedFree;
    if (countLonePairs(chained.cl) !== 2) {
      return fail('breaking both split F bonds should restore two pink lone pairs while ext0 stays bonded', {
        lp: countLonePairs(chained.cl),
        orbitals: { ...chained.cl.orbitals },
      });
    }

    // Rotate twice then break all bonds including H
    const rotated = buildH3F(app);
    if (!rotated) return fail('rotated buildH3F failed');
    rotated.compound.rotateAroundAtom(rotated.cl);
    rotated.compound.rotateAroundAtom(rotated.cl);
    let err = audit('double rotated', rotated.cl, rotated.compound);
    if (err) return err;
    for (const bond of [...rotated.compound.bonds]) {
      window.app.breakBond(bond, rotated.compound);
      window.app.renderer.refresh();
    }
    if (!rotated.cl.isValenceConsistent()) {
      return fail('Cl should be valence-consistent after breaking all bonds post-rotate');
    }

    // Pure ClF3: normal + 2 split — break each bond type
    app.compounds.length = 0;
    const resolver = app.snapEngine.electronResolver;
    const clPure = app.createAtom('Cl', 400, 200);
    const compoundPure = app.createCompound([clPure]);
    const f0 = app.createAtom('F', 480, 200);
    prepFluorineSlot(f0, 'left');
    compoundPure.addAtom(f0);
    resolver.formBond(clPure, 'right', f0, 'left');
    compoundPure.bonds.push({ id: 'cf0', atomA: clPure, atomB: f0, slotA: 'right', slotB: 'left', order: 'single' });
    for (let i = 1; i < 3; i++) {
      const f = app.createAtom('F', 400, 80 + i * 80);
      prepFluorineSlot(f, 'down');
      compoundPure.addAtom(f);
      const clSlot = ['up', 'down'][i - 1];
      const ext = resolver.formFluorideChlorineLonePairBond(f, 'down', clPure, clSlot, compoundPure);
      compoundPure.bonds.push({
        id: 'cf' + i, atomA: clPure, atomB: f, slotA: clSlot, slotB: 'down', order: 'single',
        clSplitExtSlot: ext, clSplitSlot: clSlot,
      });
    }
    for (const bid of ['cf0', 'cf1', 'cf2']) {
      app.compounds.length = 0;
      const cl2 = app.createAtom('Cl', 400, 200);
      const c2 = app.createCompound([cl2]);
      const fn = app.createAtom('F', 480, 200);
      prepFluorineSlot(fn, 'left');
      c2.addAtom(fn);
      resolver.formBond(cl2, 'right', fn, 'left');
      c2.bonds.push({ id: 'cf0', atomA: cl2, atomB: fn, slotA: 'right', slotB: 'left', order: 'single' });
      for (let i = 1; i < 3; i++) {
        const f = app.createAtom('F', 400, 80 + i * 80);
        prepFluorineSlot(f, 'down');
        c2.addAtom(f);
        const clSlot = ['up', 'down'][i - 1];
        const ext = resolver.formFluorideChlorineLonePairBond(f, 'down', cl2, clSlot, c2);
        c2.bonds.push({
          id: 'cf' + i, atomA: cl2, atomB: f, slotA: clSlot, slotB: 'down', order: 'single',
          clSplitExtSlot: ext, clSplitSlot: clSlot,
        });
      }
      window.app.breakBond(c2.bonds.find((b) => b.id === bid), c2);
      window.app.renderer.refresh();
      const e = audit('pure ClF3 break ' + bid, cl2, c2);
      if (e) return e;
    }

    // Out-of-order breaks: remove first-added F while later ones remain
    for (const firstBreak of ['cf0', 'cf1']) {
      const built = buildH3F(app);
      if (!built) return fail('out-of-order buildH3F failed');
      breakUI(built.compound, firstBreak);
      let err = audit('out-of-order after break ' + firstBreak, built.cl, built.compound);
      if (err) return err;
      err = checkNoStuckFluorines(built.cl, built.compound, 'out-of-order H3F ' + firstBreak);
      if (err) return err;
      err = assertAtMostOneFreeElectron(built.cl, 'out-of-order ' + firstBreak);
      if (err) return err;
      if (firstBreak === 'cf1' && built.cl.orbitals.left !== 2) {
        return fail('breaking second split should pair its electron with its ext orbital', {
          left: built.cl.orbitals.left,
        });
      }
    }

    // Break ext bond first, then split — free electrons should pair and reduce orbitals
    const reverse = buildH3F(app);
    if (!reverse) return fail('reverse-order buildH3F failed');
    breakUI(reverse.compound, 'cf2');
    breakUI(reverse.compound, 'cf0');
    const reverseErr = audit('reverse-order cf2 then cf0', reverse.cl, reverse.compound);
    if (reverseErr) return reverseErr;
    const reverseStuck = checkNoStuckFluorines(reverse.cl, reverse.compound, 'reverse-order');
    if (reverseStuck) return reverseStuck;
    if (reverse.cl.clOrbitalCount !== 5) {
      return fail('pairing two free electrons should reduce orbital count', { oc: reverse.cl.clOrbitalCount });
    }
    for (var bi = 0; bi < reverse.compound.bonds.length; bi++) {
      var rb = reverse.compound.bonds[bi];
      if (rb.order !== 'single') continue;
      var rCl = rb.atomA.element === 'Cl' ? rb.atomA : (rb.atomB.element === 'Cl' ? rb.atomB : null);
      if (!rCl) continue;
      var rPartner = rb.atomA.id === rCl.id ? rb.atomB : rb.atomA;
      if (rPartner.element !== 'F') continue;
      var rSlot = rb.atomA.id === rCl.id ? rb.slotA : rb.slotB;
      var expectedPos = window.__chemTest.computePartnerPositionForChlorineBond(rCl, rSlot, rPartner);
      if (Math.hypot(rPartner.x - expectedPos.x, rPartner.y - expectedPos.y) > 2) {
        return fail('bonded fluorines should realign after electron merge', {
          bondId: rb.id,
          slot: rSlot,
          actual: { x: rPartner.x, y: rPartner.y },
          expected: expectedPos,
        });
      }
    }
    const reverseAngles = window.__chemTest.getChlorineOrbitalSlots(reverse.cl)
      .map((s) => window.__chemTest.getChlorineOrbitalAngles(reverse.cl)[s]);
    const anchor = reverse.cl.clFixedAnchorSlot || 'right';
    const anchorAngle = window.__chemTest.getChlorineOrbitalAngles(reverse.cl)[anchor];
    const step = 360 / reverse.cl.clOrbitalCount;
    for (let i = 0; i < reverseAngles.length; i++) {
      const expected = ((anchorAngle + i * step) % 360 + 360) % 360;
      const nearest = reverseAngles.reduce((best, ang) => {
        const d = Math.min(Math.abs(ang - expected), 360 - Math.abs(ang - expected));
        return d < best.d ? { d } : best;
      }, { d: Infinity });
      if (nearest.d > 2) {
        return fail('merged chlorine orbitals should be evenly spaced', {
          expectedStep: step, anchorAngle, angles: reverseAngles,
        });
      }
    }

    app.compounds.length = 0;
    const clPure2 = app.createAtom('Cl', 400, 200);
    const cPure2 = app.createCompound([clPure2]);
    const fn2 = app.createAtom('F', 480, 200);
    prepFluorineSlot(fn2, 'left');
    cPure2.addAtom(fn2);
    resolver.formBond(clPure2, 'right', fn2, 'left');
    cPure2.bonds.push({ id: 'cf0', atomA: clPure2, atomB: fn2, slotA: 'right', slotB: 'left', order: 'single' });
    for (let i = 1; i < 3; i++) {
      const f = app.createAtom('F', 400, 80 + i * 80);
      prepFluorineSlot(f, 'down');
      cPure2.addAtom(f);
      const clSlot = ['up', 'down'][i - 1];
      const ext = resolver.formFluorideChlorineLonePairBond(f, 'down', clPure2, clSlot, cPure2);
      cPure2.bonds.push({
        id: 'cf' + i, atomA: clPure2, atomB: f, slotA: clSlot, slotB: 'down', order: 'single',
        clSplitExtSlot: ext, clSplitSlot: clSlot,
      });
    }
    window.app.breakBond(cPure2.bonds.find((b) => b.id === 'cf1'), cPure2);
    window.app.renderer.refresh();
    const outErr = audit('pure ClF3 out-of-order break cf1', clPure2, cPure2);
    if (outErr) return outErr;
    const stuckErr = checkNoStuckFluorines(clPure2, cPure2, 'pure ClF3 out-of-order cf1');
    if (stuckErr) return stuckErr;

    return { ok: true };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result.error);
    if (result.extra) console.error(JSON.stringify(result.extra, null, 2));
    process.exit(1);
  }
  console.log('PASS: ClF3 bond breaks (rotate, chain, pure)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
