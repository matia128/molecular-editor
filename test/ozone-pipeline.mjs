/**
 * End-to-end: O3 ozone → molfile → RDKit → SMILES → PubChem + break behavior
 * Run: node test/ozone-pipeline.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const O3_NAME = /ozone/i;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function startServer(port = 3476) {
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

function buildO3Chain(app) {
  const resolver = app.snapEngine.electronResolver;
  const o1 = app.createAtom('O', 160, 200);
  const o2 = app.createAtom('O', 240, 200);
  const o3 = app.createAtom('O', 320, 200);
  const compound = app.createCompound([o1, o2, o3]);
  if (!resolver.formBond(o1, 'right', o2, 'left')) throw new Error('bond1 failed');
  if (!resolver.formBond(o2, 'right', o3, 'left')) throw new Error('bond2 failed');
  const bond1 = { id: 'oz-b1-' + Math.random(), atomA: o1, atomB: o2, slotA: 'right', slotB: 'left', order: 'single' };
  const bond2 = { id: 'oz-b2-' + Math.random(), atomA: o2, atomB: o3, slotA: 'right', slotB: 'left', order: 'single' };
  compound.addBond(bond1);
  compound.addBond(bond2);
  return { compound, o1, o2, o3, bond1, bond2 };
}

async function main() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.initRDKitModule === 'function', { timeout: 30000 });
  await page.waitForFunction(() => window.app?.snapEngine?.activateOzone, { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const app = window.app;
    app.compounds.length = 0;

    function partSummary() {
      return app.compounds.map((c) => ({
        atomCount: c.atoms.length,
        bondCount: c.bonds.length,
        bondOrder: c.bonds[0]?.order,
        orbitals: c.atoms.map((a) => ({ o: { ...a.orbitals }, free: a.countFreeElectrons() })),
      }));
    }

    // --- Build and validate ozone ---
    const chain1 = (function () {
      const resolver = app.snapEngine.electronResolver;
      const o1 = app.createAtom('O', 160, 200);
      const o2 = app.createAtom('O', 240, 200);
      const o3 = app.createAtom('O', 320, 200);
      const compound = app.createCompound([o1, o2, o3]);
      resolver.formBond(o1, 'right', o2, 'left');
      resolver.formBond(o2, 'right', o3, 'left');
      const bond1 = { id: 'oz-b1', atomA: o1, atomB: o2, slotA: 'right', slotB: 'left', order: 'single' };
      const bond2 = { id: 'oz-b2', atomA: o2, atomB: o3, slotA: 'right', slotB: 'left', order: 'single' };
      compound.addBond(bond1);
      compound.addBond(bond2);
      return { compound, bond1, bond2 };
    })();

    if (!app.snapEngine.activateOzone(chain1.compound, chain1.bond1)) {
      return { ok: false, error: 'activateOzone failed' };
    }

    app.validationPipeline.checkAndValidate([chain1.compound]);
    await new Promise((r) => setTimeout(r, 5000));
    const validatedAsOzone = {
      state: chain1.compound.validationState,
      name: chain1.compound.name,
      smiles: chain1.compound.metadata?.smiles,
    };

    // Break while ozone is still active → O + O2 double (no free electrons)
    app.breakBond(chain1.bond1, chain1.compound);
    const activeBreakParts = partSummary();

    // --- Deactivated chain breaks normally ---
    app.compounds.length = 0;
    const chain2 = (function () {
      const resolver = app.snapEngine.electronResolver;
      const o1 = app.createAtom('O', 160, 200);
      const o2 = app.createAtom('O', 240, 200);
      const o3 = app.createAtom('O', 320, 200);
      const compound = app.createCompound([o1, o2, o3]);
      resolver.formBond(o1, 'right', o2, 'left');
      resolver.formBond(o2, 'right', o3, 'left');
      const bond1 = { id: 'oz2-b1', atomA: o1, atomB: o2, slotA: 'right', slotB: 'left', order: 'single' };
      const bond2 = { id: 'oz2-b2', atomA: o2, atomB: o3, slotA: 'right', slotB: 'left', order: 'single' };
      compound.addBond(bond1);
      compound.addBond(bond2);
      return { compound, bond1, bond2 };
    })();

    app.snapEngine.activateOzone(chain2.compound, chain2.bond1);
    if (!app.snapEngine.deactivateOzone(chain2.compound)) {
      return { ok: false, error: 'deactivateOzone failed' };
    }
    const sorted2 = chain2.compound.atoms.slice().sort((a, b) => a.x - b.x);
    const deactivatedLayout = {
      left: { ...sorted2[0].orbitals },
      right: { ...sorted2[2].orbitals },
    };
    app.breakBond(chain2.bond1, chain2.compound);
    const normalBreakParts = partSummary();

    // --- O2 double downgrades to single + 1 free each ---
    app.compounds.length = 0;
    const resolver = app.snapEngine.electronResolver;
    const a = app.createAtom('O', 200, 200);
    const b = app.createAtom('O', 280, 200);
    const o2 = app.createCompound([a, b]);
    resolver.formBond(a, 'right', b, 'left');
    const dblBond = { id: 'o2-dbl', atomA: a, atomB: b, slotA: 'right', slotB: 'left', order: 'double' };
    o2.addBond(dblBond);
    a.orbitals.right = 'double';
    b.orbitals.left = 'double';
    for (const slot of ['up', 'down', 'left', 'right']) {
      if (slot !== 'right') a.orbitals[slot] = slot === 'down' ? 2 : 0;
      if (slot !== 'left') b.orbitals[slot] = slot === 'down' ? 2 : 0;
    }
    app.breakBond(dblBond, o2);
    const o2AfterDoubleBreak = {
      bondOrder: dblBond.order,
      stillOneCompound: app.compounds.length === 1,
      orbitals: o2.atoms.map((atom) => ({ free: atom.countFreeElectrons(), o: { ...atom.orbitals } })),
    };

    return {
      ok: true,
      validatedAsOzone,
      activeBreakParts,
      normalBreakParts,
      deactivatedLayout,
      o2AfterDoubleBreak,
    };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result.error);
    process.exit(1);
  }

  console.log('Validation (as ozone):', result.validatedAsOzone);

  function isLeftTerminalLayout(o) {
    return o.right === 'single' && o.left === 1;
  }

  function isRightTerminalLayout(o) {
    return o.left === 'single' && o.right === 1;
  }

  function outerTerminalOk(orbitals) {
    return isLeftTerminalLayout(orbitals) || isRightTerminalLayout(orbitals);
  }

  function o2PairOuterOk(part) {
    if (!part || part.bondOrder !== 'single' || part.orbitals.length !== 2) return false;
    const os = part.orbitals.map((a) => a.o);
    return part.orbitals.every((a) => a.free === 1) &&
      os.some(isLeftTerminalLayout) &&
      os.some(isRightTerminalLayout);
  }

  const activeO2 = result.activeBreakParts.find((p) => p.atomCount === 2);
  const activeBreakOk = result.activeBreakParts.length === 2 &&
    result.activeBreakParts.some((p) => p.atomCount === 1 && p.bondCount === 0) &&
    o2PairOuterOk(activeO2);

  const normalO2 = result.normalBreakParts.find((p) => p.atomCount === 2);
  const normalBreakOk = result.normalBreakParts.length === 2 &&
    result.normalBreakParts.some((p) => p.atomCount === 1 && p.bondCount === 0) &&
    o2PairOuterOk(normalO2);

  const deactivatedOk = result.deactivatedLayout.left.right === 'single' &&
    result.deactivatedLayout.left.left === 1 &&
    result.deactivatedLayout.right.left === 'single' &&
    result.deactivatedLayout.right.right === 1;

  const o2DowngradeOk = result.o2AfterDoubleBreak.stillOneCompound &&
    result.o2AfterDoubleBreak.bondOrder === 'single' &&
    result.o2AfterDoubleBreak.orbitals.every((a) => a.free === 1) &&
    outerTerminalOk(result.o2AfterDoubleBreak.orbitals[0].o) &&
    outerTerminalOk(result.o2AfterDoubleBreak.orbitals[1].o);

  console.log('Deactivated layout:', result.deactivatedLayout);
  console.log('Break from active ozone:', result.activeBreakParts);
  console.log('Break from deactivated chain:', result.normalBreakParts);
  console.log('O2 double break:', result.o2AfterDoubleBreak);

  console.log('\n=== SUMMARY ===');
  console.log('Validated as ozone:', result.validatedAsOzone.state === 'validated');
  console.log('Deactivated edge free e⁻ placement:', deactivatedOk);
  console.log('Active ozone break → O + O2 single (outer e⁻):', activeBreakOk);
  console.log('Deactivated chain break → O + O2 single (outer e⁻):', normalBreakOk);
  console.log('O2 double break → single w/ outer e⁻ each:', o2DowngradeOk);

  if (!O3_NAME.test(result.validatedAsOzone.name || '') ||
      result.validatedAsOzone.state !== 'validated' ||
      !deactivatedOk || !activeBreakOk || !normalBreakOk || !o2DowngradeOk) {
    process.exit(1);
  }
  console.log('\nPASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
