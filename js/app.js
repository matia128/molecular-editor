(function () {
  'use strict';

  // ── Utils ──────────────────────────────────────────────────────────
  let idCounter = 0;
  function generateUniqueId() {
    return 'id_' + Date.now() + '_' + ++idCounter;
  }

  const GRID_SPACING = 80;
  // Covalent radii (pm); canvas/palette sizes scale relative to oxygen.
  const COVALENT_RADIUS_PM = { H: 31, C: 76, N: 71, O: 66, F: 57, Cl: 102, P: 107, S: 105 };
  const ATOM_SIZE_SCALE = 1.2;
  const MOLECULE_SCALE_STEP = 1.2;
  const MOLECULE_SCALE_CLICK_LIMIT = 3;
  const MOLECULE_DISPLAY_SCALE_MIN = Math.pow(MOLECULE_SCALE_STEP, -MOLECULE_SCALE_CLICK_LIMIT);
  const MOLECULE_DISPLAY_SCALE_MAX = Math.pow(MOLECULE_SCALE_STEP, MOLECULE_SCALE_CLICK_LIMIT);
  let moleculeDisplayScale = 1;
  const OXYGEN_ATOM_RADIUS = 22 * ATOM_SIZE_SCALE;
  const OXYGEN_ATOM_FONT_SIZE = 16 * ATOM_SIZE_SCALE;
  const BOND_GAP = 36;
  const H_BOND_LENGTH_SCALE = 0.75;
  const BOND_BREAK_PUSH = 18;
  const ELECTRON_RADIUS = 3.5 * ATOM_SIZE_SCALE;
  const PAIR_ELECTRON_OFFSET = 7;
  const COMPOUND_LABEL_FONT_SIZE = 18;
  const COMPOUND_LABEL_BELOW_GAP = 12;
  const COMPOUND_LABEL_COLOR = '#ffffff';
  const COMPOUND_LABEL_HOVER_COLOR = '#3d9eff';
  const ATOM_FONT = 'Segoe UI, system-ui, -apple-system, sans-serif';
  const ATOM_LABEL_Y_OFFSET = 1;

  function isMoleculeScaleAtMax() {
    return moleculeDisplayScale >= MOLECULE_DISPLAY_SCALE_MAX - 0.001;
  }

  function isMoleculeScaleAtMin() {
    return moleculeDisplayScale <= MOLECULE_DISPLAY_SCALE_MIN + 0.001;
  }

  function updateMoleculeScaleControls() {
    var zoomInBtn = document.getElementById('btn-canvas-zoom-in');
    var zoomOutBtn = document.getElementById('btn-canvas-zoom-out');
    if (zoomInBtn) {
      var atMax = isMoleculeScaleAtMax();
      zoomInBtn.classList.toggle('is-at-limit', atMax);
      zoomInBtn.setAttribute('aria-disabled', atMax ? 'true' : 'false');
    }
    if (zoomOutBtn) {
      var atMin = isMoleculeScaleAtMin();
      zoomOutBtn.classList.toggle('is-at-limit', atMin);
      zoomOutBtn.setAttribute('aria-disabled', atMin ? 'true' : 'false');
    }
  }

  function mscale(value) {
    return value * moleculeDisplayScale;
  }

  function getAtomRadius(element) {
    return mscale(OXYGEN_ATOM_RADIUS * (COVALENT_RADIUS_PM[element] / COVALENT_RADIUS_PM.O));
  }

  function getAtomFontSize(element) {
    return mscale(OXYGEN_ATOM_FONT_SIZE * (COVALENT_RADIUS_PM[element] / COVALENT_RADIUS_PM.O));
  }

  function getElectronRadius() {
    return mscale(ELECTRON_RADIUS);
  }

  function getPairElectronOffset() {
    return mscale(PAIR_ELECTRON_OFFSET);
  }

  function getBondStrokeWidth() {
    return mscale(BOND_STROKE_WIDTH);
  }

  function getBondTripleCenterWidth() {
    return mscale(BOND_TRIPLE_CENTER_WIDTH);
  }

  function getBondHitStrokeWidth() {
    return mscale(BOND_HIT_STROKE_WIDTH);
  }

  function bondInvolvesHydrogen(elementA, elementB) {
    return elementA === 'H' || elementB === 'H';
  }

  function isHydrogenHydrogenPair(atomA, atomB) {
    return atomA.element === 'H' && atomB.element === 'H';
  }

  function isHydrogenHydrogenBondPair(pair) {
    return isHydrogenHydrogenPair(pair.moving, pair.stationary);
  }

  function getOrbitalOffset(element) {
    var halfGap = mscale(BOND_GAP / 2);
    if (element === 'H') halfGap *= H_BOND_LENGTH_SCALE;
    return getAtomRadius(element) + halfGap;
  }

  function getBondCenterDistance(elementA, elementB) {
    var distance = getAtomRadius(elementA) + mscale(BOND_GAP) + getAtomRadius(elementB);
    if (bondInvolvesHydrogen(elementA, elementB)) distance *= H_BOND_LENGTH_SCALE;
    return distance;
  }

  function getOrbitalPosition(slot, element, atom) {
    if (atom && atom.bzSlotAngles && atom.bzSlotAngles[slot] !== undefined) {
      var bzRad = atom.bzSlotAngles[slot] * Math.PI / 180;
      var bzOffset = getOrbitalOffset(element);
      return { x: Math.cos(bzRad) * bzOffset, y: Math.sin(bzRad) * bzOffset };
    }
    if (atom && atom.fSlotAngles && atom.fSlotAngles[slot] !== undefined) {
      var fRad = atom.fSlotAngles[slot] * Math.PI / 180;
      var fOffset = getOrbitalOffset(element);
      return { x: Math.cos(fRad) * fOffset, y: Math.sin(fRad) * fOffset };
    }
    if (atom && atom.element === 'Cl' && atom.clSlotAngles && atom.clSlotAngles[slot] !== undefined) {
      var rad = atom.clSlotAngles[slot] * Math.PI / 180;
      var offset = getOrbitalOffset(element);
      return { x: Math.cos(rad) * offset, y: Math.sin(rad) * offset };
    }
    var offset = getOrbitalOffset(element);
    if (slot === 'up') return { x: 0, y: -offset };
    if (slot === 'down') return { x: 0, y: offset };
    if (slot === 'left') return { x: -offset, y: 0 };
    return { x: offset, y: 0 };
  }

  function getAtomSlotVector(atom, slot) {
    if (atom && atom.bzSlotAngles && atom.bzSlotAngles[slot] !== undefined) {
      var bzRad = atom.bzSlotAngles[slot] * Math.PI / 180;
      return { dx: Math.cos(bzRad), dy: Math.sin(bzRad) };
    }
    if (atom && atom.fSlotAngles && atom.fSlotAngles[slot] !== undefined) {
      var fRad = atom.fSlotAngles[slot] * Math.PI / 180;
      return { dx: Math.cos(fRad), dy: Math.sin(fRad) };
    }
    if (atom && atom.element === 'Cl' && atom.clSlotAngles && atom.clSlotAngles[slot] !== undefined) {
      var rad = atom.clSlotAngles[slot] * Math.PI / 180;
      return { dx: Math.cos(rad), dy: Math.sin(rad) };
    }
    return SLOT_VECTORS[slot] || { dx: 0, dy: 0 };
  }

  function pairPerpFromSlotAngle(angleDeg) {
    var rad = angleDeg * Math.PI / 180;
    var offset = getPairElectronOffset();
    return {
      x: -Math.sin(rad) * offset,
      y: Math.cos(rad) * offset,
    };
  }

  function getOrbitalPairPerp(atom, slot) {
    if (atom && atom.bzSlotAngles && atom.bzSlotAngles[slot] !== undefined) {
      return pairPerpFromSlotAngle(atom.bzSlotAngles[slot]);
    }
    if (atom && atom.fSlotAngles && atom.fSlotAngles[slot] !== undefined && atom.orbitals[slot] === 2) {
      return pairPerpFromSlotAngle(atom.fSlotAngles[slot]);
    }
    if (atom && atom.clSlotAngles && atom.clSlotAngles[slot] !== undefined) {
      return pairPerpFromSlotAngle(atom.clSlotAngles[slot]);
    }
    var offset = getPairElectronOffset();
    return (slot === 'up' || slot === 'down')
      ? { x: offset, y: 0 }
      : { x: 0, y: offset };
  }

  function getBondingRadius(element) {
    return getOrbitalOffset(element) + getElectronRadius();
  }

  function getPairBondingReach(elementA, elementB) {
    return getBondingRadius(elementA) + getBondingRadius(elementB);
  }

  function computeSnapFromPosition(movingX, movingY, movingElement, stationaryAtom, movingSlot, stationarySlot) {
    var vec = getAtomSlotVector(stationaryAtom, stationarySlot);
    var bondDist = getBondCenterDistance(movingElement, stationaryAtom.element);
    var targetX = stationaryAtom.x + vec.dx * bondDist;
    var targetY = stationaryAtom.y + vec.dy * bondDist;
    return {
      dx: targetX - movingX,
      dy: targetY - movingY,
      targetX: targetX,
      targetY: targetY,
    };
  }

  function computePartnerPositionForChlorineBond(chlorine, clSlot, partner) {
    var vec = getAtomSlotVector(chlorine, clSlot);
    var bondDist = getBondCenterDistance(partner.element, chlorine.element);
    return {
      x: chlorine.x + vec.dx * bondDist,
      y: chlorine.y + vec.dy * bondDist,
    };
  }

  function realignChlorineBondPartners(chlorine, compound, pendingPartners) {
    if (!chlorine || chlorine.element !== 'Cl') return;
    ensureChlorineOrbitalLayout(chlorine);
    var targets = [];
    if (compound) {
      for (var i = 0; i < compound.bonds.length; i++) {
        var bond = compound.bonds[i];
        var clSlot = null;
        var partner = null;
        if (bond.atomA.id === chlorine.id) {
          clSlot = bond.slotA;
          partner = bond.atomB;
        } else if (bond.atomB.id === chlorine.id) {
          clSlot = bond.slotB;
          partner = bond.atomA;
        }
        if (clSlot && partner) targets.push({ clSlot: clSlot, partner: partner, bond: bond });
      }
    }
    if (pendingPartners) {
      for (var j = 0; j < pendingPartners.length; j++) {
        targets.push(pendingPartners[j]);
      }
    }
    var moved = new Set();
    for (var t = 0; t < targets.length; t++) {
      var slot = targets[t].clSlot;
      var atom = targets[t].partner;
      var bond = targets[t].bond || null;
      if (shouldPreserveChlorinePartnerPosition(chlorine, slot, atom, compound)) continue;
      if (moved.has(atom.id)) continue;
      moved.add(atom.id);
      var pos = computePartnerPositionForChlorineBond(chlorine, slot, atom);
      atom.x = pos.x;
      atom.y = pos.y;
    }
    reorientAllChlorineFluorines(compound);
  }

  function computeSnapForSlots(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var snap = computeSnapFromPosition(
      movingAtom.x, movingAtom.y, movingAtom.element, stationaryAtom, movingSlot, stationarySlot);
    return {
      dx: snap.dx,
      dy: snap.dy,
      stationarySlot: stationarySlot,
      movingSlot: movingSlot,
    };
  }

  function chooseBondSlotsFromPosition(movingX, movingY, stationaryAtom) {
    var dx = stationaryAtom.x - movingX;
    var dy = stationaryAtom.y - movingY;
    var dist = Math.hypot(dx, dy);
    var movingSlot;
    if (dist < 8) {
      movingSlot = 'right';
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      movingSlot = dx >= 0 ? 'right' : 'left';
    } else {
      movingSlot = dy >= 0 ? 'down' : 'up';
    }
    return { movingSlot: movingSlot, stationarySlot: OPPOSITE_SLOT[movingSlot] };
  }

  function benzeneExoCardinalSlot(atom) {
    if (!isBenzeneRingCarbon(atom) || !atom.bzSlotAngles || atom.bzSlotAngles.exo === undefined) {
      return null;
    }
    return angleToSlot(atom.bzSlotAngles.exo);
  }

  function dominantApproachSlot(fromX, fromY, originX, originY) {
    var dx = fromX - originX;
    var dy = fromY - originY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
    return angleToSlot(Math.atan2(dy, dx) * 180 / Math.PI);
  }

  function benzeneExoApproachAllowedAt(benzeneAtom, benzeneX, benzeneY, otherX, otherY) {
    var allowed = benzeneExoCardinalSlot(benzeneAtom);
    if (!allowed) return true;
    return dominantApproachSlot(otherX, otherY, benzeneX, benzeneY) === allowed;
  }

  function pairAllowsBenzeneExoApproach(atomA, ax, ay, atomB, bx, by) {
    if (isBenzeneRingCarbon(atomA) && !benzeneExoApproachAllowedAt(atomA, ax, ay, bx, by)) {
      return false;
    }
    if (isBenzeneRingCarbon(atomB) && !benzeneExoApproachAllowedAt(atomB, bx, by, ax, ay)) {
      return false;
    }
    return true;
  }

  function chooseBondSlotsAt(movingAtom, movingX, movingY, stationaryAtom, stationaryX, stationaryY) {
    if (movingAtom.element === 'Cl') ensureChlorineOrbitalLayout(movingAtom);
    if (stationaryAtom.element === 'Cl') ensureChlorineOrbitalLayout(stationaryAtom);
    var stationaryPos = { x: stationaryX, y: stationaryY, element: stationaryAtom.element };
    if (isBenzeneRingCarbon(movingAtom) || isBenzeneRingCarbon(stationaryAtom)) {
      var bzMoving = isBenzeneRingCarbon(movingAtom)
        ? 'exo'
        : (movingAtom.element === 'Cl'
          ? chooseChlorineBondSlot(movingAtom, stationaryX, stationaryY)
          : chooseBondSlotsFromPosition(movingX, movingY, stationaryPos).movingSlot);
      var bzStationary = isBenzeneRingCarbon(stationaryAtom)
        ? 'exo'
        : (stationaryAtom.element === 'Cl'
          ? chooseChlorineBondSlot(stationaryAtom, movingX, movingY)
          : chooseBondSlotsFromPosition(movingX, movingY, stationaryPos).stationarySlot);
      return { movingSlot: bzMoving, stationarySlot: bzStationary };
    }
    if (movingAtom.element === 'Cl') {
      var clMoving = chooseChlorineBondSlot(movingAtom, stationaryX, stationaryY);
      var partnerSlots = chooseBondSlotsFromPosition(movingX, movingY, stationaryPos);
      return { movingSlot: clMoving, stationarySlot: partnerSlots.stationarySlot };
    }
    if (stationaryAtom.element === 'Cl') {
      var stdSlots = chooseBondSlotsFromPosition(movingX, movingY, stationaryPos);
      return {
        movingSlot: stdSlots.movingSlot,
        stationarySlot: chooseChlorineBondSlot(stationaryAtom, movingX, movingY),
      };
    }
    return chooseBondSlotsFromPosition(movingX, movingY, stationaryPos);
  }

  function chooseBondSlots(movingAtom, stationaryAtom) {
    return chooseBondSlotsAt(
      movingAtom, movingAtom.x, movingAtom.y, stationaryAtom, stationaryAtom.x, stationaryAtom.y);
  }

  function isWithinBondingRangeAt(movingX, movingY, movingElement, stationaryAtom) {
    var centerDist = Math.hypot(stationaryAtom.x - movingX, stationaryAtom.y - movingY);
    if (centerDist <= getPairBondingReach(movingElement, stationaryAtom.element)) return true;
    return centerDist <= getBondCenterDistance(movingElement, stationaryAtom.element) + getElectronRadius();
  }

  function shouldApplyStericCheck(atomA, atomB) {
    return atomA.element !== 'H' && atomB.element !== 'H';
  }

  function isAtomWithinBondingRange(atomA, atomB) {
    return isWithinBondingRangeAt(atomA.x, atomA.y, atomA.element, atomB);
  }

  function hasAvailableBondSlots(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    return isOrbitalAvailable(movingAtom.orbitals[movingSlot]) &&
      isOrbitalAvailable(stationaryAtom.orbitals[stationarySlot]);
  }

  function canBondAtSlots(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    return hasAvailableBondSlots(movingAtom, stationaryAtom, movingSlot, stationarySlot) &&
      movingAtom.countFreeElectrons() >= 1 &&
      stationaryAtom.countFreeElectrons() >= 1;
  }

  function slotsAllowSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    return hasAvailableBondSlots(movingAtom, stationaryAtom, movingSlot, stationarySlot) ||
      canNDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot) ||
      canPDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot) ||
      canSDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot) ||
      canClDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot) ||
      canFluorideChlorineLonePairSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot);
  }

  function nitrogenDativeLoneSlot(atom) {
    if (!nitrogenHubReady(atom)) return null;
    return nitrogenLonePairSlot(atom);
  }

  function chlorineFreeElectronSlot(atom) {
    if (atom.element !== 'Cl') return null;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (atom.orbitals[slot] === 1) return slot;
    }
    return null;
  }

  function chlorineBaseFreeElectronConsumed(atom) {
    if (atom.element !== 'Cl') return false;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (atom.orbitals[slot] === 1) return false;
    }
    return true;
  }

  function chlorineHasNonClDativeBond(atom, compound) {
    if (compound) {
      for (var i = 0; i < compound.bonds.length; i++) {
        var bond = compound.bonds[i];
        if (bond.order === 'cl_dative') continue;
        if (bond.atomA.id === atom.id || bond.atomB.id === atom.id) return true;
      }
    }
    for (var slot of getAtomOrbitalSlots(atom)) {
      var val = atom.orbitals[slot];
      if (val === 'single' || val === 'double' || val === 'triple') return true;
    }
    return false;
  }

  function chlorineDativeReady(atom, compound) {
    if (atom.element !== 'Cl') return false;
    if (!chlorineBaseFreeElectronConsumed(atom)) return false;
    if (!chlorineHasNonClDativeBond(atom, compound)) return false;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (atom.orbitals[slot] === 2) return true;
    }
    return false;
  }

  function chlorineIsDativeDonor(atom) {
    if (atom.element !== 'Cl') return false;
    if (!chlorineBaseFreeElectronConsumed(atom)) return false;
    return chlorineHasNonClDativeBond(atom, null) ||
      ['up', 'down', 'left', 'right'].some(function (slot) {
        return atom.orbitals[slot] === 'cl_dative';
      }) ||
      (atom.clExpansionPairs && atom.clExpansionPairs.length > 0);
  }

  function chlorineDativeLonePairSlot(atom, slot) {
    return chlorineIsDativeDonor(atom) && atom.orbitals[slot] === 2;
  }

  function countChlorineDativeLonePairs(atom, compound) {
    if (atom.element !== 'Cl') return 0;
    var count = 0;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (chlorineDativeLonePairSlot(atom, slot)) count += 1;
    }
    if (chlorineIsDativeDonor(atom) && atom.clOrbitalCount > 4) {
      for (var i = 0; i < atom.clOrbitalCount - 4; i++) {
        var ext = 'ext' + i;
        if (atom.orbitals[ext] === 2) count += 1;
      }
    }
    return count;
  }

  function chlorineCanSplitDativeLonePair(atom, slot, compound) {
    return chlorineDativeLonePairSlot(atom, slot) &&
      countChlorineDativeLonePairs(atom, compound) >= 2;
  }

  function isDativeLonePairDisplay(atom, slot) {
    return slot === nitrogenDativeLoneSlot(atom) ||
      slot === phosphorusDativeLoneSlot(atom) ||
      sulfurDativeLonePairSlot(atom, slot) ||
      chlorineDativeLonePairSlot(atom, slot);
  }

  function findCompoundChlorineHub(compound) {
    if (!compound) return null;
    for (var i = 0; i < compound.atoms.length; i++) {
      var atom = compound.atoms[i];
      if (atom.element === 'Cl' && chlorineHasExpandedLayout(atom)) return atom;
    }
    return null;
  }

  function realignAllChlorineBondPartnersInCompound(compound) {
    if (!compound) return;
    for (var i = 0; i < compound.atoms.length; i++) {
      var atom = compound.atoms[i];
      if (atom.element === 'Cl' && atom.clOrbitalCount) {
        realignChlorineBondPartners(atom, compound);
      }
    }
  }

  function getChlorineSlotsSortedByAngle(chlorine) {
    var slots = getChlorineOrbitalSlots(chlorine);
    return slots.slice().sort(function (a, b) {
      var angA = chlorine.clSlotAngles[a] !== undefined ? normalizeAngleDeg(chlorine.clSlotAngles[a]) : 0;
      var angB = chlorine.clSlotAngles[b] !== undefined ? normalizeAngleDeg(chlorine.clSlotAngles[b]) : 0;
      return angA - angB;
    });
  }

  function swapChlorineOrbitalSlots(cl, compound, slotA, slotB) {
    if (!cl || slotA === slotB) return;
    var tempVal = cl.orbitals[slotA];
    cl.orbitals[slotA] = cl.orbitals[slotB];
    cl.orbitals[slotB] = tempVal;
    if (cl.clSlotAngles) {
      var tempAng = cl.clSlotAngles[slotA];
      cl.clSlotAngles[slotA] = cl.clSlotAngles[slotB];
      cl.clSlotAngles[slotB] = tempAng;
    }
    if (cl.clExpansionPairs) {
      for (var pi = 0; pi < cl.clExpansionPairs.length; pi++) {
        var pair = cl.clExpansionPairs[pi];
        if (pair.splitSlot === slotA) pair.splitSlot = slotB;
        else if (pair.splitSlot === slotB) pair.splitSlot = slotA;
        if (pair.extSlot === slotA) pair.extSlot = slotB;
        else if (pair.extSlot === slotB) pair.extSlot = slotA;
      }
    }
    if (cl.clFixedAnchorSlot === slotA) cl.clFixedAnchorSlot = slotB;
    else if (cl.clFixedAnchorSlot === slotB) cl.clFixedAnchorSlot = slotA;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.atomA.id === cl.id) {
        if (bond.slotA === slotA) bond.slotA = slotB;
        else if (bond.slotA === slotB) bond.slotA = slotA;
      }
      if (bond.atomB.id === cl.id) {
        if (bond.slotB === slotA) bond.slotB = slotB;
        else if (bond.slotB === slotB) bond.slotB = slotA;
      }
    }
    syncChlorineExpansionBondMetadata(compound);
    realignChlorineBondPartners(cl, compound);
  }

  function ensureChlorineOrbitalLayout(atom) {
    if (atom.element !== 'Cl') return;
    if (!atom.clOrbitalCount) {
      atom.clOrbitalCount = 4;
      atom.clSlotAngles = { up: -90, right: 0, down: 90, left: 180 };
      atom.clExpansionPairs = [];
      atom.clFixedAnchorSlot = null;
      return;
    }
    if (!atom.clSlotAngles) {
      atom.clSlotAngles = { up: -90, right: 0, down: 90, left: 180 };
    }
    if (!atom.clExpansionPairs) atom.clExpansionPairs = [];
  }

  function markChlorineFixedAnchorSlot(atom, slot, partnerElement) {
    if (atom.element !== 'Cl') return;
    ensureChlorineOrbitalLayout(atom);
    if (atom.clFixedAnchorSlot) return;
    if (['up', 'down', 'left', 'right'].indexOf(slot) === -1) return;
    if (atom.orbitals[slot] === 1) atom.clFixedAnchorSlot = slot;
  }

  function chlorineSlotBondedToPartner(chlorine, slot, compound) {
    if (!chlorine || !compound || !slot) return false;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order !== 'single') continue;
      if (bond.atomA.id === chlorine.id && bond.slotA === slot) return true;
      if (bond.atomB.id === chlorine.id && bond.slotB === slot) return true;
    }
    return false;
  }

  function chlorineSlotBondedToHydrogen(chlorine, slot, compound) {
    if (!chlorine || !compound || !slot) return false;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order !== 'single') continue;
      var clSide = null;
      var partner = null;
      if (bond.atomA.id === chlorine.id) {
        clSide = bond.slotA;
        partner = bond.atomB;
      } else if (bond.atomB.id === chlorine.id) {
        clSide = bond.slotB;
        partner = bond.atomA;
      }
      if (clSide === slot && partner && partner.element === 'H') return true;
    }
    return false;
  }

  function shouldPreserveChlorinePartnerPosition(chlorine, clSlot, partner, compound) {
    if (!chlorine || !partner || !clSlot) return false;
    if (partner.element !== 'H') return false;
    return chlorine.clFixedAnchorSlot === clSlot &&
      (!compound || chlorineSlotBondedToHydrogen(chlorine, clSlot, compound));
  }

  function chlorineSlotCanonicalAngle(slot) {
    if (slot === 'up') return -90;
    if (slot === 'right') return 0;
    if (slot === 'down') return 90;
    if (slot === 'left') return 180;
    return undefined;
  }

  function findChlorineBondedSlot(atom, compound, pendingPartners) {
    if (!atom) return null;
    if (compound) {
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        var bond = compound.bonds[bi];
        if (bond.order !== 'single') continue;
        var clSlot = null;
        if (bond.atomA.id === atom.id) clSlot = bond.slotA;
        else if (bond.atomB.id === atom.id) clSlot = bond.slotB;
        else continue;
        if (isBondValue(atom.orbitals[clSlot])) return clSlot;
      }
    }
    if (pendingPartners) {
      for (var pi = 0; pi < pendingPartners.length; pi++) {
        var entry = pendingPartners[pi];
        if (!entry || !entry.clSlot) continue;
        if (isBondValue(atom.orbitals[entry.clSlot])) return entry.clSlot;
      }
    }
    return null;
  }

  function findChlorineRedistributionAnchor(atom, compound, pendingPartners) {
    ensureChlorineOrbitalLayout(atom);
    if (atom.clFixedAnchorSlot &&
        (!compound || chlorineSlotBondedToPartner(atom, atom.clFixedAnchorSlot, compound))) {
      return atom.clFixedAnchorSlot;
    }
    var freeSlot = findChlorineAnchorSlot(atom);
    if (freeSlot) return freeSlot;
    var bondSlot = findChlorineBondedSlot(atom, compound, pendingPartners || null);
    if (bondSlot) return bondSlot;
    return 'up';
  }

  function isActiveChlorineExtValue(val) {
    return val === 1 || val === 2 || isBondValue(val);
  }

  // Keep clOrbitalCount and extN keys in sync. Never invent empty ext slots —
  // empty placeholders steal rays and make n-fold spacing look uneven.
  function syncChlorineOrbitalCount(atom, compound) {
    if (!atom || atom.element !== 'Cl') return;
    ensureChlorineOrbitalLayout(atom);
    var live = [];
    for (var i = 0; i < 3; i++) {
      var ext = 'ext' + i;
      if (!isActiveChlorineExtValue(atom.orbitals[ext])) {
        if (atom.orbitals[ext] !== undefined) delete atom.orbitals[ext];
        if (atom.clSlotAngles) delete atom.clSlotAngles[ext];
        continue;
      }
      live.push({
        val: atom.orbitals[ext],
        angle: atom.clSlotAngles ? atom.clSlotAngles[ext] : undefined,
        splitSlot: findChlorineSplitSlotForExt(atom, ext),
        oldSlot: ext,
      });
      delete atom.orbitals[ext];
      if (atom.clSlotAngles) delete atom.clSlotAngles[ext];
    }
    var slotRemap = {};
    for (var j = 0; j < live.length; j++) {
      var slot = 'ext' + j;
      slotRemap[live[j].oldSlot] = slot;
      atom.orbitals[slot] = live[j].val;
      if (!atom.clSlotAngles) atom.clSlotAngles = {};
      if (live[j].angle !== undefined && isFinite(live[j].angle)) {
        atom.clSlotAngles[slot] = live[j].angle;
      }
    }
    atom.clOrbitalCount = 4 + live.length;
    if (compound) remapChlorineBondExtSlotReferences(atom, compound, slotRemap);
    if (!atom.clExpansionPairs) atom.clExpansionPairs = [];
    for (var pi = 0; pi < atom.clExpansionPairs.length; pi++) {
      var pair = atom.clExpansionPairs[pi];
      pair.extSlot = null;
      for (var k = 0; k < live.length; k++) {
        if (live[k].splitSlot === pair.splitSlot) {
          pair.extSlot = 'ext' + k;
          break;
        }
      }
    }
    atom.clExpansionPairs = atom.clExpansionPairs.filter(function (p) {
      return p.extSlot;
    });
  }

  function getChlorineOrbitalSlots(atom) {
    syncChlorineOrbitalCount(atom);
    var slots = ['up', 'right', 'down', 'left'];
    for (var i = 0; i < atom.clOrbitalCount - 4; i++) {
      slots.push('ext' + i);
    }
    return slots;
  }

  function getAtomOrbitalSlots(atom) {
    if (isBenzeneRingCarbon(atom)) return ['ringPrev', 'ringNext', 'exo'];
    if (atom.element === 'Cl') return getChlorineOrbitalSlots(atom);
    return ['up', 'down', 'left', 'right'];
  }

  function isBenzeneRingCarbon(atom) {
    return !!(atom && atom.element === 'C' && atom.bzSlotAngles);
  }

  function benzeneRingBondIdSet(compound) {
    var ids = new Set();
    var rings = compound && compound.benzeneRings ? compound.benzeneRings : [];
    for (var i = 0; i < rings.length; i++) {
      var bondIds = rings[i].bondIds || [];
      for (var j = 0; j < bondIds.length; j++) ids.add(bondIds[j]);
    }
    return ids;
  }

  function isBenzeneRingBond(bond, compound) {
    if (!bond || !compound) return false;
    return benzeneRingBondIdSet(compound).has(bond.id);
  }

  function findBenzeneRingById(compound, ringId) {
    var rings = compound && compound.benzeneRings ? compound.benzeneRings : [];
    for (var i = 0; i < rings.length; i++) {
      if (rings[i].id === ringId) return rings[i];
    }
    return null;
  }

  function getBenzeneCarbonsForRing(compound, ringId) {
    var carbons = [];
    for (var i = 0; i < compound.atoms.length; i++) {
      var atom = compound.atoms[i];
      if (atom.benzeneRingId === ringId) carbons.push(atom);
    }
    carbons.sort(function (a, b) { return (a.benzeneIndex || 0) - (b.benzeneIndex || 0); });
    return carbons;
  }

  function compoundHasActiveBenzeneResonance(compound) {
    var rings = compound && compound.benzeneRings ? compound.benzeneRings : [];
    for (var i = 0; i < rings.length; i++) {
      if (rings[i].active) return true;
    }
    return false;
  }

  function rotateBenzeneSlotAngles(atom, deltaDeg) {
    if (!atom || !atom.bzSlotAngles) return;
    var slots = ['ringPrev', 'ringNext', 'exo'];
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (atom.bzSlotAngles[slot] !== undefined) {
        atom.bzSlotAngles[slot] = normalizeAngleDeg(atom.bzSlotAngles[slot] + deltaDeg);
      }
    }
  }

  function assignBenzeneExoCardinals(carbons) {
    if (!carbons || carbons.length !== 6) return;
    var byY = carbons.slice().sort(function (a, b) {
      return a.y - b.y || a.x - b.x;
    });
    var topIds = new Set([byY[0].id, byY[1].id]);
    var botIds = new Set([byY[4].id, byY[5].id]);
    var cx = 0;
    for (var i = 0; i < carbons.length; i++) cx += carbons[i].x;
    cx /= carbons.length;
    for (var ci = 0; ci < carbons.length; ci++) {
      var atom = carbons[ci];
      if (!atom.bzSlotAngles) atom.bzSlotAngles = {};
      if (topIds.has(atom.id)) atom.bzSlotAngles.exo = -90;
      else if (botIds.has(atom.id)) atom.bzSlotAngles.exo = 90;
      else atom.bzSlotAngles.exo = atom.x < cx ? 180 : 0;
    }
  }

  function applyBenzeneResonanceState(compound, ring, stateIndex) {
    if (!compound || !ring || !ring.active) return false;
    var carbons = getBenzeneCarbonsForRing(compound, ring.id);
    if (carbons.length !== 6) return false;
    var bondById = new Map();
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      bondById.set(compound.bonds[bi].id, compound.bonds[bi]);
    }
    for (var i = 0; i < 6; i++) {
      var bond = bondById.get(ring.bondIds[i]);
      if (!bond) return false;
      var nextIsDouble = (stateIndex === 0 && i % 2 === 0) || (stateIndex === 1 && i % 2 === 1);
      bond.order = nextIsDouble ? 'double' : 'single';
    }
    for (var ci = 0; ci < carbons.length; ci++) {
      var carbon = carbons[ci];
      var nextDouble = (stateIndex === 0 && ci % 2 === 0) || (stateIndex === 1 && ci % 2 === 1);
      carbon.orbitals.ringNext = nextDouble ? 'double' : 'single';
      carbon.orbitals.ringPrev = nextDouble ? 'single' : 'double';
    }
    ring.state = stateIndex;
    return carbons.every(function (atom) { return atom.isValenceConsistent(); });
  }

  function refreshBenzeneRings(compound) {
    if (!compound || !compound.benzeneRings) return;
    var present = new Set();
    for (var i = 0; i < compound.bonds.length; i++) present.add(compound.bonds[i].id);
    for (var ri = 0; ri < compound.benzeneRings.length; ri++) {
      var ring = compound.benzeneRings[ri];
      var intact = (ring.bondIds || []).every(function (id) { return present.has(id); });
      if (!intact) ring.active = false;
    }
  }

  function transferBenzeneState(fromCompound, toCompound) {
    if (!fromCompound || !toCompound || !fromCompound.benzeneRings || !fromCompound.benzeneRings.length) return;
    if (!toCompound.benzeneRings) toCompound.benzeneRings = [];
    for (var i = 0; i < fromCompound.benzeneRings.length; i++) {
      toCompound.benzeneRings.push(fromCompound.benzeneRings[i]);
    }
    fromCompound.benzeneRings = [];
  }

  function assignBenzeneRingsToOwningCompounds(rings, compounds) {
    if (!rings || !rings.length) return;
    for (var i = 0; i < compounds.length; i++) {
      if (!compounds[i].benzeneRings) compounds[i].benzeneRings = [];
    }
    for (var ri = 0; ri < rings.length; ri++) {
      var ring = rings[ri];
      var owner = null;
      for (var ci = 0; ci < compounds.length; ci++) {
        var carbons = getBenzeneCarbonsForRing(compounds[ci], ring.id);
        if (carbons.length) { owner = compounds[ci]; break; }
      }
      if (owner) owner.benzeneRings.push(ring);
    }
  }

  function slotTowardPoint(fromX, fromY, toX, toY) {
    var dx = toX - fromX;
    var dy = toY - fromY;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function normalizeAngleDeg(deg) {
    var a = deg % 360;
    return a < 0 ? a + 360 : a;
  }

  function angleDifferenceDeg(a, b) {
    var d = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
    return d > 180 ? 360 - d : d;
  }

  function chooseChlorineBondSlot(clAtom, partnerX, partnerY) {
    ensureChlorineOrbitalLayout(clAtom);
    var angle = approachAngle(clAtom.x, clAtom.y, partnerX, partnerY);
    var slots = getChlorineOrbitalSlots(clAtom);
    var best = slots[0];
    var bestDiff = Infinity;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var diff = angleDifferenceDeg(angle, clAtom.clSlotAngles[slot]);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = slot;
      }
    }
    return best;
  }

  function updateChlorineBondSlot(bond, chlorine, slot) {
    if (bond.atomA.id === chlorine.id) bond.slotA = slot;
    else if (bond.atomB.id === chlorine.id) bond.slotB = slot;
  }

  function snapChlorineOrbitalAnglesToAxes(chlorine) {
    chlorine.clSlotAngles = { up: -90, right: 0, down: 90, left: 180 };
  }

  // True when the four named slots are a rigid 0/90/180/270 rotation of the
  // axis-aligned frame. That is how ordinary 90° Cl rotation is stored (slot
  // contents move; angles stay on that frame). Expanded-hub rotation is stored
  // as arbitrary angles and must not be snapped back to the world axes.
  function chlorineNamedSlotsMatchCardinalFrame(chlorine) {
    var canonical = { up: -90, right: 0, down: 90, left: 180 };
    var bases = ['up', 'right', 'down', 'left'];
    var deltas = [];
    for (var i = 0; i < bases.length; i++) {
      var ang = chlorine.clSlotAngles && chlorine.clSlotAngles[bases[i]];
      if (ang === undefined || !isFinite(ang)) return true;
      deltas.push(normalizeAngleDeg(ang - canonical[bases[i]]));
    }
    var d0 = deltas[0];
    for (var j = 1; j < deltas.length; j++) {
      if (angleDifferenceDeg(d0, deltas[j]) > 8) return false;
    }
    return angleDifferenceDeg(d0, 0) < 8 ||
      angleDifferenceDeg(d0, 90) < 8 ||
      angleDifferenceDeg(d0, 180) < 8 ||
      angleDifferenceDeg(d0, 270) < 8;
  }

  function refreshChlorineOrbitalGeometry(chlorine, compound, pendingPartners) {
    finalizeChlorineOrbitalLayout(chlorine, compound || null, pendingPartners || null);
    if (compound) syncChlorineExpansionBondMetadata(compound);
  }

  function getChlorineBondPartnerForSlot(chlorine, slot, compound, pendingPartners) {
    if (!chlorine || !slot) return null;
    if (compound) {
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        var bond = compound.bonds[bi];
        if (bond.order !== 'single') continue;
        var clSlot = null;
        var partner = null;
        if (bond.atomA.id === chlorine.id) {
          clSlot = bond.slotA;
          partner = bond.atomB;
        } else if (bond.atomB.id === chlorine.id) {
          clSlot = bond.slotB;
          partner = bond.atomA;
        }
        if (clSlot === slot && partner) return partner;
      }
    }
    if (pendingPartners) {
      for (var pi = 0; pi < pendingPartners.length; pi++) {
        var entry = pendingPartners[pi];
        if (entry && entry.clSlot === slot && entry.partner) return entry.partner;
      }
    }
    return null;
  }

  function alignChlorineBondSlotAnglesToPartners(chlorine, compound, pendingPartners) {
    if (!chlorine || chlorine.element !== 'Cl') return;
    ensureChlorineOrbitalLayout(chlorine);
    var slots = getChlorineOrbitalSlots(chlorine);
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (!isBondValue(chlorine.orbitals[slot])) continue;
      var partner = getChlorineBondPartnerForSlot(chlorine, slot, compound, pendingPartners);
      if (!partner) continue;
      if (shouldPreserveChlorinePartnerPosition(chlorine, slot, partner, compound)) continue;
      chlorine.clSlotAngles[slot] = approachAngle(chlorine.x, chlorine.y, partner.x, partner.y);
    }
  }

  function finalizeChlorineOrbitalLayout(chlorine, compound, pendingPartners) {
    forceEvenChlorineAngles(chlorine, compound, pendingPartners || null);
    if (compound) syncChlorineSplitBondExtSlots(compound);
  }

  function findChlorineAnchorSlot(atom) {
    var slots = getChlorineOrbitalSlots(atom);
    for (var i = 0; i < slots.length; i++) {
      if (atom.orbitals[slots[i]] === 1) return slots[i];
    }
    return null;
  }

  function redistributeChlorineOrbitalAngles(atom, anchorSlot, compound) {
    ensureChlorineOrbitalLayout(atom);
    var slots = getChlorineOrbitalSlots(atom);
    var n = slots.length;
    atom.clOrbitalCount = n;
    var step = 360 / n;
    if (!anchorSlot) anchorSlot = findChlorineRedistributionAnchor(atom, compound || null, null);
    if (slots.indexOf(anchorSlot) === -1) anchorSlot = slots[0];

    var anchorAngle = atom.clSlotAngles[anchorSlot];
    if (anchorAngle === undefined || !isFinite(anchorAngle)) {
      var partner = getChlorineBondPartnerForSlot(atom, anchorSlot, compound, null);
      if (partner) {
        anchorAngle = approachAngle(atom.x, atom.y, partner.x, partner.y);
      } else {
        anchorAngle = SLOT_VECTORS[anchorSlot]
          ? Math.atan2(SLOT_VECTORS[anchorSlot].dy, SLOT_VECTORS[anchorSlot].dx) * 180 / Math.PI
          : 0;
      }
    }
    anchorAngle = normalizeAngleDeg(anchorAngle);
    atom.clSlotAngles[anchorSlot] = anchorAngle;

    var ordered = slots.filter(function (s) { return s !== anchorSlot; });
    ordered.sort(function (a, b) {
      var angA = atom.clSlotAngles[a];
      var angB = atom.clSlotAngles[b];
      if (angA === undefined || !isFinite(angA)) angA = anchorAngle;
      if (angB === undefined || !isFinite(angB)) angB = anchorAngle;
      return normalizeAngleDeg(angA - anchorAngle) - normalizeAngleDeg(angB - anchorAngle);
    });
    for (var i = 0; i < ordered.length; i++) {
      atom.clSlotAngles[ordered[i]] = normalizeAngleDeg(anchorAngle + (i + 1) * step);
    }
  }

  function forceEvenChlorineAngles(chlorine, compound, pendingPartners) {
    if (!chlorine || chlorine.element !== 'Cl') return;
    syncChlorineOrbitalCount(chlorine, compound || null);
    if (chlorine.clOrbitalCount <= 4) {
      chlorine.clOrbitalCount = 4;
      chlorine.clExpansionPairs = [];
      if (chlorineNamedSlotsMatchCardinalFrame(chlorine)) {
        snapChlorineOrbitalAnglesToAxes(chlorine);
      } else {
        redistributeChlorineOrbitalAngles(
          chlorine,
          findChlorineRedistributionAnchor(chlorine, compound, pendingPartners || null),
          compound
        );
      }
      return;
    }

    var slots = getChlorineOrbitalSlots(chlorine);
    var n = slots.length;
    chlorine.clOrbitalCount = n;
    var step = 360 / n;
    var anchor = findChlorineRedistributionAnchor(chlorine, compound, pendingPartners || null);
    if (slots.indexOf(anchor) === -1) anchor = slots[0];

    var anchorAngle = chlorine.clSlotAngles[anchor];
    if (anchorAngle === undefined || !isFinite(anchorAngle)) {
      anchorAngle = chlorineSlotCanonicalAngle(anchor);
    }
    if (anchorAngle === undefined || !isFinite(anchorAngle)) anchorAngle = 0;
    // At 4 orbitals we snap to absolute axes. With an expanded hub, keep the
    // anchor on a cardinal direction when it already is one — otherwise a
    // drifted F "fixed" angle locks the whole star onto diagonals forever.
    if (angleDifferenceDeg(anchorAngle, 0) < 8 || angleDifferenceDeg(anchorAngle, 90) < 8 ||
        angleDifferenceDeg(anchorAngle, 180) < 8 || angleDifferenceDeg(anchorAngle, 270) < 8) {
      if (angleDifferenceDeg(anchorAngle, 0) <= angleDifferenceDeg(anchorAngle, 90) &&
          angleDifferenceDeg(anchorAngle, 0) <= angleDifferenceDeg(anchorAngle, 180) &&
          angleDifferenceDeg(anchorAngle, 0) <= angleDifferenceDeg(anchorAngle, 270)) {
        anchorAngle = 0;
      } else if (angleDifferenceDeg(anchorAngle, 90) <= angleDifferenceDeg(anchorAngle, 180) &&
                 angleDifferenceDeg(anchorAngle, 90) <= angleDifferenceDeg(anchorAngle, 270)) {
        anchorAngle = 90;
      } else if (angleDifferenceDeg(anchorAngle, 180) <= angleDifferenceDeg(anchorAngle, 270)) {
        anchorAngle = 180;
      } else {
        anchorAngle = 270;
      }
    }
    anchorAngle = normalizeAngleDeg(anchorAngle);
    chlorine.clSlotAngles[anchor] = anchorAngle;

    // Assign even rays in a clockwise order from the current relative layout.
    var ordered = slots.filter(function (s) { return s !== anchor; });
    ordered.sort(function (a, b) {
      var angA = chlorine.clSlotAngles[a];
      var angB = chlorine.clSlotAngles[b];
      if (angA === undefined || !isFinite(angA)) angA = anchorAngle;
      if (angB === undefined || !isFinite(angB)) angB = anchorAngle;
      return normalizeAngleDeg(angA - anchorAngle) - normalizeAngleDeg(angB - anchorAngle);
    });
    for (var i = 0; i < ordered.length; i++) {
      chlorine.clSlotAngles[ordered[i]] = normalizeAngleDeg(anchorAngle + (i + 1) * step);
    }
  }

  function adjustChlorineHubLayout(chlorine, compound, pendingPartners) {
    if (!chlorine || chlorine.element !== 'Cl') return;
    forceEvenChlorineAngles(chlorine, compound, pendingPartners || null);
    if (compound) syncChlorineExpansionBondMetadata(compound);
    realignChlorineBondPartners(chlorine, compound, pendingPartners || null);
  }

  function restoreFluorineToAxisLayout(fluorine) {
    if (fluorine.element !== 'F') return;
    clearFluorineBondLayout(fluorine);
    fluorine.orbitals = { up: 0, down: 0, left: 0, right: 0 };
    fluorine.initializeOrbitals();
    fluorine.x = snapToPixel(fluorine.x);
    fluorine.y = snapToPixel(fluorine.y);
  }

  function chlorineHasExpandedLayout(atom) {
    if (atom.element !== 'Cl') return false;
    ensureChlorineOrbitalLayout(atom);
    for (var i = 0; i < 3; i++) {
      if (atom.orbitals['ext' + i] !== undefined) return true;
    }
    return false;
  }

  function isChlorineBaseSlot(slot) {
    return slot === 'up' || slot === 'down' || slot === 'left' || slot === 'right';
  }

  function rotateChlorineLayoutCW(atom) {
    if (atom.element !== 'Cl') return;
    ensureChlorineOrbitalLayout(atom);
    var extras = {};
    var extraAngles = {};
    for (var i = 0; i < 3; i++) {
      var ext = 'ext' + i;
      if (atom.orbitals[ext] !== undefined) {
        extras[ext] = atom.orbitals[ext];
        if (atom.clSlotAngles && atom.clSlotAngles[ext] !== undefined) {
          extraAngles[ext] = atom.clSlotAngles[ext];
        }
      }
    }
    atom.rotateOrbitals90();
    for (var j = 0; j < 3; j++) {
      var extSlot = 'ext' + j;
      if (extras[extSlot] !== undefined) atom.orbitals[extSlot] = extras[extSlot];
      if (extraAngles[extSlot] !== undefined) {
        atom.clSlotAngles[extSlot] = normalizeAngleDeg(extraAngles[extSlot] + 90);
      }
    }
    if (atom.clExpansionPairs) {
      for (var pi = 0; pi < atom.clExpansionPairs.length; pi++) {
        atom.clExpansionPairs[pi].splitSlot = rotateSlotCW(atom.clExpansionPairs[pi].splitSlot);
      }
    }
    if (atom.clFixedAnchorSlot) atom.clFixedAnchorSlot = rotateSlotCW(atom.clFixedAnchorSlot);
    if (atom.clSlotAngles) {
      for (var bi = 0; bi < 4; bi++) {
        var base = ['up', 'right', 'down', 'left'][bi];
        if (atom.clSlotAngles[base] !== undefined) {
          atom.clSlotAngles[base] = normalizeAngleDeg(atom.clSlotAngles[base] + 90);
        }
      }
    }
  }

  function rotateChlorineLayoutCCW(atom) {
    if (atom.element !== 'Cl') return;
    ensureChlorineOrbitalLayout(atom);
    var extras = {};
    var extraAngles = {};
    for (var i = 0; i < 3; i++) {
      var ext = 'ext' + i;
      if (atom.orbitals[ext] !== undefined) {
        extras[ext] = atom.orbitals[ext];
        if (atom.clSlotAngles && atom.clSlotAngles[ext] !== undefined) {
          extraAngles[ext] = atom.clSlotAngles[ext];
        }
      }
    }
    rotateOrbitalsCCW(atom);
    for (var j = 0; j < 3; j++) {
      var extSlot = 'ext' + j;
      if (extras[extSlot] !== undefined) atom.orbitals[extSlot] = extras[extSlot];
      if (extraAngles[extSlot] !== undefined) {
        atom.clSlotAngles[extSlot] = normalizeAngleDeg(extraAngles[extSlot] - 90);
      }
    }
    if (atom.clExpansionPairs) {
      for (var pi = 0; pi < atom.clExpansionPairs.length; pi++) {
        atom.clExpansionPairs[pi].splitSlot = rotateSlotCCW(atom.clExpansionPairs[pi].splitSlot);
      }
    }
    if (atom.clFixedAnchorSlot) atom.clFixedAnchorSlot = rotateSlotCCW(atom.clFixedAnchorSlot);
    if (atom.clSlotAngles) {
      for (var bi = 0; bi < 4; bi++) {
        var base = ['up', 'right', 'down', 'left'][bi];
        if (atom.clSlotAngles[base] !== undefined) {
          atom.clSlotAngles[base] = normalizeAngleDeg(atom.clSlotAngles[base] - 90);
        }
      }
    }
  }

  function swapChlorineExpansionMetadata(atom, slotA, slotB) {
    if (!chlorineHasExpandedLayout(atom)) return;
    if (atom.clExpansionPairs) {
      for (var i = 0; i < atom.clExpansionPairs.length; i++) {
        var pair = atom.clExpansionPairs[i];
        if (pair.splitSlot === slotA) pair.splitSlot = slotB;
        else if (pair.splitSlot === slotB) pair.splitSlot = slotA;
      }
    }
    if (atom.clFixedAnchorSlot === slotA) atom.clFixedAnchorSlot = slotB;
    else if (atom.clFixedAnchorSlot === slotB) atom.clFixedAnchorSlot = slotA;
    if (atom.clSlotAngles) {
      var tempAngle = atom.clSlotAngles[slotA];
      atom.clSlotAngles[slotA] = atom.clSlotAngles[slotB];
      atom.clSlotAngles[slotB] = tempAngle;
    }
  }

  function syncChlorineExpansionBondMetadata(compound) {
    syncChlorineSplitBondExtSlots(compound);
    for (var ci = 0; ci < compound.atoms.length; ci++) {
      var chlorine = compound.atoms[ci];
      if (chlorine.element !== 'Cl') continue;
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        var bond = compound.bonds[bi];
        var clSlot = null;
        if (bond.atomA.id === chlorine.id && bond.atomB.element === 'F') clSlot = bond.slotA;
        else if (bond.atomB.id === chlorine.id && bond.atomA.element === 'F') clSlot = bond.slotB;
        if (!clSlot) continue;
        var pair = (chlorine.clExpansionPairs || []).find(function (p) {
          return p.splitSlot === clSlot;
        });
        if (pair) bond.clSplitSlot = pair.splitSlot;
        if (bond.clSplitExtSlot) {
          var extPair = (chlorine.clExpansionPairs || []).find(function (p) {
            return p.extSlot === bond.clSplitExtSlot;
          });
          if (extPair) bond.clSplitSlot = extPair.splitSlot;
        }
      }
    }
  }

  function getChlorineFreeElectronSlots(chlorine) {
    return getChlorineOrbitalSlots(chlorine).filter(function (slot) {
      return chlorine.orbitals[slot] === 1;
    });
  }

  function chlorineSlotHasActiveBond(chlorine, slot, compound) {
    if (!chlorine || !slot) return false;
    if (isBondValue(chlorine.orbitals[slot])) return true;
    if (!compound) return false;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.atomA.id === chlorine.id && bond.slotA === slot) return true;
      if (bond.atomB.id === chlorine.id && bond.slotB === slot) return true;
    }
    return false;
  }

  function recalculateChlorineOrbitalAngles(chlorine, compound) {
    finalizeChlorineOrbitalLayout(chlorine, compound || null);
    if (compound) syncChlorineExpansionBondMetadata(compound);
  }

  function isChlorineSplitCompanionExt(chlorine, extSlot, compound) {
    if (!chlorine || !isChlorineExtSlot(extSlot)) return false;
    if (chlorine.orbitals[extSlot] !== 1) return false;
    var splitSlot = findChlorineSplitSlotForExt(chlorine, extSlot);
    if (!splitSlot) return false;
    return chlorine.orbitals[splitSlot] === 'single' &&
      chlorineSlotHasActiveBond(chlorine, splitSlot, compound);
  }

  function stampChlorineSplitBondSlots(chlorine, compound, extSlot) {
    if (!chlorine || !compound || !extSlot) return;
    var pair = (chlorine.clExpansionPairs || []).find(function (p) {
      return p.extSlot === extSlot;
    });
    if (!pair) return;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order !== 'single') continue;
      var clSlot = null;
      if (bond.atomA.id === chlorine.id && bond.atomB.element === 'F') clSlot = bond.slotA;
      else if (bond.atomB.id === chlorine.id && bond.atomA.element === 'F') clSlot = bond.slotB;
      if (clSlot === pair.splitSlot) bond.clSplitSlot = pair.splitSlot;
    }
  }

  function removeChlorineExtOrbital(chlorine, extSlot, compound) {
    if (!chlorine || !isChlorineExtSlot(extSlot)) return;
    stampChlorineSplitBondSlots(chlorine, compound, extSlot);
    delete chlorine.orbitals[extSlot];
    if (chlorine.clSlotAngles) delete chlorine.clSlotAngles[extSlot];
    chlorine.clExpansionPairs = (chlorine.clExpansionPairs || []).filter(function (pair) {
      return pair.extSlot !== extSlot;
    });
    chlorine.clOrbitalCount -= 1;
    compactChlorineExtraOrbitals(chlorine, compound || null);
    refreshChlorineOrbitalGeometry(chlorine, compound);
  }

  function pairChlorineExtOrbitals(chlorine, keepExt, removeExt, compound) {
    if (!chlorine || !isChlorineExtSlot(keepExt) || !isChlorineExtSlot(removeExt)) return;
    chlorine.orbitals[keepExt] = 2;
    removeChlorineExtOrbital(chlorine, removeExt, compound);
  }

  function countPendingChlorineFluorinePartners(chlorine, compound, pendingPartners) {
    if (!pendingPartners || !pendingPartners.length) return 0;
    var bondedIds = new Set();
    if (compound) {
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        var bond = compound.bonds[bi];
        var partner = null;
        if (bond.atomA.id === chlorine.id) partner = bond.atomB;
        else if (bond.atomB.id === chlorine.id) partner = bond.atomA;
        if (partner && partner.element === 'F') bondedIds.add(partner.id);
      }
    }
    var pending = 0;
    for (var pi = 0; pi < pendingPartners.length; pi++) {
      var entry = pendingPartners[pi];
      if (!entry || !entry.partner || entry.partner.element !== 'F') continue;
      if (bondedIds.has(entry.partner.id)) continue;
      bondedIds.add(entry.partner.id);
      pending += 1;
    }
    return pending;
  }

  function countFluorinesBondedToChlorine(chlorine, compound, pendingPartners) {
    if (!chlorine || !compound) {
      return countPendingChlorineFluorinePartners(chlorine, compound, pendingPartners);
    }
    var count = 0;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order !== 'single') continue;
      var partner = null;
      if (bond.atomA.id === chlorine.id) partner = bond.atomB;
      else if (bond.atomB.id === chlorine.id) partner = bond.atomA;
      else continue;
      if (partner.element === 'F') count += 1;
    }
    return count + countPendingChlorineFluorinePartners(chlorine, compound, pendingPartners);
  }

  function shouldMergeAllChlorineFluorineCompanions(chlorine, compound, pendingPartners) {
    if (!chlorine || !compound || chlorine.element !== 'Cl') return false;
    var fCount = countCompoundElement(compound, 'F');
    if (fCount !== 3 && fCount !== 5) return false;
    return countFluorinesBondedToChlorine(chlorine, compound, null) === fCount;
  }

  function mergeTwoFreeChlorineSlots(chlorine, slotA, slotB, compound) {
    if (!chlorine || slotA === slotB) return false;
    if (chlorine.orbitals[slotA] !== 1 || chlorine.orbitals[slotB] !== 1) return false;

    var pairs = chlorine.clExpansionPairs || [];
    for (var pi = 0; pi < pairs.length; pi++) {
      var pair = pairs[pi];
      if ((pair.splitSlot === slotA && pair.extSlot === slotB) ||
          (pair.splitSlot === slotB && pair.extSlot === slotA)) {
        collapseChlorineOrbitalFromSplit(chlorine, pair.splitSlot, pair.extSlot, compound);
        return true;
      }
    }

    if (isChlorineExtSlot(slotA) && isChlorineExtSlot(slotB)) {
      pairChlorineExtOrbitals(chlorine, slotA, slotB, compound);
      return true;
    }

    var cardinal = isChlorineBaseSlot(slotA) ? slotA : (isChlorineBaseSlot(slotB) ? slotB : null);
    var extSlot = isChlorineExtSlot(slotA) ? slotA : (isChlorineExtSlot(slotB) ? slotB : null);
    if (cardinal && extSlot) {
      chlorine.orbitals[cardinal] = 2;
      removeChlorineExtOrbital(chlorine, extSlot, compound);
      return true;
    }

    if (isChlorineBaseSlot(slotA) && isChlorineBaseSlot(slotB)) {
      chlorine.orbitals[slotA] = 2;
      chlorine.orbitals[slotB] = 0;
      refreshChlorineOrbitalGeometry(chlorine, compound);
      return true;
    }

    return false;
  }

  function removeChlorineExtSlotKeepElectrons(chlorine, extSlot, compound) {
    if (!chlorine || !isChlorineExtSlot(extSlot)) return false;
    if (chlorine.orbitals[extSlot] === undefined) return false;
    if (isBondValue(chlorine.orbitals[extSlot]) &&
        chlorineSlotHasActiveBond(chlorine, extSlot, compound)) {
      return false;
    }

    var val = chlorine.orbitals[extSlot];
    stampChlorineSplitBondSlots(chlorine, compound, extSlot);

    if (val === 1 || val === 2) {
      var placed = false;
      for (var ci = 0; ci < 4; ci++) {
        var cardinal = ['up', 'right', 'down', 'left'][ci];
        if (chlorine.orbitals[cardinal] === 0) {
          chlorine.orbitals[cardinal] = val;
          placed = true;
          break;
        }
      }
      if (!placed && val === 1) {
        for (var fi = 0; fi < 4; fi++) {
          var freeCard = ['up', 'right', 'down', 'left'][fi];
          if (chlorine.orbitals[freeCard] === 1) {
            chlorine.orbitals[freeCard] = 2;
            placed = true;
            break;
          }
        }
      }
      if (!placed) return false;
    }

    delete chlorine.orbitals[extSlot];
    if (chlorine.clSlotAngles) delete chlorine.clSlotAngles[extSlot];
    chlorine.clExpansionPairs = (chlorine.clExpansionPairs || []).filter(function (p) {
      return p.extSlot !== extSlot;
    });
    chlorine.clOrbitalCount = Math.max(4, (chlorine.clOrbitalCount || 4) - 1);
    compactChlorineExtraOrbitals(chlorine, compound);
    return true;
  }

  function pruneInactiveChlorineExtOrbitals(chlorine, compound) {
    ensureChlorineOrbitalLayout(chlorine);
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < 3; i++) {
        var ext = 'ext' + i;
        if (chlorine.orbitals[ext] === undefined) continue;
        if (isChlorineSplitCompanionExt(chlorine, ext, compound)) continue;

        var splitSlot = findChlorineSplitSlotForExt(chlorine, ext);
        var splitBonded = splitSlot && isBondValue(chlorine.orbitals[splitSlot]) &&
          chlorineSlotHasActiveBond(chlorine, splitSlot, compound);

        if (splitSlot && chlorine.orbitals[splitSlot] === 1 && chlorine.orbitals[ext] === 1 &&
            !chlorineSlotHasActiveBond(chlorine, splitSlot, compound)) {
          collapseChlorineOrbitalFromSplit(chlorine, splitSlot, ext, compound);
          changed = true;
          break;
        }

        // Never delete electrons on an ext — only relocate or keep the orbital.
        if (!splitBonded && !isBondValue(chlorine.orbitals[ext])) {
          if (removeChlorineExtSlotKeepElectrons(chlorine, ext, compound)) {
            changed = true;
            break;
          }
          if (splitSlot) {
            chlorine.clExpansionPairs = (chlorine.clExpansionPairs || []).filter(function (p) {
              return p.extSlot !== ext;
            });
          }
        }
      }
    }
  }

  function mergeNextChlorineElectronPair(chlorine, compound, mergeCompanions) {
    var free = getChlorineFreeElectronSlots(chlorine);
    if (free.length < 2) return false;

    var pairs = chlorine.clExpansionPairs || [];
    for (var oi = 0; oi < pairs.length; oi++) {
      var splitSlot = pairs[oi].splitSlot;
      var extSlot = pairs[oi].extSlot;
      if (!extSlot || chlorine.orbitals[extSlot] === undefined) {
        for (var ej = 0; ej < 3; ej++) {
          var candidate = 'ext' + ej;
          if (findChlorineSplitSlotForExt(chlorine, candidate) === splitSlot) {
            extSlot = candidate;
            break;
          }
        }
      }
      if (!splitSlot || !extSlot) continue;
      if (chlorine.orbitals[splitSlot] !== 1) continue;
      if (chlorine.orbitals[extSlot] !== 1) continue;
      if (chlorineSlotHasActiveBond(chlorine, splitSlot, compound)) continue;
      collapseChlorineOrbitalFromSplit(chlorine, splitSlot, extSlot, compound);
      return true;
    }

    if (mergeCompanions) {
      var freeExts = free.filter(isChlorineExtSlot);
      if (freeExts.length >= 2) {
        pairChlorineExtOrbitals(chlorine, freeExts[0], freeExts[1], compound);
        return true;
      }
      return mergeTwoFreeChlorineSlots(chlorine, free[0], free[1], compound);
    }

    var freeExts = free.filter(function (s) {
      return isChlorineExtSlot(s) && !isChlorineSplitCompanionExt(chlorine, s, compound);
    });
    if (freeExts.length >= 2) {
      pairChlorineExtOrbitals(chlorine, freeExts[0], freeExts[1], compound);
      return true;
    }

    var freeCardinals = free.filter(isChlorineBaseSlot);
    for (var ci = 0; ci < freeCardinals.length; ci++) {
      for (var ei = 0; ei < freeExts.length; ei++) {
        if (mergeTwoFreeChlorineSlots(chlorine, freeCardinals[ci], freeExts[ei], compound)) {
          return true;
        }
      }
    }

    // Breaking the normal (non-split) Cl–F bond returns a free cardinal electron.
    // Pair it with any free companion ext — companions only stay protected from
    // merging with each other while a split bond is still incomplete.
    var allFreeExts = free.filter(isChlorineExtSlot);
    for (var nci = 0; nci < freeCardinals.length; nci++) {
      for (var nei = 0; nei < allFreeExts.length; nei++) {
        if (mergeTwoFreeChlorineSlots(chlorine, freeCardinals[nci], allFreeExts[nei], compound)) {
          return true;
        }
      }
    }

    if (freeCardinals.length >= 2) {
      return mergeTwoFreeChlorineSlots(chlorine, freeCardinals[0], freeCardinals[1], compound);
    }

    return false;
  }

  function reconcileChlorineElectrons(chlorine, compound, pendingPartners) {
    if (!chlorine || chlorine.element !== 'Cl') return;
    ensureChlorineOrbitalLayout(chlorine);
    pruneInactiveChlorineExtOrbitals(chlorine, compound);
    syncChlorineOrbitalCount(chlorine, compound);

    var mergeCompanions = shouldMergeAllChlorineFluorineCompanions(
      chlorine, compound, pendingPartners || null);
    while (getChlorineFreeElectronSlots(chlorine).length >= 2) {
      if (!mergeNextChlorineElectronPair(chlorine, compound, mergeCompanions)) break;
      mergeCompanions = shouldMergeAllChlorineFluorineCompanions(
        chlorine, compound, pendingPartners || null);
      adjustChlorineHubLayout(chlorine, compound, pendingPartners || null);
    }

    adjustChlorineHubLayout(chlorine, compound, pendingPartners || null);
  }

  function reconcileAllChlorineInCompound(compound) {
    if (!compound) return;
    for (var i = 0; i < compound.atoms.length; i++) {
      if (compound.atoms[i].element === 'Cl') {
        reconcileChlorineElectrons(compound.atoms[i], compound);
      }
    }
  }

  function tryMergeCompleteChlorineFluorideCluster(chlorine, compound) {
    reconcileChlorineElectrons(chlorine, compound);
  }

  function tryMergeChlorineFreeElectronsAfterBreak(chlorine, compound) {
    reconcileChlorineElectrons(chlorine, compound);
  }

  function breakChlorineFluorideBond(bond, compound, snapEngine) {
    var chlorine = bond.atomA.element === 'Cl' ? bond.atomA :
      bond.atomB.element === 'Cl' ? bond.atomB : null;
    var fluorine = bond.atomA.element === 'F' ? bond.atomA :
      bond.atomB.element === 'F' ? bond.atomB : null;
    if (!chlorine || !fluorine) return false;

    var clSlot = bond.atomA.id === chlorine.id ? bond.slotA : bond.slotB;
    var fSlot = bond.atomA.id === fluorine.id ? bond.slotA : bond.slotB;
    compound.removeBond(bond.id);
    chlorine.orbitals[clSlot] = 1;
    if (chlorine.clFixedAnchorSlot === clSlot) chlorine.clFixedAnchorSlot = null;
    if (fSlot) fluorine.orbitals[fSlot] = 1;

    reconcileChlorineElectrons(chlorine, compound);
    snapEngine.clearPairSuppression(bond.atomA, bond.atomB);
    return true;
  }

  function findChlorineFluorideBondForAtom(fluorine, compound) {
    if (!fluorine || fluorine.element !== 'F' || !compound) return null;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order !== 'single') continue;
      var involvesF = bond.atomA.id === fluorine.id || bond.atomB.id === fluorine.id;
      if (!involvesF) continue;
      var other = bond.atomA.id === fluorine.id ? bond.atomB : bond.atomA;
      if (other.element === 'Cl') return bond;
    }
    return null;
  }

  function breakExpandedChlorineHydrogenBond(bond, compound, snapEngine) {
    var chlorine = bond.atomA.element === 'Cl' ? bond.atomA :
      bond.atomB.element === 'Cl' ? bond.atomB : null;
    var hydrogen = bond.atomA.element === 'H' ? bond.atomA :
      bond.atomB.element === 'H' ? bond.atomB : null;
    if (!chlorine || !hydrogen) return false;
    var clSlot = bond.atomA.id === chlorine.id ? bond.slotA : bond.slotB;
    compound.removeBond(bond.id);
    chlorine.orbitals[clSlot] = 1;
    if (chlorine.clFixedAnchorSlot === clSlot) chlorine.clFixedAnchorSlot = null;
    resetAtomOrbitals(hydrogen);
    reconcileChlorineElectrons(chlorine, compound);
    snapEngine.clearPairSuppression(bond.atomA, bond.atomB);
    return true;
  }

  function breakExpandedChlorineFluorideBond(bond, compound, snapEngine) {
    return breakChlorineFluorideBond(bond, compound, snapEngine);
  }

  function isChlorineExtSlot(slot) {
    return typeof slot === 'string' && /^ext\d+$/.test(slot);
  }

  function remapChlorineBondExtSlotReferences(chlorine, compound, slotRemap) {
    if (!chlorine || !compound || !slotRemap) return;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      var clSlot = null;
      if (bond.atomA.id === chlorine.id) clSlot = bond.slotA;
      else if (bond.atomB.id === chlorine.id) clSlot = bond.slotB;
      else continue;
      if (!isChlorineExtSlot(clSlot)) continue;
      if (!Object.prototype.hasOwnProperty.call(slotRemap, clSlot)) continue;
      var mapped = slotRemap[clSlot];
      if (mapped) updateChlorineBondSlot(bond, chlorine, mapped);
    }
  }

  function compactChlorineExtraOrbitals(atom, compound) {
    var extSnapshot = [];
    for (var i = 0; i < 3; i++) {
      var ext = 'ext' + i;
      if (isActiveChlorineExtValue(atom.orbitals[ext])) {
        extSnapshot.push({
          oldSlot: ext,
          val: atom.orbitals[ext],
          angle: atom.clSlotAngles ? atom.clSlotAngles[ext] : undefined,
          splitSlot: findChlorineSplitSlotForExt(atom, ext),
        });
      }
      delete atom.orbitals[ext];
      if (atom.clSlotAngles) delete atom.clSlotAngles[ext];
    }
    var keepCount = extSnapshot.length;
    atom.clOrbitalCount = 4 + keepCount;
    var slotRemap = {};
    for (var si = 0; si < extSnapshot.length; si++) {
      slotRemap[extSnapshot[si].oldSlot] = 'ext' + si;
    }
    for (var j = 0; j < keepCount; j++) {
      var slot = 'ext' + j;
      atom.orbitals[slot] = extSnapshot[j].val;
      if (!atom.clSlotAngles) atom.clSlotAngles = {};
      if (extSnapshot[j].angle !== undefined && isFinite(extSnapshot[j].angle)) {
        atom.clSlotAngles[slot] = extSnapshot[j].angle;
      }
    }
    if (compound) remapChlorineBondExtSlotReferences(atom, compound, slotRemap);
    if (!atom.clExpansionPairs) return;
    for (var pi = 0; pi < atom.clExpansionPairs.length; pi++) {
      var pair = atom.clExpansionPairs[pi];
      pair.extSlot = null;
      for (var k = 0; k < keepCount; k++) {
        if (extSnapshot[k].splitSlot === pair.splitSlot) {
          pair.extSlot = 'ext' + k;
          break;
        }
      }
    }
    atom.clExpansionPairs = atom.clExpansionPairs.filter(function (p) {
      return p.extSlot;
    });
  }

  function findFluorineBondSlot(fluorine) {
    for (var i = 0; i < ['up', 'down', 'left', 'right'].length; i++) {
      var slot = ['up', 'down', 'left', 'right'][i];
      if (isBondValue(fluorine.orbitals[slot])) return slot;
    }
    return null;
  }

  function clearFluorineBondLayout(atom) {
    if (atom.element !== 'F') return;
    atom.fSlotAngles = null;
    atom.fBondAngle = null;
  }

  function rotateFluorineLayoutCW(atom) {
    if (!atom.fSlotAngles) return;
    var rotated = {};
    for (var slot in atom.fSlotAngles) {
      if (!Object.prototype.hasOwnProperty.call(atom.fSlotAngles, slot)) continue;
      rotated[rotateSlotCW(slot)] = normalizeAngleDeg(atom.fSlotAngles[slot] + 90);
    }
    atom.fSlotAngles = rotated;
    if (atom.fBondAngle !== undefined && atom.fBondAngle !== null) {
      atom.fBondAngle = normalizeAngleDeg(atom.fBondAngle + 90);
    }
  }

  function orientFluorineToPartner(fluorine, bondSlot, partner) {
    var actualBondSlot = findFluorineBondSlot(fluorine) || bondSlot;
    if (!actualBondSlot) return bondSlot;
    var bondAngle = approachAngle(fluorine.x, fluorine.y, partner.x, partner.y);
    fluorine.fBondAngle = bondAngle;
    fluorine.fSlotAngles = {};
    fluorine.fSlotAngles[actualBondSlot] = bondAngle;
    var loneSlots = ['up', 'down', 'left', 'right'].filter(function (slot) {
      return slot !== actualBondSlot && fluorine.orbitals[slot] === 2;
    });
    loneSlots.sort();
    var loneAngles = [
      normalizeAngleDeg(bondAngle + 90),
      normalizeAngleDeg(bondAngle - 90),
      normalizeAngleDeg(bondAngle + 180),
    ];
    for (var i = 0; i < loneSlots.length; i++) {
      fluorine.fSlotAngles[loneSlots[i]] = loneAngles[i];
    }
    return actualBondSlot;
  }

  function reorientAllChlorineFluorines(compound) {
    if (!compound) return;
    for (var ci = 0; ci < compound.atoms.length; ci++) {
      if (compound.atoms[ci].element !== 'Cl') continue;
      var chlorine = compound.atoms[ci];
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        var bond = compound.bonds[bi];
        var fluorine = null;
        var fSlot = null;
        if (bond.atomA.id === chlorine.id && bond.atomB.element === 'F') {
          fluorine = bond.atomB;
          fSlot = bond.slotB;
        } else if (bond.atomB.id === chlorine.id && bond.atomA.element === 'F') {
          fluorine = bond.atomA;
          fSlot = bond.slotA;
        }
        if (!fluorine) continue;
        var alignedSlot = orientFluorineToPartner(fluorine, fSlot, chlorine);
        updateBondSlotForAtom(bond, fluorine, alignedSlot);
      }
    }
  }

  function updateBondSlotForAtom(bond, atom, slot) {
    if (bond.atomA.id === atom.id) bond.slotA = slot;
    else if (bond.atomB.id === atom.id) bond.slotB = slot;
  }

  function findChlorineSplitSlotForExt(atom, extSlot) {
    var pairs = atom.clExpansionPairs || [];
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].extSlot === extSlot) return pairs[i].splitSlot;
    }
    return null;
  }

  function expandChlorineOrbitalFromSplit(atom, splitSlot, compound) {
    ensureChlorineOrbitalLayout(atom);
    if (atom.clOrbitalCount >= 7) return null;
    var extSlot = 'ext' + (atom.clOrbitalCount - 4);
    var splitAngle = atom.clSlotAngles[splitSlot];
    atom.clOrbitalCount += 1;
    atom.orbitals[extSlot] = 1;
    atom.clSlotAngles[extSlot] = splitAngle;
    atom.clExpansionPairs.push({ splitSlot: splitSlot, extSlot: extSlot });
    redistributeChlorineOrbitalAngles(
      atom, findChlorineRedistributionAnchor(atom, compound || null, null), compound || null);
    return extSlot;
  }

  function collapseChlorineOrbitalFromSplit(atom, splitSlot, extSlot, compound) {
    ensureChlorineOrbitalLayout(atom);
    atom.orbitals[splitSlot] = 2;
    atom.clExpansionPairs = (atom.clExpansionPairs || []).filter(function (pair) {
      return pair.extSlot !== extSlot;
    });
    delete atom.orbitals[extSlot];
    delete atom.clSlotAngles[extSlot];
    atom.clOrbitalCount -= 1;
    compactChlorineExtraOrbitals(atom, compound || null);
    refreshChlorineOrbitalGeometry(atom, compound || null);
  }

  function resolveFluorideChlorineSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var fluorine = null;
    var chlorine = null;
    var fluorineSlot = null;
    var chlorineSlot = null;
    if (movingAtom.element === 'F' && stationaryAtom.element === 'Cl') {
      fluorine = movingAtom;
      chlorine = stationaryAtom;
      fluorineSlot = movingSlot;
      chlorineSlot = stationarySlot;
    } else if (movingAtom.element === 'Cl' && stationaryAtom.element === 'F') {
      fluorine = stationaryAtom;
      chlorine = movingAtom;
      fluorineSlot = stationarySlot;
      chlorineSlot = movingSlot;
    }
    if (!fluorine || !chlorine) return null;
    return {
      fluorine: fluorine,
      chlorine: chlorine,
      fluorineSlot: fluorineSlot,
      chlorineSlot: chlorineSlot,
    };
  }

  function canFluorideChlorineLonePairSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot, compound) {
    var ends = resolveFluorideChlorineSnapEnds(
      movingAtom, stationaryAtom, movingSlot, stationarySlot);
    if (!ends) return false;
    ensureChlorineOrbitalLayout(ends.chlorine);
    if (ends.chlorine.clOrbitalCount >= 7) return false;
    if (!chlorineCanSplitDativeLonePair(ends.chlorine, ends.chlorineSlot, compound)) return false;
    if (ends.fluorine.orbitals[ends.fluorineSlot] !== 1) return false;
    return true;
  }

  function applyFluorideChlorineSlotOverrides(activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) {
    var ends = resolveFluorideChlorineSnapEnds(activeAtom, partnerAtom, slotOnActive, slotOnPartner);
    var snapCompound = activeCompound || partnerCompound || null;
    if (!ends || !canFluorideChlorineLonePairSnap(
      activeAtom, partnerAtom, slotOnActive, slotOnPartner, snapCompound)) return null;
    if (activeAtom.id === ends.fluorine.id) {
      return { slotOnActive: ends.fluorineSlot, slotOnPartner: ends.chlorineSlot };
    }
    return { slotOnActive: ends.chlorineSlot, slotOnPartner: ends.fluorineSlot };
  }

  function getFluorineChlorineSplitBondInfo(bond) {
    if (bond.order !== 'single') return null;
    var chlorine = bond.atomA.element === 'Cl' ? bond.atomA :
      bond.atomB.element === 'Cl' ? bond.atomB : null;
    var fluorine = bond.atomA.element === 'F' ? bond.atomA :
      bond.atomB.element === 'F' ? bond.atomB : null;
    if (!chlorine || !fluorine) return null;

    var clSlot = bond.clSplitSlot ||
      (bond.atomA.id === chlorine.id ? bond.slotA : bond.slotB);
    var pairs = chlorine.clExpansionPairs || [];
    var pair = pairs.find(function (p) { return p.splitSlot === clSlot; });

    if (bond.clSplitSlot || pair) {
      var extSlot = null;
      if (pair && pair.extSlot && chlorine.orbitals[pair.extSlot] !== undefined) {
        extSlot = pair.extSlot;
      } else if (bond.clSplitExtSlot && chlorine.orbitals[bond.clSplitExtSlot] !== undefined) {
        extSlot = bond.clSplitExtSlot;
      } else {
        extSlot = resolveChlorineSplitExtSlot(chlorine, clSlot, bond);
      }
      return {
        chlorine: chlorine,
        fluorine: fluorine,
        clSlot: pair ? pair.splitSlot : clSlot,
        extSlot: extSlot,
      };
    }

    if (!pairs.length && !bond.clSplitExtSlot) return null;

    var extSlot = null;
    if (bond.clSplitExtSlot && chlorine.orbitals[bond.clSplitExtSlot] !== undefined) {
      extSlot = bond.clSplitExtSlot;
      pair = pairs.find(function (p) { return p.extSlot === extSlot; });
    }
    if (!pair) {
      extSlot = resolveChlorineSplitExtSlot(chlorine, clSlot, bond);
      if (extSlot) {
        pair = pairs.find(function (p) {
          return p.extSlot === extSlot || p.splitSlot === clSlot;
        });
      }
    }
    if (!extSlot || chlorine.orbitals[extSlot] === undefined) return null;
    if (pair) {
      clSlot = pair.splitSlot;
      extSlot = pair.extSlot;
    }
    return {
      chlorine: chlorine,
      fluorine: fluorine,
      clSlot: clSlot,
      extSlot: extSlot,
    };
  }

  function cloneAllAtomPositions(allCompounds) {
    var virtualPos = new Map();
    for (var ci = 0; ci < allCompounds.length; ci++) {
      var compound = allCompounds[ci];
      for (var ai = 0; ai < compound.atoms.length; ai++) {
        var atom = compound.atoms[ai];
        virtualPos.set(atom.id, { x: atom.x, y: atom.y });
      }
    }
    return virtualPos;
  }

  function getVirtualAtomPos(virtualPos, atom) {
    if (virtualPos) {
      var pos = virtualPos.get(atom.id);
      if (pos) return pos;
    }
    return { x: atom.x, y: atom.y };
  }

  function buildVirtualPositionsFromSimulatedSnaps(allCompounds, groupCandidates) {
    var virtualPos = cloneAllAtomPositions(allCompounds);
    var movedCompoundIds = new Set();

    for (var gi = 0; gi < groupCandidates.length; gi++) {
      var candidate = groupCandidates[gi];
      if (movedCompoundIds.has(candidate.moveCompound.id)) continue;
      movedCompoundIds.add(candidate.moveCompound.id);
      for (var ai = 0; ai < candidate.moveCompound.atoms.length; ai++) {
        var atom = candidate.moveCompound.atoms[ai];
        virtualPos.set(atom.id, {
          x: atom.x + candidate.dx,
          y: atom.y + candidate.dy,
        });
      }
    }
    return virtualPos;
  }

  function isAtomPairWithinBondingRangeAtVirtual(virtualPos, atomA, atomB) {
    var posA = getVirtualAtomPos(virtualPos, atomA);
    var posB = getVirtualAtomPos(virtualPos, atomB);
    var centerDist = Math.hypot(posB.x - posA.x, posB.y - posA.y);
    if (centerDist <= getPairBondingReach(atomA.element, atomB.element)) return true;
    return centerDist <= getBondCenterDistance(atomA.element, atomB.element) + getElectronRadius();
  }

  function computeSnapForSlotsAtVirtual(virtualPos, movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var movingPos = getVirtualAtomPos(virtualPos, movingAtom);
    var stationaryPos = getVirtualAtomPos(virtualPos, stationaryAtom);
    var stationaryVirtual = {
      x: stationaryPos.x,
      y: stationaryPos.y,
      element: stationaryAtom.element,
    };
    return computeSnapFromPosition(
      movingPos.x, movingPos.y, movingAtom.element,
      stationaryVirtual, movingSlot, stationarySlot);
  }

  function candidateToBondPair(candidate) {
    return {
      moving: candidate.activeAtom,
      stationary: candidate.partnerAtom,
      slotA: candidate.slotOnActive,
      slotB: candidate.slotOnPartner,
    };
  }

  function filterCandidatesByPairwiseLoops(candidates, movingCompound, allCompounds, snapEngine) {
    if (!candidates.length) return candidates;
    var blocked = new Set();

    for (var i = 0; i < candidates.length; i++) {
      for (var j = i + 1; j < candidates.length; j++) {
        if (snapEngine.simulatedBondGroupCreatesLoop(
          [candidates[i], candidates[j]], movingCompound, allCompounds)) {
          blocked.add(i);
          blocked.add(j);
        }
      }
    }

    for (var k = 0; k < candidates.length; k++) {
      if (blocked.has(k)) continue;
      if (snapEngine.simulatedBondGroupCreatesLoop(
        [candidates[k]], movingCompound, allCompounds)) {
        blocked.add(k);
      }
    }

    return candidates.filter(function (_, idx) { return !blocked.has(idx); });
  }

  function getStationarySlotUse(stationarySlotsUsed, atomId, slot) {
    if (!stationarySlotsUsed.has(atomId)) return false;
    return stationarySlotsUsed.get(atomId).has(slot);
  }

  function markStationarySlotUse(stationarySlotsUsed, atomId, slot) {
    if (!stationarySlotsUsed.has(atomId)) stationarySlotsUsed.set(atomId, new Set());
    stationarySlotsUsed.get(atomId).add(slot);
  }

  function isSlotPairInBondingRange(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var centerDist = Math.hypot(stationaryAtom.x - movingAtom.x, stationaryAtom.y - movingAtom.y);
    if (centerDist <= getPairBondingReach(movingAtom.element, stationaryAtom.element)) return true;

    var stationPos = getOrbitalPosition(stationarySlot, stationaryAtom.element, stationaryAtom);
    var distToStationOrbital = Math.hypot(
      movingAtom.x - (stationaryAtom.x + stationPos.x),
      movingAtom.y - (stationaryAtom.y + stationPos.y)
    );
    if (distToStationOrbital <= getBondingRadius(movingAtom.element) + getElectronRadius()) return true;

    var movingPos = getOrbitalPosition(movingSlot, movingAtom.element, movingAtom);
    var distToMovingOrbital = Math.hypot(
      stationaryAtom.x - (movingAtom.x + movingPos.x),
      stationaryAtom.y - (movingAtom.y + movingPos.y)
    );
    if (distToMovingOrbital <= getBondingRadius(stationaryAtom.element) + getElectronRadius()) return true;

    return false;
  }

  function snapToPixel(value) {
    return Math.round(value);
  }

  function isBenzeneSlot(slot) {
    return slot === 'ringPrev' || slot === 'ringNext' || slot === 'exo';
  }

  function rotateSlotCW(slot) {
    if (isBenzeneSlot(slot)) return slot;
    if (typeof slot === 'string' && slot.indexOf('ext') === 0) return slot;
    return SLOT_ROTATE_CW[slot];
  }

  function swapOrbitalSlots(atom, slotA, slotB) {
    var temp = atom.orbitals[slotA];
    atom.orbitals[slotA] = atom.orbitals[slotB];
    atom.orbitals[slotB] = temp;
  }

  function cloneOrbitals(orbitals) {
    return {
      up: orbitals.up,
      down: orbitals.down,
      left: orbitals.left,
      right: orbitals.right,
    };
  }

  function rotateOrbitalsRecordCW(orbitals) {
    return {
      up: orbitals.left,
      right: orbitals.up,
      down: orbitals.right,
      left: orbitals.down,
    };
  }

  function normalizeOrbitalsToBondDown(orbitals, bondSlot) {
    var o = cloneOrbitals(orbitals);
    var slot = bondSlot;
    while (slot !== 'down') {
      o = rotateOrbitalsRecordCW(o);
      slot = rotateSlotCW(slot);
    }
    return o;
  }

  function normalizedSlotName(slot, bondSlotToParent) {
    var s = slot;
    var anchor = bondSlotToParent;
    while (anchor !== 'down') {
      s = rotateSlotCW(s);
      anchor = rotateSlotCW(anchor);
    }
    return s;
  }

  function normalizedOrbitalKey(orbitals) {
    return 'up=' + orbitals.up + ',right=' + orbitals.right +
      ',down=' + orbitals.down + ',left=' + orbitals.left;
  }

  function findBondBetween(compound, idA, idB) {
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if ((bond.atomA.id === idA && bond.atomB.id === idB) ||
        (bond.atomA.id === idB && bond.atomB.id === idA)) {
        return bond;
      }
    }
    return null;
  }

  function findPivotBond(compound, pivot, slot) {
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.atomA.id === pivot.id && bond.slotA === slot) return bond;
      if (bond.atomB.id === pivot.id && bond.slotB === slot) return bond;
    }
    return null;
  }

  function rootedSubtreeSignature(compound, atomId, parentId) {
    var atom = compound.atoms.find(function (a) { return a.id === atomId; });
    var parentBondSlot = null;
    var orbitals = atom.orbitals;

    if (parentId) {
      var parentBond = findBondBetween(compound, atomId, parentId);
      parentBondSlot = parentBond.atomA.id === atomId ? parentBond.slotA : parentBond.slotB;
      orbitals = normalizeOrbitalsToBondDown(atom.orbitals, parentBondSlot);
    }

    var orbKey = normalizedOrbitalKey(parentId ? orbitals : atom.orbitals);
    var childParts = [];

    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      var childId = null;
      var slotOnAtom = null;
      if (bond.atomA.id === atomId && bond.atomB.id !== parentId) {
        childId = bond.atomB.id;
        slotOnAtom = bond.slotA;
      } else if (bond.atomB.id === atomId && bond.atomA.id !== parentId) {
        childId = bond.atomA.id;
        slotOnAtom = bond.slotB;
      }
      if (!childId) continue;

      var slotKey = parentId
        ? normalizedSlotName(slotOnAtom, parentBondSlot)
        : slotOnAtom;
      childParts.push(
        bondElectronCost(bond.order) + '@' + slotKey + '@' +
        rootedSubtreeSignature(compound, childId, atomId)
      );
    }
    childParts.sort();
    return atom.element + '{' + orbKey + '}[' + childParts.join('|') + ']';
  }

  function attachmentSignatureAtSlot(compound, pivot, slot) {
    var bond = findPivotBond(compound, pivot, slot);
    if (bond) {
      var partner = bond.atomA.id === pivot.id ? bond.atomB : bond.atomA;
      return 'subtree:' + rootedSubtreeSignature(compound, partner.id, pivot.id);
    }
    return 'orbital:' + pivot.orbitals[slot];
  }

  function pivotPairSwapWouldChange(compound, pivot, slotA, slotB, useCompoundSwap) {
    if (useCompoundSwap) {
      return attachmentSignatureAtSlot(compound, pivot, slotA) !==
        attachmentSignatureAtSlot(compound, pivot, slotB);
    }
    return pivot.orbitals[slotA] !== pivot.orbitals[slotB];
  }

  function rotateSlotCCW(slot) {
    if (isBenzeneSlot(slot)) return slot;
    if (typeof slot === 'string' && slot.indexOf('ext') === 0) return slot;
    return { up: 'left', left: 'down', down: 'right', right: 'up' }[slot];
  }

  function findBondBetweenAtoms(atomA, atomB, allCompounds) {
    if (!atomA || !atomB || !allCompounds) return null;
    for (var ci = 0; ci < allCompounds.length; ci++) {
      var bonds = allCompounds[ci].bonds;
      for (var bi = 0; bi < bonds.length; bi++) {
        var bond = bonds[bi];
        if ((bond.atomA.id === atomA.id && bond.atomB.id === atomB.id) ||
            (bond.atomA.id === atomB.id && bond.atomB.id === atomA.id)) {
          return bond;
        }
      }
    }
    return null;
  }

  function isAxisAlignedAtomPair(atomA, atomB) {
    var dx = Math.abs(atomA.x - atomB.x);
    var dy = Math.abs(atomA.y - atomB.y);
    if (dx < 2 && dy < 2) return true;
    return Math.min(dx, dy) <= Math.max(dx, dy) * 0.35;
  }

  function isBenzeneDiagonalRingBond(bond) {
    if (!bond) return false;
    if (!isBenzeneRingCarbon(bond.atomA) || !isBenzeneRingCarbon(bond.atomB)) return false;
    if (bond.atomA.benzeneRingId !== bond.atomB.benzeneRingId) return false;
    if (bond.slotA === 'exo' || bond.slotB === 'exo') return false;
    if (!isBenzeneSlot(bond.slotA) || !isBenzeneSlot(bond.slotB)) return false;
    return !isAxisAlignedAtomPair(bond.atomA, bond.atomB);
  }

  function stericHopUsesDiagonalRingBond(atomA, atomB, allCompounds) {
    return isBenzeneDiagonalRingBond(findBondBetweenAtoms(atomA, atomB, allCompounds));
  }

  function findAtomInDirection(x, y, sourceElement, slot, allCompounds, excludeIds, ignoreHydrogen, virtualPos) {
    var best = null;
    var bestDist = Infinity;
    for (var c = 0; c < allCompounds.length; c++) {
      var compound = allCompounds[c];
      for (var a = 0; a < compound.atoms.length; a++) {
        var other = compound.atoms[a];
        if (excludeIds.has(other.id)) continue;
        if (ignoreHydrogen && other.element === 'H') continue;
        var otherPos = virtualPos ? getVirtualAtomPos(virtualPos, other) : other;
        var dx = otherPos.x - x;
        var dy = otherPos.y - y;
        var dist = Math.hypot(dx, dy);
        var maxDist = getPairBondingReach(sourceElement, other.element);
        if (dist < 8 || dist > maxDist) continue;
        var slotTo = angleToSlot(approachAngle(x, y, otherPos.x, otherPos.y));
        if (slotTo !== slot) continue;
        if (dist < bestDist) {
          bestDist = dist;
          best = other;
        }
      }
    }
    return best;
  }

  function walkStericPathEnd(startAtom, atX, atY, atElement, straightSlot, leftTurns, allCompounds, excludeIds, originAtomId, virtualPos) {
    var facing = straightSlot;
    var turn1 = leftTurns ? rotateSlotCCW(facing) : rotateSlotCW(facing);
    var excludeStep1 = new Set(excludeIds);
    if (originAtomId) excludeStep1.add(originAtomId);
    var mid = findAtomInDirection(atX, atY, atElement, turn1, allCompounds, excludeStep1, true, virtualPos);
    if (!mid) return null;
    if (stericHopUsesDiagonalRingBond(startAtom, mid, allCompounds)) return null;

    var turn2 = leftTurns ? rotateSlotCCW(turn1) : rotateSlotCW(turn1);
    var excludeStep2 = new Set(excludeIds);
    excludeStep2.add(mid.id);
    var midPos = virtualPos ? getVirtualAtomPos(virtualPos, mid) : mid;
    var end = findAtomInDirection(
      midPos.x, midPos.y, mid.element, turn2, allCompounds, excludeStep2, true, virtualPos);
    if (!end) return null;
    if (stericHopUsesDiagonalRingBond(mid, end, allCompounds)) return null;
    return end;
  }

  function claimBondSlot(usedByAtom, atomId, slot) {
    if (!usedByAtom.has(atomId)) usedByAtom.set(atomId, new Set());
    var used = usedByAtom.get(atomId);
    if (used.has(slot)) return false;
    used.add(slot);
    return true;
  }

  function wouldBondGroupCreateLoop(group, movingCompound, allCompounds) {
    var parent = new Map();
    function find(id) {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
      return parent.get(id);
    }
    function union(a, b) {
      var ra = find(a);
      var rb = find(b);
      if (ra === rb) return;
      parent.set(ra, rb);
    }

    var compoundIds = new Set([movingCompound.id]);
    for (var g = 0; g < group.length; g++) {
      var pair = group[g];
      for (var c = 0; c < allCompounds.length; c++) {
        var compound = allCompounds[c];
        if (compound.atoms.some(function (a) { return a.id === pair.stationary.id; })) {
          compoundIds.add(compound.id);
        }
      }
    }

    for (var ci = 0; ci < allCompounds.length; ci++) {
      var comp = allCompounds[ci];
      if (!compoundIds.has(comp.id)) continue;
      for (var ai = 0; ai < comp.atoms.length; ai++) find(comp.atoms[ai].id);
      for (var bi = 0; bi < comp.bonds.length; bi++) {
        var bond = comp.bonds[bi];
        union(bond.atomA.id, bond.atomB.id);
      }
    }

    for (var gi = 0; gi < group.length; gi++) {
      var bondPair = group[gi];
      if (find(bondPair.moving.id) === find(bondPair.stationary.id)) return true;
      union(bondPair.moving.id, bondPair.stationary.id);
    }
    return false;
  }

  function rotatePointCW(px, py, x, y) {
    const dx = x - px;
    const dy = y - py;
    return { x: px - dy, y: py + dx };
  }

  function rotatePointCCW(px, py, x, y) {
    const dx = x - px;
    const dy = y - py;
    return { x: px + dy, y: py - dx };
  }

  function rotateOrbitalsCCW(atom) {
    var o = atom.orbitals;
    atom.orbitals = {
      up: o.right,
      right: o.down,
      down: o.left,
      left: o.up,
    };
  }
  const ELEMENT_COLORS = { C: '#404040', H: '#f0f0f0', O: '#e74c3c', N: '#3498db', F: '#9eff7a', Cl: '#27c46a', P: '#e67e22', S: '#f1c40f' };
  const ELEMENT_TEXT_COLORS = { C: '#ffffff', H: '#333333', O: '#ffffff', N: '#ffffff', F: '#1a3310', Cl: '#ffffff', P: '#ffffff', S: '#333333' };
  const OPPOSITE_SLOT = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const SLOT_ROTATE_CW = { up: 'right', right: 'down', down: 'left', left: 'up' };
  const ORBITAL_SWAP_PAIRS = [
    ['up', 'right'],
    ['right', 'down'],
    ['down', 'left'],
    ['left', 'up'],
  ];
  const SLOT_VECTORS = {
    right: { dx: 1, dy: 0 }, left: { dx: -1, dy: 0 },
    up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
  };
  const BOND_ORDER = ['single', 'double', 'triple'];
  const CO_BOND_CYCLE = ['single', 'double', 'co_dative'];
  const BOND_STROKE_WIDTH = 3.5;
  const BOND_TRIPLE_CENTER_WIDTH = 4;
  const BOND_HIT_STROKE_WIDTH = 20;
  const COORDINATION_ARROW_COLOR = '#ff6eb4';

  function bondElectronCost(order) {
    if (order === 'single' || order === 'n_dative' || order === 'p_dative' ||
        order === 's_dative' || order === 'cl_dative') return 1;
    if (order === 'double') return 2;
    if (order === 'triple' || order === 'co_dative') return 3;
    return 0;
  }

  function bondAtomElectronCost(atom, order) {
    if (order === 'co_dative') return atom.element === 'C' ? 2 : 4;
    if (order === 'n_dative') return atom.element === 'N' ? 2 : 0;
    if (order === 'p_dative') return atom.element === 'P' ? 2 : 0;
    if (order === 's_dative') return atom.element === 'S' ? 2 : 0;
    if (order === 'cl_dative') return atom.element === 'Cl' ? 2 : 0;
    return bondElectronCost(order);
  }

  function isBondValue(val) {
    return val === 'single' || val === 'double' || val === 'triple' ||
      val === 'co_dative' || val === 'n_dative' || val === 'p_dative' ||
      val === 's_dative' || val === 'cl_dative';
  }

  function isCoOnlyDiatomic(compound) {
    if (!compound || compound.atoms.length !== 2 || compound.bonds.length !== 1) return false;
    var e0 = compound.atoms[0].element;
    var e1 = compound.atoms[1].element;
    return (e0 === 'C' && e1 === 'O') || (e0 === 'O' && e1 === 'C');
  }

  function getCoBondEnds(bond) {
    return {
      carbon: bond.atomA.element === 'C' ? bond.atomA : bond.atomB,
      oxygen: bond.atomA.element === 'O' ? bond.atomA : bond.atomB,
      carbonSlot: bond.atomA.element === 'C' ? bond.slotA : bond.slotB,
      oxygenSlot: bond.atomA.element === 'O' ? bond.slotA : bond.slotB,
    };
  }

  function oppositeOrbitalSlot(slot) {
    return { up: 'down', down: 'up', left: 'right', right: 'left' }[slot];
  }

  function bondSlotForAtom(bond, atom) {
    return bond.atomA.id === atom.id ? bond.slotA : bond.slotB;
  }

  function countBondSlots(atom) {
    var count = 0;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (isBondValue(atom.orbitals[slot])) count += 1;
    }
    return count;
  }

  function countAtomBondsInCompound(atom, compound) {
    if (!compound) return 0;
    var count = 0;
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id === atom.id || bond.atomB.id === atom.id) count += 1;
    }
    return count;
  }

  function atomHasOnlyBondTo(atom, partner, bond, compound) {
    for (var i = 0; i < compound.bonds.length; i++) {
      var b = compound.bonds[i];
      if (b.atomA.id !== atom.id && b.atomB.id !== atom.id) continue;
      if (b.id === bond.id) continue;
      return false;
    }
    var other = bond.atomA.id === atom.id ? bond.atomB : bond.atomA;
    return other.id === partner.id;
  }

  function isNitrogenHubType1Bond(bond, nitrogen, compound) {
    var hub = nitrogen.nDativeHub;
    if (!hub || !hub.receiverBondId) return false;
    if (bond.id === hub.receiverBondId || bond.id === hub.type2BondId ||
        bond.id === hub.type3BondId) return false;
    var other = bond.atomA.id === nitrogen.id ? bond.atomB : bond.atomA;
    return other.element === 'O' && bond.order === 'single';
  }

  function resolveSnapCompoundForAtom(atom, activeCompound, partnerCompound) {
    if (!atom) return activeCompound;
    for (var i = 0; i < activeCompound.atoms.length; i++) {
      if (activeCompound.atoms[i].id === atom.id) return activeCompound;
    }
    return partnerCompound;
  }

  function nitrogenLonePairSlot(atom) {
    if (atom.element !== 'N') return null;
    var loneSlot = null;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (atom.orbitals[slot] === 2) loneSlot = slot;
    }
    return loneSlot;
  }

  function nitrogenHubReady(atom) {
    if (atom.element !== 'N') return false;
    if (!nitrogenLonePairSlot(atom)) return false;
    if (atom.countFreeElectrons() !== 0) return false;
    if (atom.nDativeHub && atom.nDativeHub.receiverBondId) return false;
    return true;
  }

  function phosphorusLonePairSlot(atom) {
    if (atom.element !== 'P') return null;
    var loneSlot = null;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (atom.orbitals[slot] === 2) loneSlot = slot;
    }
    return loneSlot;
  }

  function phosphorusDativeReady(atom) {
    if (atom.element !== 'P') return false;
    if (!phosphorusLonePairSlot(atom)) return false;
    if (atom.countFreeElectrons() !== 0) return false;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (atom.orbitals[slot] === 'p_dative') return false;
    }
    return true;
  }

  function phosphorusDativeLoneSlot(atom) {
    if (!phosphorusDativeReady(atom)) return null;
    return phosphorusLonePairSlot(atom);
  }

  function sulfurIsDativeDonor(atom) {
    if (atom.element !== 'S') return false;
    if (atom.countFreeElectrons() !== 0) return false;
    for (var slot of ['up', 'down', 'left', 'right']) {
      var val = atom.orbitals[slot];
      if (val === 'single' || val === 'double' || val === 'triple' || val === 's_dative') return true;
    }
    return false;
  }

  function sulfurDativeReady(atom) {
    if (!sulfurIsDativeDonor(atom)) return false;
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (atom.orbitals[slot] === 2) return true;
    }
    return false;
  }

  function sulfurDativeLonePairSlot(atom, slot) {
    return sulfurIsDativeDonor(atom) && atom.orbitals[slot] === 2;
  }

  function syncNitrogenBondOrbitalsFromOrders(nitrogen, compound) {
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id !== nitrogen.id && bond.atomB.id !== nitrogen.id) continue;
      var nSlot = bondSlotForAtom(bond, nitrogen);
      nitrogen.orbitals[nSlot] = bond.order;
    }
  }

  function countNitrogenHubBonds(nitrogen, compound) {
    var count = 0;
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id === nitrogen.id || bond.atomB.id === nitrogen.id) count += 1;
    }
    return count;
  }

  function countNitrogenPeripheralBonds(nitrogen, compound, hub) {
    var hubBondIds = new Set();
    if (hub && hub.receiverBondId) hubBondIds.add(hub.receiverBondId);
    if (hub && hub.type2BondId) hubBondIds.add(hub.type2BondId);
    if (hub && hub.type3BondId) hubBondIds.add(hub.type3BondId);
    var count = 0;
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id !== nitrogen.id && bond.atomB.id !== nitrogen.id) continue;
      if (hubBondIds.has(bond.id)) continue;
      count += 1;
    }
    return count;
  }

  function shouldPreserveResonanceFreeElectron(nitrogen, compound, hub) {
    if (!hub || !hub.resonanceActive || !hub.releasedSlot) return false;
    return nitrogen.orbitals[hub.releasedSlot] === 1;
  }

  function isThreeWayOxoResonance(hub) {
    return !!(hub && hub.type3BondId);
  }

  function oxoResonanceModulus(hub) {
    return isThreeWayOxoResonance(hub) ? 3 : 2;
  }

  function oxoDativeCompactElectronCost(donor, compound, hub) {
    var triadSize = isThreeWayOxoResonance(hub) ? 3 : 2;
    return 2 * triadSize + countNitrogenPeripheralBonds(donor, compound, hub);
  }

  function shouldUseExpandedResonanceOrbitals(nitrogen, compound, hub, opts) {
    if (opts && opts.expandedOrbitals) return true;
    var compactCost = oxoDativeCompactElectronCost(nitrogen, compound, hub);
    if (compactCost > nitrogen.maxElectrons) return true;
    return !!(hub && hub.releasedSlot && compactCost >= nitrogen.maxElectrons);
  }

  function syncReleasedHubSlot(nitrogen, hub) {
    if (!hub || !hub.releasedSlot) return;
    if (nitrogen.countFreeElectrons() === 0 || nitrogen.orbitals[hub.releasedSlot] !== 1) {
      hub.releasedSlot = null;
    }
  }

  function getOxoResonanceTriadBonds(grouped) {
    var bonds = [];
    if (grouped.type2Bond) bonds.push(grouped.type2Bond);
    if (grouped.receiverBond) bonds.push(grouped.receiverBond);
    if (grouped.type3Bond) bonds.push(grouped.type3Bond);
    return bonds;
  }

  function oxoResonanceDoubleBond(grouped, stateIndex) {
    var triad = getOxoResonanceTriadBonds(grouped);
    if (!triad.length) return null;
    return triad[stateIndex % triad.length];
  }

  function syncNitrogenResonanceOrbitals(nitrogen, compound, hub, stateIndex, opts) {
    opts = opts || {};
    var grouped = getNitrogenHubBonds(nitrogen, compound);
    var triad = getOxoResonanceTriadBonds(grouped);
    if (triad.length < 2) return;
    var doubleBond = oxoResonanceDoubleBond(grouped, stateIndex);
    var hubBondIds = new Set();
    for (var ti = 0; ti < triad.length; ti++) hubBondIds.add(triad[ti].id);
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id !== nitrogen.id && bond.atomB.id !== nitrogen.id) continue;
      if (hubBondIds.has(bond.id)) continue;
      nitrogen.orbitals[bondSlotForAtom(bond, nitrogen)] = bond.order;
    }
    var hubBondCount = countNitrogenHubBonds(nitrogen, compound);
    var useCompactResonance = hubBondCount <= 3 &&
      !shouldUseExpandedResonanceOrbitals(nitrogen, compound, hub, opts);
    var dativeOrder = oxoDativeOrderForAtom(nitrogen) || 'n_dative';
    for (var oi = 0; oi < triad.length; oi++) {
      var oxoBond = triad[oi];
      var oxoSlot = bondSlotForAtom(oxoBond, nitrogen);
      var isDouble = doubleBond && oxoBond.id === doubleBond.id;
      if (useCompactResonance) {
        nitrogen.orbitals[oxoSlot] = isDouble ? 'double' : dativeOrder;
      } else {
        nitrogen.orbitals[oxoSlot] = isDouble ? 'double' : 'single';
      }
    }
    if (!shouldPreserveResonanceFreeElectron(nitrogen, compound, hub)) {
      clearNitrogenStrayElectrons(nitrogen, compound);
    }
  }

  function syncNitrogenHubOrbitals(nitrogen, compound, hub) {
    if (hub && hub.resonanceActive) {
      syncNitrogenResonanceOrbitals(nitrogen, compound, hub, hub.resonanceState || 0);
      return;
    }
    syncNitrogenBondOrbitalsFromOrders(nitrogen, compound);
    if (hub) clearNitrogenStrayElectrons(nitrogen, compound);
  }

  function clearNitrogenStrayElectrons(nitrogen, compound) {
    var bondSlots = new Set();
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id !== nitrogen.id && bond.atomB.id !== nitrogen.id) continue;
      bondSlots.add(bondSlotForAtom(bond, nitrogen));
    }
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (bondSlots.has(slot)) continue;
      if (nitrogen.orbitals[slot] === 1) nitrogen.orbitals[slot] = 0;
    }
  }

  function getNoBondEnds(bond) {
    var donor = null;
    if (bond.atomA.element === 'N' || bond.atomA.element === 'P' || bond.atomA.element === 'S') {
      donor = bond.atomA;
    } else if (bond.atomB.element === 'N' || bond.atomB.element === 'P' || bond.atomB.element === 'S') {
      donor = bond.atomB;
    } else {
      donor = bond.atomA.element !== 'O' ? bond.atomA : bond.atomB;
    }
    var oxygen = bond.atomA.id === donor.id ? bond.atomB : bond.atomA;
    return {
      nitrogen: donor,
      oxygen: oxygen,
      nitrogenSlot: bond.atomA.id === donor.id ? bond.slotA : bond.slotB,
      oxygenSlot: bond.atomA.id === oxygen.id ? bond.slotA : bond.slotB,
    };
  }

  function getClOBondEnds(bond) {
    return {
      chlorine: bond.atomA.element === 'Cl' ? bond.atomA : bond.atomB,
      oxygen: bond.atomA.element === 'O' ? bond.atomA : bond.atomB,
      chlorineSlot: bond.atomA.element === 'Cl' ? bond.slotA : bond.slotB,
      oxygenSlot: bond.atomA.element === 'O' ? bond.slotA : bond.slotB,
    };
  }

  function getPOBondEnds(bond) {
    return {
      phosphorus: bond.atomA.element === 'P' ? bond.atomA : bond.atomB,
      oxygen: bond.atomA.element === 'O' ? bond.atomA : bond.atomB,
      phosphorusSlot: bond.atomA.element === 'P' ? bond.slotA : bond.slotB,
      oxygenSlot: bond.atomA.element === 'O' ? bond.slotA : bond.slotB,
    };
  }

  function getSOBondEnds(bond) {
    return {
      sulfur: bond.atomA.element === 'S' ? bond.atomA : bond.atomB,
      oxygen: bond.atomA.element === 'O' ? bond.atomA : bond.atomB,
      sulfurSlot: bond.atomA.element === 'S' ? bond.slotA : bond.slotB,
      oxygenSlot: bond.atomA.element === 'O' ? bond.slotA : bond.slotB,
    };
  }

  function isOxoDativeDonor(atom) {
    return !!(atom && (atom.element === 'N' || atom.element === 'P' || atom.element === 'S'));
  }

  function oxoDativeOrderForAtom(atom) {
    if (!atom) return null;
    if (atom.element === 'N') return 'n_dative';
    if (atom.element === 'P') return 'p_dative';
    if (atom.element === 'S') return 's_dative';
    return null;
  }

  function oxoHubAtomFromBond(bond) {
    if (isOxoDativeDonor(bond.atomA) && bond.atomA.nDativeHub) return bond.atomA;
    if (isOxoDativeDonor(bond.atomB) && bond.atomB.nDativeHub) return bond.atomB;
    return null;
  }

  function oxygenSlotTowardPartner(oxygen, partner) {
    var dx = partner.x - oxygen.x;
    var dy = partner.y - oxygen.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? 'right' : 'left';
    }
    return dy >= 0 ? 'down' : 'up';
  }

  function resolveNDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var nitrogen = null;
    var oxygen = null;
    var nitrogenSlot = null;
    var oxygenSlot = null;
    if (movingAtom.element === 'O' && stationaryAtom.element === 'N') {
      oxygen = movingAtom;
      nitrogen = stationaryAtom;
      nitrogenSlot = stationarySlot;
      oxygenSlot = movingSlot;
    } else if (movingAtom.element === 'N' && stationaryAtom.element === 'O') {
      nitrogen = movingAtom;
      oxygen = stationaryAtom;
      nitrogenSlot = movingSlot;
      oxygenSlot = stationarySlot;
    }
    if (!nitrogen || !oxygen) return null;
    return { nitrogen: nitrogen, oxygen: oxygen, nitrogenSlot: nitrogenSlot, oxygenSlot: oxygenSlot };
  }

  function canNDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot, oxygenCompound) {
    var ends = resolveNDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot);
    if (!ends) return false;
    if (!nitrogenHubReady(ends.nitrogen)) return false;
    if (ends.nitrogenSlot !== nitrogenLonePairSlot(ends.nitrogen)) return false;
    if (countAtomBondsInCompound(ends.oxygen, oxygenCompound) > 0) return false;
    return true;
  }

  function applyNDativeSlotOverrides(activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) {
    var ends = resolveNDativeSnapEnds(activeAtom, partnerAtom, slotOnActive, slotOnPartner);
    var oxygenCompound = resolveSnapCompoundForAtom(ends ? ends.oxygen : null, activeCompound, partnerCompound);
    if (!ends || !canNDativeSnap(activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound)) return null;
    if (activeAtom.id === ends.oxygen.id) {
      return { slotOnActive: ends.oxygenSlot, slotOnPartner: ends.nitrogenSlot };
    }
    return { slotOnActive: ends.nitrogenSlot, slotOnPartner: ends.oxygenSlot };
  }

  function resolveClDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var chlorine = null;
    var oxygen = null;
    var chlorineSlot = null;
    var oxygenSlot = null;
    if (movingAtom.element === 'O' && stationaryAtom.element === 'Cl') {
      oxygen = movingAtom;
      chlorine = stationaryAtom;
      chlorineSlot = stationarySlot;
      oxygenSlot = movingSlot;
    } else if (movingAtom.element === 'Cl' && stationaryAtom.element === 'O') {
      chlorine = movingAtom;
      oxygen = stationaryAtom;
      chlorineSlot = movingSlot;
      oxygenSlot = stationarySlot;
    }
    if (!chlorine || !oxygen) return null;
    return { chlorine: chlorine, oxygen: oxygen, chlorineSlot: chlorineSlot, oxygenSlot: oxygenSlot };
  }

  function canClDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot, oxygenCompound, chlorineCompound) {
    var ends = resolveClDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot);
    if (!ends) return false;
    if (!chlorineDativeReady(ends.chlorine, chlorineCompound)) return false;
    if (ends.chlorine.orbitals[ends.chlorineSlot] !== 2) return false;
    if (countAtomBondsInCompound(ends.oxygen, oxygenCompound) > 0) return false;
    return true;
  }

  function applyClDativeSlotOverrides(activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) {
    var ends = resolveClDativeSnapEnds(activeAtom, partnerAtom, slotOnActive, slotOnPartner);
    var oxygenCompound = resolveSnapCompoundForAtom(ends ? ends.oxygen : null, activeCompound, partnerCompound);
    var chlorineCompound = resolveSnapCompoundForAtom(ends ? ends.chlorine : null, activeCompound, partnerCompound);
    if (!ends || !canClDativeSnap(
      activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound, chlorineCompound)) return null;
    if (activeAtom.id === ends.oxygen.id) {
      return { slotOnActive: ends.oxygenSlot, slotOnPartner: ends.chlorineSlot };
    }
    return { slotOnActive: ends.chlorineSlot, slotOnPartner: ends.oxygenSlot };
  }

  function resolvePDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var phosphorus = null;
    var oxygen = null;
    var phosphorusSlot = null;
    var oxygenSlot = null;
    if (movingAtom.element === 'O' && stationaryAtom.element === 'P') {
      oxygen = movingAtom;
      phosphorus = stationaryAtom;
      phosphorusSlot = stationarySlot;
      oxygenSlot = movingSlot;
    } else if (movingAtom.element === 'P' && stationaryAtom.element === 'O') {
      phosphorus = movingAtom;
      oxygen = stationaryAtom;
      phosphorusSlot = movingSlot;
      oxygenSlot = stationarySlot;
    }
    if (!phosphorus || !oxygen) return null;
    return {
      phosphorus: phosphorus,
      oxygen: oxygen,
      phosphorusSlot: phosphorusSlot,
      oxygenSlot: oxygenSlot,
    };
  }

  function canPDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot, oxygenCompound) {
    var ends = resolvePDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot);
    if (!ends) return false;
    if (!phosphorusDativeReady(ends.phosphorus)) return false;
    if (ends.phosphorusSlot !== phosphorusLonePairSlot(ends.phosphorus)) return false;
    if (countAtomBondsInCompound(ends.oxygen, oxygenCompound) > 0) return false;
    return true;
  }

  function applyPDativeSlotOverrides(activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) {
    var ends = resolvePDativeSnapEnds(activeAtom, partnerAtom, slotOnActive, slotOnPartner);
    var oxygenCompound = resolveSnapCompoundForAtom(ends ? ends.oxygen : null, activeCompound, partnerCompound);
    if (!ends || !canPDativeSnap(activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound)) return null;
    if (activeAtom.id === ends.oxygen.id) {
      return { slotOnActive: ends.oxygenSlot, slotOnPartner: ends.phosphorusSlot };
    }
    return { slotOnActive: ends.phosphorusSlot, slotOnPartner: ends.oxygenSlot };
  }

  function resolveSDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot) {
    var sulfur = null;
    var oxygen = null;
    var sulfurSlot = null;
    var oxygenSlot = null;
    if (movingAtom.element === 'O' && stationaryAtom.element === 'S') {
      oxygen = movingAtom;
      sulfur = stationaryAtom;
      sulfurSlot = stationarySlot;
      oxygenSlot = movingSlot;
    } else if (movingAtom.element === 'S' && stationaryAtom.element === 'O') {
      sulfur = movingAtom;
      oxygen = stationaryAtom;
      sulfurSlot = movingSlot;
      oxygenSlot = stationarySlot;
    }
    if (!sulfur || !oxygen) return null;
    return { sulfur: sulfur, oxygen: oxygen, sulfurSlot: sulfurSlot, oxygenSlot: oxygenSlot };
  }

  function canSDativeSnap(movingAtom, stationaryAtom, movingSlot, stationarySlot, oxygenCompound) {
    var ends = resolveSDativeSnapEnds(movingAtom, stationaryAtom, movingSlot, stationarySlot);
    if (!ends) return false;
    if (!sulfurDativeReady(ends.sulfur)) return false;
    if (ends.sulfur.orbitals[ends.sulfurSlot] !== 2) return false;
    if (countAtomBondsInCompound(ends.oxygen, oxygenCompound) > 0) return false;
    return true;
  }

  function applySDativeSlotOverrides(activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) {
    var ends = resolveSDativeSnapEnds(activeAtom, partnerAtom, slotOnActive, slotOnPartner);
    var oxygenCompound = resolveSnapCompoundForAtom(ends ? ends.oxygen : null, activeCompound, partnerCompound);
    if (!ends || !canSDativeSnap(activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound)) return null;
    if (activeAtom.id === ends.oxygen.id) {
      return { slotOnActive: ends.oxygenSlot, slotOnPartner: ends.sulfurSlot };
    }
    return { slotOnActive: ends.sulfurSlot, slotOnPartner: ends.oxygenSlot };
  }

  function applySpecialBondSlotOverrides(activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) {
    return applyNDativeSlotOverrides(
      activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) ||
      applyPDativeSlotOverrides(
        activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) ||
      applySDativeSlotOverrides(
        activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) ||
      applyClDativeSlotOverrides(
        activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound) ||
      applyFluorideChlorineSlotOverrides(
        activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound);
  }

  function layoutNDativeReceiverOxygen(oxygen, bondSlot) {
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) oxygen.orbitals[slots[i]] = 0;
    oxygen.orbitals[bondSlot] = 'n_dative';
    for (var j = 0; j < slots.length; j++) {
      if (slots[j] !== bondSlot) oxygen.orbitals[slots[j]] = 2;
    }
  }

  function layoutClDativeReceiverOxygen(oxygen, bondSlot) {
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) oxygen.orbitals[slots[i]] = 0;
    oxygen.orbitals[bondSlot] = 'cl_dative';
    for (var j = 0; j < slots.length; j++) {
      if (slots[j] !== bondSlot) oxygen.orbitals[slots[j]] = 2;
    }
  }

  function layoutPDativeReceiverOxygen(oxygen, bondSlot) {
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) oxygen.orbitals[slots[i]] = 0;
    oxygen.orbitals[bondSlot] = 'p_dative';
    for (var j = 0; j < slots.length; j++) {
      if (slots[j] !== bondSlot) oxygen.orbitals[slots[j]] = 2;
    }
  }

  function layoutSDativeReceiverOxygen(oxygen, bondSlot) {
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) oxygen.orbitals[slots[i]] = 0;
    oxygen.orbitals[bondSlot] = 's_dative';
    for (var j = 0; j < slots.length; j++) {
      if (slots[j] !== bondSlot) oxygen.orbitals[slots[j]] = 2;
    }
  }

  function layoutOxoDativeReceiverOxygen(oxygen, bondSlot, donor) {
    var order = oxoDativeOrderForAtom(donor);
    if (order === 'p_dative') layoutPDativeReceiverOxygen(oxygen, bondSlot);
    else if (order === 's_dative') layoutSDativeReceiverOxygen(oxygen, bondSlot);
    else layoutNDativeReceiverOxygen(oxygen, bondSlot);
  }

  function layoutOxygenThreeLonePairs(oxygen, bondSlot, bondOrder) {
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) oxygen.orbitals[slots[i]] = 0;
    oxygen.orbitals[bondSlot] = bondOrder;
    for (var j = 0; j < slots.length; j++) {
      if (slots[j] !== bondSlot) oxygen.orbitals[slots[j]] = 2;
    }
  }

  function layoutOxygenTwoLonePairs(oxygen, bondSlot) {
    var opp = oppositeOrbitalSlot(bondSlot);
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) oxygen.orbitals[slots[i]] = 0;
    oxygen.orbitals[bondSlot] = 'double';
    oxygen.orbitals[opp] = 2;
    var extras = slots.filter(function (s) { return s !== bondSlot && s !== opp; });
    oxygen.orbitals[extras[0]] = 2;
    oxygen.orbitals[extras[1]] = 0;
  }

  function restoreIsolatedOxygen(oxygen) {
    resetAtomOrbitals(oxygen);
  }

  function restoreType2Oxygen(oxygen, bondSlot) {
    layoutOxygenTwoLonePairs(oxygen, bondSlot);
  }

  function restoreType2DoubleAfterReceiverBreak(type2Bond, nitrogen) {
    if (!type2Bond) return;
    type2Bond.order = 'double';
    var type2NSlot = bondSlotForAtom(type2Bond, nitrogen);
    nitrogen.orbitals[type2NSlot] = 'double';
    var type2Partner = type2Bond.atomA.id === nitrogen.id ? type2Bond.atomB : type2Bond.atomA;
    var type2PartnerSlot = oxygenSlotTowardPartner(type2Partner, nitrogen);
    if (type2Bond.atomA.id === nitrogen.id) {
      type2Bond.slotA = type2NSlot;
      type2Bond.slotB = type2PartnerSlot;
    } else {
      type2Bond.slotA = type2PartnerSlot;
      type2Bond.slotB = type2NSlot;
    }
    restoreType2Oxygen(type2Partner, type2PartnerSlot);
  }

  function restoreIsolatedPartnerAtom(atom) {
    if (atom.element === 'O') {
      restoreIsolatedOxygen(atom);
    } else {
      resetAtomOrbitals(atom);
    }
  }

  function reconcileNDativeResonanceHubs(compounds, opts) {
    opts = opts || {};
    for (var ci = 0; ci < compounds.length; ci++) {
      var compound = compounds[ci];
      for (var ai = 0; ai < compound.atoms.length; ai++) {
        var nitrogen = compound.atoms[ai];
        var hub = nitrogen.nDativeHub;
        if (!hub || !hub.resonanceActive) continue;
        if (opts.skipApply) continue;
        var applyOpts = nDativeResonanceApplyOpts(hub, nitrogen, compound);
        applyNDativeResonanceState(nitrogen, compound, hub.resonanceState || 0, applyOpts);
      }
    }
  }

  function restoreOxygenAfterPeripheralBreak(oxygen, compound, electronResolver) {
    var bonds = [];
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id === oxygen.id || bond.atomB.id === oxygen.id) bonds.push(bond);
    }
    if (bonds.length === 0) {
      restoreIsolatedOxygen(oxygen);
      return;
    }
    if (bonds.length === 1) {
      var loneBond = bonds[0];
      var slot = bondSlotForAtom(loneBond, oxygen);
      if (loneBond.order === 'double') layoutOxygenTwoLonePairs(oxygen, slot);
      else if (loneBond.order === 'n_dative') layoutNDativeReceiverOxygen(oxygen, slot);
      else if (loneBond.order === 'p_dative') layoutPDativeReceiverOxygen(oxygen, slot);
      else if (loneBond.order === 's_dative') layoutSDativeReceiverOxygen(oxygen, slot);
      else layoutOxygenSingleBond(oxygen, slot);
      if (electronResolver && !oxygen.isValenceConsistent()) {
        electronResolver.redistributeAfterBondBreak(oxygen);
      }
      return;
    }
    for (var j = 0; j < bonds.length; j++) {
      var b = bonds[j];
      var bondSlot = bondSlotForAtom(b, oxygen);
      if (b.order === 'double') oxygen.orbitals[bondSlot] = 'double';
      else if (b.order === 'n_dative') oxygen.orbitals[bondSlot] = 'n_dative';
      else if (b.order === 'p_dative') oxygen.orbitals[bondSlot] = 'p_dative';
      else if (b.order === 's_dative') oxygen.orbitals[bondSlot] = 's_dative';
      else oxygen.orbitals[bondSlot] = 'single';
    }
    if (electronResolver && !oxygen.isValenceConsistent()) {
      electronResolver.redistributeAfterBondBreak(oxygen);
    }
  }

  function breakNDativeResonancePeripheralBond(bond, compound, nitrogen, hub, snapEngine) {
    // Peripheral bond on a resonating hub: break the partner normally, keep resonance on N.
    var nSlot = bond.atomA.id === nitrogen.id ? bond.slotA : bond.slotB;
    var partner = bond.atomA.id === nitrogen.id ? bond.atomB : bond.atomA;
    var partnerSlot = bond.atomA.id === nitrogen.id ? bond.slotB : bond.slotA;
    compound.removeBond(bond.id);
    if (partner.element === 'O') {
      partner.orbitals[partnerSlot] = 0;
      restoreOxygenAfterPeripheralBreak(partner, compound, snapEngine.electronResolver);
    } else {
      snapEngine.electronResolver.breakBondSlot(partner, partnerSlot, bond.order);
      if (!partner.isValenceConsistent()) {
        snapEngine.electronResolver.redistributeAfterBondBreak(partner);
      }
    }
    nitrogen.orbitals[nSlot] = 1;
    hub.releasedSlot = nSlot;
    if (window.app && window.app.renderer) window.app.renderer.ensureNDativeResonanceTimer();
    snapEngine.clearPairSuppression(bond.atomA, bond.atomB);
    return true;
  }

  function restoreOxoDativeBond(bond, donor) {
    var dativeOrder = oxoDativeOrderForAtom(donor) || 'n_dative';
    bond.order = dativeOrder;
    var ends = getNoBondEnds(bond);
    donor.orbitals[ends.nitrogenSlot] = dativeOrder;
    var oxygenSlot = oxygenSlotTowardPartner(ends.oxygen, donor);
    if (bond.atomA.id === donor.id) {
      bond.slotA = ends.nitrogenSlot;
      bond.slotB = oxygenSlot;
    } else {
      bond.slotA = oxygenSlot;
      bond.slotB = ends.nitrogenSlot;
    }
    layoutOxoDativeReceiverOxygen(ends.oxygen, oxygenSlot, donor);
  }

  function findBondById(compound, bondId) {
    if (!bondId) return null;
    for (var i = 0; i < compound.bonds.length; i++) {
      if (compound.bonds[i].id === bondId) return compound.bonds[i];
    }
    return null;
  }

  function returnOxoResonanceBondElectrons(bond, donor, snapEngine) {
    var donorSlot = bondSlotForAtom(bond, donor);
    var order = isBondValue(donor.orbitals[donorSlot]) ? donor.orbitals[donorSlot] : bond.order;
    snapEngine.electronResolver.breakBondSlot(donor, donorSlot, order);
  }

  function breakNDativeResonanceType3Bond(bond, compound, nitrogen, hub, snapEngine) {
    var ends = getNoBondEnds(bond);
    returnOxoResonanceBondElectrons(bond, nitrogen, snapEngine);
    compound.removeBond(bond.id);
    restoreIsolatedOxygen(ends.oxygen);
    hub.type3BondId = null;
    if (hub.resonanceState > 1) hub.resonanceState = 0;
    refreshNDativeHub(nitrogen, compound);
    snapEngine.clearPairSuppression(bond.atomA, bond.atomB);
    return true;
  }

  function breakNDativeResonanceType2Bond(bond, compound, nitrogen, hub, snapEngine) {
    var ends = getNoBondEnds(bond);
    returnOxoResonanceBondElectrons(bond, nitrogen, snapEngine);
    compound.removeBond(bond.id);
    restoreIsolatedOxygen(ends.oxygen);
    var type3Bond = findBondById(compound, hub.type3BondId);
    if (type3Bond) restoreOxoDativeBond(type3Bond, nitrogen);
    hub.type2BondId = null;
    hub.type3BondId = null;
    hub.resonanceActive = false;
    hub.resonanceState = 0;
    refreshNDativeHub(nitrogen, compound);
    if (window.app && window.app.renderer) window.app.renderer.ensureNDativeResonanceTimer();
    snapEngine.clearPairSuppression(bond.atomA, bond.atomB);
    return true;
  }

  function nitrogenBondCostFromCompound(nitrogen, compound) {
    var bondCost = 0;
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id !== nitrogen.id && bond.atomB.id !== nitrogen.id) continue;
      bondCost += bondAtomElectronCost(nitrogen, bond.order);
    }
    return bondCost;
  }

  function restoreNitrogenAfterReceiverBreak(nitrogen, compound, loneSlot, electronResolver, type2Bond) {
    if (type2Bond) restoreType2DoubleAfterReceiverBreak(type2Bond, nitrogen);
    var bondCost = nitrogenBondCostFromCompound(nitrogen, compound);
    if (loneSlot && bondCost + 2 <= nitrogen.maxElectrons) {
      restoreNitrogenAfterNDativeBreak(nitrogen, compound, loneSlot, electronResolver);
    } else {
      restoreNitrogenFromRemainingBonds(nitrogen, compound, null, electronResolver);
    }
  }

  function getNitrogenHubBonds(nitrogen, compound) {
    var receiverBond = null;
    var type1Bonds = [];
    var type2Bond = null;
    var type3Bond = null;
    var hub = nitrogen.nDativeHub;
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      var other = bond.atomA.id === nitrogen.id ? bond.atomB :
        bond.atomB.id === nitrogen.id ? bond.atomA : null;
      if (!other || other.element !== 'O') continue;
      if (hub && bond.id === hub.receiverBondId) {
        receiverBond = bond;
        continue;
      }
      if (hub && hub.type2BondId && bond.id === hub.type2BondId) {
        type2Bond = bond;
        continue;
      }
      if (hub && hub.type3BondId && bond.id === hub.type3BondId) {
        type3Bond = bond;
        continue;
      }
      if (!hub && (bond.order === 'n_dative' || bond.order === 'p_dative' ||
          bond.order === 's_dative')) {
        if (!receiverBond) receiverBond = bond;
        else if (nitrogen.element === 'S' && !type3Bond) type3Bond = bond;
        continue;
      }
      if ((bond.order === 'n_dative' || bond.order === 'p_dative' ||
          bond.order === 's_dative') && nitrogen.element === 'S') {
        if (!type3Bond) type3Bond = bond;
        continue;
      }
      if (bond.order === 'double' && !(hub && hub.type2BondId)) {
        if (!type2Bond) type2Bond = bond;
      } else if (bond.order === 'single') {
        type1Bonds.push(bond);
      }
    }
    return {
      receiverBond: receiverBond,
      type1Bonds: type1Bonds,
      type2Bond: type2Bond,
      type2Bonds: type2Bond ? [type2Bond] : [],
      type3Bond: type3Bond,
    };
  }

  function clearNDativeHub(nitrogen) {
    if (!nitrogen) return;
    nitrogen.nDativeHub = null;
  }

  function refreshNDativeHub(nitrogen, compound) {
    var hub = nitrogen.nDativeHub;
    if (!hub) return;
    var grouped = getNitrogenHubBonds(nitrogen, compound);
    if (!grouped.receiverBond) {
      var savedLone = hub.loneSlot;
      clearNDativeHub(nitrogen);
      if (window.app && window.app.snapEngine) {
        restoreNitrogenFromRemainingBonds(
          nitrogen, compound, savedLone, window.app.snapEngine.electronResolver);
      }
      return;
    }
    hub.receiverBondId = grouped.receiverBond.id;
    if (!hub.type2BondId && grouped.type2Bond) hub.type2BondId = grouped.type2Bond.id;
    else if (hub.type2BondId && !compound.bonds.some(function (b) { return b.id === hub.type2BondId; })) {
      hub.type2BondId = grouped.type2Bond ? grouped.type2Bond.id : null;
    }
    if (nitrogen.element === 'S') {
      if (!hub.type3BondId && grouped.type3Bond) hub.type3BondId = grouped.type3Bond.id;
      else if (hub.type3BondId && !compound.bonds.some(function (b) { return b.id === hub.type3BondId; })) {
        hub.type3BondId = grouped.type3Bond ? grouped.type3Bond.id : null;
      }
    } else {
      hub.type3BondId = null;
    }
    if (hub.resonanceState >= oxoResonanceModulus(hub)) hub.resonanceState = 0;
    hub.resonanceActive = !!hub.type2BondId;
    if (!hub.resonanceActive) {
      hub.resonanceState = 0;
      var dativeOrder = oxoDativeOrderForAtom(nitrogen) || 'n_dative';
      grouped.receiverBond.order = dativeOrder;
      var recvEnds = getNoBondEnds(grouped.receiverBond);
      recvEnds.nitrogen.orbitals[recvEnds.nitrogenSlot] = dativeOrder;
      var recvOxygenSlot = oxygenSlotTowardPartner(recvEnds.oxygen, recvEnds.nitrogen);
      if (grouped.receiverBond.atomA.id === recvEnds.nitrogen.id) {
        grouped.receiverBond.slotA = recvEnds.nitrogenSlot;
        grouped.receiverBond.slotB = recvOxygenSlot;
      } else {
        grouped.receiverBond.slotA = recvOxygenSlot;
        grouped.receiverBond.slotB = recvEnds.nitrogenSlot;
      }
      layoutOxoDativeReceiverOxygen(recvEnds.oxygen, recvOxygenSlot, nitrogen);
      syncNitrogenBondOrbitalsFromOrders(nitrogen, compound);
      return;
    }
    if (window.app && window.app.renderer) window.app.renderer.ensureNDativeResonanceTimer();
    syncReleasedHubSlot(nitrogen, hub);
    var refreshOpts = nDativeResonanceApplyOpts(hub, nitrogen, compound);
    applyNDativeResonanceState(nitrogen, compound, hub.resonanceState || 0, refreshOpts);
  }

  function layoutOxygenSingleBond(oxygen, bondSlot) {
    var opp = oppositeOrbitalSlot(bondSlot);
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) oxygen.orbitals[slots[i]] = 0;
    oxygen.orbitals[bondSlot] = 'single';
    oxygen.orbitals[opp] = 2;
    var extras = slots.filter(function (s) { return s !== bondSlot && s !== opp; });
    oxygen.orbitals[extras[0]] = 2;
    oxygen.orbitals[extras[1]] = 0;
  }

  function layoutNDativeType1Oxygens(nitrogen, compound, receiverBondId, type2BondId) {
    // Type-1 oxygens (standard N–O single covalent bonds) do not participate in resonance.
    // Intentionally no-op: do not change their bond orders, slots, or orbitals.
  }

  function bondIsResonanceDativeLeg(bond) {
    var donor = oxoHubAtomFromBond(bond);
    if (!donor) {
      donor = bond.atomA.element === 'N' ? bond.atomA :
        bond.atomB.element === 'N' ? bond.atomB : null;
    }
    if (!donor || !isOxoDativeDonor(donor)) return false;
    if (bond.atomA.element !== 'O' && bond.atomB.element !== 'O') return false;
    var hub = donor.nDativeHub;
    if (!hub || !hub.resonanceActive || !hub.receiverBondId || !hub.type2BondId) return false;
    var state = hub.resonanceState || 0;
    var doubleId = state === 0 ? hub.type2BondId :
      state === 1 ? hub.receiverBondId : hub.type3BondId;
    return (bond.id === hub.receiverBondId || bond.id === hub.type2BondId ||
      bond.id === hub.type3BondId) && bond.id !== doubleId;
  }

  function bondIsOzoneResonanceDativeLeg(bond) {
    if (bond.order !== 'single') return false;
    var chargeA = bond.atomA.ozoneFormalCharge || 0;
    var chargeB = bond.atomB.ozoneFormalCharge || 0;
    return (chargeA === 1 && chargeB === -1) || (chargeA === -1 && chargeB === 1);
  }

  function getOzoneDativeBondEnds(bond) {
    if ((bond.atomA.ozoneFormalCharge || 0) === 1) {
      return { donor: bond.atomA, acceptor: bond.atomB };
    }
    if ((bond.atomB.ozoneFormalCharge || 0) === 1) {
      return { donor: bond.atomB, acceptor: bond.atomA };
    }
    return null;
  }

  function nDativeResonanceApplyOpts(hub, nitrogen, compound) {
    if (nitrogen && compound &&
        oxoDativeCompactElectronCost(nitrogen, compound, hub) > nitrogen.maxElectrons) {
      return { expandedOrbitals: true };
    }
    return null;
  }

  function applyNDativeResonanceState(nitrogen, compound, stateIndex, opts) {
    opts = opts || nDativeResonanceApplyOpts(nitrogen.nDativeHub, nitrogen, compound);
    var hub = nitrogen.nDativeHub;
    if (!hub || !hub.resonanceActive) return false;
    var grouped = getNitrogenHubBonds(nitrogen, compound);
    var triad = getOxoResonanceTriadBonds(grouped);
    if (triad.length < 2) return false;
    var doubleBond = oxoResonanceDoubleBond(grouped, stateIndex);
    if (!doubleBond) return false;
    var oxygens = [];
    for (var i = 0; i < triad.length; i++) {
      var bond = triad[i];
      var ends = getNoBondEnds(bond);
      var oxygenSlot = oxygenSlotTowardPartner(ends.oxygen, nitrogen);
      if (bond.id === doubleBond.id) {
        bond.order = 'double';
        layoutOxygenTwoLonePairs(ends.oxygen, oxygenSlot);
      } else {
        bond.order = 'single';
        layoutOxoDativeReceiverOxygen(ends.oxygen, oxygenSlot, nitrogen);
      }
      oxygens.push(ends.oxygen);
    }
    layoutNDativeType1Oxygens(nitrogen, compound, grouped.receiverBond.id, grouped.type2Bond.id);
    syncNitrogenResonanceOrbitals(nitrogen, compound, hub, stateIndex, opts);
    syncReleasedHubSlot(nitrogen, hub);
    var nitrogenOk = nitrogen.isValenceConsistent() &&
      (nitrogen.countFreeElectrons() === 0 ||
        shouldPreserveResonanceFreeElectron(nitrogen, compound, hub));
    var ok = nitrogenOk;
    for (var oi = 0; oi < oxygens.length; oi++) {
      if (!oxygens[oi].isValenceConsistent()) ok = false;
    }
    if (ok) hub.resonanceState = stateIndex;
    return ok;
  }

  function registerNDativeHub(nitrogen, loneSlot, receiverBondId) {
    nitrogen.nDativeHub = {
      loneSlot: loneSlot,
      receiverBondId: receiverBondId,
      type2BondId: null,
      type3BondId: null,
      resonanceActive: false,
      resonanceState: 0,
    };
  }

  function compoundHasNDativeResonance(compound) {
    for (var i = 0; i < compound.atoms.length; i++) {
      var hub = compound.atoms[i].nDativeHub;
      if (hub && hub.resonanceActive) return true;
    }
    return false;
  }

  function unionVisualBounds(boundsA, boundsB) {
    var left = Math.min(boundsA.left, boundsB.left);
    var top = Math.min(boundsA.top, boundsB.top);
    var right = Math.max(boundsA.right, boundsB.right);
    var bottom = Math.max(boundsA.bottom, boundsB.bottom);
    return {
      left: left,
      top: top,
      right: right,
      bottom: bottom,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    };
  }

  function snapshotCompoundVisualState(compound) {
    return {
      atoms: compound.atoms.map(function (atom) {
        return {
          id: atom.id,
          orbitals: {
            up: atom.orbitals.up,
            down: atom.orbitals.down,
            left: atom.orbitals.left,
            right: atom.orbitals.right,
          },
          ozoneFormalCharge: atom.ozoneFormalCharge || 0,
          nDativeHub: atom.nDativeHub ? Object.assign({}, atom.nDativeHub) : null,
        };
      }),
      bonds: compound.bonds.map(function (bond) {
        return { id: bond.id, order: bond.order };
      }),
      ozoneActive: compound.ozoneActive,
      ozoneResonanceState: compound.ozoneResonanceState,
    };
  }

  function restoreCompoundVisualState(compound, snapshot) {
    for (var ai = 0; ai < snapshot.atoms.length; ai++) {
      var saved = snapshot.atoms[ai];
      var atom = compound.atoms.find(function (a) { return a.id === saved.id; });
      if (!atom) continue;
      atom.orbitals.up = saved.orbitals.up;
      atom.orbitals.down = saved.orbitals.down;
      atom.orbitals.left = saved.orbitals.left;
      atom.orbitals.right = saved.orbitals.right;
      atom.ozoneFormalCharge = saved.ozoneFormalCharge;
      atom.nDativeHub = saved.nDativeHub ? Object.assign({}, saved.nDativeHub) : null;
    }
    for (var bi = 0; bi < snapshot.bonds.length; bi++) {
      var savedBond = snapshot.bonds[bi];
      var bond = compound.bonds.find(function (b) { return b.id === savedBond.id; });
      if (bond) bond.order = savedBond.order;
    }
    compound.ozoneActive = snapshot.ozoneActive;
    compound.ozoneResonanceState = snapshot.ozoneResonanceState;
  }

  function getBoundsForNDativeResonanceState(compound, stateIndex) {
    var hubInfo = findNDativeResonanceHub(compound);
    if (!hubInfo) return compound.getBounds();
    var snapshot = snapshotCompoundVisualState(compound);
    var opts = nDativeResonanceApplyOpts(hubInfo.hub, hubInfo.nitrogen, compound);
    applyNDativeResonanceState(hubInfo.nitrogen, compound, stateIndex, opts);
    var bounds = compound.getBounds();
    restoreCompoundVisualState(compound, snapshot);
    return bounds;
  }

  function getBoundsForOzoneResonanceState(compound, stateIndex) {
    var snapshot = snapshotCompoundVisualState(compound);
    if (typeof window !== 'undefined' && window.app && window.app.snapEngine) {
      window.app.snapEngine.applyOzoneResonanceState(compound, stateIndex);
    }
    var bounds = compound.getBounds();
    restoreCompoundVisualState(compound, snapshot);
    return bounds;
  }

  function getCompoundLabelPlacementBounds(compound) {
    if (compoundHasNDativeResonance(compound)) {
      var state0 = getBoundsForNDativeResonanceState(compound, 0);
      var state1 = getBoundsForNDativeResonanceState(compound, 1);
      var bounds = unionVisualBounds(state0, state1);
      var hasTriad = compound.atoms.some(function (atom) {
        return atom.nDativeHub && atom.nDativeHub.type3BondId;
      });
      if (hasTriad) {
        bounds = unionVisualBounds(bounds, getBoundsForNDativeResonanceState(compound, 2));
      }
      return bounds;
    }
    if (compound.ozoneActive && isOzoneOnly(compound)) {
      var ozone0 = getBoundsForOzoneResonanceState(compound, 0);
      var ozone1 = getBoundsForOzoneResonanceState(compound, 1);
      return unionVisualBounds(ozone0, ozone1);
    }
    return compound.getBounds();
  }

  function findNDativeResonanceHubs(compound) {
    var hubs = [];
    for (var i = 0; i < compound.atoms.length; i++) {
      var hub = compound.atoms[i].nDativeHub;
      if (hub && hub.resonanceActive && hub.receiverBondId && hub.type2BondId) {
        hubs.push({ nitrogen: compound.atoms[i], hub: hub });
      }
    }
    return hubs;
  }

  function findNDativeResonanceHub(compound) {
    var hubs = findNDativeResonanceHubs(compound);
    return hubs.length ? hubs[0] : null;
  }

  function normalizeNDativeResonanceHubs(resonanceHubs) {
    if (!resonanceHubs) return [];
    return Array.isArray(resonanceHubs) ? resonanceHubs : [resonanceHubs];
  }

  function isNDativeResonanceReceiverBond(bond, resonanceHubs) {
    var hubs = normalizeNDativeResonanceHubs(resonanceHubs);
    for (var i = 0; i < hubs.length; i++) {
      if (hubs[i].hub && (hubs[i].hub.receiverBondId === bond.id ||
          hubs[i].hub.type3BondId === bond.id)) return true;
    }
    return false;
  }

  function isNDativeResonanceType2Bond(bond, resonanceHubs) {
    var hubs = normalizeNDativeResonanceHubs(resonanceHubs);
    for (var i = 0; i < hubs.length; i++) {
      if (hubs[i].hub && hubs[i].hub.type2BondId === bond.id) return true;
    }
    return false;
  }

  function molExportBondOrder(compound, bond, resonanceHubs) {
    if (bond.order === 'cl_dative') return 1;
    if (bond.order === 'n_dative') return 1;
    if (bond.order === 'p_dative') return 1;
    if (bond.order === 's_dative') return 1;
    if (isNDativeResonanceReceiverBond(bond, resonanceHubs)) return 1;
    if (isNDativeResonanceType2Bond(bond, resonanceHubs)) return 2;
    if (bond.order === 'co_dative') return 3;
    return bondElectronCost(bond.order) || 1;
  }

  function molExportChargeEntries(bond, resonanceHubs, atomIndex) {
    var entries = [];
    if (bond.order === 'co_dative') {
      var coEnds = getCoBondEnds(bond);
      entries.push(
        { idx: atomIndex.get(coEnds.carbon.id), charge: -1 },
        { idx: atomIndex.get(coEnds.oxygen.id), charge: 1 });
    } else if (bond.order === 'n_dative' ||
        isNDativeResonanceReceiverBond(bond, resonanceHubs)) {
      var noEnds = getNoBondEnds(bond);
      entries.push(
        { idx: atomIndex.get(noEnds.nitrogen.id), charge: 1 },
        { idx: atomIndex.get(noEnds.oxygen.id), charge: -1 });
    } else if (bond.order === 'cl_dative') {
      var cloChargeEnds = getClOBondEnds(bond);
      entries.push(
        { idx: atomIndex.get(cloChargeEnds.chlorine.id), charge: 1 },
        { idx: atomIndex.get(cloChargeEnds.oxygen.id), charge: -1 });
    } else if (bond.order === 'p_dative') {
      var poChargeEnds = getPOBondEnds(bond);
      entries.push(
        { idx: atomIndex.get(poChargeEnds.phosphorus.id), charge: 1 },
        { idx: atomIndex.get(poChargeEnds.oxygen.id), charge: -1 });
    } else if (bond.order === 's_dative') {
      var soChargeEnds = getSOBondEnds(bond);
      entries.push(
        { idx: atomIndex.get(soChargeEnds.sulfur.id), charge: 1 },
        { idx: atomIndex.get(soChargeEnds.oxygen.id), charge: -1 });
    }
    return entries;
  }

  function compoundHasNDativeReceiver(compound) {
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      if (compound.bonds[bi].order === 'n_dative') return true;
    }
    for (var ai = 0; ai < compound.atoms.length; ai++) {
      var hub = compound.atoms[ai].nDativeHub;
      if (hub && hub.receiverBondId) return true;
    }
    return false;
  }

  function isAzaneOxide(compound) {
    if (!compoundHasNDativeReceiver(compound)) return false;
    var hCount = 0;
    var nCount = 0;
    var oCount = 0;
    var other = false;
    for (var i = 0; i < compound.atoms.length; i++) {
      var el = compound.atoms[i].element;
      if (el === 'H') hCount += 1;
      else if (el === 'N') nCount += 1;
      else if (el === 'O') oCount += 1;
      else other = true;
    }
    if (other || hCount !== 3 || nCount !== 1 || oCount !== 1) return false;
    var nitrogen = null;
    for (var ai = 0; ai < compound.atoms.length; ai++) {
      if (compound.atoms[ai].element === 'N' && compound.atoms[ai].nDativeHub) {
        nitrogen = compound.atoms[ai];
        break;
      }
    }
    if (!nitrogen) {
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        if (compound.bonds[bi].order !== 'n_dative') continue;
        nitrogen = compound.bonds[bi].atomA.element === 'N' ?
          compound.bonds[bi].atomA : compound.bonds[bi].atomB;
        break;
      }
    }
    if (!nitrogen) return false;
    for (var j = 0; j < compound.bonds.length; j++) {
      var bond = compound.bonds[j];
      if (bond.order === 'n_dative') continue;
      if (bond.order === 'p_dative') continue;
      if (bond.order === 's_dative') continue;
      if (bond.order === 'cl_dative') continue;
      if (bond.atomA.id !== nitrogen.id && bond.atomB.id !== nitrogen.id) continue;
      var partner = bond.atomA.id === nitrogen.id ? bond.atomB : bond.atomA;
      if (partner.element !== 'H') return false;
    }
    return true;
  }

  function countCompoundElements(compound) {
    var counts = { H: 0, C: 0, N: 0, O: 0, other: 0 };
    for (var i = 0; i < compound.atoms.length; i++) {
      var el = compound.atoms[i].element;
      if (el === 'H') counts.H += 1;
      else if (el === 'C') counts.C += 1;
      else if (el === 'N') counts.N += 1;
      else if (el === 'O') counts.O += 1;
      else counts.other += 1;
    }
    return counts;
  }

  function countHydrogensBondedTo(compound, element) {
    var count = 0;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order === 'n_dative') continue;
      if (bond.order === 'p_dative') continue;
      if (bond.order === 's_dative') continue;
      if (bond.order === 'cl_dative') continue;
      var hAtom = null;
      var partner = null;
      if (bond.atomA.element === 'H' && bond.atomB.element === element) {
        hAtom = bond.atomA;
        partner = bond.atomB;
      } else if (bond.atomB.element === 'H' && bond.atomA.element === element) {
        hAtom = bond.atomB;
        partner = bond.atomA;
      }
      if (hAtom && partner) count += 1;
    }
    return count;
  }

  function countChlorineFluorideBonds(compound) {
    var count = 0;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order !== 'single') continue;
      var els = [bond.atomA.element, bond.atomB.element].sort().join('-');
      if (els === 'Cl-F') count += 1;
    }
    return count;
  }

  function countChlorineHydrogenBonds(compound) {
    var count = 0;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.order !== 'single') continue;
      var els = [bond.atomA.element, bond.atomB.element].sort().join('-');
      if (els === 'Cl-H') count += 1;
    }
    return count;
  }

  function resolveChlorineSplitExtSlot(chlorine, clSlot, bond) {
    var pairs = chlorine.clExpansionPairs || [];
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].splitSlot !== clSlot) continue;
      if (pairs[i].extSlot && chlorine.orbitals[pairs[i].extSlot] !== undefined) {
        return pairs[i].extSlot;
      }
    }
    for (var j = 0; j < 3; j++) {
      var candidate = 'ext' + j;
      if (chlorine.orbitals[candidate] === undefined) continue;
      if (findChlorineSplitSlotForExt(chlorine, candidate) === clSlot) return candidate;
    }
    return bond && bond.clSplitExtSlot && chlorine.orbitals[bond.clSplitExtSlot] !== undefined ?
      bond.clSplitExtSlot : null;
  }

  function syncChlorineSplitBondExtSlots(compound) {
    if (!compound) return;
    for (var ci = 0; ci < compound.atoms.length; ci++) {
      var chlorine = compound.atoms[ci];
      if (chlorine.element !== 'Cl') continue;
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        var bond = compound.bonds[bi];
        if (bond.order !== 'single') continue;
        var clSlot = null;
        if (bond.atomA.id === chlorine.id && bond.atomB.element === 'F') clSlot = bond.slotA;
        else if (bond.atomB.id === chlorine.id && bond.atomA.element === 'F') clSlot = bond.slotB;
        if (!clSlot) continue;
        var extSlot = resolveChlorineSplitExtSlot(chlorine, clSlot, bond);
        if (extSlot) bond.clSplitExtSlot = extSlot;
        else delete bond.clSplitExtSlot;
      }
    }
  }

  function countCompoundElement(compound, element) {
    var count = 0;
    for (var i = 0; i < compound.atoms.length; i++) {
      if (compound.atoms[i].element === element) count += 1;
    }
    return count;
  }

  function isChlorineFluorideOnly(compound, fluorineCount) {
    if (!compound) return false;
    if (countCompoundElement(compound, 'Cl') !== 1) return false;
    if (countCompoundElement(compound, 'F') !== fluorineCount) return false;
    var hydrogenCount = countCompoundElement(compound, 'H');
    if (compound.atoms.length !== fluorineCount + 1 + hydrogenCount) return false;
    for (var i = 0; i < compound.atoms.length; i++) {
      var el = compound.atoms[i].element;
      if (el !== 'Cl' && el !== 'F' && el !== 'H') return false;
    }
    if (countChlorineFluorideBonds(compound) !== fluorineCount) return false;
    if (countChlorineHydrogenBonds(compound) !== hydrogenCount) return false;
    if (compound.bonds.length !== fluorineCount + hydrogenCount) return false;
    return compound.atoms.every(function (atom) { return atom.isValenceConsistent(); });
  }

  function isChlorineTrifluoride(compound) {
    return isChlorineFluorideOnly(compound, 3);
  }

  function isChlorinePentafluoride(compound) {
    return isChlorineFluorideOnly(compound, 5);
  }

  function canValidateCompound(compound) {
    if (!compound.isMultiAtom()) return false;
    if (!compound.hasNoFreeElectrons()) return false;
    if (compound.isFullyBalanced()) return true;
    return isChlorineTrifluoride(compound) || isChlorinePentafluoride(compound);
  }

  function hasBondBetween(compound, elA, elB, order) {
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (order && bond.order !== order) continue;
      var a = bond.atomA.element;
      var b = bond.atomB.element;
      if ((a === elA && b === elB) || (a === elB && b === elA)) return true;
    }
    return false;
  }

  // PubChem SMILES lookup cannot distinguish isomers that differ only by H placement
  // (on N vs on O) and N→O dative bonding. Use graph topology for those cases.
  function isMethyleneNitrone(compound) {
    if (!compoundHasNDativeReceiver(compound)) return false;
    var counts = countCompoundElements(compound);
    if (counts.other || counts.H !== 3 || counts.C !== 1 || counts.N !== 1 || counts.O !== 1) {
      return false;
    }
    if (countHydrogensBondedTo(compound, 'N') !== 1) return false;
    if (countHydrogensBondedTo(compound, 'O') !== 0) return false;
    return hasBondBetween(compound, 'N', 'C', 'double');
  }

  function isFormalOxime(compound) {
    if (compoundHasNDativeReceiver(compound)) return false;
    var counts = countCompoundElements(compound);
    if (counts.other || counts.H !== 3 || counts.C !== 1 || counts.N !== 1 || counts.O !== 1) {
      return false;
    }
    if (countHydrogensBondedTo(compound, 'O') !== 1) return false;
    if (countHydrogensBondedTo(compound, 'N') !== 0) return false;
    return hasBondBetween(compound, 'O', 'N', 'single') &&
      hasBondBetween(compound, 'N', 'C', 'double');
  }

  function isNitrylHydrideResonance(compound) {
    var counts = countCompoundElements(compound);
    if (counts.other || counts.H !== 1 || counts.N !== 1 || counts.O !== 2) return false;
    if (!findNDativeResonanceHub(compound)) return false;

    var hydrogen = null;
    for (var ai = 0; ai < compound.atoms.length; ai++) {
      if (compound.atoms[ai].element === 'H') hydrogen = compound.atoms[ai];
    }
    if (!hydrogen) return false;

    var bondedToN = false;
    var bondedToO = false;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      if (bond.atomA.id !== hydrogen.id && bond.atomB.id !== hydrogen.id) continue;
      var partner = bond.atomA.id === hydrogen.id ? bond.atomB : bond.atomA;
      if (partner.element === 'N') bondedToN = true;
      if (partner.element === 'O') bondedToO = true;
    }
    return bondedToN && !bondedToO;
  }

  var CURATED_AZANE_OXIDE = {
    name: 'Azane oxide',
    iupacName: 'Azane oxide',
    molecularFormula: 'H3NO',
    molecularWeight: 33.03,
    cid: null,
    description: 'Azane oxide (ammonia monoxide) is the H3N→O adduct: ammonia donates a lone pair to oxygen ' +
      'through a dative bond, giving a zwitterionic H3N+–O− structure. It is not hydroxylamine (HO–NH2), ' +
      'which has hydrogen on oxygen rather than a dative N→O linkage.',
    sdf3d: '\n  Chemical Discovery Sandbox\n\n' +
      '  5  4  0  0  0  0  0  0  0  0999 V2000\n' +
      '    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    0.0000    1.4500    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -1.0210   -0.4900    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.0210   -0.4900    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    0.0000   -0.9800    0.8900 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '  1  2  1  0  0  0  0\n' +
      '  1  3  1  0  0  0  0\n' +
      '  1  4  1  0  0  0  0\n' +
      '  1  5  1  0  0  0  0\n' +
      'M  CHG  2   1   1   2  -1\n' +
      'M  END\n',
  };

  var CURATED_NITRYL_HYDRIDE = {
    name: 'Nitryl hydride',
    iupacName: 'Nitryl hydride',
    molecularFormula: 'HNO2',
    molecularWeight: 47.014,
    cid: null,
    description: 'Nitryl hydride (also called isonitrous acid) is an HNO2 isomer with hydrogen bonded ' +
      'directly to nitrogen and two oxygen atoms in resonance (H–N(=O)↔O). It is distinct from nitrous ' +
      'acid (HONO), where hydrogen is on oxygen and there is no N→O dative resonance.',
    sdf3d: '\n  Chemical Discovery Sandbox\n\n' +
      '  4  3  0  0  0  0  0  0  0  0999 V2000\n' +
      '    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.2200    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -0.6000    1.3000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -1.0200   -0.4900    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '  1  2  2  0  0  0  0\n' +
      '  1  3  1  0  0  0  0\n' +
      '  1  4  1  0  0  0  0\n' +
      'M  CHG  2   1   1   3  -1\n' +
      'M  END\n',
  };

  var CURATED_NITRONE = {
    name: 'Nitrone',
    iupacName: 'Methylene nitrone',
    molecularFormula: 'CH3NO',
    molecularWeight: 45.041,
    cid: null,
    description: 'A nitrone is an N-oxide of an imine: the nitrogen bears hydrogen and is datively ' +
      'bonded to oxygen (H–N→O), with a C=N double bond. This is not formaldoxime (HO–N=CH2), ' +
      'where hydrogen sits on oxygen and there is no N→O dative bond.',
    sdf3d: '\n  Chemical Discovery Sandbox\n\n' +
      '  6  5  0  0  0  0  0  0  0  0999 V2000\n' +
      '    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.3000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -1.0500    1.2000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -0.6500   -0.4500    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.8500    0.9000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.8500   -0.9000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '  1  2  2  0  0  0  0\n' +
      '  1  3  1  0  0  0  0\n' +
      '  1  4  1  0  0  0  0\n' +
      '  2  5  1  0  0  0  0\n' +
      '  2  6  1  0  0  0  0\n' +
      'M  CHG  2   1   1   3  -1\n' +
      'M  END\n',
  };

  var CURATED_CHLORINE_TRIFLUORIDE = {
    name: 'Chlorine trifluoride',
    iupacName: 'Chlorine trifluoride',
    molecularFormula: 'ClF3',
    molecularWeight: 92.45,
    cid: 66217,
    description: 'Chlorine trifluoride (ClF3) is an interhalogen compound with a T-shaped geometry: ' +
      'chlorine bonded to three fluorine atoms with two equatorial lone pairs.',
    sdf3d: '\n  Chemical Discovery Sandbox\n\n' +
      '  4  3  0  0  0  0  0  0  0  0999 V2000\n' +
      '    0.0000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.6000    0.0000    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -0.8000    1.3860    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -0.8000   -1.3860    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '  1  2  1  0  0  0  0\n' +
      '  1  3  1  0  0  0  0\n' +
      '  1  4  1  0  0  0  0\n' +
      'M  END\n',
  };

  var CURATED_CHLORINE_PENTAFLUORIDE = {
    name: 'Chlorine pentafluoride',
    iupacName: 'Chlorine pentafluoride',
    molecularFormula: 'ClF5',
    molecularWeight: 130.45,
    cid: 66227,
    description: 'Chlorine pentafluoride (ClF5) is an interhalogen compound with square-pyramidal ' +
      'geometry: chlorine bonded to five fluorine atoms.',
    sdf3d: '\n  Chemical Discovery Sandbox\n\n' +
      '  6  5  0  0  0  0  0  0  0  0999 V2000\n' +
      '    0.0000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.6000    0.0000    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -0.8000    1.3860    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '   -0.8000   -1.3860    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    0.0000    0.0000    1.6000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    0.0000    0.0000   -1.6000 F   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '  1  2  1  0  0  0  0\n' +
      '  1  3  1  0  0  0  0\n' +
      '  1  4  1  0  0  0  0\n' +
      '  1  5  1  0  0  0  0\n' +
      '  1  6  1  0  0  0  0\n' +
      'M  END\n',
  };

  var CURATED_FORMALDOXIME = {
    name: 'Formaldoxime',
    iupacName: 'N-methylidenehydroxylamine',
    molecularFormula: 'CH3NO',
    molecularWeight: 45.041,
    cid: null,
    description: 'Formaldoxime (methanal oxime) has the oxime arrangement HO–N=CH2: hydrogen is on ' +
      'oxygen, with a single O–N bond and an N=C double bond. It is not a nitrone, which requires ' +
      'hydrogen on nitrogen and a dative N→O bond.',
    sdf3d: '\n  Chemical Discovery Sandbox\n\n' +
      '  6  5  0  0  0  0  0  0  0  0999 V2000\n' +
      '   -1.3000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    1.3000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    2.6000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    3.1500    0.9000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '    3.1500   -0.9000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n' +
      '  1  2  1  0  0  0  0\n' +
      '  2  3  1  0  0  0  0\n' +
      '  3  4  2  0  0  0  0\n' +
      '  4  5  1  0  0  0  0\n' +
      '  4  6  1  0  0  0  0\n' +
      'M  END\n',
  };

  function applyCuratedIdentification(pubchemResult, curated) {
    var merged = Object.assign({}, pubchemResult || { found: true }, curated, {
      found: true,
      localOverride: true,
    });
    return merged;
  }

  function resolveCuratedIdentification(compound, pubchemResult) {
    if (isAzaneOxide(compound)) {
      return applyCuratedIdentification(pubchemResult, CURATED_AZANE_OXIDE);
    }
    if (isNitrylHydrideResonance(compound)) {
      return applyCuratedIdentification(pubchemResult, CURATED_NITRYL_HYDRIDE);
    }
    if (isMethyleneNitrone(compound)) {
      return applyCuratedIdentification(pubchemResult, CURATED_NITRONE);
    }
    if (isFormalOxime(compound)) {
      return applyCuratedIdentification(pubchemResult, CURATED_FORMALDOXIME);
    }
    if (isChlorineTrifluoride(compound)) {
      return applyCuratedIdentification(pubchemResult, CURATED_CHLORINE_TRIFLUORIDE);
    }
    if (isChlorinePentafluoride(compound)) {
      return applyCuratedIdentification(pubchemResult, CURATED_CHLORINE_PENTAFLUORIDE);
    }
    return pubchemResult;
  }

  function pubchemNameIsUsable(result) {
    if (!result || !result.found) return false;
    function usable(name) {
      if (!name || typeof name !== 'string') return false;
      var trimmed = name.trim();
      if (!trimmed || trimmed === 'Unknown') return false;
      if (/^CID\s+\d+$/i.test(trimmed)) return false;
      return true;
    }
    return usable(result.name) || usable(result.iupacName);
  }

  function restoreNitrogenFromRemainingBonds(nitrogen, compound, loneSlot, electronResolver) {
    for (var i = 0; i < compound.bonds.length; i++) {
      var bond = compound.bonds[i];
      if (bond.atomA.id !== nitrogen.id && bond.atomB.id !== nitrogen.id) continue;
      nitrogen.orbitals[bondSlotForAtom(bond, nitrogen)] = bond.order;
    }

    var bondSlots = new Set();
    var bondCost = 0;
    for (var j = 0; j < compound.bonds.length; j++) {
      var b = compound.bonds[j];
      if (b.atomA.id === nitrogen.id || b.atomB.id === nitrogen.id) {
        var nSlot = bondSlotForAtom(b, nitrogen);
        bondSlots.add(nSlot);
        bondCost += bondAtomElectronCost(nitrogen, b.order);
      }
    }

    var useLoneSlot = loneSlot && !bondSlots.has(loneSlot) ? loneSlot : null;
    var reserved = 0;
    var pinned = new Set(bondSlots);
    if (useLoneSlot) {
      nitrogen.orbitals[useLoneSlot] = 2;
      pinned.add(useLoneSlot);
      reserved += 2;
    }
    for (var slot of ['up', 'down', 'left', 'right']) {
      if (bondSlots.has(slot) || slot === useLoneSlot) continue;
      var val = nitrogen.orbitals[slot];
      if (val === 2) {
        reserved += 2;
        pinned.add(slot);
      } else if (val === 1) {
        reserved += 1;
      }
    }

    var budget = nitrogen.maxElectrons - bondCost - reserved;
    if (budget > 0 && electronResolver) {
      electronResolver.distributeReleasedElectrons(nitrogen, budget, pinned);
    }
  }

  function restoreNitrogenAfterNDativeBreak(nitrogen, compound, loneSlot, electronResolver) {
    if (loneSlot) nitrogen.orbitals[loneSlot] = 0;
    restoreNitrogenFromRemainingBonds(nitrogen, compound, loneSlot, electronResolver);
  }

  function isOxygenDiatomic(compound) {
    if (!compound || compound.atoms.length !== 2 || compound.bonds.length !== 1) return false;
    return compound.atoms[0].element === 'O' && compound.atoms[1].element === 'O';
  }

  function breakOxygenDiatomicDouble(bond) {
    bond.order = 'single';
    layoutOzoneTerminalSingleOuter(bond.atomA, bondSlotForAtom(bond, bond.atomA));
    layoutOzoneTerminalSingleOuter(bond.atomB, bondSlotForAtom(bond, bond.atomB));
  }

  function layoutOzoneTerminalSingleOuter(atom, bondSlot) {
    var outer = oppositeOrbitalSlot(bondSlot);
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) atom.orbitals[slots[i]] = 0;
    atom.orbitals[bondSlot] = 'single';
    atom.orbitals[outer] = 1;
    var perp = slots.filter(function (s) { return s !== bondSlot && s !== outer; });
    atom.orbitals[perp[0]] = 2;
    atom.orbitals[perp[1]] = 2;
  }

  function layoutOxygenDimerSingle(bond) {
    bond.order = 'single';
    layoutOzoneTerminalSingleOuter(bond.atomA, bondSlotForAtom(bond, bond.atomA));
    layoutOzoneTerminalSingleOuter(bond.atomB, bondSlotForAtom(bond, bond.atomB));
  }

  function isOzoneOnly(compound) {
    if (!compound || compound.atoms.length !== 3 || compound.bonds.length !== 2) return false;
    for (var i = 0; i < compound.atoms.length; i++) {
      if (compound.atoms[i].element !== 'O') return false;
    }
    var degrees = compound.atoms.map(function (atom) {
      return compound.bonds.filter(function (b) {
        return b.atomA.id === atom.id || b.atomB.id === atom.id;
      }).length;
    }).sort(function (a, b) { return a - b; });
    return degrees[0] === 1 && degrees[1] === 1 && degrees[2] === 2;
  }

  function getOzoneChain(compound) {
    if (!isOzoneOnly(compound)) return null;
    var center = null;
    var terminals = [];
    for (var ai = 0; ai < compound.atoms.length; ai++) {
      var atom = compound.atoms[ai];
      var deg = compound.bonds.filter(function (b) {
        return b.atomA.id === atom.id || b.atomB.id === atom.id;
      }).length;
      if (deg === 2) center = atom;
      else if (deg === 1) terminals.push(atom);
    }
    if (!center || terminals.length !== 2) return null;
    var left;
    var right;
    if (Math.abs(terminals[0].x - terminals[1].x) >= Math.abs(terminals[0].y - terminals[1].y)) {
      left = terminals[0].x <= terminals[1].x ? terminals[0] : terminals[1];
      right = left === terminals[0] ? terminals[1] : terminals[0];
    } else {
      left = terminals[0].y <= terminals[1].y ? terminals[0] : terminals[1];
      right = left === terminals[0] ? terminals[1] : terminals[0];
    }
    var bondLeft = null;
    var bondRight = null;
    for (var bi = 0; bi < compound.bonds.length; bi++) {
      var bond = compound.bonds[bi];
      var ids = [bond.atomA.id, bond.atomB.id];
      if (ids.indexOf(left.id) !== -1 && ids.indexOf(center.id) !== -1) bondLeft = bond;
      if (ids.indexOf(center.id) !== -1 && ids.indexOf(right.id) !== -1) bondRight = bond;
    }
    if (!bondLeft || !bondRight) return null;
    return { left: left, center: center, right: right, bondLeft: bondLeft, bondRight: bondRight };
  }

  function clearOzoneState(compound) {
    compound.ozoneActive = false;
    compound.ozoneResonanceState = 0;
    for (var i = 0; i < compound.atoms.length; i++) {
      compound.atoms[i].ozoneFormalCharge = 0;
    }
  }

  function resetAtomOrbitals(atom) {
    atom.ozoneFormalCharge = 0;
    atom.orbitals = { up: 0, down: 0, left: 0, right: 0 };
    atom.clOrbitalCount = null;
    atom.clSlotAngles = null;
    atom.clExpansionPairs = null;
    atom.clFixedAnchorSlot = null;
    clearFluorineBondLayout(atom);
    atom.initializeOrbitals();
    if (atom.element === 'Cl') ensureChlorineOrbitalLayout(atom);
  }

  function layoutCoSingleBond(carbon, oxygen, carbonSlot, oxygenSlot) {
    var cSlots = ['up', 'down', 'left', 'right'];
    for (var ci = 0; ci < cSlots.length; ci++) carbon.orbitals[cSlots[ci]] = 0;
    carbon.orbitals[carbonSlot] = 'single';
    for (var cj = 0; cj < cSlots.length; cj++) {
      if (cSlots[cj] !== carbonSlot) carbon.orbitals[cSlots[cj]] = 1;
    }
    layoutOzoneTerminalSingle(oxygen, oxygenSlot);
  }

  function layoutOzoneTerminalSingle(atom, bondSlot) {
    var opp = oppositeOrbitalSlot(bondSlot);
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) atom.orbitals[slots[i]] = 0;
    atom.orbitals[bondSlot] = 'single';
    atom.orbitals[opp] = 2;
    var extras = slots.filter(function (s) { return s !== bondSlot && s !== opp; });
    atom.orbitals[extras[0]] = 2;
    atom.orbitals[extras[1]] = 1;
  }

  function layoutOzoneCenterSingles(atom, slotA, slotB) {
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) atom.orbitals[slots[i]] = 0;
    atom.orbitals[slotA] = 'single';
    atom.orbitals[slotB] = 'single';
    var free = slots.filter(function (s) { return s !== slotA && s !== slotB; });
    atom.orbitals[free[0]] = 2;
    atom.orbitals[free[1]] = 2;
  }

  function layoutOzoneSingleBonds(compound) {
    var chain = getOzoneChain(compound);
    if (!chain) return false;
    clearOzoneState(compound);
    chain.bondLeft.order = 'single';
    chain.bondRight.order = 'single';
    layoutOzoneTerminalSingleOuter(chain.left, bondSlotForAtom(chain.bondLeft, chain.left));
    layoutOzoneCenterSingles(
      chain.center,
      bondSlotForAtom(chain.bondLeft, chain.center),
      bondSlotForAtom(chain.bondRight, chain.center));
    layoutOzoneTerminalSingleOuter(chain.right, bondSlotForAtom(chain.bondRight, chain.right));
    return compound.atoms.every(function (a) {
      return a.isValenceConsistent();
    });
  }

  function layoutOxygenDimerDouble(bond) {
    bond.order = 'double';
    layoutOzoneTerminalDouble(bond.atomA, bondSlotForAtom(bond, bond.atomA));
    layoutOzoneTerminalDouble(bond.atomB, bondSlotForAtom(bond, bond.atomB));
  }

  function restoreOxygenAfterOzoneBreak(compound) {
    var remainingBond = compound.bonds.length === 1 ? compound.bonds[0] : null;
    for (var i = 0; i < compound.atoms.length; i++) {
      var atom = compound.atoms[i];
      atom.ozoneFormalCharge = 0;
      var bonds = compound.bonds.filter(function (b) {
        return b.atomA.id === atom.id || b.atomB.id === atom.id;
      });
      if (bonds.length === 0) {
        resetAtomOrbitals(atom);
      }
    }
    if (remainingBond &&
        remainingBond.atomA.element === 'O' &&
        remainingBond.atomB.element === 'O') {
      layoutOxygenDimerSingle(remainingBond);
    }
  }

  function layoutOzoneTerminalDouble(atom, bondSlot) {
    var opp = oppositeOrbitalSlot(bondSlot);
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) atom.orbitals[slots[i]] = 0;
    atom.orbitals[bondSlot] = 'double';
    atom.orbitals[opp] = 2;
    var extras = slots.filter(function (s) { return s !== bondSlot && s !== opp; });
    atom.orbitals[extras[0]] = 2;
    atom.orbitals[extras[1]] = 0;
  }

  function layoutOzoneTerminalMinus(atom, bondSlot) {
    var slots = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < slots.length; i++) {
      atom.orbitals[slots[i]] = slots[i] === bondSlot ? 'single' : 2;
    }
  }

  function layoutOzoneCenterPlus(atom, slotDouble, slotSingle) {
    var slots = ['up', 'down', 'left', 'right'];
    var loneSlot = null;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] !== slotDouble && slots[i] !== slotSingle) {
        if (!loneSlot) loneSlot = slots[i];
      }
    }
    for (var j = 0; j < slots.length; j++) atom.orbitals[slots[j]] = 0;
    atom.orbitals[slotDouble] = 'double';
    atom.orbitals[slotSingle] = 'single';
    atom.orbitals[loneSlot] = 2;
  }

  function isOrbitalAvailable(val) {
    return val === 0 || val === 1;
  }

  function orbitalElectronCount(val, atom) {
    if (val === 0) return 0;
    if (val === 1) return 1;
    if (val === 2) return 2;
    if (isBondValue(val)) return bondAtomElectronCost(atom, val);
    return 0;
  }

  function angleToSlot(angleDeg) {
    const a = ((angleDeg % 360) + 360) % 360;
    if (a >= 315 || a < 45) return 'right';
    if (a >= 45 && a < 135) return 'down';
    if (a >= 135 && a < 225) return 'left';
    return 'up';
  }

  function approachAngle(fromX, fromY, toX, toY) {
    return (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
  }

  function distancePointToSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    var t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function bondEdgeEndpoints(bond) {
    return {
      x1: bond.atomA.x,
      y1: bond.atomA.y,
      x2: bond.atomB.x,
      y2: bond.atomB.y,
    };
  }

  function createOrbitalDisplay(val, ox, oy, slot, element, atomX, atomY, options) {
    var objects = [];
    var electronFill = '#f1c40f';
    var wx = atomX + ox;
    var wy = atomY + oy;
    var dativeLonePair = options && options.dativeLonePair;
    var protectedLonePair = options && options.protectedLonePair;

    if (isBondValue(val)) {
      return objects;
    }

    if (val === 0) {
      return objects;
    } else if (val === 1) {
      objects.push(new fabric.Circle({
        radius: getElectronRadius(), fill: electronFill, stroke: '#d4a017', strokeWidth: 1,
        left: wx, top: wy, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      }));
    } else if (val === 2) {
      var perp = options && options.pairPerp;
      if (!perp) {
        var pairOffset = getPairElectronOffset();
        perp = (slot === 'up' || slot === 'down')
          ? { x: pairOffset, y: 0 }
          : { x: 0, y: pairOffset };
      }
      var pairFill = protectedLonePair ? '#ffffff' : (dativeLonePair ? '#ff6eb4' : '#ffffff');
      var pairStroke = protectedLonePair ? '#b0b8c4' : (dativeLonePair ? '#e0569a' : '#b0b8c4');
      objects.push(new fabric.Circle({
        radius: getElectronRadius(), fill: pairFill, stroke: pairStroke, strokeWidth: 1,
        left: wx - perp.x, top: wy - perp.y, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      }));
      objects.push(new fabric.Circle({
        radius: getElectronRadius(), fill: pairFill, stroke: pairStroke, strokeWidth: 1,
        left: wx + perp.x, top: wy + perp.y, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      }));
    }
    return objects;
  }

  function partitionCompoundByBonds(compound) {
    var adjacency = new Map();
    for (var i = 0; i < compound.atoms.length; i++) {
      adjacency.set(compound.atoms[i].id, []);
    }
    for (var j = 0; j < compound.bonds.length; j++) {
      var bond = compound.bonds[j];
      adjacency.get(bond.atomA.id).push(bond.atomB.id);
      adjacency.get(bond.atomB.id).push(bond.atomA.id);
    }

    var visited = new Set();
    var parts = [];
    for (var a = 0; a < compound.atoms.length; a++) {
      var start = compound.atoms[a];
      if (visited.has(start.id)) continue;

      var ids = new Set();
      var stack = [start.id];
      visited.add(start.id);
      while (stack.length) {
        var id = stack.pop();
        ids.add(id);
        var neighbors = adjacency.get(id) || [];
        for (var n = 0; n < neighbors.length; n++) {
          var nid = neighbors[n];
          if (!visited.has(nid)) {
            visited.add(nid);
            stack.push(nid);
          }
        }
      }

      parts.push({
        atoms: compound.atoms.filter(function (atom) { return ids.has(atom.id); }),
        bonds: compound.bonds.filter(function (bond) {
          return ids.has(bond.atomA.id) && ids.has(bond.atomB.id);
        }),
      });
    }
    return parts;
  }

  function syncLayoutInsets() {
    var toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      document.documentElement.style.setProperty('--toolbar-height', toolbar.offsetHeight + 'px');
    }
    var toolbox = document.getElementById('atom-toolbox');
    var basicPalette = document.getElementById('atom-palette');
    if (!toolbox || !basicPalette) return;
    var style = window.getComputedStyle(toolbox);
    var padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    var borderY = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    var stackHeight = basicPalette.offsetHeight + padY + borderY + 147;
    document.documentElement.style.setProperty('--left-toolbox-stack-height', stackHeight + 'px');
  }

  function getTooltipText(el) {
    if (el.hasAttribute('data-tooltip-collapsed')) {
      var toolbox = el.closest('#atom-toolbox');
      return toolbox && toolbox.classList.contains('expanded')
        ? el.getAttribute('data-tooltip-expanded')
        : el.getAttribute('data-tooltip-collapsed');
    }
    return el.getAttribute('data-tooltip');
  }

  function setupTooltips() {
    var TOOLTIP_HOVER_DELAY_MS = 1000;

    var tip = document.createElement('div');
    tip.id = 'ui-tooltip';
    tip.className = 'ui-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);

    var activeEl = null;
    var pendingTarget = null;
    var pendingSince = 0;
    var showTimer = null;

    function clearPending() {
      pendingTarget = null;
      pendingSince = 0;
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
    }

    function hideTooltip() {
      activeEl = null;
      tip.classList.remove('visible');
      clearPending();
    }

    function showTooltip(el) {
      activeEl = el;
      clearPending();
      positionTooltip(el);
    }

    function armShowTimer() {
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(function () {
        showTimer = null;
        if (pendingTarget && Date.now() - pendingSince >= TOOLTIP_HOVER_DELAY_MS) {
          showTooltip(pendingTarget);
        }
      }, TOOLTIP_HOVER_DELAY_MS);
    }

    function beginPending(el) {
      if (activeEl === el && tip.classList.contains('visible')) {
        positionTooltip(el);
        return;
      }
      pendingTarget = el;
      pendingSince = Date.now();
      tip.classList.remove('visible');
      activeEl = null;
      armShowTimer();
    }

    function positionTooltip(el) {
      var rect = el.getBoundingClientRect();
      var gap = 8;
      var edgePad = 8;

      tip.textContent = getTooltipText(el);
      tip.style.left = '0px';
      tip.style.top = '0px';
      tip.style.transform = 'none';
      tip.classList.add('visible');
      tip.style.visibility = 'hidden';

      var tipW = tip.offsetWidth;
      var tipH = tip.offsetHeight;
      tip.style.visibility = '';

      var left = rect.left + rect.width / 2 - tipW / 2;
      left = Math.max(edgePad, Math.min(left, window.innerWidth - tipW - edgePad));

      var top = rect.top - gap - tipH;
      if (top < edgePad) {
        top = rect.bottom + gap;
      }
      top = Math.max(edgePad, Math.min(top, window.innerHeight - tipH - edgePad));

      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }

    function findTooltipTargetAt(x, y) {
      var trash = document.getElementById('canvas-trash-bin');
      if (trash) {
        var trashRect = trash.getBoundingClientRect();
        if (x >= trashRect.left && x <= trashRect.right &&
            y >= trashRect.top && y <= trashRect.bottom) {
          return trash;
        }
      }
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest('[data-tooltip], [data-tooltip-collapsed]');
    }

    function bindTooltip(el) {
      if (!getTooltipText(el)) return;

      el.addEventListener('mouseenter', function () {
        beginPending(el);
      });
      el.addEventListener('mousemove', function () {
        if (activeEl === el) positionTooltip(el);
      });
      el.addEventListener('mouseleave', hideTooltip);
      el.addEventListener('focus', function () {
        beginPending(el);
      });
      el.addEventListener('blur', hideTooltip);
    }

    document.querySelectorAll('[data-tooltip], [data-tooltip-collapsed]').forEach(bindTooltip);

    window.addEventListener('resize', function () {
      if (activeEl) positionTooltip(activeEl);
    });

    return {
      bind: bindTooltip,
      refresh: function (el) {
        if (activeEl === el) positionTooltip(el);
        else if (pendingTarget === el) beginPending(el);
      },
      syncHoverAt: function (x, y) {
        var target = findTooltipTargetAt(x, y);
        if (!target) {
          hideTooltip();
          return;
        }
        if (activeEl === target && tip.classList.contains('visible')) {
          positionTooltip(target);
          return;
        }
        if (pendingTarget !== target) beginPending(target);
      },
    };
  }

  // ── Atom ───────────────────────────────────────────────────────────
  const VALENCE = { C: 4, H: 1, O: 6, N: 5, F: 7, Cl: 7, P: 5, S: 6 };

  class Atom {
    constructor(element, x, y) {
      this.id = generateUniqueId();
      this.element = element;
      this.x = x;
      this.y = y;
      this.compoundId = null;
      this.maxElectrons = VALENCE[element] ?? 4;
      this.ozoneFormalCharge = 0;
      this.nDativeHub = null;
      this.orbitals = { up: 0, down: 0, left: 0, right: 0 };
      this.initializeOrbitals();
      if (element === 'Cl') ensureChlorineOrbitalLayout(this);
    }

    initializeOrbitals() {
      const slots = ['up', 'down', 'left', 'right'];
      let remaining = this.maxElectrons;
      for (const slot of slots) {
        if (remaining <= 0) { this.orbitals[slot] = 0; continue; }
        if (remaining >= 2 && (this.element === 'O' || this.element === 'S') && (slot === 'up' || slot === 'down')) {
          this.orbitals[slot] = 2; remaining -= 2;
        } else if (remaining >= 2 && (this.element === 'N' || this.element === 'P') && slot === 'up') {
          this.orbitals[slot] = 2; remaining -= 2;
        } else if (remaining >= 2 && (this.element === 'F' || this.element === 'Cl') &&
                   (slot === 'up' || slot === 'down' || slot === 'left')) {
          this.orbitals[slot] = 2; remaining -= 2;
        } else {
          this.orbitals[slot] = 1; remaining -= 1;
        }
      }
    }

    totalOrbitalElectrons() {
      var self = this;
      return Object.values(this.orbitals).reduce(function (sum, val) {
        return sum + orbitalElectronCount(val, self);
      }, 0);
    }

    countFreeElectrons() {
      return Object.values(this.orbitals).filter((v) => v === 1).length;
    }

    countEmptySlots() {
      return Object.values(this.orbitals).filter((v) => v === 0).length;
    }

    isValenceConsistent() {
      var target = this.maxElectrons - (this.ozoneFormalCharge || 0);
      return this.totalOrbitalElectrons() === target;
    }

    findFreeElectronSlot(excludeSlot) {
      for (const [slot, val] of Object.entries(this.orbitals)) {
        if (slot !== excludeSlot && val === 1) return slot;
      }
      return null;
    }

    maxAchievableBondOrder(slot) {
      const current = isBondValue(this.orbitals[slot]) ? bondAtomElectronCost(this, this.orbitals[slot]) : 0;
      return Math.min(3, current + this.countFreeElectrons());
    }

    isBalanced() {
      return this.countFreeElectrons() === 0 && this.countEmptySlots() === 0 && this.isValenceConsistent();
    }

    rotateOrbitals90() {
      if (isBenzeneRingCarbon(this)) {
        rotateBenzeneSlotAngles(this, 90);
        return;
      }
      const o = this.orbitals;
      this.orbitals = {
        up: o.left,
        right: o.up,
        down: o.right,
        left: o.down,
      };
    }
  }

  // ── Bond ───────────────────────────────────────────────────────────
  class Bond {
    constructor(atomA, atomB, slotA, slotB, order) {
      this.id = generateUniqueId();
      this.atomA = atomA;
      this.atomB = atomB;
      this.slotA = slotA;
      this.slotB = slotB;
      this.order = order || 'single';
    }
  }

  // ── Compound ───────────────────────────────────────────────────────
  class Compound {
    constructor(atoms) {
      this.id = generateUniqueId();
      this.atoms = atoms ? atoms.slice() : [];
      this.bonds = [];
      this.name = null;
      this.metadata = null;
      this.validationState = 'pending';
      this.structureKeyAtValidation = null;
      this.ozoneActive = false;
      this.ozoneResonanceState = 0;
      this.benzeneRings = [];
      for (const atom of this.atoms) atom.compoundId = this.id;
    }

    invalidateIdentification() {
      this.name = null;
      this.metadata = null;
      this.validationState = 'pending';
      this.structureKeyAtValidation = null;
      this._validationStructureKey = null;
    }

    structureKey() {
      const posKey = (atom) =>
        atom.element + '@' + Math.round(atom.x / GRID_SPACING) + ',' + Math.round(atom.y / GRID_SPACING);
      const posById = new Map(this.atoms.map((a) => [a.id, posKey(a)]));
      const atomPart = Array.from(posById.values()).sort().join('|');
      if (this.ozoneActive && isOzoneOnly(this)) {
        return atomPart + '||ozone';
      }
      if (this.atoms.some(function (a) { return a.nDativeHub && a.nDativeHub.resonanceActive; })) {
        return atomPart + '||ndres';
      }
      var ringBondIds = benzeneRingBondIdSet(this);
      const bondPart = this.bonds.map((b) => {
        const k1 = posById.get(b.atomA.id);
        const k2 = posById.get(b.atomB.id);
        const orderKey = ringBondIds.has(b.id) && compoundHasActiveBenzeneResonance(this) ? 'ar' :
          b.order === 'co_dative' ? '3d' :
          b.order === 'n_dative' ? 'nd' :
          b.order === 'p_dative' ? 'pd' :
          b.order === 's_dative' ? 'sd' :
          b.order === 'cl_dative' ? 'cld' : String(bondElectronCost(b.order));
        return orderKey + ':' + [k1, k2].sort().join('-');
      }).sort().join('|');
      return atomPart + '||' + bondPart;
    }

    identificationKey() {
      var atomPart = this.atoms.map(function (a) { return a.id + ':' + a.element; }).sort().join('|');
      var ringBondIds = benzeneRingBondIdSet(this);
      var resonating = compoundHasActiveBenzeneResonance(this);
      var bondPart = this.bonds.map(function (b) {
        var orderKey = ringBondIds.has(b.id) && resonating ? 'ar' :
          b.order === 'co_dative' ? '3d' :
          b.order === 'n_dative' ? 'nd' :
          b.order === 'p_dative' ? 'pd' :
          b.order === 's_dative' ? 'sd' :
          b.order === 'cl_dative' ? 'cld' : String(bondElectronCost(b.order));
        return orderKey + ':' + [b.atomA.id, b.atomB.id].sort().join('-');
      }).sort().join('|');
      var extra = '';
      if (this.ozoneActive && isOzoneOnly(this)) extra += '||ozone';
      if (this.atoms.some(function (a) { return a.nDativeHub && a.nDativeHub.resonanceActive; })) {
        extra += '||ndres';
      }
      if (resonating) extra += '||bzres';
      return atomPart + '||' + bondPart + extra;
    }

    hasNoFreeElectrons() {
      return this.atoms.every((a) => a.countFreeElectrons() === 0);
    }

    addAtom(atom) {
      if (!this.atoms.find((a) => a.id === atom.id)) {
        this.atoms.push(atom);
        atom.compoundId = this.id;
      }
    }

    addBond(bond) {
      if (!this.bonds.find((b) => b.id === bond.id)) {
        this.bonds.push(bond);
        this.invalidateIdentification();
      }
    }

    removeBond(bondId) {
      this.bonds = this.bonds.filter((b) => b.id !== bondId);
      this.invalidateIdentification();
    }

    isMultiAtom() { return this.atoms.length > 1; }

    atomHasBonds(atom) {
      return this.bonds.some(function (b) {
        return b.atomA.id === atom.id || b.atomB.id === atom.id;
      });
    }

    isFullyBalanced() {
      if (!this.isMultiAtom()) return false;
      return this.hasNoFreeElectrons();
    }

    getCenter() {
      const bounds = this.getBounds();
      return { x: bounds.centerX, y: bounds.centerY };
    }

    getBounds() {
      const slots = ['up', 'down', 'left', 'right'];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      const includeCircle = (cx, cy, radius) => {
        minX = Math.min(minX, cx - radius);
        minY = Math.min(minY, cy - radius);
        maxX = Math.max(maxX, cx + radius);
        maxY = Math.max(maxY, cy + radius);
      };

      for (const atom of this.atoms) {
        includeCircle(atom.x, atom.y, getAtomRadius(atom.element));
        for (const slot of getAtomOrbitalSlots(atom)) {
          const val = atom.orbitals[slot];
          if (isBondValue(val) || val === 0) continue;
          const pos = getOrbitalPosition(slot, atom.element, atom);
          const wx = atom.x + pos.x;
          const wy = atom.y + pos.y;
          if (val === 1) {
            includeCircle(wx, wy, getElectronRadius());
          } else if (val === 2) {
            const perp = getOrbitalPairPerp(atom, slot);
            includeCircle(wx - perp.x, wy - perp.y, getElectronRadius());
            includeCircle(wx + perp.x, wy + perp.y, getElectronRadius());
          }
        }
      }

      return {
        left: minX,
        top: minY,
        right: maxX,
        bottom: maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };
    }

    getLabelPlacementBounds() {
      return getCompoundLabelPlacementBounds(this);
    }

    translate(dx, dy) {
      for (const atom of this.atoms) { atom.x += dx; atom.y += dy; }
    }

    merge(other) {
      for (const atom of other.atoms) this.addAtom(atom);
      for (const bond of other.bonds) this.addBond(bond);
      transferBenzeneState(other, this);
      this.invalidateIdentification();
      return this;
    }

    hasInternalOverlap() {
      const positions = new Set();
      for (const atom of this.atoms) {
        const key = Math.round(atom.x / GRID_SPACING) + ',' + Math.round(atom.y / GRID_SPACING);
        if (positions.has(key)) return true;
        positions.add(key);
      }
      return false;
    }

    checkExternalOverlap(allCompounds) {
      const ownIds = new Set(this.atoms.map((a) => a.id));
      for (const atom of this.atoms) {
        const ax = Math.round(atom.x / GRID_SPACING);
        const ay = Math.round(atom.y / GRID_SPACING);
        for (const other of allCompounds) {
          if (other.id === this.id) continue;
          for (const oa of other.atoms) {
            const ox = Math.round(oa.x / GRID_SPACING);
            const oy = Math.round(oa.y / GRID_SPACING);
            if (ax === ox && ay === oy && !ownIds.has(oa.id)) return true;
          }
        }
      }
      return false;
    }

    rotateAroundAtom(pivot) {
      if (this.benzeneRings && this.benzeneRings.length) {
        return this.rotateBenzeneLayout(pivot);
      }
      var clHub = findCompoundChlorineHub(this);
      if (clHub) {
        return this.rotateExpandedChlorineLayout(clHub);
      }

      const px = pivot.x;
      const py = pivot.y;

      for (const atom of this.atoms) {
        if (atom.id === pivot.id) continue;
        const rotated = rotatePointCW(px, py, atom.x, atom.y);
        atom.x = snapToPixel(rotated.x);
        atom.y = snapToPixel(rotated.y);
      }

      for (const atom of this.atoms) {
        if (atom.element === 'F' && atom.fSlotAngles) {
          rotateFluorineLayoutCW(atom);
        } else if (atom.element === 'Cl' && atom.clSlotAngles) {
          rotateChlorineLayoutCW(atom);
        } else {
          atom.rotateOrbitals90();
        }
      }

      for (const bond of this.bonds) {
        bond.slotA = rotateSlotCW(bond.slotA);
        bond.slotB = rotateSlotCW(bond.slotB);
      }

      syncChlorineExpansionBondMetadata(this);
      reconcileAllChlorineInCompound(this);
      reorientAllChlorineFluorines(this);
      return true;
    }

    rotateBenzeneLayout(pivot) {
      var carbons = this.atoms.filter(isBenzeneRingCarbon);
      if (!carbons.length) return false;
      var px;
      var py;
      if (pivot) {
        px = pivot.x;
        py = pivot.y;
      } else {
        px = 0;
        py = 0;
        for (var ci = 0; ci < carbons.length; ci++) {
          px += carbons[ci].x;
          py += carbons[ci].y;
        }
        px /= carbons.length;
        py /= carbons.length;
      }

      for (var ai = 0; ai < this.atoms.length; ai++) {
        var atom = this.atoms[ai];
        if (!pivot || atom.id !== pivot.id) {
          var rotated = rotatePointCW(px, py, atom.x, atom.y);
          atom.x = snapToPixel(rotated.x);
          atom.y = snapToPixel(rotated.y);
        }
        if (isBenzeneRingCarbon(atom)) {
          rotateBenzeneSlotAngles(atom, 90);
        } else if (atom.element === 'F' && atom.fSlotAngles) {
          rotateFluorineLayoutCW(atom);
        } else if (atom.element === 'Cl' && atom.clSlotAngles) {
          rotateChlorineLayoutCW(atom);
        } else {
          atom.rotateOrbitals90();
        }
      }

      for (var bi = 0; bi < this.bonds.length; bi++) {
        var bond = this.bonds[bi];
        bond.slotA = rotateSlotCW(bond.slotA);
        bond.slotB = rotateSlotCW(bond.slotB);
      }

      syncChlorineExpansionBondMetadata(this);
      reconcileAllChlorineInCompound(this);
      reorientAllChlorineFluorines(this);
      return true;
    }

    rotateExpandedChlorineLayout(chlorine) {
      ensureChlorineOrbitalLayout(chlorine);
      var step = 360 / chlorine.clOrbitalCount;
      var cx = chlorine.x;
      var cy = chlorine.y;
      var rad = step * Math.PI / 180;

      for (var ai = 0; ai < this.atoms.length; ai++) {
        var atom = this.atoms[ai];
        if (atom.id === chlorine.id) continue;
        var dx = atom.x - cx;
        var dy = atom.y - cy;
        var dist = Math.hypot(dx, dy);
        if (dist < 1) continue;
        var angle = Math.atan2(dy, dx) + rad;
        atom.x = snapToPixel(cx + Math.cos(angle) * dist);
        atom.y = snapToPixel(cy + Math.sin(angle) * dist);
      }

      var slots = getChlorineOrbitalSlots(chlorine);
      for (var si = 0; si < slots.length; si++) {
        var slot = slots[si];
        if (chlorine.clSlotAngles[slot] !== undefined) {
          chlorine.clSlotAngles[slot] = normalizeAngleDeg(chlorine.clSlotAngles[slot] + step);
        }
      }

      syncChlorineExpansionBondMetadata(this);
      reconcileAllChlorineInCompound(this);
      reorientAllChlorineFluorines(this);
      return true;
    }

    swapAroundAtom(pivot, slotA, slotB) {
      var affectedBonds = [];

      for (var bi = 0; bi < this.bonds.length; bi++) {
        var bond = this.bonds[bi];
        if (bond.atomA.id === pivot.id &&
          (bond.slotA === slotA || bond.slotA === slotB)) {
          affectedBonds.push({ bond: bond, pivotOnA: true, wasSlot: bond.slotA });
        } else if (bond.atomB.id === pivot.id &&
          (bond.slotB === slotA || bond.slotB === slotB)) {
          affectedBonds.push({ bond: bond, pivotOnA: false, wasSlot: bond.slotB });
        }
      }

      swapOrbitalSlots(pivot, slotA, slotB);
      if (chlorineHasExpandedLayout(pivot)) {
        swapChlorineExpansionMetadata(pivot, slotA, slotB);
      }

      for (var ai = 0; ai < affectedBonds.length; ai++) {
        var entry = affectedBonds[ai];
        var bond = entry.bond;
        var clockwise = entry.wasSlot === slotA;
        var newPivotSlot = entry.wasSlot === slotA ? slotB : slotA;
        var partner = entry.pivotOnA ? bond.atomB : bond.atomA;
        var oldPartnerSlot = entry.pivotOnA ? bond.slotB : bond.slotA;
        var newPartnerSlot = clockwise
          ? rotateSlotCW(oldPartnerSlot)
          : rotateSlotCCW(oldPartnerSlot);

        if (entry.pivotOnA) {
          bond.slotA = newPivotSlot;
          bond.slotB = newPartnerSlot;
        } else {
          bond.slotB = newPivotSlot;
          bond.slotA = newPartnerSlot;
        }

        this.rotateSubtreeForSwap(pivot, partner, clockwise, bond);
      }

      syncChlorineExpansionBondMetadata(this);
      reconcileAllChlorineInCompound(this);
      reorientAllChlorineFluorines(this);
      this.invalidateIdentification();
      return true;
    }

    rotateSubtreeForSwap(pivot, rootAtom, clockwise, pivotBond) {
      var subtree = this.collectSubtreeAtoms(rootAtom, pivot.id);
      var subtreeIds = new Set(subtree.map(function (a) { return a.id; }));
      var rotatePos = clockwise ? rotatePointCW : rotatePointCCW;

      for (var si = 0; si < subtree.length; si++) {
        var atom = subtree[si];
        var rotated = rotatePos(pivot.x, pivot.y, atom.x, atom.y);
        atom.x = snapToPixel(rotated.x);
        atom.y = snapToPixel(rotated.y);
        if (atom.element === 'F' && atom.fSlotAngles) {
          if (clockwise) rotateFluorineLayoutCW(atom);
          else {
            for (var ri = 0; ri < 3; ri++) rotateFluorineLayoutCW(atom);
          }
        } else if (atom.element === 'Cl' && atom.clSlotAngles) {
          if (clockwise) rotateChlorineLayoutCW(atom);
          else rotateChlorineLayoutCCW(atom);
        } else if (isBenzeneRingCarbon(atom)) {
          rotateBenzeneSlotAngles(atom, clockwise ? 90 : -90);
        } else if (clockwise) {
          atom.rotateOrbitals90();
        } else {
          rotateOrbitalsCCW(atom);
        }
      }

      for (var bi = 0; bi < this.bonds.length; bi++) {
        var bond = this.bonds[bi];
        if (bond.id === pivotBond.id) continue;
        var aIn = subtreeIds.has(bond.atomA.id);
        var bIn = subtreeIds.has(bond.atomB.id);
        if (!aIn || !bIn) continue;
        if (clockwise) {
          bond.slotA = rotateSlotCW(bond.slotA);
          bond.slotB = rotateSlotCW(bond.slotB);
        } else {
          bond.slotA = rotateSlotCCW(bond.slotA);
          bond.slotB = rotateSlotCCW(bond.slotB);
        }
      }
    }

    collectSubtreeAtoms(rootAtom, blockAtomId) {
      var result = [rootAtom];
      var visited = new Set([blockAtomId, rootAtom.id]);
      var queue = [rootAtom.id];

      while (queue.length) {
        var atomId = queue.shift();
        for (var bi = 0; bi < this.bonds.length; bi++) {
          var bond = this.bonds[bi];
          var otherId = bond.atomA.id === atomId ? bond.atomB.id
            : bond.atomB.id === atomId ? bond.atomA.id : null;
          if (otherId && !visited.has(otherId)) {
            visited.add(otherId);
            var other = this.atoms.find(function (a) { return a.id === otherId; });
            if (other) result.push(other);
            queue.push(otherId);
          }
        }
      }

      return result;
    }

    simulateNucleusPairSwap(pivot, slotA, slotB, useCompoundSwap) {
      if (!pivotPairSwapWouldChange(this, pivot, slotA, slotB, useCompoundSwap)) return false;
      if (useCompoundSwap) this.swapAroundAtom(pivot, slotA, slotB);
      else swapOrbitalSlots(pivot, slotA, slotB);
      return true;
    }
  }

  // ── ElectronResolver ───────────────────────────────────────────────
  class ElectronResolver {
    bondOrbitalSlots(atom) {
      var slots = new Set();
      for (var entry of Object.entries(atom.orbitals)) {
        if (isBondValue(entry[1])) slots.add(entry[0]);
      }
      return slots;
    }

    distributeReleasedElectrons(atom, count, pinnedSlots) {
      var slots = getAtomOrbitalSlots(atom);
      var bondSlots = this.bondOrbitalSlots(atom);
      var pinned = pinnedSlots || new Set();

      for (var i = 0; i < slots.length && count > 0; i++) {
        var slot = slots[i];
        if (pinned.has(slot) || bondSlots.has(slot)) continue;
        if (atom.orbitals[slot] === 0) {
          atom.orbitals[slot] = 1;
          count -= 1;
        }
      }

      for (var j = 0; j < slots.length && count > 0; j++) {
        var pairSlot = slots[j];
        if (pinned.has(pairSlot) || bondSlots.has(pairSlot)) continue;
        if (atom.orbitals[pairSlot] === 1) {
          atom.orbitals[pairSlot] = 2;
          count -= 1;
        }
      }

      return count;
    }

    restoreBondElectrons(atom, slot, count) {
      atom.orbitals[slot] = 0;
      if (count > 0) {
        this.distributeReleasedElectrons(atom, count, this.bondOrbitalSlots(atom));
      }

      if (!atom.isValenceConsistent()) {
        this.redistributeAfterBondBreak(atom);
      }
    }

    breakBondSlot(atom, slot, order) {
      var orbitalVal = atom.orbitals[slot];
      var cost = isBondValue(orbitalVal)
        ? bondAtomElectronCost(atom, orbitalVal)
        : bondAtomElectronCost(atom, order);
      this.restoreBondElectrons(atom, slot, cost);
    }

    consumeFreeElectron(atom, bondSlot) {
      if (atom.orbitals[bondSlot] === 1) return true;
      if (atom.orbitals[bondSlot] !== 0) return false;
      const donor = atom.findFreeElectronSlot(bondSlot);
      if (!donor) return false;
      atom.orbitals[donor] = 0;
      return true;
    }

    consumeElectronsForBond(atom, bondSlot, count) {
      var taken = 0;
      for (var slot of ['up', 'down', 'left', 'right']) {
        if (slot === bondSlot || taken >= count) continue;
        if (atom.orbitals[slot] === 1) {
          atom.orbitals[slot] = 0;
          taken += 1;
        }
      }
      for (var pairSlot of ['up', 'down', 'left', 'right']) {
        if (pairSlot === bondSlot || taken >= count) continue;
        if (atom.orbitals[pairSlot] === 2) {
          atom.orbitals[pairSlot] = 1;
          taken += 1;
        }
      }
      return taken === count;
    }

    alignCoDativeLonePairs(carbon, oxygen, carbonSlot, oxygenSlot) {
      var entries = [
        { atom: carbon, bondSlot: carbonSlot, loneSlot: oppositeOrbitalSlot(carbonSlot) },
        { atom: oxygen, bondSlot: oxygenSlot, loneSlot: oppositeOrbitalSlot(oxygenSlot) },
      ];

      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var atom = entry.atom;
        var bondSlot = entry.bondSlot;
        var loneSlot = entry.loneSlot;
        if (!loneSlot) return false;
        var bondCost = bondAtomElectronCost(atom, 'co_dative');
        var spare = atom.maxElectrons - bondCost - 2;
        if (spare < 0) return false;

        for (var slot of ['up', 'down', 'left', 'right']) {
          if (slot !== bondSlot) atom.orbitals[slot] = 0;
        }
        atom.orbitals[loneSlot] = 2;

        if (spare > 0) {
          var pinned = new Set([bondSlot, loneSlot]);
          if (this.distributeReleasedElectrons(atom, spare, pinned) !== 0) return false;
        }
      }

      return carbon.isValenceConsistent() && oxygen.isValenceConsistent();
    }

    releaseElectrons(atom, bondSlot, count) {
      var pinned = this.bondOrbitalSlots(atom);
      pinned.add(bondSlot);
      this.distributeReleasedElectrons(atom, count, pinned);
    }

    redistributeAfterBondBreak(atom) {
      var slots = chlorineHasExpandedLayout(atom)
        ? getChlorineOrbitalSlots(atom)
        : getAtomOrbitalSlots(atom);
      var bondSlots = this.bondOrbitalSlots(atom);
      var bondCost = 0;
      var reserved = 0;
      var pinned = new Set(bondSlots);
      for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        var val = atom.orbitals[slot];
        if (isBondValue(val)) {
          bondCost += bondAtomElectronCost(atom, val);
          continue;
        }
        if (val === 2) {
          reserved += 2;
          pinned.add(slot);
        } else if (val === 1) {
          reserved += 1;
        }
      }
      var budget = atom.maxElectrons - bondCost - reserved;
      if (budget > 0) this.distributeReleasedElectrons(atom, budget, pinned);
    }

    maxPairBondOrder(atomA, slotA, atomB, slotB) {
      return Math.min(atomA.maxAchievableBondOrder(slotA), atomB.maxAchievableBondOrder(slotB));
    }

    canUpgradeBond(atomA, slotA, atomB, slotB, targetOrder) {
      const cost = bondElectronCost(targetOrder);
      if (cost > this.maxPairBondOrder(atomA, slotA, atomB, slotB)) return false;
      for (const { atom, slot } of [{ atom: atomA, slot: slotA }, { atom: atomB, slot: slotB }]) {
        const currentCost = isBondValue(atom.orbitals[slot]) ? bondAtomElectronCost(atom, atom.orbitals[slot]) : 0;
        const needed = cost - currentCost;
        if (needed > 0) {
          if (atom.countFreeElectrons() < needed) return false;
        }
      }
      return true;
    }

    upgradeBond(atomA, slotA, atomB, slotB, targetOrder) {
      if (!this.canUpgradeBond(atomA, slotA, atomB, slotB, targetOrder)) return false;
      const cost = bondElectronCost(targetOrder);
      for (const { atom, slot } of [{ atom: atomA, slot: slotA }, { atom: atomB, slot: slotB }]) {
        const currentCost = isBondValue(atom.orbitals[slot]) ? bondAtomElectronCost(atom, atom.orbitals[slot]) : 0;
        let needed = cost - currentCost;
        if (needed > 0) {
          for (const [s, val] of Object.entries(atom.orbitals)) {
            if (s !== slot && val === 1 && needed > 0) { atom.orbitals[s] = 0; needed -= 1; }
          }
        }
        atom.orbitals[slot] = targetOrder;
      }
      return atomA.isValenceConsistent() && atomB.isValenceConsistent();
    }

    downgradeBond(atomA, slotA, atomB, slotB, targetOrder) {
      const cost = bondElectronCost(targetOrder);
      for (const { atom, slot } of [{ atom: atomA, slot: slotA }, { atom: atomB, slot: slotB }]) {
        const currentCost = isBondValue(atom.orbitals[slot]) ? bondAtomElectronCost(atom, atom.orbitals[slot]) : 0;
        const released = currentCost - cost;
        atom.orbitals[slot] = targetOrder;
        if (released > 0) this.releaseElectrons(atom, slot, released);
      }
      return atomA.isValenceConsistent() && atomB.isValenceConsistent();
    }

    formBond(atomA, slotA, atomB, slotB, compound) {
      if (!isOrbitalAvailable(atomA.orbitals[slotA]) || !isOrbitalAvailable(atomB.orbitals[slotB])) return false;
      if (atomA.countFreeElectrons() < 1 || atomB.countFreeElectrons() < 1) return false;
      markChlorineFixedAnchorSlot(atomA, slotA, atomB.element);
      markChlorineFixedAnchorSlot(atomB, slotB, atomA.element);
      if (!this.consumeFreeElectron(atomA, slotA) || !this.consumeFreeElectron(atomB, slotB)) return false;
      atomA.orbitals[slotA] = 'single';
      atomB.orbitals[slotB] = 'single';
      if (atomA.nDativeHub) syncReleasedHubSlot(atomA, atomA.nDativeHub);
      if (atomB.nDativeHub) syncReleasedHubSlot(atomB, atomB.nDativeHub);
      var ok = atomA.isValenceConsistent() && atomB.isValenceConsistent();
      if (ok && compound) {
        if (atomA.element === 'Cl') reconcileChlorineElectrons(atomA, compound);
        if (atomB.element === 'Cl') reconcileChlorineElectrons(atomB, compound);
      }
      return ok;
    }

    formNDativeBond(nitrogen, nitrogenSlot, oxygen, oxygenSlot, oxygenCompound) {
      if (!nitrogenHubReady(nitrogen)) return false;
      if (nitrogenSlot !== nitrogenLonePairSlot(nitrogen)) return false;
      if (oxygenCompound && countAtomBondsInCompound(oxygen, oxygenCompound) > 0) return false;
      nitrogen.orbitals[nitrogenSlot] = 'n_dative';
      layoutNDativeReceiverOxygen(oxygen, oxygenSlot);
      return nitrogen.isValenceConsistent() && oxygen.isValenceConsistent();
    }

    formClDativeBond(chlorine, chlorineSlot, oxygen, oxygenSlot, oxygenCompound, chlorineCompound) {
      if (!chlorineDativeReady(chlorine, chlorineCompound)) return false;
      if (chlorine.orbitals[chlorineSlot] !== 2) return false;
      if (oxygenCompound && countAtomBondsInCompound(oxygen, oxygenCompound) > 0) return false;
      chlorine.orbitals[chlorineSlot] = 'cl_dative';
      layoutClDativeReceiverOxygen(oxygen, oxygenSlot);
      return chlorine.isValenceConsistent() && oxygen.isValenceConsistent();
    }

    formPDativeBond(phosphorus, phosphorusSlot, oxygen, oxygenSlot, oxygenCompound) {
      if (!phosphorusDativeReady(phosphorus)) return false;
      if (phosphorusSlot !== phosphorusLonePairSlot(phosphorus)) return false;
      if (oxygenCompound && countAtomBondsInCompound(oxygen, oxygenCompound) > 0) return false;
      phosphorus.orbitals[phosphorusSlot] = 'p_dative';
      layoutPDativeReceiverOxygen(oxygen, oxygenSlot);
      return phosphorus.isValenceConsistent() && oxygen.isValenceConsistent();
    }

    formSDativeBond(sulfur, sulfurSlot, oxygen, oxygenSlot, oxygenCompound) {
      if (!sulfurDativeReady(sulfur)) return false;
      if (sulfur.orbitals[sulfurSlot] !== 2) return false;
      if (oxygenCompound && countAtomBondsInCompound(oxygen, oxygenCompound) > 0) return false;
      sulfur.orbitals[sulfurSlot] = 's_dative';
      layoutSDativeReceiverOxygen(oxygen, oxygenSlot);
      return sulfur.isValenceConsistent() && oxygen.isValenceConsistent();
    }

    formFluorideChlorineLonePairBond(fluorine, fluorineSlot, chlorine, chlorineSlot, compound) {
      if (!canFluorideChlorineLonePairSnap(fluorine, chlorine, fluorineSlot, chlorineSlot, compound)) return null;
      if (fluorine.orbitals[fluorineSlot] !== 1) return null;
      if (chlorine.orbitals[chlorineSlot] !== 2) return null;
      chlorine.orbitals[chlorineSlot] = 'single';
      fluorine.orbitals[fluorineSlot] = 'single';
      var extSlot = expandChlorineOrbitalFromSplit(chlorine, chlorineSlot, compound);
      if (!extSlot) {
        chlorine.orbitals[chlorineSlot] = 2;
        fluorine.orbitals[fluorineSlot] = 1;
        return null;
      }
      if (!chlorine.isValenceConsistent() || !fluorine.isValenceConsistent()) {
        collapseChlorineOrbitalFromSplit(chlorine, chlorineSlot, extSlot);
        chlorine.orbitals[chlorineSlot] = 2;
        fluorine.orbitals[fluorineSlot] = 1;
        return null;
      }
      var pendingPartners = [{ clSlot: chlorineSlot, partner: fluorine }];
      reconcileChlorineElectrons(chlorine, compound, pendingPartners);
      var resolvedExt = extSlot;
      orientFluorineToPartner(fluorine, fluorineSlot, chlorine);
      return resolvedExt;
    }

    nextBondOrder(current) {
      const idx = BOND_ORDER.indexOf(current);
      return BOND_ORDER[(idx + 1) % BOND_ORDER.length];
    }

    achievableBondOrders(atomA, slotA, atomB, slotB) {
      var maxPair = this.maxPairBondOrder(atomA, slotA, atomB, slotB);
      return BOND_ORDER.filter(function (order) {
        return bondElectronCost(order) <= maxPair;
      });
    }

    nextAchievableBondOrder(atomA, slotA, atomB, slotB, current) {
      var achievable = this.achievableBondOrders(atomA, slotA, atomB, slotB);
      if (!achievable.length) return current;
      var currentIdx = achievable.indexOf(current);
      if (currentIdx === -1) return achievable[0];
      return achievable[(currentIdx + 1) % achievable.length];
    }
  }

  // ── SnapEngine ─────────────────────────────────────────────────────
  class SnapEngine {
    constructor() {
      this.electronResolver = new ElectronResolver();
      this.suppressedPairs = new Set();
    }

    pairKey(idA, idB) { return [idA, idB].sort().join('::'); }
    suppressPair(a, b) { this.suppressedPairs.add(this.pairKey(a.id, b.id)); }
    clearPairSuppression(a, b) { this.suppressedPairs.delete(this.pairKey(a.id, b.id)); }
    isPairSuppressed(a, b) { return this.suppressedPairs.has(this.pairKey(a.id, b.id)); }

    clearSuppression(atom) {
      for (const key of [...this.suppressedPairs]) {
        if (key.includes(atom.id)) this.suppressedPairs.delete(key);
      }
    }

    pathStericBlocked(startAtom, atX, atY, atElement, straightSlot, allCompounds, exclude, originAtomId, virtualPos) {
      var leftEnd = walkStericPathEnd(
        startAtom, atX, atY, atElement, straightSlot, true, allCompounds, exclude, originAtomId, virtualPos);
      if (leftEnd) return true;
      var rightEnd = walkStericPathEnd(
        startAtom, atX, atY, atElement, straightSlot, false, allCompounds, exclude, originAtomId, virtualPos);
      if (rightEnd) return true;
      return false;
    }

    passesStericBondCheck(atomA, slotA, atomB, slotB, allCompounds, offsetX, offsetY, virtualPos) {
      if (!shouldApplyStericCheck(atomA, atomB)) return true;

      var exclude = new Set([atomA.id, atomB.id]);
      var atomAPos = getVirtualAtomPos(virtualPos, atomA);
      var ax = atomAPos.x + (offsetX || 0);
      var ay = atomAPos.y + (offsetY || 0);
      var atomBPos = getVirtualAtomPos(virtualPos, atomB);

      if (this.pathStericBlocked(
        atomB, atomBPos.x, atomBPos.y, atomB.element, slotA, allCompounds, exclude, atomA.id, virtualPos)) {
        return false;
      }
      if (this.pathStericBlocked(
        atomA, ax, ay, atomA.element, slotA, allCompounds, exclude, atomB.id, virtualPos)) {
        return false;
      }
      return true;
    }

    atomHasInternalBond(atom, compound) {
      for (var bi = 0; bi < compound.bonds.length; bi++) {
        var bond = compound.bonds[bi];
        if (bond.atomA.id === atom.id || bond.atomB.id === atom.id) return true;
      }
      return false;
    }

    buildBondSnapStepAtVirtual(activeAtom, partnerAtom, partnerCompound, activeCompound, allCompounds, virtualPos) {
      var activePos = getVirtualAtomPos(virtualPos, activeAtom);
      var partnerPos = getVirtualAtomPos(virtualPos, partnerAtom);
      if (!pairAllowsBenzeneExoApproach(
        activeAtom, activePos.x, activePos.y, partnerAtom, partnerPos.x, partnerPos.y)) {
        return null;
      }
      var slots = chooseBondSlotsAt(
        activeAtom, activePos.x, activePos.y, partnerAtom, partnerPos.x, partnerPos.y);
      var slotOnActive = slots.movingSlot;
      var slotOnPartner = slots.stationarySlot;
      var dativeSlots = applySpecialBondSlotOverrides(
        activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound);
      if (dativeSlots) {
        slotOnActive = dativeSlots.slotOnActive;
        slotOnPartner = dativeSlots.slotOnPartner;
      } else if (!slotsAllowSnap(activeAtom, partnerAtom, slotOnActive, slotOnPartner)) {
        return null;
      }

      var movePartner = this.atomHasInternalBond(activeAtom, activeCompound);
      var moveCompound;
      var dx;
      var dy;

      if (movePartner) {
        var partnerSlots = chooseBondSlotsAt(
          partnerAtom, partnerPos.x, partnerPos.y, activeAtom, activePos.x, activePos.y);
        var snap = computeSnapForSlotsAtVirtual(
          virtualPos, partnerAtom, activeAtom, partnerSlots.movingSlot, partnerSlots.stationarySlot);
        moveCompound = partnerCompound;
        dx = snap.dx;
        dy = snap.dy;
        if (shouldApplyStericCheck(activeAtom, partnerAtom) &&
          !this.passesStericBondCheck(
            partnerAtom, partnerSlots.movingSlot, activeAtom, partnerSlots.stationarySlot,
            allCompounds, dx, dy, virtualPos)) {
          return null;
        }
      } else {
        var snapActive = computeSnapForSlotsAtVirtual(
          virtualPos, activeAtom, partnerAtom, slotOnActive, slotOnPartner);
        moveCompound = activeCompound;
        dx = snapActive.dx;
        dy = snapActive.dy;
        if (shouldApplyStericCheck(activeAtom, partnerAtom) &&
          !this.passesStericBondCheck(
            activeAtom, slotOnActive, partnerAtom, slotOnPartner, allCompounds, dx, dy, virtualPos)) {
          return null;
        }
      }

      return {
        moveCompound: moveCompound,
        dx: dx,
        dy: dy,
        activeAtom: activeAtom,
        partnerAtom: partnerAtom,
        slotOnActive: slotOnActive,
        slotOnPartner: slotOnPartner,
        partnerCompound: partnerCompound,
        dist: Math.hypot(partnerPos.x - activePos.x, partnerPos.y - activePos.y),
      };
    }

    buildBondSnapStep(activeAtom, partnerAtom, partnerCompound, activeCompound, allCompounds) {
      if (!pairAllowsBenzeneExoApproach(
        activeAtom, activeAtom.x, activeAtom.y, partnerAtom, partnerAtom.x, partnerAtom.y)) {
        return null;
      }
      var slots = chooseBondSlots(activeAtom, partnerAtom);
      var slotOnActive = slots.movingSlot;
      var slotOnPartner = slots.stationarySlot;
      var dativeSlots = applySpecialBondSlotOverrides(
        activeAtom, partnerAtom, slotOnActive, slotOnPartner, activeCompound, partnerCompound);
      if (dativeSlots) {
        slotOnActive = dativeSlots.slotOnActive;
        slotOnPartner = dativeSlots.slotOnPartner;
      } else if (!slotsAllowSnap(activeAtom, partnerAtom, slotOnActive, slotOnPartner)) {
        return null;
      }

      var movePartner = this.atomHasInternalBond(activeAtom, activeCompound);
      var moveCompound;
      var dx;
      var dy;

      if (movePartner) {
        var partnerSlots = chooseBondSlots(partnerAtom, activeAtom);
        var snap = computeSnapForSlots(
          partnerAtom, activeAtom, partnerSlots.movingSlot, partnerSlots.stationarySlot);
        moveCompound = partnerCompound;
        dx = snap.dx;
        dy = snap.dy;
        if (shouldApplyStericCheck(activeAtom, partnerAtom) &&
          !this.passesStericBondCheck(
            partnerAtom, partnerSlots.movingSlot, activeAtom, partnerSlots.stationarySlot,
            allCompounds, dx, dy)) {
          return null;
        }
      } else {
        var snapActive = computeSnapForSlots(
          activeAtom, partnerAtom, slotOnActive, slotOnPartner);
        moveCompound = activeCompound;
        dx = snapActive.dx;
        dy = snapActive.dy;
        if (shouldApplyStericCheck(activeAtom, partnerAtom) &&
          !this.passesStericBondCheck(
            activeAtom, slotOnActive, partnerAtom, slotOnPartner, allCompounds, dx, dy)) {
          return null;
        }
      }

      return {
        moveCompound: moveCompound,
        dx: dx,
        dy: dy,
        activeAtom: activeAtom,
        partnerAtom: partnerAtom,
        slotOnActive: slotOnActive,
        slotOnPartner: slotOnPartner,
        partnerCompound: partnerCompound,
        dist: Math.hypot(partnerAtom.x - activeAtom.x, partnerAtom.y - activeAtom.y),
      };
    }

    collectDirectionalBondCandidates(activeCompound, allCompounds) {
      var allCandidates = [];
      var stationarySlotsUsed = new Map();

      for (var ai = 0; ai < activeCompound.atoms.length; ai++) {
        var activeAtom = activeCompound.atoms[ai];
        var nearby = [];

        for (var ci = 0; ci < allCompounds.length; ci++) {
          var partnerCompound = allCompounds[ci];
          if (partnerCompound.id === activeCompound.id) continue;

          for (var pi = 0; pi < partnerCompound.atoms.length; pi++) {
            var partnerAtom = partnerCompound.atoms[pi];
            if (this.isPairSuppressed(activeAtom, partnerAtom)) continue;
            if (!isAtomWithinBondingRange(activeAtom, partnerAtom)) continue;
            nearby.push({
              atom: partnerAtom,
              compound: partnerCompound,
              dist: Math.hypot(partnerAtom.x - activeAtom.x, partnerAtom.y - activeAtom.y),
            });
          }
        }
        nearby.sort(function (a, b) { return a.dist - b.dist; });

        var movingSlotsUsed = new Set();

        for (var ni = 0; ni < nearby.length; ni++) {
          var partnerAtom = nearby[ni].atom;
          var partnerCompound = nearby[ni].compound;
          if (!pairAllowsBenzeneExoApproach(
            activeAtom, activeAtom.x, activeAtom.y, partnerAtom, partnerAtom.x, partnerAtom.y)) {
            continue;
          }
          var slots = chooseBondSlots(activeAtom, partnerAtom);
          var slotOnActive = slots.movingSlot;
          var slotOnPartner = slots.stationarySlot;

          if (movingSlotsUsed.has(slotOnActive)) continue;
          if (getStationarySlotUse(stationarySlotsUsed, partnerAtom.id, slotOnPartner)) continue;

          var canNormal = hasAvailableBondSlots(activeAtom, partnerAtom, slotOnActive, slotOnPartner) &&
            canBondAtSlots(activeAtom, partnerAtom, slotOnActive, slotOnPartner);
          var oxygenCompound = resolveSnapCompoundForAtom(
            activeAtom.element === 'O' ? activeAtom : partnerAtom, activeCompound, partnerCompound);
          var chlorineCompound = resolveSnapCompoundForAtom(
            activeAtom.element === 'Cl' ? activeAtom : partnerAtom, activeCompound, partnerCompound);
          var canNDative = canNDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound);
          var canPDative = canPDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound);
          var canSDative = canSDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound);
          var canClDative = canClDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound, chlorineCompound);
          var canFluorideClSplit = canFluorideChlorineLonePairSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, chlorineCompound);
          if (!canNormal && !canNDative && !canPDative && !canSDative &&
              !canClDative && !canFluorideClSplit) continue;

          var step = this.buildBondSnapStep(
            activeAtom, partnerAtom, partnerCompound, activeCompound, allCompounds);
          if (!step) break;
          step.isNDative = canNDative;
          step.isPDative = canPDative;
          step.isSDative = canSDative;
          step.isClDative = canClDative;
          step.isFluorideClSplit = canFluorideClSplit;

          movingSlotsUsed.add(slotOnActive);
          markStationarySlotUse(stationarySlotsUsed, partnerAtom.id, slotOnPartner);
          allCandidates.push(step);
        }
      }

      return allCandidates;
    }

    collectDirectionalBondCandidatesAtVirtual(activeCompound, allCompounds, virtualPos, options) {
      var excludeHydrogenHydrogen = options && options.excludeHydrogenHydrogen;
      var allCandidates = [];
      var stationarySlotsUsed = new Map();

      for (var ai = 0; ai < activeCompound.atoms.length; ai++) {
        var activeAtom = activeCompound.atoms[ai];
        var activePos = getVirtualAtomPos(virtualPos, activeAtom);
        var nearby = [];

        for (var ci = 0; ci < allCompounds.length; ci++) {
          var partnerCompound = allCompounds[ci];
          if (partnerCompound.id === activeCompound.id) continue;

          for (var pi = 0; pi < partnerCompound.atoms.length; pi++) {
            var partnerAtom = partnerCompound.atoms[pi];
            if (excludeHydrogenHydrogen && isHydrogenHydrogenPair(activeAtom, partnerAtom)) continue;
            if (this.isPairSuppressed(activeAtom, partnerAtom)) continue;
            if (!isAtomPairWithinBondingRangeAtVirtual(virtualPos, activeAtom, partnerAtom)) continue;
            var partnerPos = getVirtualAtomPos(virtualPos, partnerAtom);
            nearby.push({
              atom: partnerAtom,
              compound: partnerCompound,
              dist: Math.hypot(partnerPos.x - activePos.x, partnerPos.y - activePos.y),
            });
          }
        }
        nearby.sort(function (a, b) { return a.dist - b.dist; });

        var movingSlotsUsed = new Set();

        for (var ni = 0; ni < nearby.length; ni++) {
          var partnerAtom = nearby[ni].atom;
          var partnerCompound = nearby[ni].compound;
          var partnerPos = getVirtualAtomPos(virtualPos, partnerAtom);
          if (!pairAllowsBenzeneExoApproach(
            activeAtom, activePos.x, activePos.y, partnerAtom, partnerPos.x, partnerPos.y)) {
            continue;
          }
          var slots = chooseBondSlotsAt(
            activeAtom, activePos.x, activePos.y, partnerAtom, partnerPos.x, partnerPos.y);
          var slotOnActive = slots.movingSlot;
          var slotOnPartner = slots.stationarySlot;

          if (movingSlotsUsed.has(slotOnActive)) continue;
          if (getStationarySlotUse(stationarySlotsUsed, partnerAtom.id, slotOnPartner)) continue;

          var canNormal = hasAvailableBondSlots(activeAtom, partnerAtom, slotOnActive, slotOnPartner) &&
            canBondAtSlots(activeAtom, partnerAtom, slotOnActive, slotOnPartner);
          var oxygenCompound = resolveSnapCompoundForAtom(
            activeAtom.element === 'O' ? activeAtom : partnerAtom, activeCompound, partnerCompound);
          var chlorineCompound = resolveSnapCompoundForAtom(
            activeAtom.element === 'Cl' ? activeAtom : partnerAtom, activeCompound, partnerCompound);
          var canNDative = canNDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound);
          var canPDative = canPDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound);
          var canSDative = canSDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound);
          var canClDative = canClDativeSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, oxygenCompound, chlorineCompound);
          var canFluorideClSplit = canFluorideChlorineLonePairSnap(
            activeAtom, partnerAtom, slotOnActive, slotOnPartner, chlorineCompound);
          if (!canNormal && !canNDative && !canPDative && !canSDative &&
              !canClDative && !canFluorideClSplit) continue;

          var step = this.buildBondSnapStepAtVirtual(
            activeAtom, partnerAtom, partnerCompound, activeCompound, allCompounds, virtualPos);
          if (!step) break;
          step.isNDative = canNDative;
          step.isPDative = canPDative;
          step.isSDative = canSDative;
          step.isClDative = canClDative;
          step.isFluorideClSplit = canFluorideClSplit;

          movingSlotsUsed.add(slotOnActive);
          markStationarySlotUse(stationarySlotsUsed, partnerAtom.id, slotOnPartner);
          allCandidates.push(step);
        }
      }

      return allCandidates;
    }

    getPostSnapBondPairsAfterSimulation(simGroup, activeCompound, allCompounds) {
      var virtualPos = buildVirtualPositionsFromSimulatedSnaps(allCompounds, simGroup);
      var postSnapCandidates = this.collectDirectionalBondCandidatesAtVirtual(
        activeCompound, allCompounds, virtualPos, { excludeHydrogenHydrogen: true });
      var pairKeys = new Set();
      var pairs = [];

      function addPair(pair) {
        if (isHydrogenHydrogenBondPair(pair)) return;
        var key = [pair.moving.id, pair.stationary.id].sort().join('::');
        if (pairKeys.has(key)) return;
        pairKeys.add(key);
        pairs.push(pair);
      }

      for (var si = 0; si < simGroup.length; si++) {
        addPair(candidateToBondPair(simGroup[si]));
      }
      for (var pi = 0; pi < postSnapCandidates.length; pi++) {
        addPair(candidateToBondPair(postSnapCandidates[pi]));
      }
      return pairs;
    }

    simulatedBondGroupCreatesLoop(simGroup, activeCompound, allCompounds) {
      if (!simGroup.length) return false;
      var pairs = this.getPostSnapBondPairsAfterSimulation(simGroup, activeCompound, allCompounds);
      if (!pairs.length) return false;
      return wouldBondGroupCreateLoop(pairs, activeCompound, allCompounds);
    }

    findNextBondStep(activeCompound, allCompounds) {
      var candidates = this.collectDirectionalBondCandidates(activeCompound, allCompounds);
      candidates = filterCandidatesByPairwiseLoops(candidates, activeCompound, allCompounds, this);

      var best = null;
      for (var ci = 0; ci < candidates.length; ci++) {
        var candidate = candidates[ci];
        var canNormal = canBondAtSlots(
          candidate.activeAtom, candidate.partnerAtom,
          candidate.slotOnActive, candidate.slotOnPartner);
        if (!canNormal && !candidate.isNDative && !candidate.isPDative &&
            !candidate.isSDative && !candidate.isClDative &&
            !candidate.isFluorideClSplit) continue;
        if (!best || candidate.dist < best.dist) best = candidate;
      }

      return best;
    }

    hasPendingBond(activeCompound, allCompounds) {
      return this.findNextBondStep(activeCompound, allCompounds) !== null;
    }

    executeOneBondStep(step) {
      step.moveCompound.translate(step.dx, step.dy);
      if (step.isFluorideClSplit) {
        var fcEnds = resolveFluorideChlorineSnapEnds(
          step.activeAtom, step.partnerAtom, step.slotOnActive, step.slotOnPartner);
        if (!fcEnds) {
          step.moveCompound.translate(-step.dx, -step.dy);
          return null;
        }
        var fcCompound = resolveSnapCompoundForAtom(
          fcEnds.chlorine, step.moveCompound, step.partnerCompound);
        var extSlot = this.electronResolver.formFluorideChlorineLonePairBond(
          fcEnds.fluorine, fcEnds.fluorineSlot, fcEnds.chlorine, fcEnds.chlorineSlot, fcCompound);
        if (!extSlot) {
          step.moveCompound.translate(-step.dx, -step.dy);
          return null;
        }
        var fcBond = new Bond(
          fcEnds.fluorine, fcEnds.chlorine, fcEnds.fluorineSlot, fcEnds.chlorineSlot, 'single');
        fcBond.clSplitExtSlot = extSlot;
        fcBond.clSplitSlot = fcEnds.chlorineSlot;
        return fcBond;
      }
      if (step.isClDative) {
        var clEnds = resolveClDativeSnapEnds(
          step.activeAtom, step.partnerAtom, step.slotOnActive, step.slotOnPartner);
        var clOxygenCompound = resolveSnapCompoundForAtom(
          clEnds.oxygen, step.moveCompound, step.partnerCompound);
        var clChlorineCompound = resolveSnapCompoundForAtom(
          clEnds.chlorine, step.moveCompound, step.partnerCompound);
        if (!clEnds || !this.electronResolver.formClDativeBond(
          clEnds.chlorine, clEnds.chlorineSlot, clEnds.oxygen, clEnds.oxygenSlot,
          clOxygenCompound, clChlorineCompound)) {
          step.moveCompound.translate(-step.dx, -step.dy);
          return null;
        }
        return new Bond(
          clEnds.chlorine, clEnds.oxygen, clEnds.chlorineSlot, clEnds.oxygenSlot, 'cl_dative');
      }
      if (step.isPDative) {
        var pEnds = resolvePDativeSnapEnds(
          step.activeAtom, step.partnerAtom, step.slotOnActive, step.slotOnPartner);
        var pOxygenCompound = resolveSnapCompoundForAtom(
          pEnds.oxygen, step.moveCompound, step.partnerCompound);
        if (!pEnds || !this.electronResolver.formPDativeBond(
          pEnds.phosphorus, pEnds.phosphorusSlot, pEnds.oxygen, pEnds.oxygenSlot, pOxygenCompound)) {
          step.moveCompound.translate(-step.dx, -step.dy);
          return null;
        }
        var pBond = new Bond(
          pEnds.phosphorus, pEnds.oxygen, pEnds.phosphorusSlot, pEnds.oxygenSlot, 'p_dative');
        if (!pEnds.phosphorus.nDativeHub) {
          registerNDativeHub(pEnds.phosphorus, pEnds.phosphorusSlot, pBond.id);
        }
        return pBond;
      }
      if (step.isSDative) {
        var sEnds = resolveSDativeSnapEnds(
          step.activeAtom, step.partnerAtom, step.slotOnActive, step.slotOnPartner);
        var sOxygenCompound = resolveSnapCompoundForAtom(
          sEnds.oxygen, step.moveCompound, step.partnerCompound);
        if (!sEnds || !this.electronResolver.formSDativeBond(
          sEnds.sulfur, sEnds.sulfurSlot, sEnds.oxygen, sEnds.oxygenSlot, sOxygenCompound)) {
          step.moveCompound.translate(-step.dx, -step.dy);
          return null;
        }
        var sBond = new Bond(
          sEnds.sulfur, sEnds.oxygen, sEnds.sulfurSlot, sEnds.oxygenSlot, 's_dative');
        if (!sEnds.sulfur.nDativeHub) {
          registerNDativeHub(sEnds.sulfur, sEnds.sulfurSlot, sBond.id);
        }
        return sBond;
      }
      if (step.isNDative) {
        var ends = resolveNDativeSnapEnds(
          step.activeAtom, step.partnerAtom, step.slotOnActive, step.slotOnPartner);
        var oxygenCompound = resolveSnapCompoundForAtom(
          ends.oxygen, step.moveCompound, step.partnerCompound);
        if (!ends || !this.electronResolver.formNDativeBond(
          ends.nitrogen, ends.nitrogenSlot, ends.oxygen, ends.oxygenSlot, oxygenCompound)) {
          step.moveCompound.translate(-step.dx, -step.dy);
          return null;
        }
        var nBond = new Bond(
          ends.nitrogen, ends.oxygen, ends.nitrogenSlot, ends.oxygenSlot, 'n_dative');
        registerNDativeHub(ends.nitrogen, ends.nitrogenSlot, nBond.id);
        return nBond;
      }
      if (!this.electronResolver.formBond(
        step.activeAtom, step.slotOnActive, step.partnerAtom, step.slotOnPartner,
        step.activeAtom.element === 'Cl' || step.partnerAtom.element === 'Cl' ?
          resolveSnapCompoundForAtom(
            step.activeAtom.element === 'Cl' ? step.activeAtom : step.partnerAtom,
            step.moveCompound, step.partnerCompound) :
          null)) {
        step.moveCompound.translate(-step.dx, -step.dy);
        return null;
      }
      return new Bond(
        step.activeAtom, step.partnerAtom, step.slotOnActive, step.slotOnPartner, 'single');
    }

    canFormBondGroup(group, movingCompound, allCompounds) {
      if (!group || !group.length) return false;

      var movingUsed = new Map();
      var stationaryUsed = new Map();
      var electronDemand = new Map();

      for (var i = 0; i < group.length; i++) {
        var pair = group[i];
        if (!claimBondSlot(movingUsed, pair.moving.id, pair.slotA)) return false;
        if (!claimBondSlot(stationaryUsed, pair.stationary.id, pair.slotB)) return false;
        electronDemand.set(pair.moving.id, (electronDemand.get(pair.moving.id) || 0) + 1);
        electronDemand.set(pair.stationary.id, (electronDemand.get(pair.stationary.id) || 0) + 1);
      }

      for (var entry of electronDemand.entries()) {
        var atomId = entry[0];
        var needed = entry[1];
        var atom = null;
        for (var gi = 0; gi < group.length; gi++) {
          if (group[gi].moving.id === atomId) { atom = group[gi].moving; break; }
          if (group[gi].stationary.id === atomId) { atom = group[gi].stationary; break; }
        }
        if (!atom || atom.countFreeElectrons() < needed) return false;
      }

      return !wouldBondGroupCreateLoop(group, movingCompound, allCompounds);
    }

    computeSnapPosition(movingAtom, stationaryAtom) {
      var slots = chooseBondSlots(movingAtom, stationaryAtom);
      return computeSnapForSlots(movingAtom, stationaryAtom, slots.movingSlot, slots.stationarySlot);
    }

    breakBond(bond, compound) {
      var isCo = isCoOnlyDiatomic(compound);
      var isO3 = isOzoneOnly(compound);
      var wasOzoneActive = isO3 && compound.ozoneActive;
      if (wasOzoneActive) {
        clearOzoneState(compound);
        if (window.app && window.app.renderer) window.app.renderer.stopOzoneResonanceTimer();
      }
      if (isCo) {
        compound.removeBond(bond.id);
        resetAtomOrbitals(bond.atomA);
        resetAtomOrbitals(bond.atomB);
        this.clearPairSuppression(bond.atomA, bond.atomB);
        return true;
      }
      if (isOxygenDiatomic(compound) && bond.order === 'double') {
        breakOxygenDiatomicDouble(bond);
        this.clearPairSuppression(bond.atomA, bond.atomB);
        return false;
      }
      if (isO3 && wasOzoneActive) {
        compound.removeBond(bond.id);
        restoreOxygenAfterOzoneBreak(compound);
        this.clearPairSuppression(bond.atomA, bond.atomB);
        return true;
      }
      var hubN = oxoHubAtomFromBond(bond) ||
        (bond.atomA.element === 'N' ? bond.atomA :
          bond.atomB.element === 'N' ? bond.atomB : null);
      var hub = hubN && hubN.nDativeHub;
      if (hub && hub.resonanceActive && bond.id === hub.type2BondId) {
        return breakNDativeResonanceType2Bond(bond, compound, hubN, hub, this);
      }
      if (hub && hub.resonanceActive && bond.id === hub.type3BondId) {
        return breakNDativeResonanceType3Bond(bond, compound, hubN, hub, this);
      }
      if (hub && hub.resonanceActive &&
          bond.id !== hub.receiverBondId && bond.id !== hub.type2BondId &&
          bond.id !== hub.type3BondId) {
        return breakNDativeResonancePeripheralBond(bond, compound, hubN, hub, this);
      }
      if (bond.order === 'cl_dative') {
        var cloEnds = getClOBondEnds(bond);
        compound.removeBond(bond.id);
        restoreIsolatedOxygen(cloEnds.oxygen);
        cloEnds.chlorine.orbitals[cloEnds.chlorineSlot] = 2;
        this.clearPairSuppression(bond.atomA, bond.atomB);
        return true;
      }
      if (bond.order === 'single') {
        var clInBond = bond.atomA.element === 'Cl' ? bond.atomA :
          bond.atomB.element === 'Cl' ? bond.atomB : null;
        if (clInBond && (chlorineHasExpandedLayout(clInBond) || chlorineIsDativeDonor(clInBond))) {
          var isClH = (bond.atomA.element === 'Cl' && bond.atomB.element === 'H') ||
            (bond.atomA.element === 'H' && bond.atomB.element === 'Cl');
          var isClF = (bond.atomA.element === 'Cl' && bond.atomB.element === 'F') ||
            (bond.atomA.element === 'F' && bond.atomB.element === 'Cl');
          if (isClH && breakExpandedChlorineHydrogenBond(bond, compound, this)) return true;
          if (isClF && breakChlorineFluorideBond(bond, compound, this)) return true;
        }
      }
      if (bond.order === 'n_dative' || bond.order === 'p_dative' ||
          bond.order === 's_dative' ||
          (hubN && hub && bond.id === hub.receiverBondId)) {
        var noEnds = getNoBondEnds(bond);
        var wasResonance = hub && hub.resonanceActive;
        var type2BondId = hub ? hub.type2BondId : null;
        var type3BondId = hub ? hub.type3BondId : null;
        var loneSlot = hub ? hub.loneSlot : noEnds.nitrogenSlot;
        compound.removeBond(bond.id);
        restoreIsolatedOxygen(noEnds.oxygen);
        clearNDativeHub(noEnds.nitrogen);
        var type2Bond = wasResonance ? findBondById(compound, type2BondId) : null;
        var type3Bond = findBondById(compound, type3BondId);
        restoreNitrogenAfterReceiverBreak(
          noEnds.nitrogen, compound, loneSlot, this.electronResolver, type2Bond);
        if (type3Bond) restoreOxoDativeBond(type3Bond, noEnds.nitrogen);
        if (window.app && window.app.renderer) window.app.renderer.stopNDativeResonanceTimer();
        this.clearPairSuppression(bond.atomA, bond.atomB);
        return true;
      }
      this.electronResolver.breakBondSlot(bond.atomA, bond.slotA, bond.order);
      this.electronResolver.breakBondSlot(bond.atomB, bond.slotB, bond.order);
      compound.removeBond(bond.id);
      if (hubN && hubN.nDativeHub && !(hub && hub.resonanceActive)) {
        refreshNDativeHub(hubN, compound);
      }
      if (compoundHasNDativeResonance(compound)) {
        reconcileNDativeResonanceHubs([compound]);
      }
      this.clearPairSuppression(bond.atomA, bond.atomB);
      return true;
    }

    deactivateOzone(compound) {
      if (!compound.ozoneActive || !isOzoneOnly(compound)) return false;
      if (window.app && window.app.renderer) window.app.renderer.stopOzoneResonanceTimer();
      if (!layoutOzoneSingleBonds(compound)) return false;
      return true;
    }

    applyOzoneResonanceState(compound, stateIndex) {
      var chain = getOzoneChain(compound);
      if (!chain) return false;
      var leftSlot = bondSlotForAtom(chain.bondLeft, chain.left);
      var centerLeftSlot = bondSlotForAtom(chain.bondLeft, chain.center);
      var centerRightSlot = bondSlotForAtom(chain.bondRight, chain.center);
      var rightSlot = bondSlotForAtom(chain.bondRight, chain.right);

      if (stateIndex === 0) {
        chain.bondLeft.order = 'double';
        chain.bondRight.order = 'single';
        chain.left.ozoneFormalCharge = 0;
        chain.center.ozoneFormalCharge = 1;
        chain.right.ozoneFormalCharge = -1;
        layoutOzoneTerminalDouble(chain.left, leftSlot);
        layoutOzoneCenterPlus(chain.center, centerLeftSlot, centerRightSlot);
        layoutOzoneTerminalMinus(chain.right, rightSlot);
      } else {
        chain.bondLeft.order = 'single';
        chain.bondRight.order = 'double';
        chain.left.ozoneFormalCharge = -1;
        chain.center.ozoneFormalCharge = 1;
        chain.right.ozoneFormalCharge = 0;
        layoutOzoneTerminalMinus(chain.left, leftSlot);
        layoutOzoneCenterPlus(chain.center, centerRightSlot, centerLeftSlot);
        layoutOzoneTerminalDouble(chain.right, rightSlot);
      }

      return compound.atoms.every(function (a) {
        return a.isValenceConsistent() && a.countFreeElectrons() === 0;
      });
    }

    activateOzone(compound, clickedBond) {
      var chain = getOzoneChain(compound);
      if (!chain) return false;
      var state = clickedBond.id === chain.bondLeft.id ? 0 : 1;
      compound.ozoneActive = true;
      compound.ozoneResonanceState = state;
      if (!this.applyOzoneResonanceState(compound, state)) {
        clearOzoneState(compound);
        return false;
      }
      if (window.app && window.app.renderer) window.app.renderer.ensureOzoneResonanceTimer();
      return true;
    }

    cycleBondOrder(bond, compound) {
      const resolver = this.electronResolver;
      if (isBenzeneRingBond(bond, compound)) return false;
      if (isOzoneOnly(compound)) {
        if (compound.ozoneActive) return this.deactivateOzone(compound);
        if (bond.order !== 'single') return false;
        if (!compound.bonds.every(function (b) { return b.order === 'single'; })) return false;
        return this.activateOzone(compound, bond);
      }
      if (bond.order === 'n_dative' || bond.order === 'p_dative' ||
          bond.order === 's_dative' || bond.order === 'cl_dative') return false;
      var hubN = oxoHubAtomFromBond(bond) ||
        (bond.atomA.element === 'N' ? bond.atomA :
          bond.atomB.element === 'N' ? bond.atomB : null);
      if (hubN && hubN.nDativeHub) {
        var hub = hubN.nDativeHub;
        if (bond.id === hub.receiverBondId) return false;
        if (hub.resonanceActive && bond.id === hub.type2BondId) return false;
        if (hub.resonanceActive && bond.id === hub.type3BondId) return false;
        if (hub.resonanceActive && isNitrogenHubType1Bond(bond, hubN, compound)) return false;
      }
      var next;
      if (isCoOnlyDiatomic(compound)) {
        var idx = CO_BOND_CYCLE.indexOf(bond.order);
        if (idx === -1) return false;
        next = CO_BOND_CYCLE[(idx + 1) % CO_BOND_CYCLE.length];
      } else {
        next = resolver.nextAchievableBondOrder(
          bond.atomA, bond.slotA, bond.atomB, bond.slotB, bond.order);
      }

      if (hubN && hubN.nDativeHub) {
        var activeHub = hubN.nDativeHub;
        if (!activeHub.resonanceActive && bond.order === 'single' &&
            bond.id !== activeHub.receiverBondId) {
          var type2Partner = bond.atomA.element === 'O' ? bond.atomA :
            bond.atomB.element === 'O' ? bond.atomB : null;
          if (type2Partner && atomHasOnlyBondTo(type2Partner, hubN, bond, compound)) {
            bond.order = 'double';
            activeHub.type2BondId = bond.id;
            activeHub.resonanceActive = true;
            activeHub.resonanceState = 0;
            if (!applyNDativeResonanceState(hubN, compound, 0)) {
              bond.order = 'single';
              activeHub.type2BondId = null;
              activeHub.resonanceActive = false;
              return false;
            }
            refreshNDativeHub(hubN, compound);
            if (window.app && window.app.renderer) window.app.renderer.ensureNDativeResonanceTimer();
            return true;
          }
        }
      }

      if (next === bond.order) return false;

      if (next === 'co_dative') {
        return this.applyCoDativeBond(bond);
      }
      if (bond.order === 'co_dative') {
        return this.downgradeFromCoDative(bond, next);
      }

      const nextCost = bondElectronCost(next);
      const currentCost = bondElectronCost(bond.order);

      if (nextCost > currentCost) {
        if (!resolver.canUpgradeBond(bond.atomA, bond.slotA, bond.atomB, bond.slotB, next)) return false;
        if (!resolver.upgradeBond(bond.atomA, bond.slotA, bond.atomB, bond.slotB, next)) return false;
      } else {
        if (!resolver.downgradeBond(bond.atomA, bond.slotA, bond.atomB, bond.slotB, next)) return false;
      }

      bond.order = next;
      if (hubN && hubN.nDativeHub) refreshNDativeHub(hubN, compound);
      return true;
    }

    applyCoDativeBond(bond) {
      if (bond.order !== 'double') return false;
      var ends = getCoBondEnds(bond);
      var resolver = this.electronResolver;
      var savedCarbonOrbitals = Object.assign({}, ends.carbon.orbitals);
      var savedOxygenOrbitals = Object.assign({}, ends.oxygen.orbitals);
      ends.carbon.orbitals[ends.carbonSlot] = 'co_dative';
      ends.oxygen.orbitals[ends.oxygenSlot] = 'co_dative';
      if (!resolver.alignCoDativeLonePairs(
        ends.carbon, ends.oxygen, ends.carbonSlot, ends.oxygenSlot)) {
        ends.carbon.orbitals = savedCarbonOrbitals;
        ends.oxygen.orbitals = savedOxygenOrbitals;
        return false;
      }
      bond.order = 'co_dative';
      return true;
    }

    downgradeFromCoDative(bond, targetOrder) {
      if (bond.order !== 'co_dative') return false;
      var ends = getCoBondEnds(bond);
      if (targetOrder === 'single') {
        bond.order = 'single';
        layoutCoSingleBond(ends.carbon, ends.oxygen, ends.carbonSlot, ends.oxygenSlot);
        return ends.carbon.isValenceConsistent() && ends.oxygen.isValenceConsistent();
      }
      var resolver = this.electronResolver;
      var cRelease = bondAtomElectronCost(ends.carbon, 'co_dative') - bondElectronCost(targetOrder);
      var oRelease = bondAtomElectronCost(ends.oxygen, 'co_dative') - bondElectronCost(targetOrder);
      ends.carbon.orbitals[ends.carbonSlot] = targetOrder;
      ends.oxygen.orbitals[ends.oxygenSlot] = targetOrder;
      if (cRelease > 0) resolver.releaseElectrons(ends.carbon, ends.carbonSlot, cRelease);
      if (oRelease > 0) resolver.releaseElectrons(ends.oxygen, ends.oxygenSlot, oRelease);
      if (!ends.carbon.isValenceConsistent() || !ends.oxygen.isValenceConsistent()) return false;
      bond.order = targetOrder;
      return true;
    }
  }

  // ── Molfile ────────────────────────────────────────────────────────

  function molSymbol(element) {
    if (element.length === 1) return ' ' + element + ' ';
    return ' ' + element;
  }

  function mergeChargeEntries(chargeEntries) {
    var byIdx = new Map();
    for (var i = 0; i < chargeEntries.length; i++) {
      var entry = chargeEntries[i];
      byIdx.set(entry.idx, (byIdx.get(entry.idx) || 0) + entry.charge);
    }
    var merged = [];
    for (var pair of byIdx.entries()) {
      if (pair[1] !== 0) merged.push({ idx: pair[0], charge: pair[1] });
    }
    return merged;
  }

  function generateMolfile(compound) {
    const atoms = compound.atoms, bonds = compound.bonds;
    const atomIndex = new Map(atoms.map((a, i) => [a.id, i + 1]));
    let block = '\n     Chemical Discovery Sandbox 2D\n\n';
    block += String(atoms.length).padStart(3) + String(bonds.length).padStart(3) +
      '  0  0  0  0  0  0  0  0  0999 V2000\n';
    for (const atom of atoms) {
      const x = (atom.x / 40).toFixed(4);
      const y = (-atom.y / 40).toFixed(4);
      block += x.padStart(10) + y.padStart(10) + '0.0000'.padStart(10) + molSymbol(atom.element) +
        '  0  0  0  0  0  0  0  0  0  0  0  0\n';
    }
    var chargeEntries = [];
    var resonanceHubs = findNDativeResonanceHubs(compound);
    for (const bond of bonds) {
      var bondOrder = molExportBondOrder(compound, bond, resonanceHubs);
      block += String(atomIndex.get(bond.atomA.id)).padStart(3) +
        String(atomIndex.get(bond.atomB.id)).padStart(3) +
        String(bondOrder).padStart(3) + '  0  0  0  0\n';
      chargeEntries = chargeEntries.concat(molExportChargeEntries(bond, resonanceHubs, atomIndex));
    }
    if (compound.ozoneActive && isOzoneOnly(compound)) {
      var chain = getOzoneChain(compound);
      if (chain) {
        var minusAtom = chain.left.ozoneFormalCharge === -1 ? chain.left : chain.right;
        chargeEntries.push(
          { idx: atomIndex.get(chain.center.id), charge: 1 },
          { idx: atomIndex.get(minusAtom.id), charge: -1 });
      }
    }
    if (chargeEntries.length) {
      chargeEntries = mergeChargeEntries(chargeEntries);
      block += 'M  CHG  ' + chargeEntries.length;
      for (var ci = 0; ci < chargeEntries.length; ci++) {
        var entry = chargeEntries[ci];
        block += String(entry.idx).padStart(4) + String(entry.charge).padStart(4);
      }
      block += '\n';
    }
    return block + 'M  END\n';
  }

  // ── RDKit ────────────────────────────────────────────────────────
  let rdkitModule = null, initPromise = null;

  function initRDKit() {
    if (rdkitModule) return Promise.resolve(rdkitModule);
    if (initPromise) return initPromise;
    initPromise = new Promise(function (resolve, reject) {
      function check() {
        if (typeof window.initRDKitModule === 'function') {
          window.initRDKitModule().then(function (RDKit) { rdkitModule = RDKit; resolve(RDKit); }).catch(reject);
        } else setTimeout(check, 100);
      }
      check();
    });
    return initPromise;
  }

  function canonicalizeSmilesForLookup(RDKit, smiles) {
    if (!smiles) return smiles;
    var canonMol = RDKit.get_mol(smiles);
    if (!canonMol) return smiles;
    try {
      var canon = canonMol.get_smiles();
      return canon || smiles;
    } finally {
      canonMol.delete();
    }
  }

  function molfileToSmiles(molfile) {
    return initRDKit().then(function (RDKit) {
      var mol = RDKit.get_mol(molfile);
      if (!mol) throw new Error('RDKit could not parse molfile');
      try {
        var smiles = mol.get_smiles();
        if (!smiles) throw new Error('RDKit could not generate SMILES');
        return canonicalizeSmilesForLookup(RDKit, smiles);
      } finally {
        mol.delete();
      }
    });
  }

  function formatFormulaSubscript(formula) {
    if (!formula) return '—';
    var subscripts = '₀₁₂₃₄₅₆₇₈₉';
    return formula.replace(/\d/g, function (digit) {
      return subscripts[parseInt(digit, 10)];
    });
  }

  function formatMolecularWeight(weight) {
    if (weight === undefined || weight === null || weight === '') return '—';
    var value = Number(weight);
    if (Number.isNaN(value)) return String(weight);
    return value.toFixed(value % 1 === 0 ? 0 : 3).replace(/\.?0+$/, '') + ' g/mol';
  }

  // ── PubChem ──────────────────────────────────────────────────────
  function buildPugViewReferenceMap(record) {
    var map = Object.create(null);
    var refs = record && record.Reference;
    if (!refs) return map;
    for (var i = 0; i < refs.length; i++) {
      var ref = refs[i];
      if (ref.ReferenceNumber == null) continue;
      map[ref.ReferenceNumber] = {
        sourceName: ref.SourceName || null,
        sourceUrl: ref.URL || null,
      };
    }
    return map;
  }

  function findPugViewSection(sections, heading) {
    if (!sections) return null;
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (section.TOCHeading === heading) return section;
      var nested = findPugViewSection(section.Section, heading);
      if (nested) return nested;
    }
    return null;
  }

  function extractPugViewStringWithMarkup(value) {
    var items = [];
    if (!value || !value.StringWithMarkup) return items;
    var parts = value.StringWithMarkup;
    if (!Array.isArray(parts)) parts = [parts];
    for (var i = 0; i < parts.length; i++) {
      var text = (parts[i].String || '').replace(/\s+/g, ' ').trim();
      if (text) items.push(text);
    }
    return items;
  }

  function parseRecordDescriptions(record) {
    var refMap = buildPugViewReferenceMap(record);
    var section = findPugViewSection(record.Section, 'Record Description');
    if (!section || !section.Information) return [];
    var descriptions = [];
    for (var i = 0; i < section.Information.length; i++) {
      var info = section.Information[i];
      if (info.Name === 'See Also') continue;
      var texts = extractPugViewStringWithMarkup(info.Value);
      var ref = refMap[info.ReferenceNumber] || {};
      for (var j = 0; j < texts.length; j++) {
        var text = texts[j];
        if (/^see also:/i.test(text)) continue;
        descriptions.push({
          text: text,
          sourceName: ref.sourceName,
          sourceUrl: ref.sourceUrl,
        });
      }
    }
    return descriptions;
  }

  function parsePrimaryHazardPictograms(record) {
    var section = findPugViewSection(record.Section, 'Primary Hazards');
    if (!section && record.Section && record.Section[0] &&
        record.Section[0].TOCHeading === 'Primary Hazards') {
      section = record.Section[0];
    }
    var seen = Object.create(null);
    var pictograms = [];

    function collectIcons(node) {
      if (!node) return;
      if (node.Information) {
        for (var i = 0; i < node.Information.length; i++) {
          var info = node.Information[i];
          var parts = info.Value && info.Value.StringWithMarkup;
          if (!parts) continue;
          if (!Array.isArray(parts)) parts = [parts];
          for (var j = 0; j < parts.length; j++) {
            var markup = parts[j].Markup;
            if (!markup) continue;
            for (var k = 0; k < markup.length; k++) {
              var item = markup[k];
              if (item.Type !== 'Icon' || !item.URL || item.URL.indexOf('/ghs/') === -1) continue;
              var codeMatch = String(item.URL).match(/GHS0[1-9]/i);
              if (!codeMatch) continue;
              var code = codeMatch[0].toUpperCase();
              if (seen[code]) continue;
              seen[code] = true;
              pictograms.push({
                url: 'img/ghs/' + code + '.svg?v=white-figures-1',
                label: item.Extra || 'Hazard',
                code: code,
              });
            }
          }
        }
      }
      if (node.Section) {
        for (var s = 0; s < node.Section.length; s++) collectIcons(node.Section[s]);
      }
    }

    collectIcons(section);
    return pictograms;
  }

  function fetchPubChem(url) {
    return fetch(url, { cache: 'no-store' });
  }

  function pubchemFaultIsBusy(data) {
    var code = data && data.Fault && data.Fault.Code;
    return typeof code === 'string' && /Busy|Throttl/i.test(code);
  }

  function fetchCompoundViewRecord(cid) {
    var url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/' + cid +
      '/JSON/?response_type=display';
    return fetchPubChem(url).then(function (res) {
      if (!res.ok) return { error: true, httpStatus: res.status };
      return res.json().then(function (data) {
        if (pubchemFaultIsBusy(data)) return { error: true, httpStatus: 503 };
        return data;
      }, function () {
        return { error: true };
      });
    }).catch(function () {
      return { error: true, blocked: true };
    });
  }

  function fetchCompoundSdf3d(cid) {
    return fetchPubChem('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + cid +
      '/record/SDF?record_type=3d')
      .then(function (res) {
        if (!res.ok) return { error: true, httpStatus: res.status };
        return res.text().then(function (text) {
          if (!text || !text.trim()) return { error: true };
          if (/PUGREST\.(ServerBusy|TooManyRequests)/i.test(text)) {
            return { error: true, httpStatus: 503 };
          }
          return text;
        }, function () {
          return { error: true };
        });
      }).catch(function () {
        return { error: true, blocked: true };
      });
  }

  function pubchemRequestBlocked(result) {
    if (!result) return false;
    return result.blocked || result.httpStatus === 503 || result.httpStatus === 429;
  }

  function fetchCompoundPanelData(cid) {
    return Promise.all([
      fetchCompoundViewRecord(cid),
      fetchCompoundSdf3d(cid),
    ]).then(function (parts) {
      var viewData = parts[0];
      var sdf3d = parts[1];
      var record = viewData && !viewData.error && viewData.Record ? viewData.Record : null;
      var sdfText = sdf3d && !sdf3d.error ? sdf3d : null;
      return {
        ok: !!(record || sdfText),
        httpStatus: (viewData && viewData.httpStatus) || (sdf3d && sdf3d.httpStatus) || null,
        blocked: pubchemRequestBlocked(viewData) || pubchemRequestBlocked(sdf3d),
        data: {
          descriptions: record ? parseRecordDescriptions(record) : [],
          hazardPictograms: record ? parsePrimaryHazardPictograms(record) : [],
          sdf3d: sdfText,
        },
      };
    });
  }

  function startCompoundPanelEnrichment(compound) {
    var meta = compound && compound.metadata;
    if (!meta || !meta.cid || meta.localOverride || meta._panelLoaded || meta._panelLoading) {
      return;
    }
    meta._panelLoading = true;
    fetchCompoundPanelData(meta.cid).then(function (panel) {
      if (compound.metadata !== meta) return;
      meta._panelLoading = false;
      meta._panelLoaded = true;
      if (panel.ok) {
        meta.descriptions = panel.data.descriptions;
        meta.hazardPictograms = panel.data.hazardPictograms;
        meta.sdf3d = panel.data.sdf3d;
      } else if (panel.httpStatus) {
        console.warn('PubChem panel HTTP', panel.httpStatus, 'for CID', meta.cid);
      }
      var infoPanel = window.app && window.app.infoPanel;
      if (infoPanel) infoPanel.syncEnrichment(compound);
    });
  }

  class PubChemService {
    lookupBySmiles(smiles) {
      var encoded = encodeURIComponent(smiles);
      var url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/' +
        'Title,IUPACName,MolecularFormula,MolecularWeight/JSON?smiles=' + encoded;
      return fetchPubChem(url).then(function (res) {
        if (!res.ok) {
          console.warn('PubChem HTTP', res.status, 'for SMILES', smiles);
          return { found: false, httpStatus: res.status };
        }
        return res.json().then(function (propData) {
          if (pubchemFaultIsBusy(propData)) {
            return { found: false, httpStatus: 503 };
          }
          var props = (propData.PropertyTable && propData.PropertyTable.Properties &&
            propData.PropertyTable.Properties[0]) || {};
          if (props.CID == null) return { found: false };
          var iupacName = props.IUPACName || null;
          var displayName = props.Title || iupacName || null;
          return {
            found: true,
            cid: props.CID,
            name: displayName,
            iupacName: iupacName,
            molecularFormula: props.MolecularFormula || '—',
            molecularWeight: props.MolecularWeight,
            smiles: smiles,
          };
        }, function () {
          return { found: false };
        });
      }).catch(function (err) {
        console.warn('PubChem lookup failed:', err);
        return { found: false, error: err.message, blocked: true };
      });
    }
  }

  class ValidationPipeline {
    constructor(onStatusChange) {
      this.pubchem = new PubChemService();
      this.onStatusChange = onStatusChange;
    }

    applyLocalCuratedValidation(compound, curated, structureKey) {
      var result = applyCuratedIdentification({ found: false }, curated);
      compound.name = result.name;
      compound.metadata = result;
      compound.validationState = 'validated';
      compound.structureKeyAtValidation = structureKey;
      compound._validationStructureKey = null;
      if (this.onStatusChange) this.onStatusChange('Identified: ' + result.name);
      if (window.app) window.app.renderer.setCompoundLabel(compound, compound.name);
    }

    validate(compound) {
      var self = this;
      if (!compound.isMultiAtom() || !canValidateCompound(compound)) return;

      var structureKey = compound.identificationKey();
      if (compound.validationState === 'validated' && compound.structureKeyAtValidation === structureKey) return;
      if (compound.validationState === 'validating') return;
      if (compound.validationState === 'unrecognized' && compound.structureKeyAtValidation === structureKey) return;

      compound._validationStructureKey = structureKey;
      compound.validationState = 'validating';
      compound.name = null;
      compound.metadata = null;
      if (window.app) window.app.renderer.removeCompoundLabels(compound);

      if (isChlorineTrifluoride(compound)) {
        this.applyLocalCuratedValidation(compound, CURATED_CHLORINE_TRIFLUORIDE, structureKey);
        return;
      }
      if (isChlorinePentafluoride(compound)) {
        this.applyLocalCuratedValidation(compound, CURATED_CHLORINE_PENTAFLUORIDE, structureKey);
        return;
      }

      compound._validateGeneration = (compound._validateGeneration || 0) + 1;
      var validateGen = compound._validateGeneration;
      if (self.onStatusChange) self.onStatusChange('Loading...');

      var molfile = generateMolfile(compound);
      molfileToSmiles(molfile).then(function (smiles) {
        if (compound._validateGeneration !== validateGen) return null;
        return self.pubchem.lookupBySmiles(smiles);
      }).then(function (lookupResult) {
        if (!lookupResult || compound._validateGeneration !== validateGen) return;

        if (compound.identificationKey() !== structureKey) {
          compound.validationState = 'pending';
          compound.structureKeyAtValidation = null;
          compound._validationStructureKey = null;
          self.validate(compound);
          return;
        }

        var result = resolveCuratedIdentification(compound, lookupResult);
        if (result.found && pubchemNameIsUsable(result)) {
          compound.name = result.name;
          compound.metadata = result;
          compound.validationState = 'validated';
          compound.structureKeyAtValidation = structureKey;
          compound._validationStructureKey = null;
          if (self.onStatusChange) self.onStatusChange('Identified: ' + result.name);
          if (window.app) window.app.renderer.setCompoundLabel(compound, compound.name);
          startCompoundPanelEnrichment(compound);
          return;
        }

        compound.name = null;
        compound.metadata = null;
        compound.validationState = 'unrecognized';
        compound.structureKeyAtValidation = structureKey;
        compound._validationStructureKey = null;
        if (self.onStatusChange) {
          if (pubchemRequestBlocked(lookupResult)) {
            self.onStatusChange('PubChem unavailable');
          } else {
            self.onStatusChange('Structure balanced but not recognized by PubChem');
          }
        }
        if (window.app) window.app.renderer.removeCompoundLabels(compound);
      }).catch(function (err) {
        if (compound._validateGeneration !== validateGen) return;
        if (compound.identificationKey() !== structureKey) {
          compound.validationState = 'pending';
          compound.structureKeyAtValidation = null;
          compound._validationStructureKey = null;
          self.validate(compound);
          return;
        }
        var curated = resolveCuratedIdentification(compound, { found: false });
        if (curated.found && pubchemNameIsUsable(curated)) {
          compound.name = curated.name;
          compound.metadata = curated;
          compound.validationState = 'validated';
          compound.structureKeyAtValidation = structureKey;
          compound._validationStructureKey = null;
          if (self.onStatusChange) self.onStatusChange('Identified: ' + curated.name);
          if (window.app) window.app.renderer.setCompoundLabel(compound, compound.name);
          return;
        }
        compound.name = null;
        compound.metadata = null;
        compound.validationState = 'unrecognized';
        compound.structureKeyAtValidation = structureKey;
        compound._validationStructureKey = null;
        if (self.onStatusChange) self.onStatusChange('Structure balanced but not recognized by PubChem');
        if (window.app) window.app.renderer.removeCompoundLabels(compound);
        console.error(err);
      });
    }

    checkAndValidate(compounds) {
      var needsRefresh = false;
      for (var ri = 0; ri < compounds.length; ri++) {
        var compound = compounds[ri];
        var hasChlorineHub = false;
        for (var cai = 0; cai < compound.atoms.length; cai++) {
          if (compound.atoms[cai].element === 'Cl') {
            hasChlorineHub = true;
            break;
          }
        }
        reconcileAllChlorineInCompound(compound);
        if (hasChlorineHub && window.app) {
          realignAllChlorineBondPartnersInCompound(compound);
          window.app.renderer.syncPositions(compound);
          window.app.renderer.refreshCompoundOrbitals(compound);
          needsRefresh = true;
        }
      }
      for (var i = 0; i < compounds.length; i++) {
        var cmp = compounds[i];
        if (cmp.isFullyBalanced() || canValidateCompound(cmp)) {
          this.validate(cmp);
        } else if (cmp.validationState !== 'pending' || cmp.name || cmp.metadata) {
          cmp.invalidateIdentification();
          needsRefresh = true;
        }
      }
      if (needsRefresh && window.app) window.app.renderer.refresh();
    }
  }

  // ── InfoPanel ────────────────────────────────────────────────────
  class InfoPanel {
    constructor() {
      this.panel = document.getElementById('compound-panel');
      this.title = document.getElementById('panel-title');
      this.properties = document.getElementById('panel-properties');
      this.loadingEl = document.getElementById('panel-enrichment-status');
      this.attribution = document.getElementById('panel-attribution');
      this.viewer = null;
      this.conformerEl = null;
      this.wheelHandler = null;
      this.boundMouseDown = null;
      this.boundMouseMove = null;
      this.boundMouseUp = null;
      this.boundContextMenu = null;
      document.getElementById('panel-close').addEventListener('click', () => this.hide());
    }

    detachViewerControls() {
      var canvas = this.viewer && this.viewer.getCanvas ? this.viewer.getCanvas() : null;
      if (canvas && this.boundMouseDown) {
        canvas.removeEventListener('mousedown', this.boundMouseDown);
        canvas.removeEventListener('touchstart', this.boundMouseDown);
        canvas.removeEventListener('contextmenu', this.boundContextMenu);
      }
      if (this.boundMouseMove) {
        document.body.removeEventListener('mousemove', this.boundMouseMove);
        document.body.removeEventListener('touchmove', this.boundMouseMove);
      }
      if (this.boundMouseUp) {
        document.body.removeEventListener('mouseup', this.boundMouseUp);
        document.body.removeEventListener('touchend', this.boundMouseUp);
      }
      if (this.conformerEl && this.wheelHandler) {
        this.conformerEl.removeEventListener('wheel', this.wheelHandler);
      }
      this.wheelHandler = null;
      this.boundMouseDown = null;
      this.boundMouseMove = null;
      this.boundMouseUp = null;
      this.boundContextMenu = null;
    }

    attachViewerControls(viewer, hostEl) {
      var canvas = viewer.getCanvas ? viewer.getCanvas() : hostEl.querySelector('canvas');
      if (!canvas) return;

      viewer.control_all = true;

      this.boundMouseDown = viewer._handleMouseDown.bind(viewer);
      this.boundMouseMove = viewer._handleMouseMove.bind(viewer);
      this.boundMouseUp = viewer._handleMouseUp.bind(viewer);
      this.boundContextMenu = viewer._handleContextMenu.bind(viewer);

      canvas.addEventListener('mousedown', this.boundMouseDown, { passive: false });
      canvas.addEventListener('touchstart', this.boundMouseDown, { passive: false });
      canvas.addEventListener('contextmenu', this.boundContextMenu, { passive: false });
      document.body.addEventListener('mousemove', this.boundMouseMove, { passive: false });
      document.body.addEventListener('touchmove', this.boundMouseMove, { passive: false });
      document.body.addEventListener('mouseup', this.boundMouseUp, { passive: false });
      document.body.addEventListener('touchend', this.boundMouseUp, { passive: false });

      this.wheelHandler = function (ev) {
        if (!hostEl.contains(ev.target)) return;
        ev.preventDefault();
        ev.stopPropagation();

        var delta = ev.deltaY;
        if (delta === 0 && typeof ev.wheelDelta === 'number') delta = -ev.wheelDelta;
        if (delta === 0) return;

        var factor = Math.exp(-delta * 0.0015);
        factor = Math.max(0.9, Math.min(1.1, factor));
        viewer.zoom(factor);
      };
      hostEl.addEventListener('wheel', this.wheelHandler, { passive: false });
    }

    markPanelExtra(el, marker) {
      el.setAttribute('data-panel-extra', 'true');
      if (marker) el.setAttribute(marker, 'true');
      return el;
    }

    appendSectionHeading(text, marker) {
      var dt = document.createElement('dt');
      dt.className = 'panel-section-heading';
      dt.textContent = text;
      this.markPanelExtra(dt, marker);
      this.properties.appendChild(dt);
    }

    appendDescriptions(descriptions) {
      if (!descriptions || !descriptions.length) return;
      this.appendSectionHeading('Descriptions', 'data-descriptions-heading');
      for (var i = 0; i < descriptions.length; i++) {
        var entry = descriptions[i];
        var text = typeof entry === 'string' ? entry : entry.text;
        if (!text) continue;
        var sourceName = typeof entry === 'string' ? null : entry.sourceName;
        var sourceUrl = typeof entry === 'string' ? null : entry.sourceUrl;

        var dd = document.createElement('dd');
        dd.className = 'description-value';
        this.markPanelExtra(dd, 'data-description');

        var paragraph = document.createElement('p');
        paragraph.className = 'description-text';
        paragraph.textContent = text;
        dd.appendChild(paragraph);

        if (sourceName && sourceUrl) {
          var sourceLink = document.createElement('a');
          sourceLink.className = 'description-source';
          sourceLink.href = sourceUrl;
          sourceLink.target = '_blank';
          sourceLink.rel = 'noopener noreferrer';
          sourceLink.textContent = sourceName;
          dd.appendChild(sourceLink);
        } else if (sourceName) {
          var sourceLabel = document.createElement('span');
          sourceLabel.className = 'description-source';
          sourceLabel.textContent = sourceName;
          dd.appendChild(sourceLabel);
        }

        this.properties.appendChild(dd);
      }
    }

    renderHazardPictograms(pictograms) {
      if (!pictograms || !pictograms.length) return;

      this.appendSectionHeading('Primary hazards', 'data-hazards-heading');

      var dd = document.createElement('dd');
      dd.className = 'hazard-pictograms-value';
      this.markPanelExtra(dd, 'data-hazard-pictograms');

      var row = document.createElement('div');
      row.className = 'hazard-pictograms';
      for (var i = 0; i < pictograms.length; i++) {
        var pictogram = pictograms[i];
        var wrap = document.createElement('span');
        wrap.className = 'hazard-pictogram';
        wrap.setAttribute('data-tooltip', pictogram.label);
        wrap.setAttribute('role', 'img');
        wrap.setAttribute('aria-label', pictogram.label);

        var img = document.createElement('img');
        img.src = pictogram.url;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        wrap.appendChild(img);
        row.appendChild(wrap);

        if (window.app && window.app.tooltips && window.app.tooltips.bind) {
          window.app.tooltips.bind(wrap);
        }
      }
      dd.appendChild(row);
      this.properties.appendChild(dd);
    }

    appendPubChemAttribution(cid) {
      if (!this.attribution) return;
      this.attribution.textContent = '';
      if (cid == null) {
        this.attribution.hidden = true;
        return;
      }

      this.attribution.hidden = false;
      this.attribution.appendChild(document.createTextNode('Provided by '));

      var link = document.createElement('a');
      link.href = 'https://pubchem.ncbi.nlm.nih.gov/compound/' + cid;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'PubChem';
      this.attribution.appendChild(link);
    }

    clearConformer() {
      this.detachViewerControls();
      if (this.viewer) {
        this.viewer.clear();
        this.viewer = null;
      }
      this.conformerEl = null;
      var conformerLabel = this.properties.querySelector('dt[data-conformer-label]');
      if (conformerLabel) {
        var conformerValue = conformerLabel.nextElementSibling;
        conformerLabel.remove();
        if (conformerValue) conformerValue.remove();
      }
    }

    renderConformer(meta) {
      this.clearConformer();
      if (!meta || !meta.sdf3d || typeof $3Dmol === 'undefined') return;

      var dt = document.createElement('dt');
      dt.textContent = '3D Structure';
      this.markPanelExtra(dt, 'data-conformer-label');

      var dd = document.createElement('dd');
      dd.className = 'conformer-value';
      this.markPanelExtra(dd);

      var host = document.createElement('div');
      host.className = 'panel-conformer';
      dd.appendChild(host);
      this.properties.appendChild(dt);
      this.properties.appendChild(dd);
      this.conformerEl = host;

      this.viewer = $3Dmol.createViewer(this.conformerEl, {
        backgroundColor: 0x0f1419,
        nomouse: true,
      });
      this.viewer.addModel(meta.sdf3d, 'sdf');
      this.viewer.setStyle({}, {
        stick: { radius: 0.12, colorscheme: 'Jmol' },
        sphere: { scale: 0.28, colorscheme: 'Jmol' },
      });
      this.viewer.zoomTo();
      this.viewer.render();
      this.attachViewerControls(this.viewer, this.conformerEl);
    }

    setEnrichmentLoading(visible) {
      if (!this.loadingEl) return;
      this.loadingEl.hidden = !visible;
    }

    clearPanelEnrichment() {
      this.setEnrichmentLoading(false);
      this.clearConformer();
      var extras = this.properties.querySelectorAll('[data-panel-extra]');
      for (var i = 0; i < extras.length; i++) extras[i].remove();
    }

    showEnrichmentLoading() {
      this.setEnrichmentLoading(true);
    }

    renderPanelExtras(meta) {
      if (!meta) return;
      var descriptions = meta.descriptions;
      if (!descriptions && meta.description) {
        descriptions = [{ text: meta.description, sourceName: null, sourceUrl: null }];
      } else if (descriptions && descriptions.length && typeof descriptions[0] === 'string') {
        descriptions = descriptions.map(function (text) {
          return { text: text, sourceName: null, sourceUrl: null };
        });
      }
      this.renderConformer(meta);
      this.renderHazardPictograms(meta.hazardPictograms);
      this.appendDescriptions(descriptions);
    }

    enrichmentIsReady(meta) {
      if (!meta) return false;
      if (meta.localOverride) return true;
      return !!meta._panelLoaded;
    }

    syncEnrichment(compound) {
      if (!compound || this.activeCompound !== compound) return;
      var meta = compound.metadata;
      this.clearPanelEnrichment();
      if (this.enrichmentIsReady(meta)) {
        this.renderPanelExtras(meta);
        return;
      }
      if (meta && meta.cid && !meta.localOverride) {
        this.showEnrichmentLoading();
        startCompoundPanelEnrichment(compound);
      }
    }

    show(compound) {
      if (!compound || !compound.metadata) return;
      this.activeCompound = compound;
      var meta = compound.metadata;
      this.title.textContent = meta.name || meta.iupacName || 'Compound Properties';

      this.clearConformer();
      this.properties.innerHTML = '';
      var entries = [
        ['IUPAC name', meta.iupacName],
        ['Formula', formatFormulaSubscript(meta.molecularFormula)],
        ['Molecular weight', formatMolecularWeight(meta.molecularWeight)],
      ];
      for (var i = 0; i < entries.length; i++) {
        var dt = document.createElement('dt');
        dt.textContent = entries[i][0];
        var dd = document.createElement('dd');
        dd.textContent = entries[i][1] || '—';
        if (entries[i][0] === 'Formula') dd.className = 'formula-value';
        this.properties.appendChild(dt);
        this.properties.appendChild(dd);
      }

      this.syncEnrichment(compound);
      this.appendPubChemAttribution(meta.cid);

      this.panel.classList.remove('hidden');
      this.panel.setAttribute('aria-hidden', 'false');
    }

    hide() {
      this.activeCompound = null;
      this.setEnrichmentLoading(false);
      this.clearConformer();
      this.properties.innerHTML = '';
      if (this.attribution) {
        this.attribution.textContent = '';
        this.attribution.hidden = true;
      }
      this.panel.classList.add('hidden');
      this.panel.setAttribute('aria-hidden', 'true');
    }
  }

  // ── CanvasRenderer ───────────────────────────────────────────────
  class CanvasRenderer {
    constructor(canvasEl, engine) {
      this.engine = engine;
      this.canvas = new fabric.Canvas(canvasEl, {
        selection: false, backgroundColor: 'transparent',
        width: window.innerWidth, height: window.innerHeight,
        enableRetinaScaling: true,
        fireRightClick: true,
        stopContextMenu: true,
      });
      this.atomFabricMap = new Map();
      this.bondFabricMap = new Map();
      this.labelFabricMap = new Map();
      this.dragOrigin = null;
      this.dragCompound = null;
      this.canvasMode = 'edit';
      this.navigatePan = null;
      this.nucleusSwapAtomId = null;
      this.nucleusSwapPhase = 0;
      this.trashBinEl = document.getElementById('canvas-trash-bin');
      this.workspaceEl = document.querySelector('.workspace');
      var self = this;
      window.addEventListener('resize', function () {
        syncLayoutInsets();
        self.resize();
      });
      syncLayoutInsets();
      this.attachCanvasPointerRouting();
      this.attachNavigateControls();
      this.canvas.upperCanvasEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      this.canvas.on('mouse:down', function (opt) {
        if (!self.shouldAllowCanvasEditing()) return;
        var button = opt.e ? opt.e.button : opt.button;
        if (button === 0) {
          self.resetNucleusOrbitalSwap();
          return;
        }
        if (button !== 2) return;
        var atomHit = self.resolveAtomTarget(opt.target);
        if (atomHit) return;
        var hit = self.resolveBondTarget(opt.target);
        if (!hit) {
          hit = self.findBondNearPointer(self.canvas.getPointer(opt.e));
        }
        if (!hit) return;
        self.engine.breakBond(hit.bond, hit.compound);
        self.refresh();
      });
    }

    resetNucleusOrbitalSwap() {
      this.nucleusSwapAtomId = null;
      this.nucleusSwapPhase = 0;
    }

    isToolboxUiTarget(target) {
      return !!(target && target.closest && target.closest(
        '.workspace-left-toolboxes, .canvas-top-toolbox, .atom-toolbox, .atom-toolbox-bookmark, .atom-btn, .canvas-toolbox, .canvas-tool-btn, .canvas-tool-palette'
      ));
    }

    setCanvasMode(mode) {
      this.canvasMode = mode === 'navigate' ? 'navigate' : 'edit';
      this.navigatePan = null;
      if (this.workspaceEl) {
        this.workspaceEl.classList.toggle('canvas-navigate-mode', this.canvasMode === 'navigate');
        this.workspaceEl.classList.remove('canvas-navigate-dragging');
      }
      if (this.canvasMode === 'navigate') {
        this.syncWorkspaceCursor('grab');
      } else {
        this.syncWorkspaceCursor('');
      }
    }

    resetCanvasView() {
      var vpt = this.canvas.viewportTransform.slice();
      vpt[0] = 1;
      vpt[3] = 1;
      this.canvas.setViewportTransform(vpt);
      this.canvas.requestRenderAll();
    }

    zoomCanvasByFactor(factor) {
      this.scaleMoleculesByFactor(factor);
    }

    scaleMoleculesByFactor(factor) {
      if (!factor || !isFinite(factor) || factor <= 0) return;
      var oldScale = moleculeDisplayScale;
      var newScale = Math.max(
        MOLECULE_DISPLAY_SCALE_MIN,
        Math.min(MOLECULE_DISPLAY_SCALE_MAX, oldScale * factor));
      if (Math.abs(newScale - oldScale) < 0.001) {
        updateMoleculeScaleControls();
        return;
      }

      var ratio = newScale / oldScale;
      var pivots = [];
      for (var ci = 0; ci < this.engine.compounds.length; ci++) {
        var compound = this.engine.compounds[ci];
        pivots.push({ compound: compound, center: compound.getCenter() });
      }

      for (var pi = 0; pi < pivots.length; pi++) {
        var entry = pivots[pi];
        var center = entry.center;
        var cmp = entry.compound;
        for (var ai = 0; ai < cmp.atoms.length; ai++) {
          var atom = cmp.atoms[ai];
          atom.x = snapToPixel(center.x + (atom.x - center.x) * ratio);
          atom.y = snapToPixel(center.y + (atom.y - center.y) * ratio);
        }
      }

      moleculeDisplayScale = newScale;

      for (var ri = 0; ri < this.engine.compounds.length; ri++) {
        reconcileAllChlorineInCompound(this.engine.compounds[ri]);
      }
      this.refresh();
      updateMoleculeScaleControls();
    }

    shouldAllowCanvasEditing() {
      return this.canvasMode === 'edit';
    }

    isInfoPanelTarget(target) {
      return !!(target && target.closest && target.closest('#compound-panel, .compound-panel, .panel-conformer'));
    }

    isOverWorkspace(clientX, clientY) {
      if (!this.workspaceEl) return false;
      var rect = this.workspaceEl.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom;
    }

    shouldForwardCanvasPointerEvent(e) {
      if (!this.shouldAllowCanvasEditing()) return false;
      if (this.isInfoPanelTarget(e.target)) return false;
      if (!this.isOverWorkspace(e.clientX, e.clientY)) return false;
      if (this.canvas.findTarget(e)) return true;
      if (this.isToolboxUiTarget(e.target)) return false;
      return true;
    }

    shouldForwardCanvasHoverEvent(e) {
      if (!this.shouldAllowCanvasEditing()) return false;
      if (this.isInfoPanelTarget(e.target)) return false;
      if (!this.isOverWorkspace(e.clientX, e.clientY)) return false;
      if (this.isToolboxUiTarget(e.target) && !this.canvas.findTarget(e)) return false;
      return true;
    }

    forwardCanvasPointerEvent(e) {
      if (typeof this.canvas._onMouseDown === 'function') {
        this.canvas._onMouseDown(e);
      }
    }

    updateCanvasPointerHover(e) {
      if (this.dragCompound) return;
      if (this.canvasMode === 'navigate') return;
      if (this.shouldForwardCanvasHoverEvent(e)) {
        if (typeof this.canvas._onMouseMove === 'function') {
          this.canvas._onMouseMove(e);
        }
        this.syncWorkspaceCursor();
        return;
      }
      if (typeof this.canvas._onMouseOut === 'function') {
        this.canvas._onMouseOut(e);
      }
      this.syncWorkspaceCursor('');
    }

    syncWorkspaceCursor(forcedCursor) {
      if (!this.workspaceEl || this.dragCompound) return;
      if (forcedCursor !== undefined) {
        this.workspaceEl.style.cursor = forcedCursor;
        return;
      }
      var hovered = this.canvas._hoveredTarget;
      if (hovered && hovered.compoundPart === 'label') {
        this.workspaceEl.style.cursor = 'pointer';
        return;
      }
      var upper = this.canvas.upperCanvasEl;
      this.workspaceEl.style.cursor = (upper && upper.style.cursor) ? upper.style.cursor : '';
    }

    attachNavigateControls() {
      var self = this;

      this.workspaceEl.addEventListener('wheel', function (ev) {
        if (self.canvasMode !== 'navigate') return;
        if (self.isInfoPanelTarget(ev.target) || self.isToolboxUiTarget(ev.target)) return;
        if (!self.isOverWorkspace(ev.clientX, ev.clientY)) return;
        ev.preventDefault();

        var delta = ev.deltaY;
        if (delta === 0 && typeof ev.wheelDelta === 'number') delta = -ev.wheelDelta;
        if (delta === 0) return;

        var factor = Math.exp(-delta * 0.0015);
        var zoom = self.canvas.getZoom() * factor;
        zoom = Math.max(0.25, Math.min(4, zoom));
        self.canvas.zoomToPoint(new fabric.Point(ev.clientX, ev.clientY), zoom);
        self.canvas.requestRenderAll();
      }, { passive: false });

      document.addEventListener('mousedown', function (e) {
        if (self.canvasMode !== 'navigate' || e.button !== 0) return;
        if (self.isInfoPanelTarget(e.target) || self.isToolboxUiTarget(e.target)) return;
        if (!self.isOverWorkspace(e.clientX, e.clientY)) return;

        self.navigatePan = {
          startX: e.clientX,
          startY: e.clientY,
          vpt: self.canvas.viewportTransform.slice(),
        };
        if (self.workspaceEl) self.workspaceEl.classList.add('canvas-navigate-dragging');
        self.syncWorkspaceCursor('grabbing');
      }, true);

      document.addEventListener('mousemove', function (e) {
        if (!self.navigatePan) return;
        var vpt = self.navigatePan.vpt.slice();
        vpt[4] = self.navigatePan.vpt[4] + e.clientX - self.navigatePan.startX;
        vpt[5] = self.navigatePan.vpt[5] + e.clientY - self.navigatePan.startY;
        self.canvas.setViewportTransform(vpt);
        self.canvas.requestRenderAll();
      }, true);

      document.addEventListener('mouseup', function () {
        if (!self.navigatePan) return;
        self.navigatePan = null;
        if (self.workspaceEl) self.workspaceEl.classList.remove('canvas-navigate-dragging');
        if (self.canvasMode === 'navigate') self.syncWorkspaceCursor('grab');
      }, true);
    }

    attachCanvasPointerRouting() {
      var self = this;
      document.addEventListener('mousedown', function (e) {
        if (!self.shouldForwardCanvasPointerEvent(e)) return;
        self.forwardCanvasPointerEvent(e);
        e.stopPropagation();
        if (e.button === 2) e.preventDefault();
      }, true);
      document.addEventListener('mousemove', function (e) {
        self.updateCanvasPointerHover(e);
      }, true);
      document.addEventListener('contextmenu', function (e) {
        if (!self.shouldForwardCanvasPointerEvent(e)) return;
        e.preventDefault();
      }, true);
    }

    cycleNucleusOrbitalSwap(atom, compound) {
      var clHub = findCompoundChlorineHub(compound);
      if (clHub) {
        return this.cycleExpandedChlorineOrbitalSwap(clHub, compound);
      }

      if (this.nucleusSwapAtomId !== atom.id) {
        this.nucleusSwapAtomId = atom.id;
        this.nucleusSwapPhase = 0;
      } else {
        this.nucleusSwapPhase = (this.nucleusSwapPhase + 1) % ORBITAL_SWAP_PAIRS.length;
      }

      var useCompoundSwap = compound.atomHasBonds(atom) || compound.isMultiAtom();
      var appliedPhase = null;

      for (var attempt = 0; attempt < ORBITAL_SWAP_PAIRS.length; attempt++) {
        var phase = (this.nucleusSwapPhase + attempt) % ORBITAL_SWAP_PAIRS.length;
        var pair = ORBITAL_SWAP_PAIRS[phase];
        if (compound.simulateNucleusPairSwap(atom, pair[0], pair[1], useCompoundSwap)) {
          appliedPhase = phase;
          break;
        }
      }

      if (appliedPhase === null) return;

      this.nucleusSwapPhase = appliedPhase;

      if (useCompoundSwap) {
        this.refreshCompoundOrbitals(compound);
        this.syncPositions(compound);
        this.syncCompoundLabels(compound);
      } else {
        compound.invalidateIdentification();
        this.refreshAtomOrbitals(atom);
        this.moveAtomParts(atom.id, atom.x, atom.y);
      }

      this.engine.validationPipeline.checkAndValidate(this.engine.compounds);
      this.canvas.requestRenderAll();
    }

    cycleExpandedChlorineOrbitalSwap(chlorine, compound) {
      var sorted = getChlorineSlotsSortedByAngle(chlorine);
      if (sorted.length < 2) return;
      if (compound._clSwapIndex === undefined || compound._clSwapIndex === null) {
        compound._clSwapIndex = 0;
      }
      var idx = compound._clSwapIndex % sorted.length;
      var slotA = sorted[idx];
      var slotB = sorted[(idx + 1) % sorted.length];
      compound._clSwapIndex += 1;
      swapChlorineOrbitalSlots(chlorine, compound, slotA, slotB);
      reconcileChlorineElectrons(chlorine, compound);
      compound.invalidateIdentification();
      this.refreshCompoundOrbitals(compound);
      this.syncPositions(compound);
      this.syncCompoundLabels(compound);
      this.engine.validationPipeline.checkAndValidate(this.engine.compounds);
      this.canvas.requestRenderAll();
    }

    resolveAtomTarget(target) {
      while (target) {
        if (target.atomRef && target.atomPart === 'body') {
          var compound = this.findCompoundForAtom(target.atomRef.id);
          if (compound) return { atom: target.atomRef, compound: compound };
          return null;
        }
        target = target.group;
      }
      return null;
    }

    resolveBondTarget(target) {
      while (target) {
        if (target.bondRef) {
          var bond = target.bondRef;
          var compoundId = bond.atomA.compoundId || bond.atomB.compoundId;
          var compound = this.engine.compounds.find(function (c) { return c.id === compoundId; });
          if (compound) return { bond: bond, compound: compound };
          return null;
        }
        target = target.group;
      }
      return null;
    }

    findBondNearPointer(pointer) {
      var candidates = [];
      var hitRadius = getBondHitStrokeWidth() / 2;
      for (var c = 0; c < this.engine.compounds.length; c++) {
        var compound = this.engine.compounds[c];
        for (var b = 0; b < compound.bonds.length; b++) {
          var bond = compound.bonds[b];
          var endpts = bondEdgeEndpoints(bond);
          var dist = distancePointToSegment(
            pointer.x, pointer.y, endpts.x1, endpts.y1, endpts.x2, endpts.y2
          );
          if (dist > hitRadius) continue;
          var partnerDist = Infinity;
          if (bond.atomA.element === 'F') {
            partnerDist = Math.hypot(pointer.x - bond.atomA.x, pointer.y - bond.atomA.y);
          } else if (bond.atomB.element === 'F') {
            partnerDist = Math.hypot(pointer.x - bond.atomB.x, pointer.y - bond.atomB.y);
          }
          candidates.push({ bond: bond, compound: compound, dist: dist, partnerDist: partnerDist });
        }
      }
      if (!candidates.length) return null;
      candidates.sort(function (a, b) {
        if (Math.abs(a.dist - b.dist) > 0.5) return a.dist - b.dist;
        return a.partnerDist - b.partnerDist;
      });
      return { bond: candidates[0].bond, compound: candidates[0].compound };
    }

    resize() {
      var el = this.workspaceEl || document.querySelector('.workspace');
      var w = el ? el.clientWidth : window.innerWidth;
      var h = el ? el.clientHeight : window.innerHeight;
      this.canvas.setWidth(w);
      this.canvas.setHeight(h);
      this.canvas.renderAll();
    }

    createAtomCircle(atom, compound) {
      var orbitalObjects = [];
      var px = snapToPixel(atom.x);
      var py = snapToPixel(atom.y);
      var slots = getAtomOrbitalSlots(atom);

      for (var s = 0; s < slots.length; s++) {
        var slot = slots[s];
        var pos = getOrbitalPosition(slot, atom.element, atom);
        var orbitalParts = createOrbitalDisplay(
          atom.orbitals[slot], pos.x, pos.y, slot, atom.element, px, py,
          {
            dativeLonePair: isDativeLonePairDisplay(atom, slot),
            pairPerp: getOrbitalPairPerp(atom, slot),
          });
        for (var p = 0; p < orbitalParts.length; p++) {
          orbitalParts[p].atomId = atom.id;
          orbitalParts[p].atomPart = 'orbital';
          orbitalParts[p].orbitalDx = orbitalParts[p].left - px;
          orbitalParts[p].orbitalDy = orbitalParts[p].top - py;
          orbitalObjects.push(orbitalParts[p]);
        }
      }

      var atomRadius = getAtomRadius(atom.element);
      var circle = new fabric.Circle({
        radius: atomRadius, fill: ELEMENT_COLORS[atom.element], stroke: '#2d3a4f', strokeWidth: Math.max(1, mscale(2)),
        left: 0, top: 0, originX: 'center', originY: 'center',
        selectable: false, evented: false,
      });

      var label = new fabric.Text(atom.element, {
        fontSize: getAtomFontSize(atom.element),
        fontWeight: '700',
        fontFamily: ATOM_FONT,
        lineHeight: 1,
        fill: ELEMENT_TEXT_COLORS[atom.element],
        left: 0, top: mscale(ATOM_LABEL_Y_OFFSET), originX: 'center', originY: 'center',
        selectable: false, evented: false,
        objectCaching: false,
        noScaleCache: true,
      });

      var body = new fabric.Group([circle, label], {
        left: px, top: py, originX: 'center', originY: 'center',
        hasControls: false, hasBorders: false, lockRotation: true,
        selectable: false, evented: true,
        objectCaching: false,
        hoverCursor: 'grab',
      });

      body.atomId = atom.id;
      body.atomRef = atom;
      body.atomPart = 'body';

      return { body: body, orbitals: orbitalObjects, atom: atom };
    }

    getAtomParts(atomId) {
      var parts = [];
      var objects = this.canvas.getObjects();
      for (var i = 0; i < objects.length; i++) {
        if (objects[i].atomId === atomId) parts.push(objects[i]);
      }
      return parts;
    }

    placeAtomParts(atomVisual, attachDrag, compound) {
      for (var i = 0; i < atomVisual.orbitals.length; i++) {
        this.canvas.add(atomVisual.orbitals[i]);
      }
      this.canvas.add(atomVisual.body);
      this.atomFabricMap.set(atomVisual.atom.id, atomVisual.body);
      this.stackAtomLayers(atomVisual.atom.id);
      if (attachDrag && compound) {
        this.attachAtomDrag(atomVisual.body, compound);
      }
      return atomVisual.body;
    }

    stackAtomLayers(atomId) {
      var parts = this.getAtomParts(atomId);
      var body = null;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part.atomPart === 'orbital') this.canvas.sendToBack(part);
        else if (part.atomPart === 'body') body = part;
      }
      if (body) this.canvas.bringToFront(body);
    }

    raiseAtomToFront(atomId) {
      var parts = this.getAtomParts(atomId);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].atomPart === 'orbital') this.canvas.bringToFront(parts[i]);
      }
      var body = this.atomFabricMap.get(atomId);
      if (body) this.canvas.bringToFront(body);
    }

    setCanvasElevated(elevated) {
      if (this.workspaceEl) {
        this.workspaceEl.classList.toggle('canvas-elevated', elevated);
        if (elevated) this.resize();
        else {
          syncLayoutInsets();
          this.resize();
        }
      }
      document.body.classList.toggle('dragging-atom', elevated);
    }

    moveAtomParts(atomId, x, y) {
      var px = snapToPixel(x);
      var py = snapToPixel(y);
      var parts = this.getAtomParts(atomId);
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part.atomPart === 'orbital') {
          part.set({ left: px + part.orbitalDx, top: py + part.orbitalDy });
        } else if (part.atomPart === 'body') {
          part.set({ left: px, top: py });
        }
        part.setCoords();
      }
    }

    moveAtomDecorations(atomId, x, y) {
      var px = snapToPixel(x);
      var py = snapToPixel(y);
      var parts = this.getAtomParts(atomId);
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part.atomPart !== 'orbital') continue;
        part.set({ left: px + part.orbitalDx, top: py + part.orbitalDy });
        part.setCoords();
      }
    }

    setAtomPosition(body, x, y) {
      var atom = body.atomRef;
      var px = snapToPixel(x);
      var py = snapToPixel(y);
      atom.x = px;
      atom.y = py;
      body.set({ left: px, top: py });
      body.setCoords();
      this.moveAtomDecorations(atom.id, px, py);
      this.raiseAtomToFront(atom.id);
      this.canvas.requestRenderAll();
    }

    createAtomOnCanvas(element, x, y, attachDrag) {
      var atom = this.engine.createAtom(element, x, y);
      var compound = this.engine.createCompound([atom]);
      var visual = this.createAtomCircle(atom, compound);
      var body = this.placeAtomParts(visual, attachDrag, compound);
      return { atom: atom, compound: compound, body: body };
    }

    removeCompound(compound) {
      this.engine.compounds = this.engine.compounds.filter(function (c) {
        return c.id !== compound.id;
      });
      this.removeCompoundLabels(compound);
      for (var k = 0; k < compound.bonds.length; k++) {
        this.removeBondVisual(this.bondFabricMap.get(compound.bonds[k].id));
        this.bondFabricMap.delete(compound.bonds[k].id);
      }
      for (var i = 0; i < compound.atoms.length; i++) {
        var atomId = compound.atoms[i].id;
        var parts = this.getAtomParts(atomId);
        for (var j = 0; j < parts.length; j++) this.canvas.remove(parts[j]);
        this.atomFabricMap.delete(atomId);
      }
      this.canvas.requestRenderAll();
    }

    removeBondVisual(bondVisual) {
      if (!bondVisual || !bondVisual.parts) return;
      for (var i = 0; i < bondVisual.parts.length; i++) {
        this.canvas.remove(bondVisual.parts[i]);
      }
    }

    addBondVisual(bondVisual, compound) {
      for (var i = 0; i < bondVisual.parts.length; i++) {
        this.canvas.add(bondVisual.parts[i]);
      }
      this.attachBondEvents(bondVisual, compound);
    }

    stackBondVisualBehind(bondVisual) {
      if (!bondVisual || !bondVisual.parts) return;
      for (var i = 0; i < bondVisual.parts.length; i++) {
        this.canvas.sendToBack(bondVisual.parts[i]);
      }
    }

    makeCanvasLine(x1, y1, x2, y2, props) {
      var cx = (x1 + x2) / 2;
      var cy = (y1 + y2) / 2;
      return new fabric.Line([x1 - cx, y1 - cy, x2 - cx, y2 - cy], Object.assign({}, props, {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
      }));
    }

    makeArrowBondLine(x1, y1, x2, y2, props) {
      var dx = x2 - x1;
      var dy = y2 - y1;
      var len = Math.hypot(dx, dy) || 1;
      var ux = dx / len;
      var uy = dy / len;
      var headLen = mscale(10);
      var wing = mscale(3.25);
      var tipX = x2;
      var tipY = y2;
      var baseX = tipX - ux * headLen;
      var baseY = tipY - uy * headLen;
      var parts = [];
      parts.push(this.makeCanvasLine(x1, y1, baseX, baseY, Object.assign({}, props, {
        strokeWidth: getBondStrokeWidth(),
      })));
      parts.push(new fabric.Polygon([
        { x: tipX, y: tipY },
        { x: baseX - uy * wing, y: baseY + ux * wing },
        { x: baseX + uy * wing, y: baseY - ux * wing },
      ], Object.assign({}, props, {
        fill: props.stroke || '#ffffff',
        stroke: props.stroke || '#ffffff',
        strokeWidth: 1,
        objectCaching: false,
        evented: false,
        selectable: false,
      })));
      return parts;
    }

    appendCoordinationArrow(parts, donor, acceptor, lineDefaults) {
      var dx = acceptor.x - donor.x;
      var dy = acceptor.y - donor.y;
      var len = Math.hypot(dx, dy) || 1;
      var donorR = getAtomRadius(donor.element);
      var acceptorR = getAtomRadius(acceptor.element);
      var startX = donor.x + (dx / len) * donorR;
      var startY = donor.y + (dy / len) * donorR;
      var endX = acceptor.x - (dx / len) * acceptorR;
      var endY = acceptor.y - (dy / len) * acceptorR;
      var arrowParts = this.makeArrowBondLine(
        startX, startY, endX, endY,
        Object.assign({}, lineDefaults, {
          stroke: COORDINATION_ARROW_COLOR,
          evented: false,
        }));
      for (var i = 0; i < arrowParts.length; i++) parts.push(arrowParts[i]);
    }

    createBondLine(bond) {
      var x1 = bond.atomA.x;
      var y1 = bond.atomA.y;
      var x2 = bond.atomB.x;
      var y2 = bond.atomB.y;
      var order = bondElectronCost(bond.order);
      var dx = x2 - x1;
      var dy = y2 - y1;
      var len = Math.hypot(dx, dy) || 1;
      var px = -dy / len;
      var py = dx / len;
      var compoundId = bond.atomA.compoundId || bond.atomB.compoundId;
      var parts = [];
      var lineDefaults = {
        strokeLineCap: 'round',
        selectable: false,
        hasControls: false,
        hasBorders: false,
        perPixelTargetFind: false,
        objectCaching: false,
        bondId: bond.id,
        bondRef: bond,
        atomPart: 'bond',
        compoundId: compoundId,
      };

      if (bond.order === 'co_dative') {
        var ends = getCoBondEnds(bond);
        var oX = ends.oxygen.x;
        var oY = ends.oxygen.y;
        var cX = ends.carbon.x;
        var cY = ends.carbon.y;
        var odx = cX - oX;
        var ody = cY - oY;
        var oLen = Math.hypot(odx, ody) || 1;
        var opx = -ody / oLen;
        var opy = odx / oLen;
        var oRadius = getAtomRadius('O');
        var cRadius = getAtomRadius('C');
        var startX = oX + (odx / oLen) * oRadius;
        var startY = oY + (ody / oLen) * oRadius;
        var endX = cX - (odx / oLen) * cRadius;
        var endY = cY - (ody / oLen) * cRadius;
        var coLineOffsets = [-mscale(6), 0, mscale(6)];
        var arrowOff = opy >= 0 ? mscale(6) : -mscale(6);
        var plainOffsets = coLineOffsets.filter(function (o) { return o !== arrowOff; });
        for (var si = 0; si < plainOffsets.length; si++) {
          var so = plainOffsets[si];
          parts.push(this.makeCanvasLine(
            startX + opx * so, startY + opy * so, endX + opx * so, endY + opy * so,
            Object.assign({}, lineDefaults, {
              stroke: '#ffffff',
              strokeWidth: getBondStrokeWidth(),
              evented: false,
            })));
        }
        var arrowParts = this.makeArrowBondLine(
          startX + opx * arrowOff, startY + opy * arrowOff,
          endX + opx * arrowOff, endY + opy * arrowOff,
          Object.assign({}, lineDefaults, {
            stroke: COORDINATION_ARROW_COLOR,
            evented: false,
          }));
        for (var ai = 0; ai < arrowParts.length; ai++) parts.push(arrowParts[ai]);
      } else if (bond.order === 'n_dative' || bondIsResonanceDativeLeg(bond)) {
        var noEnds = getNoBondEnds(bond);
        this.appendCoordinationArrow(parts, noEnds.nitrogen, noEnds.oxygen, lineDefaults);
      } else if (bond.order === 'cl_dative') {
        var cloEnds = getClOBondEnds(bond);
        this.appendCoordinationArrow(parts, cloEnds.chlorine, cloEnds.oxygen, lineDefaults);
      } else if (bond.order === 'p_dative') {
        var poEnds = getPOBondEnds(bond);
        this.appendCoordinationArrow(parts, poEnds.phosphorus, poEnds.oxygen, lineDefaults);
      } else if (bond.order === 's_dative') {
        var soEnds = getSOBondEnds(bond);
        this.appendCoordinationArrow(parts, soEnds.sulfur, soEnds.oxygen, lineDefaults);
      } else if (bondIsOzoneResonanceDativeLeg(bond)) {
        var ozoneEnds = getOzoneDativeBondEnds(bond);
        if (ozoneEnds) {
          this.appendCoordinationArrow(parts, ozoneEnds.donor, ozoneEnds.acceptor, lineDefaults);
        }
      } else {
        var bondSep = mscale(3);
        var tripleSep = mscale(6);
        var offsets = order === 1 ? [0] : order === 2 ? [-bondSep, bondSep] : [-tripleSep, 0, tripleSep];
        for (var i = 0; i < offsets.length; i++) {
          var off = offsets[i];
          var ox = px * off;
          var oy = py * off;
          parts.push(this.makeCanvasLine(
            x1 + ox, y1 + oy, x2 + ox, y2 + oy,
            Object.assign({}, lineDefaults, {
              stroke: '#ffffff',
              strokeWidth: order === 3 && off === 0 ? getBondTripleCenterWidth() : getBondStrokeWidth(),
              evented: false,
            })));
        }
      }

      parts.push(this.makeCanvasLine(x1, y1, x2, y2, Object.assign({}, lineDefaults, {
        stroke: 'rgba(0,0,0,0)',
        strokeWidth: getBondHitStrokeWidth(),
        evented: true,
        hoverCursor: 'pointer',
      })));

      return { parts: parts, bondRef: bond, bondId: bond.id, atomPart: 'bond' };
    }

    stackBondsBehind(compound) {
      for (var j = 0; j < compound.bonds.length; j++) {
        this.stackBondVisualBehind(this.bondFabricMap.get(compound.bonds[j].id));
      }
      for (var i = 0; i < compound.atoms.length; i++) {
        this.stackAtomLayers(compound.atoms[i].id);
      }
    }

    createCompoundLabel(compound, text) {
      var self = this;
      var label = new fabric.Text(text || '', {
        fontSize: COMPOUND_LABEL_FONT_SIZE,
        fill: COMPOUND_LABEL_COLOR,
        fontFamily: ATOM_FONT,
        originX: 'center',
        originY: 'top',
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
        moveCursor: 'pointer',
      });
      label.compoundId = compound.id;
      label.compoundPart = 'label';
      label.compoundRef = compound;
      label.on('mouseover', function () {
        if (!self.dragCompound) {
          label.set('fill', COMPOUND_LABEL_HOVER_COLOR);
          self.canvas.requestRenderAll();
        }
      });
      label.on('mouseout', function () {
        label.set('fill', COMPOUND_LABEL_COLOR);
        self.canvas.requestRenderAll();
      });
      label.on('mousedown', function (opt) {
        if (!self.shouldAllowCanvasEditing()) return;
        if (opt.e.button !== 0 || self.dragCompound) return;
        self.engine.infoPanel.show(compound);
      });
      return label;
    }

    positionCompoundLabels(compound) {
      var label = this.labelFabricMap.get(compound.id + '_label');
      if (!label) return;

      var bounds = compound.getLabelPlacementBounds();
      label.set({
        left: bounds.centerX,
        top: bounds.bottom + COMPOUND_LABEL_BELOW_GAP,
      });
      label.setCoords();
      this.canvas.bringToFront(label);
    }

    removeCompoundLabels(compound) {
      var label = this.labelFabricMap.get(compound.id + '_label');
      if (label) {
        this.canvas.remove(label);
        this.labelFabricMap.delete(compound.id + '_label');
      }
    }

    setCompoundLabel(compound, text) {
      if (!text) {
        this.removeCompoundLabels(compound);
        this.canvas.requestRenderAll();
        return;
      }

      var labelKey = compound.id + '_label';
      var label = this.labelFabricMap.get(labelKey);
      if (label) {
        label.set({ text: text, fill: COMPOUND_LABEL_COLOR });
        label.setCoords();
      } else {
        label = this.createCompoundLabel(compound, text);
        this.canvas.add(label);
        this.labelFabricMap.set(labelKey, label);
      }

      this.positionCompoundLabels(compound);
      this.canvas.requestRenderAll();
    }

    syncCompoundLabels(compound) {
      if (!compound.name) return;
      this.setCompoundLabel(compound, compound.name);
    }

    renderCompound(compound, interactive) {
      if (interactive === undefined) interactive = true;
      var self = this;
      for (var j = 0; j < compound.bonds.length; j++) {
        var bondVisual = this.createBondLine(compound.bonds[j]);
        this.addBondVisual(bondVisual, compound);
        this.bondFabricMap.set(compound.bonds[j].id, bondVisual);
      }
      for (var i = 0; i < compound.atoms.length; i++) {
        var visual = this.createAtomCircle(compound.atoms[i]);
        this.placeAtomParts(visual, interactive, compound);
      }
      this.stackBondsBehind(compound);
      if (compound.name) {
        this.setCompoundLabel(compound, compound.name);
      }
    }

    refreshAtomOrbitals(atom) {
      var compound = this.findCompoundForAtom(atom.id);
      var parts = this.getAtomParts(atom.id);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].atomPart === 'orbital') this.canvas.remove(parts[i]);
      }
      var px = snapToPixel(atom.x);
      var py = snapToPixel(atom.y);
      var slots = getAtomOrbitalSlots(atom);

      for (var s = 0; s < slots.length; s++) {
        var slot = slots[s];
        var pos = getOrbitalPosition(slot, atom.element, atom);
        var orbitalParts = createOrbitalDisplay(
          atom.orbitals[slot], pos.x, pos.y, slot, atom.element, px, py,
          {
            dativeLonePair: isDativeLonePairDisplay(atom, slot),
            pairPerp: getOrbitalPairPerp(atom, slot),
          });
        for (var p = 0; p < orbitalParts.length; p++) {
          orbitalParts[p].atomId = atom.id;
          orbitalParts[p].atomPart = 'orbital';
          orbitalParts[p].orbitalDx = orbitalParts[p].left - px;
          orbitalParts[p].orbitalDy = orbitalParts[p].top - py;
          this.canvas.add(orbitalParts[p]);
        }
      }
      this.stackAtomLayers(atom.id);
      this.canvas.requestRenderAll();
    }

    refreshCompoundOrbitals(compound) {
      for (var i = 0; i < compound.atoms.length; i++) {
        this.refreshAtomOrbitals(compound.atoms[i]);
      }
    }

    findCompoundForAtom(atomId) {
      for (var i = 0; i < this.engine.compounds.length; i++) {
        var compound = this.engine.compounds[i];
        for (var j = 0; j < compound.atoms.length; j++) {
          if (compound.atoms[j].id === atomId) return compound;
        }
      }
      return null;
    }

    attachAtomDrag(fabricBody, compound) {
      if (fabricBody._dragAttached) return;
      fabricBody._dragAttached = true;
      var self = this;
      var dragAtom = fabricBody.atomRef;
      var DRAG_THRESHOLD = 8;

      fabricBody.on('mousedown', function (opt) {
        if (!self.shouldAllowCanvasEditing()) return;
        var activeCompound = self.findCompoundForAtom(dragAtom.id) || compound;

        if (opt.e.button !== 0) return;
        opt.e.preventDefault();

        var pointer = self.canvas.getPointer(opt.e);
        var dragPointerOffset = { x: pointer.x - dragAtom.x, y: pointer.y - dragAtom.y };
        var startClientX = opt.e.clientX;
        var startClientY = opt.e.clientY;
        var dragStarted = false;
        var finished = false;

        self.raiseAtomToFront(dragAtom.id);

        function clearDragState(e) {
          self.setCanvasElevated(false);
          self.setTrashBinHover(false);
          self.dragOrigin = null;
          self.dragCompound = null;
          self.draggedAtomId = null;
          document.body.style.cursor = '';
          self.syncWorkspaceCursor('');
          if (e && self.engine.tooltips) {
            self.engine.tooltips.syncHoverAt(e.clientX, e.clientY);
          }
        }

        function detachListeners() {
          document.removeEventListener('mousemove', onPointerMove);
          document.removeEventListener('mouseup', onPointerUp);
          window.removeEventListener('mouseup', onPointerUp);
          window.removeEventListener('blur', onPointerUp);
        }

        function finishInteraction(e) {
          if (finished) return;
          finished = true;
          detachListeners();

          activeCompound = self.findCompoundForAtom(dragAtom.id) || activeCompound;

          if (!dragStarted) {
            if (self.trySnapOnClick(activeCompound)) {
              clearDragState(e);
              return;
            }
            if (activeCompound.atomHasBonds(dragAtom) || activeCompound.isMultiAtom()) {
              activeCompound.rotateAroundAtom(dragAtom);
              reorientAllChlorineFluorines(activeCompound);
              reconcileNDativeResonanceHubs([activeCompound]);
              self.refreshCompoundOrbitals(activeCompound);
              self.syncPositions(activeCompound);
              self.syncCompoundLabels(activeCompound);
            } else {
              dragAtom.rotateOrbitals90();
              activeCompound.invalidateIdentification();
              self.refreshAtomOrbitals(dragAtom);
              self.moveAtomParts(dragAtom.id, dragAtom.x, dragAtom.y);
              self.engine.validationPipeline.checkAndValidate(self.engine.compounds);
            }
            self.canvas.requestRenderAll();
            clearDragState(e);
            return;
          }

          var droppedCompound = self.findCompoundForAtom(dragAtom.id) || activeCompound;
          clearDragState(e);
          reconcileNDativeResonanceHubs(self.engine.compounds);
          if (!self.deleteCompoundsWithAtomsInTrash() && droppedCompound) {
            self.handleDrop(droppedCompound);
          }
        }

        function onPointerMove(e) {
          if (finished) return;
          if (!dragStarted) {
            if (Math.hypot(e.clientX - startClientX, e.clientY - startClientY) <= DRAG_THRESHOLD) return;
            dragStarted = true;
            self.dragPointerOffset = dragPointerOffset;
            self.dragOrigin = activeCompound.atoms.map(function (a) { return { id: a.id, x: a.x, y: a.y }; });
            self.dragCompound = activeCompound;
            self.draggedAtomId = dragAtom.id;
            self.engine.snapEngine.clearSuppression(dragAtom);
            self.setCanvasElevated(true);
            document.body.style.cursor = 'grabbing';
          }
          if (dragStarted && self.engine.tooltips) {
            self.engine.tooltips.syncHoverAt(e.clientX, e.clientY);
          }
          if (!self.dragCompound) return;
          var coords = self.canvas.getPointer(e);
          var nx = snapToPixel(coords.x - self.dragPointerOffset.x);
          var ny = snapToPixel(coords.y - self.dragPointerOffset.y);
          var dx = nx - dragAtom.x;
          var dy = ny - dragAtom.y;
          if (dx === 0 && dy === 0) return;
          dragAtom.x = nx;
          dragAtom.y = ny;
          fabricBody.set({ left: nx, top: ny });
          fabricBody.setCoords();
          for (var i = 0; i < activeCompound.atoms.length; i++) {
            var a = activeCompound.atoms[i];
            if (a.id === dragAtom.id) continue;
            a.x = snapToPixel(a.x + dx);
            a.y = snapToPixel(a.y + dy);
            self.moveAtomParts(a.id, a.x, a.y);
          }
          self.moveAtomDecorations(dragAtom.id, nx, ny);
          self.syncBonds(activeCompound);
          self.syncCompoundLabels(activeCompound);
          self.raiseAtomToFront(dragAtom.id);
          self.setTrashBinHover(self.compoundHasAtomInTrashBin(activeCompound));
          self.canvas.requestRenderAll();
        }

        function onPointerUp(e) {
          finishInteraction(e);
        }

        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('blur', onPointerUp);
      });
    }

    syncBonds(compound) {
      for (var j = 0; j < compound.bonds.length; j++) {
        var bond = compound.bonds[j];
        if (!this.bondFabricMap.has(bond.id)) continue;
        this.removeBondVisual(this.bondFabricMap.get(bond.id));
        var bondVisual = this.createBondLine(bond);
        this.addBondVisual(bondVisual, compound);
        this.bondFabricMap.set(bond.id, bondVisual);
      }
      this.stackBondsBehind(compound);
      this.canvas.renderAll();
    }

    attachBondEvents(bondVisual, compound) {
      var self = this;
      if (!bondVisual || !bondVisual.parts) return;
      for (var i = 0; i < bondVisual.parts.length; i++) {
        var part = bondVisual.parts[i];
        if (!part.evented) continue;
        part.on('mousedown', function (e) {
          var bond = bondVisual.bondRef;
          if (!bond) return;
          var button = e.e ? e.e.button : e.button;
          if (button !== 0) return;
          if (self.engine.snapEngine.cycleBondOrder(bond, compound)) {
            var compoundId = bond.atomA.compoundId || bond.atomB.compoundId;
            var bondCompound = self.engine.compounds.find(function (c) { return c.id === compoundId; });
            if (bondCompound) bondCompound.invalidateIdentification();
            self.engine.validationPipeline.checkAndValidate(self.engine.compounds);
            self.refresh();
          }
        });
      }
    }

    syncPositions(compound) {
      for (var i = 0; i < compound.atoms.length; i++) {
        var atom = compound.atoms[i];
        this.moveAtomParts(atom.id, atom.x, atom.y);
        this.stackAtomLayers(atom.id);
      }
      this.syncBonds(compound);
      this.syncCompoundLabels(compound);
    }

    trySnapOnClick(compound) {
      if (!this.engine.snapEngine.hasPendingBond(compound, this.engine.compounds)) return false;
      this.handleDrop(compound);
      return true;
    }

    handleDrop(compound) {
      var activeCompound = compound;
      var formedAny = false;
      var maxSteps = 12;

      for (var stepNum = 0; stepNum < maxSteps; stepNum++) {
        var step = this.engine.snapEngine.findNextBondStep(
          activeCompound, this.engine.compounds);
        if (!step) break;

        var bond = this.engine.snapEngine.executeOneBondStep(step);
        if (!bond) break;

        activeCompound.addBond(bond);
        this.engine.mergeCompounds(step.partnerCompound, activeCompound);
        var clInBond = bond.atomA.element === 'Cl' ? bond.atomA :
          bond.atomB.element === 'Cl' ? bond.atomB : null;
        if (clInBond) {
          reconcileChlorineElectrons(clInBond, activeCompound);
        } else {
          reorientAllChlorineFluorines(activeCompound);
        }
        formedAny = true;
      }

      for (var cmi = 0; cmi < activeCompound.atoms.length; cmi++) {
        if (activeCompound.atoms[cmi].element === 'Cl') {
          reconcileChlorineElectrons(activeCompound.atoms[cmi], activeCompound);
        }
      }

      if (formedAny) {
        for (var ci = 0; ci < this.engine.compounds.length; ci++) {
          var cmp = this.engine.compounds[ci];
          for (var ai = 0; ai < cmp.atoms.length; ai++) {
            if (cmp.atoms[ai].nDativeHub) refreshNDativeHub(cmp.atoms[ai], cmp);
          }
        }
        this.refresh();
        this.engine.validationPipeline.checkAndValidate(this.engine.compounds);
      } else {
        reconcileNDativeResonanceHubs(this.engine.compounds);
        this.syncPositions(compound);
        this.syncCompoundLabels(compound);
      }
    }

    clear() {
      this.stopOzoneResonanceTimer();
      this.stopNDativeResonanceTimer();
      this.stopBenzeneResonanceTimer();
      this.canvas.clear();
      this.canvas.backgroundColor = 'transparent';
      this.atomFabricMap.clear();
      this.bondFabricMap.clear();
      this.labelFabricMap.clear();
    }

    refresh() {
      this.clear();
      reconcileNDativeResonanceHubs(this.engine.compounds);
      for (var i = 0; i < this.engine.compounds.length; i++) {
        reconcileAllChlorineInCompound(this.engine.compounds[i]);
        reorientAllChlorineFluorines(this.engine.compounds[i]);
        this.renderCompound(this.engine.compounds[i]);
      }
      this.canvas.renderAll();
      this.ensureOzoneResonanceTimer();
      this.ensureNDativeResonanceTimer();
      this.ensureBenzeneResonanceTimer();
    }

    stopNDativeResonanceTimer() {
      if (this.nDativeResonanceTimer) {
        clearInterval(this.nDativeResonanceTimer);
        this.nDativeResonanceTimer = null;
      }
    }

    ensureNDativeResonanceTimer() {
      var self = this;
      var hasHub = this.engine.compounds.some(compoundHasNDativeResonance);
      if (!hasHub) {
        this.stopNDativeResonanceTimer();
        return;
      }
      if (this.nDativeResonanceTimer) return;
      this.nDativeResonanceTimer = setInterval(function () {
        var changed = false;
        for (var i = 0; i < self.engine.compounds.length; i++) {
          var compound = self.engine.compounds[i];
          for (var ai = 0; ai < compound.atoms.length; ai++) {
            var nitrogen = compound.atoms[ai];
            var hub = nitrogen.nDativeHub;
            if (!hub || !hub.resonanceActive) continue;
            var nextState = ((hub.resonanceState || 0) + 1) % oxoResonanceModulus(hub);
            if (applyNDativeResonanceState(nitrogen, compound, nextState)) {
              self.syncBonds(compound);
              self.refreshCompoundOrbitals(compound);
              if (compound.name) self.positionCompoundLabels(compound);
              changed = true;
            }
          }
        }
        if (changed) self.canvas.renderAll();
        if (!self.engine.compounds.some(compoundHasNDativeResonance)) {
          self.stopNDativeResonanceTimer();
        }
      }, 1000);
    }

    stopOzoneResonanceTimer() {
      if (this.ozoneResonanceTimer) {
        clearInterval(this.ozoneResonanceTimer);
        this.ozoneResonanceTimer = null;
      }
    }

    ensureOzoneResonanceTimer() {
      var self = this;
      var hasOzone = this.engine.compounds.some(function (c) { return c.ozoneActive; });
      if (!hasOzone) {
        this.stopOzoneResonanceTimer();
        return;
      }
      if (this.ozoneResonanceTimer) return;
      this.ozoneResonanceTimer = setInterval(function () {
        var changed = false;
        for (var i = 0; i < self.engine.compounds.length; i++) {
          var compound = self.engine.compounds[i];
          if (!compound.ozoneActive) continue;
          compound.ozoneResonanceState = compound.ozoneResonanceState === 0 ? 1 : 0;
          if (self.engine.snapEngine.applyOzoneResonanceState(compound, compound.ozoneResonanceState)) {
            self.syncBonds(compound);
            self.refreshCompoundOrbitals(compound);
            if (compound.name) self.positionCompoundLabels(compound);
            changed = true;
          }
        }
        if (changed) self.canvas.renderAll();
        if (!self.engine.compounds.some(function (c) { return c.ozoneActive; })) {
          self.stopOzoneResonanceTimer();
        }
      }, 1000);
    }

    stopBenzeneResonanceTimer() {
      if (this.benzeneResonanceTimer) {
        clearInterval(this.benzeneResonanceTimer);
        this.benzeneResonanceTimer = null;
      }
    }

    ensureBenzeneResonanceTimer() {
      var self = this;
      var hasBenzene = this.engine.compounds.some(compoundHasActiveBenzeneResonance);
      if (!hasBenzene) {
        this.stopBenzeneResonanceTimer();
        return;
      }
      if (this.benzeneResonanceTimer) return;
      this.benzeneResonanceTimer = setInterval(function () {
        var changed = false;
        for (var i = 0; i < self.engine.compounds.length; i++) {
          var compound = self.engine.compounds[i];
          var rings = compound.benzeneRings || [];
          for (var ri = 0; ri < rings.length; ri++) {
            var ring = rings[ri];
            if (!ring.active) continue;
            var nextState = ring.state === 0 ? 1 : 0;
            if (applyBenzeneResonanceState(compound, ring, nextState)) {
              self.syncBonds(compound);
              self.refreshCompoundOrbitals(compound);
              if (compound.name) self.positionCompoundLabels(compound);
              changed = true;
            }
          }
        }
        if (changed) self.canvas.renderAll();
        if (!self.engine.compounds.some(compoundHasActiveBenzeneResonance)) {
          self.stopBenzeneResonanceTimer();
        }
      }, 1000);
    }

    addAtomAt(element, x, y, snapOnPlace) {
      if (snapOnPlace === undefined) snapOnPlace = true;
      var result = this.createAtomOnCanvas(element, x, y, true);
      if (snapOnPlace) this.handleDrop(result.compound);
      return result;
    }

    clientToCanvas(clientX, clientY) {
      return this.canvas.getPointer({ clientX: clientX, clientY: clientY });
    }

    getTrashBinCanvasRect() {
      if (!this.trashBinEl) return null;
      var rect = this.trashBinEl.getBoundingClientRect();
      var tl = this.clientToCanvas(rect.left, rect.top);
      var tr = this.clientToCanvas(rect.right, rect.top);
      var bl = this.clientToCanvas(rect.left, rect.bottom);
      var br = this.clientToCanvas(rect.right, rect.bottom);
      return {
        left: Math.min(tl.x, tr.x, bl.x, br.x),
        top: Math.min(tl.y, tr.y, bl.y, br.y),
        right: Math.max(tl.x, tr.x, bl.x, br.x),
        bottom: Math.max(tl.y, tr.y, bl.y, br.y),
      };
    }

    atomOverlapsTrashBin(atom) {
      var trash = this.getTrashBinCanvasRect();
      if (!trash) return false;
      var radius = getAtomRadius(atom.element);
      var closestX = Math.max(trash.left, Math.min(atom.x, trash.right));
      var closestY = Math.max(trash.top, Math.min(atom.y, trash.bottom));
      var dx = atom.x - closestX;
      var dy = atom.y - closestY;
      return dx * dx + dy * dy <= radius * radius;
    }

    compoundHasAtomInTrashBin(compound) {
      if (!compound) return false;
      for (var i = 0; i < compound.atoms.length; i++) {
        if (this.atomOverlapsTrashBin(compound.atoms[i])) return true;
      }
      return false;
    }

    setTrashBinHover(active) {
      if (!this.trashBinEl) return;
      this.trashBinEl.classList.toggle('drag-hover', !!active);
    }

    deleteCompoundsWithAtomsInTrash() {
      var deleted = false;
      var compounds = this.engine.compounds.slice();
      for (var i = 0; i < compounds.length; i++) {
        if (this.compoundHasAtomInTrashBin(compounds[i])) {
          this.removeCompound(compounds[i]);
          deleted = true;
        }
      }
      if (deleted) {
        this.engine.validationPipeline.checkAndValidate(this.engine.compounds);
        this.setTrashBinHover(false);
      }
      return deleted;
    }
  }

  // ── App ──────────────────────────────────────────────────────────
  class ChemicalSandbox {
    constructor() {
      this.compounds = [];
      this.snapEngine = new SnapEngine();
      this.infoPanel = new InfoPanel();
      this.statusEl = document.getElementById('status');
      var self = this;
      this.validationPipeline = new ValidationPipeline(function (msg) { self.setStatus(msg); });
      this.renderer = new CanvasRenderer(document.getElementById('chemistry-canvas'), this);
      this.setupPalette();
      this.setupAtomToolboxExpand();
      this.setupCanvasTools();
      this.tooltips = setupTooltips();
      this.init();
    }

    init() {
      var self = this;
      this.setStatus('Loading RDKit…');
      initRDKit().then(function () {
        self.setStatus('Ready — drag atoms onto the canvas');
      }).catch(function (err) {
        self.setStatus('RDKit failed to load — PubChem validation unavailable');
        console.error(err);
      });
    }

    setStatus(msg) { if (this.statusEl) this.statusEl.textContent = msg; }

    hasValidatingCompound() {
      for (var i = 0; i < this.compounds.length; i++) {
        if (this.compounds[i].validationState === 'validating') return true;
      }
      return false;
    }

    setActionStatus(msg) {
      if (this.hasValidatingCompound()) return;
      this.setStatus(msg);
    }

    createAtom(element, x, y) {
      return new Atom(element, x, y);
    }

    createCompound(atoms) {
      var compound = new Compound(atoms);
      this.compounds.push(compound);
      return compound;
    }

    mergeCompounds(source, target) {
      target.merge(source);
      this.compounds = this.compounds.filter(function (c) { return c.id !== source.id; });
    }

    breakBond(bond, compound) {
      var atomA = bond.atomA;
      var atomB = bond.atomB;
      var slotA = bond.slotA;
      var slotB = bond.slotB;

      var removed = this.snapEngine.breakBond(bond, compound);
      if (!removed) {
        compound.invalidateIdentification();
        this.validationPipeline.checkAndValidate(this.compounds);
        return;
      }

      var parts = partitionCompoundByBonds(compound);
      this.separateBondFragments(atomA, atomB, slotA, slotB, parts);
      this.applyCompoundSplit(compound, parts);

      for (var ci = 0; ci < this.compounds.length; ci++) {
        reconcileAllChlorineInCompound(this.compounds[ci]);
        realignAllChlorineBondPartnersInCompound(this.compounds[ci]);
      }

      reconcileNDativeResonanceHubs(this.compounds);
      for (var bzi = 0; bzi < this.compounds.length; bzi++) {
        refreshBenzeneRings(this.compounds[bzi]);
      }
      this.validationPipeline.checkAndValidate(this.compounds);
      if (window.app && window.app.renderer) {
        window.app.renderer.refresh();
      }
    }

    findFragmentContaining(parts, atom) {
      for (var i = 0; i < parts.length; i++) {
        for (var j = 0; j < parts[i].atoms.length; j++) {
          if (parts[i].atoms[j].id === atom.id) return parts[i];
        }
      }
      return null;
    }

    translateFragment(fragment, dx, dy) {
      for (var i = 0; i < fragment.atoms.length; i++) {
        fragment.atoms[i].x = snapToPixel(fragment.atoms[i].x + dx);
        fragment.atoms[i].y = snapToPixel(fragment.atoms[i].y + dy);
      }
    }

    separateBondFragments(atomA, atomB, slotA, slotB, parts) {
      var vecA = getAtomSlotVector(atomA, slotA);
      var vecB = getAtomSlotVector(atomB, slotB);
      var pushA = { dx: -vecA.dx * mscale(BOND_BREAK_PUSH), dy: -vecA.dy * mscale(BOND_BREAK_PUSH) };
      var pushB = { dx: -vecB.dx * mscale(BOND_BREAK_PUSH), dy: -vecB.dy * mscale(BOND_BREAK_PUSH) };
      var fragA = this.findFragmentContaining(parts, atomA);
      var fragB = this.findFragmentContaining(parts, atomB);

      if (!fragA || !fragB || fragA === fragB) {
        atomA.x = snapToPixel(atomA.x + pushA.dx);
        atomA.y = snapToPixel(atomA.y + pushA.dy);
        atomB.x = snapToPixel(atomB.x + pushB.dx);
        atomB.y = snapToPixel(atomB.y + pushB.dy);
        return;
      }

      this.translateFragment(fragA, pushA.dx, pushA.dy);
      this.translateFragment(fragB, pushB.dx, pushB.dy);
    }

    applyCompoundSplit(compound, parts) {
      if (parts.length <= 1) return;

      parts.sort(function (a, b) {
        var aHub = a.atoms.some(function (at) { return at.nDativeHub; });
        var bHub = b.atoms.some(function (at) { return at.nDativeHub; });
        if (aHub !== bHub) return aHub ? -1 : 1;
        return b.atoms.length - a.atoms.length;
      });

      var savedRings = (compound.benzeneRings || []).slice();
      compound.benzeneRings = [];

      compound.atoms = parts[0].atoms;
      compound.bonds = parts[0].bonds;
      for (var i = 0; i < compound.atoms.length; i++) {
        compound.atoms[i].compoundId = compound.id;
      }
      compound.invalidateIdentification();

      var splitCompounds = [compound];
      for (var p = 1; p < parts.length; p++) {
        var fragment = parts[p];
        var newCompound = this.createCompound(fragment.atoms);
        for (var b = 0; b < fragment.bonds.length; b++) {
          newCompound.addBond(fragment.bonds[b]);
        }
        splitCompounds.push(newCompound);
      }
      assignBenzeneRingsToOwningCompounds(savedRings, splitCompounds);
    }

    clearCanvas() {
      this.renderer.stopOzoneResonanceTimer();
      this.renderer.stopBenzeneResonanceTimer();
      this.compounds = [];
      this.renderer.clear();
      this.renderer.canvas.renderAll();
      this.setStatus('Canvas cleared');
    }

    findCompoundForAtom(atomId) {
      for (var i = 0; i < this.compounds.length; i++) {
        var compound = this.compounds[i];
        for (var j = 0; j < compound.atoms.length; j++) {
          if (compound.atoms[j].id === atomId) return compound;
        }
      }
      return null;
    }

    generateBenzeneRing() {
      var canvas = this.renderer && this.renderer.canvas;
      var cx = canvas ? canvas.getWidth() / 2 : 400;
      var cy = canvas ? canvas.getHeight() / 2 : 300;
      var side = getBondCenterDistance('C', 'C');
      var carbons = [];
      for (var i = 0; i < 6; i++) {
        var angleDeg = i * 60;
        var rad = angleDeg * Math.PI / 180;
        var carbon = this.createAtom(
          'C',
          snapToPixel(cx + Math.cos(rad) * side),
          snapToPixel(cy + Math.sin(rad) * side));
        carbons.push(carbon);
      }

      var ringId = generateUniqueId();
      for (var ci = 0; ci < 6; ci++) {
        var atom = carbons[ci];
        var prev = carbons[(ci + 5) % 6];
        var next = carbons[(ci + 1) % 6];
        atom.benzeneRingId = ringId;
        atom.benzeneIndex = ci;
        atom.bzSlotAngles = {
          ringPrev: Math.atan2(prev.y - atom.y, prev.x - atom.x) * 180 / Math.PI,
          ringNext: Math.atan2(next.y - atom.y, next.x - atom.x) * 180 / Math.PI,
          exo: 0,
        };
        atom.orbitals = { ringPrev: 0, ringNext: 0, exo: 1 };
      }
      assignBenzeneExoCardinals(carbons);

      var compound = this.createCompound(carbons);
      var bondIds = [];
      for (var bi = 0; bi < 6; bi++) {
        var a = carbons[bi];
        var b = carbons[(bi + 1) % 6];
        var ringBond = new Bond(a, b, 'ringNext', 'ringPrev', 'single');
        compound.addBond(ringBond);
        bondIds.push(ringBond.id);
      }

      var ring = { id: ringId, bondIds: bondIds, active: true, state: 0 };
      compound.benzeneRings = [ring];
      if (!applyBenzeneResonanceState(compound, ring, 0)) {
        this.compounds = this.compounds.filter(function (c) { return c.id !== compound.id; });
        this.setStatus('Could not generate a benzene ring');
        return null;
      }

      this.renderer.refresh();
      this.setStatus('Added a benzene ring');
      return compound;
    }

    fillFreeElectronsWithHydrogen() {
      var resolver = this.snapEngine.electronResolver;
      var slots = ['up', 'down', 'left', 'right'];
      var tasks = [];

      for (var ci = 0; ci < this.compounds.length; ci++) {
        var compound = this.compounds[ci];
        for (var ai = 0; ai < compound.atoms.length; ai++) {
          var atom = compound.atoms[ai];
          var atomSlots = getAtomOrbitalSlots(atom);
          for (var si = 0; si < atomSlots.length; si++) {
            var slot = atomSlots[si];
            if (atom.orbitals[slot] === 1) {
              tasks.push({ atom: atom, slot: slot, compound: compound });
            }
          }
        }
      }

      if (!tasks.length) {
        this.setStatus('No free electrons to fill');
        return 0;
      }

      var filled = 0;
      for (var ti = 0; ti < tasks.length; ti++) {
        var task = tasks[ti];
        var host = task.atom;
        var hostSlot = task.slot;
        if (host.orbitals[hostSlot] !== 1) continue;

        var hostCompound = this.findCompoundForAtom(host.id) || task.compound;
        var vec = getAtomSlotVector(host, hostSlot);
        var dist = getBondCenterDistance('H', host.element);
        var hx = snapToPixel(host.x + vec.dx * dist);
        var hy = snapToPixel(host.y + vec.dy * dist);
        var hSlot = slotTowardPoint(hx, hy, host.x, host.y);

        var hAtom = this.createAtom('H', hx, hy);
        var hCompound = this.createCompound([hAtom]);

        if (!resolver.formBond(host, hostSlot, hAtom, hSlot)) {
          this.compounds = this.compounds.filter(function (c) { return c.id !== hCompound.id; });
          continue;
        }

        var hBond = new Bond(host, hAtom, hostSlot, hSlot, 'single');
        hostCompound.addBond(hBond);
        this.mergeCompounds(hCompound, hostCompound);
        filled += 1;
      }

      if (filled > 0) {
        this.renderer.refresh();
        this.setActionStatus('Filled ' + filled + ' free electron' + (filled === 1 ? '' : 's') + ' with hydrogen');
        this.validationPipeline.checkAndValidate(this.compounds);
      } else {
        this.setStatus('Could not fill free electrons');
      }

      return filled;
    }

    setupPalette() {
      var self = this;
      var workspace = document.querySelector('.workspace');
      var buttons = document.querySelectorAll('.atom-btn');
      var pointerDrag = null;
      var suppressPaletteClick = false;

      function onPointerMove(e) {
        if (!pointerDrag) return;
        var coords = self.renderer.clientToCanvas(e.clientX, e.clientY);

        if (!pointerDrag.active) {
          var dx = e.clientX - pointerDrag.startX;
          var dy = e.clientY - pointerDrag.startY;
          if (Math.hypot(dx, dy) <= 6) return;
          pointerDrag.active = true;
          document.body.style.cursor = 'grabbing';
          self.renderer.setCanvasElevated(true);

          var placed = self.renderer.createAtomOnCanvas(
            pointerDrag.element, coords.x, coords.y, false
          );
          pointerDrag.placed = placed;
        }

        if (pointerDrag.active && self.tooltips) {
          self.tooltips.syncHoverAt(e.clientX, e.clientY);
        }

        if (pointerDrag.placed) {
          self.renderer.setAtomPosition(pointerDrag.placed.body, coords.x, coords.y);
          self.renderer.setTrashBinHover(
            self.renderer.compoundHasAtomInTrashBin(pointerDrag.placed.compound)
          );
        }
      }

      function endPointerDrag(e) {
        if (!pointerDrag) return;
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', endPointerDrag);
        document.body.style.cursor = '';
        self.renderer.setCanvasElevated(false);
        self.renderer.setTrashBinHover(false);
        if (self.tooltips) self.tooltips.syncHoverAt(e.clientX, e.clientY);

        if (pointerDrag.active && pointerDrag.placed) {
          if (self.renderer.deleteCompoundsWithAtomsInTrash()) {
            // compound removed via trash bin overlap
          } else if (isOverWorkspace(e.clientX, e.clientY)) {
            self.renderer.attachAtomDrag(pointerDrag.placed.body, pointerDrag.placed.compound);
            self.renderer.handleDrop(pointerDrag.placed.compound);
            self.setActionStatus('Placed ' + pointerDrag.element + ' atom');
          } else {
            self.renderer.removeCompound(pointerDrag.placed.compound);
          }
          suppressPaletteClick = true;
        }

        pointerDrag = null;
      }

      function isOverWorkspace(clientX, clientY) {
        var rect = workspace.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right &&
          clientY >= rect.top && clientY <= rect.bottom;
      }

      for (var i = 0; i < buttons.length; i++) {
        (function (btn) {
          var element = btn.dataset.element;

          btn.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            if (self.renderer.canvasMode !== 'edit') return;
            pointerDrag = {
              element: element,
              btn: btn,
              startX: e.clientX,
              startY: e.clientY,
              active: false,
              placed: null,
            };
            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', endPointerDrag);
          });

          btn.addEventListener('click', function () {
            if (suppressPaletteClick) {
              suppressPaletteClick = false;
              return;
            }
            var cx = self.renderer.canvas.width / 2;
            var cy = self.renderer.canvas.height / 2;
            var offset = (Math.random() - 0.5) * 40;
            self.renderer.addAtomAt(element, cx + offset, cy + offset, false);
            self.setStatus('Placed ' + element + ' atom');
          });

          btn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              btn.click();
            }
          });
        })(buttons[i]);
      }
    }

    setupAtomToolboxExpand() {
      var self = this;
      var toolbox = document.getElementById('atom-toolbox');
      var expandBtn = document.getElementById('atom-toolbox-expand');
      var extraPalette = document.getElementById('atom-palette-extra');
      if (!toolbox || !expandBtn || !extraPalette) return;

      expandBtn.addEventListener('click', function () {
        var expanded = toolbox.classList.toggle('expanded');
        expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        expandBtn.setAttribute('aria-label', expanded ? 'See less' : 'More options');
        extraPalette.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        syncLayoutInsets();
        if (self.tooltips) self.tooltips.refresh(expandBtn);
      });
    }

    setupCanvasTools() {
      var self = this;
      var zoomInBtn = document.getElementById('btn-canvas-zoom-in');
      var zoomOutBtn = document.getElementById('btn-canvas-zoom-out');

      if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function () {
          self.renderer.scaleMoleculesByFactor(MOLECULE_SCALE_STEP);
        });
      }
      if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function () {
          self.renderer.scaleMoleculesByFactor(1 / MOLECULE_SCALE_STEP);
        });
      }

      document.getElementById('btn-canvas-clear-all').addEventListener('click', function () {
        self.clearCanvas();
      });
      document.getElementById('btn-fill-hydrogen').addEventListener('click', function () {
        self.fillFreeElectronsWithHydrogen();
      });
      var benzeneBtn = document.getElementById('btn-generate-benzene');
      if (benzeneBtn) {
        benzeneBtn.addEventListener('click', function () {
          self.generateBenzeneRing();
        });
      }

      updateMoleculeScaleControls();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncLayoutInsets();
    window.app = new ChemicalSandbox();
    window.__chemTest = {
      generateMolfile: generateMolfile,
      molfileToSmiles: molfileToSmiles,
      getCompoundLabelPlacementBounds: getCompoundLabelPlacementBounds,
      getBoundsForNDativeResonanceState: getBoundsForNDativeResonanceState,
      formClDativeBond: function (chlorine, chlorineSlot, oxygen, oxygenSlot, compound) {
        return window.app.snapEngine.electronResolver.formClDativeBond(
          chlorine, chlorineSlot, oxygen, oxygenSlot, compound, compound);
      },
      formPDativeBond: function (phosphorus, phosphorusSlot, oxygen, oxygenSlot, compound) {
        return window.app.snapEngine.electronResolver.formPDativeBond(
          phosphorus, phosphorusSlot, oxygen, oxygenSlot, compound);
      },
      formSDativeBond: function (sulfur, sulfurSlot, oxygen, oxygenSlot, compound) {
        return window.app.snapEngine.electronResolver.formSDativeBond(
          sulfur, sulfurSlot, oxygen, oxygenSlot, compound);
      },
      generateBenzeneRing: function () {
        return window.app.generateBenzeneRing();
      },
      applyBenzeneResonanceState: applyBenzeneResonanceState,
      formFluorideChlorineLonePairBond: function (fluorine, fluorineSlot, chlorine, chlorineSlot, compound) {
        return window.app.snapEngine.electronResolver.formFluorideChlorineLonePairBond(
          fluorine, fluorineSlot, chlorine, chlorineSlot, compound || null);
      },
      realignChlorineBondPartners: realignChlorineBondPartners,
      reconcileChlorineElectrons: reconcileChlorineElectrons,
      reconcileAllChlorineInCompound: reconcileAllChlorineInCompound,
      tryMergeCompleteChlorineFluorideCluster: tryMergeCompleteChlorineFluorideCluster,
      computePartnerPositionForChlorineBond: computePartnerPositionForChlorineBond,
      molExportBondOrder: molExportBondOrder,
      getChlorineOrbitalSlots: getChlorineOrbitalSlots,
      getChlorineOrbitalAngles: function (atom) { return Object.assign({}, atom.clSlotAngles); },
      redistributeChlorineOrbitalAngles: redistributeChlorineOrbitalAngles,
      chlorineIsDativeDonor: chlorineIsDativeDonor,
      countChlorineDativeLonePairs: countChlorineDativeLonePairs,
      chlorineCanSplitDativeLonePair: chlorineCanSplitDativeLonePair,
      isChlorineTrifluoride: isChlorineTrifluoride,
      isChlorinePentafluoride: isChlorinePentafluoride,
      restoreFluorineToAxisLayout: restoreFluorineToAxisLayout,
      getFluorineChlorineSplitBondInfo: getFluorineChlorineSplitBondInfo,
      syncChlorineSplitBondExtSlots: syncChlorineSplitBondExtSlots,
      orientFluorineToPartner: orientFluorineToPartner,
      getFluorineOrbitalAngles: function (atom) {
        return atom.fSlotAngles ? Object.assign({}, atom.fSlotAngles) : null;
      },
      getOrbitalPairPerp: getOrbitalPairPerp,
      getOrbitalPosition: getOrbitalPosition,
      reorientAllChlorineFluorines: reorientAllChlorineFluorines,
      findFluorineBondSlot: findFluorineBondSlot,
      getBondCenterDistance: getBondCenterDistance,
      recalculateChlorineOrbitalAngles: recalculateChlorineOrbitalAngles,
      finalizeChlorineOrbitalLayout: finalizeChlorineOrbitalLayout,
      findChlorineFluorideBondForAtom: findChlorineFluorideBondForAtom,
      breakChlorineFluorideBond: function (bond, compound) {
        return window.app.snapEngine.breakBond(bond, compound);
      },
      getChlorineFreeElectronSlots: getChlorineFreeElectronSlots,
    };
  });
})();
