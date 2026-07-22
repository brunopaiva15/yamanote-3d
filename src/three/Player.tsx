// Caméra et contrôles : cliquer-glisser pour regarder (fiable en iframe),
// pointer lock en bonus, ZQSD / WASD / flèches, clic net pour s'asseoir,
// joystick tactile additionné au clavier. Balancement caméra lié au train.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG, V_MAX } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { input, moveAxes, consumeLook } from '../systems/input';
import { SEAT_SLOTS, seatOccupant } from '../systems/seats';
import { lookupVocab } from '../systems/vocab';

const AISLE_X = 0.7;
const AISLE_Z = 9.2;
const LOOK_SENS = 0.0032;

export function Player() {
  const { camera, gl } = useThree();
  const pos = useRef(new THREE.Vector3(0, CONFIG.eyeHeight, 4.2));
  const yaw = useRef(Math.PI); // regard initial vers l'avant du wagon (-z... on regarde l'allée)
  const pitch = useRef(0);
  const bobT = useRef(0);
  const playerSeat = useRef(-1);
  const seatAnchor = useRef(new THREE.Vector3());
  const seatYaw = useRef(0);
  const transition = useRef(1); // 0..1, interpolation assise/debout
  const vocabAcc = useRef(0);
  const lookDir = useRef(new THREE.Vector3());
  const camBase = useRef(new THREE.Vector3(0, CONFIG.eyeHeight, 4.2));

  // --- Entrées : clavier + souris + tactile ---
  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let dragDist = 0;
    let pointerDown = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      input.keys.add(e.code);
      if (e.code === 'Space') {
        input.standRequest = true;
        e.preventDefault();
      }
      if (e.code === 'KeyM') useStore.getState().toggleMute();
      if (e.code === 'KeyF') {
        void document.documentElement.requestFullscreen().catch(() => undefined);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => input.keys.delete(e.code);

    const locked = () => document.pointerLockElement === canvas;

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== canvas) return;
      pointerDown = true;
      downX = e.clientX;
      downY = e.clientY;
      dragDist = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    // Pointer lock en bonus, sur double-clic uniquement : jamais au clic
    // simple, sinon le HUD devient incliquable une fois le verrou actif.
    // Échoue sans bruit en iframe ; Échap pour en sortir.
    const onDoubleClick = () => {
      if (locked()) return;
      try {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') void p.catch(() => undefined);
      } catch {
        /* refus silencieux */
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (locked()) {
        input.lookDX += e.movementX;
        input.lookDY += e.movementY;
        dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
        return;
      }
      if (!pointerDown) return;
      input.lookDX += e.movementX;
      input.lookDY += e.movementY;
      dragDist = Math.max(dragDist, Math.hypot(e.clientX - downX, e.clientY - downY));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      // Clic net (sans glisser) : s'asseoir / se lever. Souris uniquement,
      // le tactile a son propre bouton.
      if (dragDist < 6 && e.pointerType === 'mouse' && useStore.getState().started) {
        input.sitRequest = true;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl]);

  const trySit = () => {
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < SEAT_SLOTS.length; i++) {
      if (seatOccupant[i] !== null) continue;
      const s = SEAT_SLOTS[i];
      const dx = s.x - pos.current.x;
      const dz = s.z - pos.current.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.3) continue;
      const dot = (dx * forward.x + dz * forward.z) / (dist || 1);
      if (dot < 0.3 && dist > 0.6) continue;
      const score = dist - dot * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) return;
    const s = SEAT_SLOTS[best];
    seatOccupant[best] = 'player';
    playerSeat.current = best;
    seatAnchor.current.set(s.x - s.side * 0.16, CONFIG.sitHeight, s.z);
    seatYaw.current = s.side === 1 ? Math.PI / 2 : -Math.PI / 2; // dos à la paroi, face à l'allée
    transition.current = 0;
    useStore.getState().setSeated(true);
  };

  const standUp = () => {
    const i = playerSeat.current;
    if (i >= 0 && seatOccupant[i] === 'player') seatOccupant[i] = null;
    if (i >= 0) {
      const s = SEAT_SLOTS[i];
      pos.current.set(THREE.MathUtils.clamp(s.x - s.side * 0.55, -AISLE_X, AISLE_X), CONFIG.eyeHeight, s.z);
    }
    playerSeat.current = -1;
    transition.current = 0;
    useStore.getState().setSeated(false);
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const { started, seated } = useStore.getState();

    // Regard.
    const { dx, dy } = consumeLook();
    if (started) {
      yaw.current -= dx * LOOK_SENS;
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * LOOK_SENS, -1.35, 1.35);
    }

    // Demandes s'asseoir / se lever.
    if (input.sitRequest) {
      input.sitRequest = false;
      if (started) {
        if (seated) standUp();
        else trySit();
      }
    }
    if (input.standRequest) {
      input.standRequest = false;
      if (seated) standUp();
    }

    transition.current = Math.min(1, transition.current + dt * 2.2);
    const speed01 = runtime.speed / V_MAX;

    let targetPos: THREE.Vector3;
    if (seated) {
      targetPos = seatAnchor.current;
      // Attirer doucement le regard vers l'allée au moment de s'asseoir.
      if (transition.current < 0.4) {
        let d = seatYaw.current - yaw.current;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        yaw.current += d * dt * 2.4;
      }
    } else {
      // Marche dans l'allée.
      const axes = moveAxes();
      const mag = Math.hypot(axes.x, axes.y);
      if (started && mag > 0.01) {
        const fx = -Math.sin(yaw.current);
        const fz = -Math.cos(yaw.current);
        const rx = Math.cos(yaw.current);
        const rz = -Math.sin(yaw.current);
        const vx = (fx * axes.y + rx * axes.x) * CONFIG.walkSpeed * Math.min(1, mag);
        const vz = (fz * axes.y + rz * axes.x) * CONFIG.walkSpeed * Math.min(1, mag);
        pos.current.x = THREE.MathUtils.clamp(pos.current.x + vx * dt, -AISLE_X, AISLE_X);
        pos.current.z = THREE.MathUtils.clamp(pos.current.z + vz * dt, -AISLE_Z, AISLE_Z);
        bobT.current += dt * 7.5 * Math.min(1, mag);
      }
      pos.current.y = CONFIG.eyeHeight;
      targetPos = pos.current;
    }

    // Position de base lissée SÉPARÉMENT des offsets de balancement : la
    // caméra ne se poursuit plus elle-même (fini les dérives une fois assis).
    if (seated || transition.current < 1) camBase.current.lerp(targetPos, Math.min(1, dt * 4.5));
    else camBase.current.copy(targetPos);
    camera.position.copy(camBase.current);

    // Assis, le corps est calé contre la banquette : le balancement ressenti
    // est très atténué (on bouge AVEC la rame).
    const brace = seated ? 0.25 : 1;
    const bob = seated ? 0 : Math.sin(bobT.current * 2) * 0.016;
    const trainBounce = Math.sin(runtime.swayTime * 6.7) * 0.006 * speed01 * brace;
    camera.position.y += bob + trainBounce;
    camera.position.x += runtime.sway * 0.028 * brace;

    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    camera.rotation.z = (runtime.sway * 0.011 - runtime.accel * 0.004) * (seated ? 0.4 : 1);

    // Position du joueur partagée (regards des PNJ).
    runtime.playerX = camera.position.x;
    runtime.playerY = camera.position.y;
    runtime.playerZ = camera.position.z;

    // Fiche de vocabulaire (esprit Shashingo) : objet au centre du regard.
    vocabAcc.current += dt;
    if (started && vocabAcc.current > 0.18) {
      vocabAcc.current = 0;
      camera.getWorldDirection(lookDir.current);
      const state = useStore.getState();
      const id = lookupVocab(camera.position, lookDir.current, state.vocab);
      if (id !== state.vocab) state.setVocab(id);
    }
  });

  return null;
}
