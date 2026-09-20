/**
 * Verify ClF3 and ClF5 are identified only when fully paired (no free electrons).
 * Run: node test/clf-recognition.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function startServer(port = 3487) {
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

  const result = await page.evaluate(async () => {
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

    async function buildClFn(n) {
      const app = window.app;
      const resolver = app.snapEngine.electronResolver;
      const cl = app.createAtom('Cl', 200, 200);
      const compound = app.createCompound([cl]);
      const firstF = app.createAtom('F', 280, 200);
      prepFluorineSlot(firstF, 'left');
      compound.addAtom(firstF);
      if (!resolver.formBond(cl, 'right', firstF, 'left')) return fail('initial Cl–F bond failed');
      compound.bonds.push({
        id: 'cf0', atomA: cl, atomB: firstF, slotA: 'right', slotB: 'left', order: 'single',
      });

      const loneSlots = ['up', 'down', 'left'];
      for (let i = 1; i < n; i++) {
        const f = app.createAtom('F', 200, 80 + i * 40);
        prepFluorineSlot(f, 'down');
        compound.addAtom(f);
        const clSlot = loneSlots[i - 1];
        const ext = resolver.formFluorideChlorineLonePairBond(f, 'down', cl, clSlot, compound);
        if (!ext) return fail(`split bond ${i} failed`);
        compound.bonds.push({
          id: 'cf' + i,
          atomA: cl,
          atomB: f,
          slotA: clSlot,
          slotB: 'down',
          order: 'single',
          clSplitExtSlot: ext,
        });
      }
      window.__chemTest.tryMergeCompleteChlorineFluorideCluster(cl, compound);
      return { ok: true, compound, cl };
    }

    const clf3 = await buildClFn(3);
    if (!clf3.ok) return clf3;
    if (clf3.cl.countFreeElectrons() !== 0) {
      return fail('ClF3 should merge spare ext electrons into a lone pair', {
        free: clf3.cl.countFreeElectrons(),
        orbitals: { ...clf3.cl.orbitals },
      });
    }
    if (!window.__chemTest.isChlorineTrifluoride(clf3.compound)) {
      return fail('compound should match ClF3 pattern', {
        atoms: clf3.compound.atoms.map((a) => a.element),
        bonds: clf3.compound.bonds.length,
      });
    }

    const pipeline = window.app.validationPipeline;
    pipeline.validate(clf3.compound);
    for (let i = 0; i < 40; i++) {
      if (clf3.compound.validationState !== 'validating') break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (clf3.compound.validationState !== 'validated') {
      return fail('ClF3 should validate', {
        state: clf3.compound.validationState,
        name: clf3.compound.name,
      });
    }
    if (!clf3.compound.name || !/trifluoride/i.test(clf3.compound.name)) {
      return fail('ClF3 should be named chlorine trifluoride', { name: clf3.compound.name });
    }

    window.app.compounds.length = 0;
    const appH = window.app;
    const clH = appH.createAtom('Cl', 400, 200);
    const h = appH.createAtom('H', 480, 200);
    const compoundH = appH.createCompound([clH, h]);
    const resolverH = appH.snapEngine.electronResolver;
    if (!resolverH.formBond(clH, 'right', h, 'left')) return fail('Cl–H setup for ClF3+H failed');
    compoundH.bonds.push({
      id: 'clh', atomA: clH, atomB: h, slotA: 'right', slotB: 'left', order: 'single',
    });
    const loneSlotsH = ['up', 'left'];
    for (let i = 0; i < 2; i++) {
      const f = appH.createAtom('F', 400, 80 + i * 40);
      prepFluorineSlot(f, 'down');
      compoundH.addAtom(f);
      const clSlot = loneSlotsH[i];
      const ext = resolverH.formFluorideChlorineLonePairBond(f, 'down', clH, clSlot, compoundH);
      if (!ext) return fail(`ClF3+H split bond ${i} failed`);
      compoundH.bonds.push({
        id: 'cfh' + i,
        atomA: clH,
        atomB: f,
        slotA: clSlot,
        slotB: 'down',
        order: 'single',
        clSplitExtSlot: ext,
      });
    }
    const fThird = appH.createAtom('F', 400, 160);
    prepFluorineSlot(fThird, 'left');
    compoundH.addAtom(fThird);
    if (!resolverH.formBond(clH, 'ext0', fThird, 'left')) {
      return fail('third F on ClF3+H should bond to expanded orbital');
    }
    compoundH.bonds.push({
      id: 'cfh2',
      atomA: clH,
      atomB: fThird,
      slotA: 'ext0',
      slotB: 'left',
      order: 'single',
    });
    if (!window.__chemTest.isChlorineTrifluoride(compoundH)) {
      return fail('Cl + H + 3F should still match ClF3 pattern', {
        atoms: compoundH.atoms.map((a) => a.element),
        bonds: compoundH.bonds.length,
      });
    }
    if (clH.countFreeElectrons() === 0) {
      pipeline.validate(compoundH);
      for (let i = 0; i < 40; i++) {
        if (compoundH.validationState !== 'validating') break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (compoundH.validationState !== 'validated') {
        return fail('ClF3 with no free electrons should validate', {
          state: compoundH.validationState,
          name: compoundH.name,
        });
      }
    } else {
      pipeline.validate(compoundH);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (compoundH.validationState === 'validated' || compoundH.name) {
        return fail('ClF3 with free electrons should not be labeled', {
          state: compoundH.validationState,
          name: compoundH.name,
          free: clH.countFreeElectrons(),
        });
      }
    }

    window.app.compounds.length = 0;
    const app = window.app;
    const cl5 = app.createAtom('Cl', 300, 200);
    cl5.clOrbitalCount = 6;
    cl5.clFixedAnchorSlot = null;
    cl5.clExpansionPairs = [];
    cl5.orbitals = {
      up: 'single', down: 'single', left: 'single', right: 'single', ext0: 'single', ext1: 2,
    };
    cl5.clSlotAngles = { up: -90, right: 0, down: 90, left: 180, ext0: 120, ext1: 240 };
    const compound5 = app.createCompound([cl5]);
    const clSlots = ['up', 'down', 'left', 'right', 'ext0'];
    for (let i = 0; i < 5; i++) {
      const f = app.createAtom('F', 300 + i * 20, 120);
      f.orbitals = { up: 2, down: 2, left: 2, right: 'single' };
      compound5.addAtom(f);
      compound5.bonds.push({
        id: 'cf5-' + i,
        atomA: cl5,
        atomB: f,
        slotA: clSlots[i],
        slotB: 'right',
        order: 'single',
      });
    }
    if (!window.__chemTest.isChlorinePentafluoride(compound5)) {
      return fail('hand-built compound should match ClF5 pattern', {
        val: compound5.atoms.map((a) => a.isValenceConsistent()),
      });
    }
    pipeline.validate(compound5);
    for (let i = 0; i < 40; i++) {
      if (compound5.validationState !== 'validating') break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (compound5.validationState !== 'validated') {
      return fail('ClF5 should validate', {
        state: compound5.validationState,
        name: compound5.name,
      });
    }
    if (!compound5.name || !/pentafluoride/i.test(compound5.name)) {
      return fail('ClF5 should be named chlorine pentafluoride', { name: compound5.name });
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
  console.log('PASS: ClF3 and ClF5 recognition');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
