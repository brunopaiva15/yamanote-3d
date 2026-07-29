// Caméra et contrôles : un clic souris capture le pointeur (regard libre),
// cliquer-glisser en secours si le verrou est refusé (iframe), ZQSD / WASD /
// flèches, clic net pour s'asseoir, joystick tactile additionné au clavier.
// Balancement caméra lié au train.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG, V_MAX } from '../data/config';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { input, moveAxes, consumeLook } from '../systems/input';
import { SEAT_SLOTS, seatOccupant } from '../systems/seats';
import { publishPlayerLook, publishPlayerPose } from '../systems/playerFrame';
import { AISLE_U, frameAt, groundY, resolveMove, snapInside } from '../systems/walkable';
import { alight, board, crossNearestPortal } from '../systems/boarding';
import { setListenerPose } from '../systems/audioEngine';

const LOOK_SENS = 0.0032;

// Caméra libre de développement : __freeCam({x,y,z,tx,ty,tz}) en console pose
// l'œil où l'on veut (juger l'extérieur de la rame, une gare, une cote) ;
// __freeCam(null) rend la main au joueur.
const freeCam = {
  active: false,
  pos: new THREE.Vector3(),
  target: new THREE.Vector3(),
};
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__freeCam = (
    v: { x: number; y: number; z: number; tx: number; ty: number; tz: number } | null,
  ) => {
    freeCam.active = v !== null;
    if (v) {
      freeCam.pos.set(v.x, v.y, v.z);
      freeCam.target.set(v.tx, v.ty, v.tz);
    }
  };
}
/** Vitesse de montée/descente de l'œil au franchissement d'un seuil (m/s). */
const STEP_LERP = 0.28;

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
  const camBase = useRef(new THREE.Vector3(0, CONFIG.eyeHeight, 4.2));
  const earFwd = useRef(new THREE.Vector3());
  const earUp = useRef(new THREE.Vector3());

  // Outil dev : franchir le seuil le plus proche sans avoir à y marcher —
  // la marche reste le seul moyen en jeu.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__crossPortal = () =>
      crossNearestPortal(pos.current);
  }, []);

  // --- Entrées : clavier + souris + tactile ---
  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let dragDist = 0;
    let pointerDown = false;
    /** True si le verrou était déjà actif au pointerdown (clic = s'asseoir). */
    let wasLockedAtDown = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      input.keys.add(e.code);
      if (e.code === 'Space') {
        input.standRequest = true;
        e.preventDefault();
      }
      if (e.code === 'KeyE') input.talkRequest = true;
      if (e.code === 'KeyM') useStore.getState().toggleMute();
      if (e.code === 'KeyF') {
        void document.documentElement.requestFullscreen().catch(() => undefined);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => input.keys.delete(e.code);

    const locked = () => document.pointerLockElement === canvas;

    const requestLock = () => {
      if (locked()) return;
      try {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') void p.catch(() => undefined);
      } catch {
        /* refus silencieux (iframe, politique navigateur…) */
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== canvas) return;
      pointerDown = true;
      wasLockedAtDown = locked();
      downX = e.clientX;
      downY = e.clientY;
      dragDist = 0;
      // Desktop : un clic capture le pointeur pour regarder librement.
      // Échap libère le verrou (HUD à nouveau cliquable). Tactile : glisser.
      if (
        e.pointerType === 'mouse' &&
        !wasLockedAtDown &&
        useStore.getState().started
      ) {
        requestLock();
      }
      // Capture de secours pour le cliquer-glisser. Elle est REFUSÉE quand une
      // demande de verrou est déjà en vol (InvalidStateError) : sans ce filet,
      // chaque clic de la souris lançait une exception non rattrapée.
      if (!wasLockedAtDown) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* verrou de pointeur en cours : le glisser passera par window */
        }
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
      // le tactile a son propre bouton. Le clic qui vient de demander le
      // verrou ne s'assoit pas ; un clic une fois verrouillé, ou un clic
      // net si le verrou a été refusé, oui.
      if (dragDist >= 6 || e.pointerType !== 'mouse' || !useStore.getState().started) return;
      if (wasLockedAtDown || !locked()) input.sitRequest = true;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl]);

  const trySit = () => {
    // Les banquettes du wagon ne se prennent pas depuis le quai.
    if (runtime.playerFrame !== 'car') return;
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
      pos.current.set(
        THREE.MathUtils.clamp(s.x - s.side * 0.55, -AISLE_U, AISLE_U),
        CONFIG.eyeHeight,
        s.z + runtime.trainZ,
      );
      snapInside(pos.current);
    }
    playerSeat.current = -1;
    transition.current = 0;
    useStore.getState().setSeated(false);
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const { started, seated } = useStore.getState();

    if (freeCam.active) {
      camera.position.copy(freeCam.pos);
      camera.rotation.set(0, 0, 0);
      camera.lookAt(freeCam.target);
      return;
    }

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
      // Marche : allée du wagon, alcôves de porte, seuils ouverts, quai.
      const axes = moveAxes();
      const mag = Math.hypot(axes.x, axes.y);
      // Le quai fait 96 m de long : au pas de promenade on n'en verrait
      // jamais le bout. Maj. pour presser le pas, comme tout le monde.
      const running = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
      const speed = running ? CONFIG.runSpeed : CONFIG.walkSpeed;
      if (started && mag > 0.01) {
        const fx = -Math.sin(yaw.current);
        const fz = -Math.cos(yaw.current);
        const rx = Math.cos(yaw.current);
        const rz = -Math.sin(yaw.current);
        const vx = (fx * axes.y + rx * axes.x) * speed * Math.min(1, mag);
        const vz = (fz * axes.y + rz * axes.x) * speed * Math.min(1, mag);
        resolveMove(pos.current, vx * dt, vz * dt);
        bobT.current += dt * (running ? 10.5 : 7.5) * Math.min(1, mag);
      }
      // Le sol descend de 6 cm entre le plancher du wagon et la dalle du
      // quai : l'œil suit la marche au lieu de sauter.
      const eyeTarget = groundY(pos.current.x, pos.current.z) + CONFIG.eyeHeight;
      pos.current.y = THREE.MathUtils.damp(pos.current.y, eyeTarget, 1 / STEP_LERP, dt);
      // Basculement de repère : franchir le seuil suffit, aucune touche.
      const frame = frameAt(pos.current.x, pos.current.z);
      if (frame === 'platform') alight();
      else if (frame === 'car') board();
      targetPos = pos.current;
    }

    // Position de base lissée SÉPARÉMENT des offsets de balancement : la
    // caméra ne se poursuit plus elle-même (fini les dérives une fois assis).
    if (seated || transition.current < 1) camBase.current.lerp(targetPos, Math.min(1, dt * 4.5));
    else camBase.current.copy(targetPos);
    camera.position.copy(camBase.current);

    // Assis, le corps est calé contre la banquette : le balancement ressenti
    // est très atténué (on bouge AVEC la rame). Debout sur le quai, il n'y a
    // évidemment rien à ressentir : le béton ne tangue pas.
    const aboard = runtime.playerFrame === 'car' ? 1 : 0;
    const brace = (seated ? 0.25 : 1) * aboard;
    const bob = seated ? 0 : Math.sin(bobT.current * 2) * 0.016;
    const trainBounce = Math.sin(runtime.swayTime * 6.7) * 0.006 * speed01 * brace;
    camera.position.y += bob + trainBounce;
    camera.position.x += runtime.sway * 0.028 * brace;

    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    camera.rotation.z =
      (runtime.sway * 0.011 - runtime.accel * 0.004) * (seated ? 0.4 : 1) * aboard;

    // Position du joueur partagée (regards des PNJ), dans les trois repères.
    publishPlayerPose(camera.position.x, camera.position.y, camera.position.z);

    // Oreilles du joueur = caméra : les diffuseurs sont fixes dans le wagon,
    // c'est la tête qui tourne autour d'eux.
    camera.getWorldDirection(earFwd.current);
    // Le même vecteur sert à savoir qui on a en face (systems/paxTargeting).
    publishPlayerLook(earFwd.current.x, earFwd.current.y, earFwd.current.z);
    earUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
    setListenerPose(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      earFwd.current.x,
      earFwd.current.y,
      earFwd.current.z,
      earUp.current.x,
      earUp.current.y,
      earUp.current.z,
    );

  });

  return null;
}
