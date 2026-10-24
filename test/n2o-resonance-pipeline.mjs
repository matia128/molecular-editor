/**
 * N=N-O → nitrous oxide resonance (N≡N⁺–O⁻ ↔ ⁻N=N⁺=O)
 * Run: node test/n2o-resonance-pipeline.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function startServer(port = 3484) {
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
  await page.waitForFunction(() => window.app?.snapEngine?.activateN2O);

  const result = await page.evaluate(() => {
    const app = window.app;
    const resolver = app.snapEngine.electronResolver;
    app.compounds.length = 0;

    const nTerm = app.createAtom('N', 160, 200);
    const nCenter = app.createAtom('N', 240, 200);
    const oxygen = app.createAtom('O', 320, 200);
    const compound = app.createCompound([nTerm, nCenter, oxygen]);
    if (!resolver.formBond(nTerm, 'right', nCenter, 'left')) {
      return { ok: false, error: 'NN single failed' };
    }
    if (!resolver.formBond(nCenter, 'right', oxygen, 'left')) {
      return { ok: false, error: 'NO single failed' };
    }
    const bondNN = {
      id: 'n2o-nn', atomA: nTerm, atomB: nCenter, slotA: 'right', slotB: 'left', order: 'single',
    };
    const bondNO = {
      id: 'n2o-no', atomA: nCenter, atomB: oxygen, slotA: 'right', slotB: 'left', order: 'single',
    };
    compound.addBond(bondNN);
    compound.addBond(bondNO);

    if (!app.snapEngine.cycleBondOrder(bondNN, compound)) {
      return { ok: false, error: 'could not make N=N', nn: bondNN.order, no: bondNO.order };
    }
    if (bondNN.order !== 'double' || bondNO.order !== 'single') {
      return { ok: false, error: 'expected N=N-O', nn: bondNN.order, no: bondNO.order };
    }

    if (!app.snapEngine.cycleBondOrder(bondNO, compound)) {
      return { ok: false, error: 'clicking N-O did not start resonance' };
    }
    const afterNO = {
      active: compound.n2oActive,
      state: compound.n2oResonanceState,
      nn: bondNN.order,
      no: bondNO.order,
      charges: compound.atoms.map((a) => ({ el: a.element, q: a.ozoneFormalCharge || 0 })),
      free: compound.atoms.map((a) => a.countFreeElectrons()),
      valence: compound.atoms.every((a) => a.isValenceConsistent()),
    };

    if (!app.snapEngine.applyN2OResonanceState(compound, 0)) {
      return { ok: false, error: 'state 0 failed', afterNO };
    }
    const state0 = { nn: bondNN.order, no: bondNO.order };
    if (!app.snapEngine.applyN2OResonanceState(compound, 1)) {
      return { ok: false, error: 'state 1 failed', afterNO, state0 };
    }
    const state1 = { nn: bondNN.order, no: bondNO.order };

    if (!app.snapEngine.cycleBondOrder(bondNN, compound)) {
      return { ok: false, error: 'second click did not deactivate' };
    }
    const afterOff = {
      active: compound.n2oActive,
      nn: bondNN.order,
      no: bondNO.order,
    };

    const clickNN = (function () {
      app.compounds.length = 0;
      const t = app.createAtom('N', 160, 280);
      const c = app.createAtom('N', 240, 280);
      const o = app.createAtom('O', 320, 280);
      const cmp = app.createCompound([t, c, o]);
      resolver.formBond(t, 'right', c, 'left');
      resolver.formBond(c, 'right', o, 'left');
      const nn = { id: 'n2o-nn2', atomA: t, atomB: c, slotA: 'right', slotB: 'left', order: 'single' };
      const no = { id: 'n2o-no2', atomA: c, atomB: o, slotA: 'right', slotB: 'left', order: 'single' };
      cmp.addBond(nn);
      cmp.addBond(no);
      app.snapEngine.cycleBondOrder(nn, cmp);
      const started = app.snapEngine.cycleBondOrder(nn, cmp);
      return { started, active: cmp.n2oActive, state: cmp.n2oResonanceState, nn: nn.order, no: no.order };
    })();

    return {
      ok: afterNO.active &&
        afterNO.valence &&
        afterNO.free.every((n) => n === 0) &&
        state0.nn === 'triple' && state0.no === 'single' &&
        state1.nn === 'double' && state1.no === 'double' &&
        afterOff.active === false && afterOff.nn === 'double' && afterOff.no === 'single' &&
        clickNN.started && clickNN.active && clickNN.state === 0,
      afterNO,
      state0,
      state1,
      afterOff,
      clickNN,
    };
  });

  await browser.close();
  server.close();

  if (!result.ok) {
    console.error('FAIL:', result);
    process.exit(1);
  }
  console.log('PASS: N=N-O click starts N2O resonance');
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
