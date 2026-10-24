/**
 * Verify SO3 bond breaking collapses to SO2 + lone O.
 * Run: node test/so3-break.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

function startServer(port = 3490) {
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
  await page.waitForFunction(() => window.app?.snapEngine);

  const result = await page.evaluate(() => {
    const app = window.app;

    function setupSO3() {
      app.compounds.length = 0;
      const sulfur = app.createAtom('S', 300, 300);
      const o1 = app.createAtom('O', 220, 300);
      const o2 = app.createAtom('O', 300, 220);
      const o3 = app.createAtom('O', 380, 300);
      const compound = app.createCompound([sulfur, o1, o2, o3]);
      const b1 = { id: 'so3-b1', atomA: sulfur, atomB: o1, slotA: 'left', slotB: 'right', order: 'single' };
      const b2 = { id: 'so3-b2', atomA: sulfur, atomB: o2, slotA: 'up', slotB: 'down', order: 'double' };
      const b3 = { id: 'so3-b3', atomA: sulfur, atomB: o3, slotA: 'right', slotB: 'left', order: 'single' };
      compound.addBond(b1);
      compound.addBond(b2);
      compound.addBond(b3);
      sulfur.orbitals.left = 's_dative';
      sulfur.orbitals.up = 'double';
      sulfur.orbitals.right = 's_dative';
      sulfur.orbitals.down = 0;
      sulfur.nDativeHub = {
        loneSlot: 'down',
        receiverBondId: 'so3-b1',
        type2BondId: 'so3-b2',
        type3BondId: 'so3-b3',
        resonanceActive: true,
        resonanceState: 0,
      };
      o1.orbitals.right = 's_dative';
      o2.orbitals.down = 'double';
      o3.orbitals.left = 's_dative';
      return { compound, sulfur, bonds: { b1, b2, b3 } };
    }

    function snapshot(compound, sulfur) {
      return {
        bonds: compound.bonds.length,
        bondOrders: compound.bonds.map((b) => b.order).sort(),
        sulfurValence: sulfur.isValenceConsistent(),
        sulfurFree: sulfur.countFreeElectrons(),
        sulfurOrbitals: { ...sulfur.orbitals },
        hub: sulfur.nDativeHub ? {
          receiverBondId: sulfur.nDativeHub.receiverBondId,
          type2BondId: sulfur.nDativeHub.type2BondId,
          type3BondId: sulfur.nDativeHub.type3BondId,
          resonanceActive: sulfur.nDativeHub.resonanceActive,
        } : null,
        oValence: compound.atoms.filter((a) => a.element === 'O').every((o) => o.isValenceConsistent()),
        isolatedO: compound.atoms.filter((a) => a.element === 'O' && !compound.atomHasBonds(a)).length,
      };
    }

    function expectSO2(snap) {
      return snap.bonds === 2 &&
        snap.isolatedO === 1 &&
        snap.sulfurValence &&
        snap.sulfurFree === 0 &&
        snap.oValence &&
        snap.hub &&
        snap.hub.resonanceActive &&
        !snap.hub.type3BondId &&
        snap.bondOrders.includes('double');
    }

    const cases = [];
    for (const bondId of ['so3-b2', 'so3-b3', 'so3-b1']) {
      const { compound, sulfur } = setupSO3();
      const bond = compound.bonds.find((b) => b.id === bondId);
      app.snapEngine.breakBond(bond, compound);
      const snap = snapshot(compound, sulfur);
      cases.push({ bondId, snap, ok: expectSO2(snap) });
    }

    return { ok: cases.every((c) => c.ok), cases };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log('PASS: SO3 breaks to SO2 + lone O for all three legs');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
