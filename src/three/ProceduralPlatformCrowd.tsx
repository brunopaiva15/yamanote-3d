// Foule du quai en rendu procédural (repli si les GLB manquent). Voyageurs
// debout avec apparence complète — plus de capsules grises.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { crowdList, initPlatformCrowd } from '../systems/platformCrowd';
import type { Appearance } from '../systems/appearance';
import { makeFaceTexture } from '../textures/procedural';
import { runtime } from '../systems/runtime';
import { useStore } from '../store';
import { DOOR_SIDE } from '../data/stations';
import { usesHeldPose } from './characters/props';
import { ACTION_BY_ID, type MotionId, type PaxAction } from '../data/paxActions';
import { applyBodyPivot } from './characters/pose';
import { disposeOwned, markOwned } from './characters/library';

const PLATFORM_Y = -0.06;
const HEAD_Y = 1.34;
const SHOULDER_Y = 1.06;
const HIP_Y = 0.5;
const HEAD_SCALE: [number, number, number] = [0.88, 1.0, 0.94];

const headGeo = new THREE.SphereGeometry(0.105, 14, 12);
const faceGeo = new THREE.PlaneGeometry(0.17, 0.17);
const neckGeo = new THREE.CylinderGeometry(0.043, 0.047, 0.15, 8);
const shoeGeo = new RoundedBoxGeometry(0.08, 0.048, 0.16, 2, 0.018);
const phoneBodyGeo = new RoundedBoxGeometry(0.042, 0.082, 0.009, 2, 0.004);
const phoneScreenGeo = new THREE.BoxGeometry(0.034, 0.066, 0.0012);
const phoneBodyMat = new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.45, metalness: 0.25 });
const phoneScreenMat = new THREE.MeshStandardMaterial({
  color: '#7a96b0',
  roughness: 0.28,
  metalness: 0.05,
  emissive: '#243848',
  emissiveIntensity: 0.45,
});

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cloth(color: string, rough = 0.85): THREE.MeshStandardMaterial {
  const key = `${rough}:${color}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    matCache.set(key, m);
  }
  return m;
}

function torsoGeometry(app: Appearance): THREE.LatheGeometry {
  const b = app.build;
  const pts = [
    new THREE.Vector2(b.hipR, 0.46),
    new THREE.Vector2(b.waistR, HIP_Y + 0.22),
    new THREE.Vector2(b.chestR, 0.95),
    new THREE.Vector2(b.shoulderR, SHOULDER_Y),
    new THREE.Vector2(b.shoulderR * 0.55, SHOULDER_Y + 0.13),
    new THREE.Vector2(0.048, SHOULDER_Y + 0.16),
  ];
  return new THREE.LatheGeometry(pts, 18);
}

// Ce corps peut être défait (le slot change d'identité au seuil d'une porte) :
// tout ce qui n'est créé que pour LUI est marqué, le reste est mutualisé et ne
// doit jamais être libéré avec lui (voir characters/library, markOwned).
function buildPerson(app: Appearance, identity: number): THREE.Group {
  const root = new THREE.Group();
  const skin = markOwned(new THREE.MeshStandardMaterial({ color: app.skin, roughness: 0.7 }));
  const top = cloth(app.top.color);
  const bottom = cloth(app.bottom.color);
  const shoe = cloth(app.shoes, 0.6);
  const hair = cloth(app.hair.color, 0.88);

  const legX = 0.062;
  const bare = app.bottom.type === 'skirt' || app.bottom.type === 'dress';
  if (bare) {
    const legGeo = markOwned(new THREE.CylinderGeometry(0.04, 0.034, 0.48, 7));
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, skin);
      leg.position.set(s * legX, 0.27, 0);
      root.add(leg);
      const sh = new THREE.Mesh(shoeGeo, shoe);
      sh.position.set(s * legX, 0.03, 0.03);
      root.add(sh);
    }
    if (app.bottom.type === 'skirt') {
      const skirt = new THREE.Mesh(
        markOwned(new THREE.CylinderGeometry(app.build.hipR + 0.01, app.build.hipR + 0.12, 0.34, 14, 1, true)),
        bottom,
      );
      skirt.position.y = 0.55;
      root.add(skirt);
    }
  } else {
    const legGeo = markOwned(new THREE.CylinderGeometry(app.build.legR, app.build.legR * 0.85, 0.5, 8));
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, bottom);
      leg.position.set(s * legX, 0.28, 0);
      root.add(leg);
      const sh = new THREE.Mesh(shoeGeo, shoe);
      sh.position.set(s * legX, 0.03, 0.03);
      root.add(sh);
    }
  }

  root.add(new THREE.Mesh(markOwned(torsoGeometry(app)), top));
  const neck = new THREE.Mesh(neckGeo, skin);
  neck.position.y = SHOULDER_Y + 0.14;
  root.add(neck);

  const armGeo = markOwned(new THREE.CylinderGeometry(0.035, 0.03, 0.5, 7));
  for (const s of [-1, 1]) {
    const armG = new THREE.Group();
    armG.position.set(s * (app.build.shoulderR + 0.02), SHOULDER_Y - 0.12, 0.02);
    armG.rotation.z = s * 0.12;
    if (s === 1) armG.name = 'crowd-arm-r';
    const arm = new THREE.Mesh(armGeo, top);
    armG.add(arm);
    if (s === 1) {
      // Smartphone dans la main droite (visible en action « phone »).
      const phone = new THREE.Group();
      phone.name = 'crowd-phone';
      phone.visible = false;
      phone.position.set(0.02, -0.22, 0.06);
      phone.rotation.set(-0.5, 0.4, 0.2);
      phone.add(new THREE.Mesh(phoneBodyGeo, phoneBodyMat));
      const screen = new THREE.Mesh(phoneScreenGeo, phoneScreenMat);
      screen.position.z = 0.0052;
      phone.add(screen);
      armG.add(phone);
    }
    root.add(armG);
  }

  const headG = new THREE.Group();
  headG.position.y = HEAD_Y;
  headG.name = 'crowd-head';
  const head = new THREE.Mesh(headGeo, skin);
  head.scale.set(...HEAD_SCALE);
  headG.add(head);
  const face = new THREE.Mesh(
    faceGeo,
    markOwned(new THREE.MeshBasicMaterial({ map: markOwned(makeFaceTexture(app, identity)), toneMapped: false })),
  );
  face.position.set(0, 0.02, 0.093);
  headG.add(face);
  if (app.hair.style !== 'bald') {
    const cap = new THREE.Mesh(markOwned(new THREE.SphereGeometry(0.11, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair);
    cap.position.y = 0.02;
    cap.scale.set(0.95, 0.85, 0.95);
    headG.add(cap);
  }
  root.add(headG);

  if (app.bag === 'backpack') {
    const bag = new THREE.Mesh(markOwned(new RoundedBoxGeometry(0.22, 0.28, 0.12, 2, 0.04)), cloth(app.bagColor, 0.75));
    bag.position.set(0, 0.95, -0.16);
    root.add(bag);
  } else if (app.bag !== 'none') {
    const bag = new THREE.Mesh(markOwned(new RoundedBoxGeometry(0.14, 0.18, 0.07, 2, 0.02)), cloth(app.bagColor, 0.75));
    bag.position.set(0.18, 0.85, 0.05);
    root.add(bag);
  }

  root.scale.setScalar(app.build.scale);
  return root;
}

// Familles de gestes du bras droit (rotX = levée, rotZ = écart). Le corps de
// secours n'a qu'une articulation d'épaule : on ne distingue que les grandes
// familles — main au visage, bras levé, bras tendu, objet tenu.
const CROWD_ARMS: Partial<Record<MotionId, [number, number, number?, number?]>> = {
  phone: [-1.15, 0.35],
  read: [-1.05, 0.3],
  map: [-1.1, 0.4],
  ticket: [-1.2, 0.3],
  share: [-1.1, 0.45],
  photo: [-1.4, 0.35],
  drink: [-1.5, 0.4],
  sneeze: [-1.55, 0.45],
  cough: [-1.55, 0.45],
  yawn: [-1.5, 0.45],
  sniffle: [-1.5, 0.45],
  gasp: [-1.55, 0.4],
  laugh: [-1.5, 0.4],
  adjust: [-1.5, 0.45],
  glasses: [-1.5, 0.4],
  wipe: [-1.55, 0.45, 0.3, 4],
  fan: [-1.5, 0.5, 0.5, 6],
  eat: [-1.5, 0.4, 0.25, 3.2],
  scratch: [-1.7, 0.7, 0.2, 9],
  earbud: [-1.6, 0.75],
  facepalm: [-1.65, 0.4],
  whisper: [-1.45, 0.55],
  flirt: [-1.5, 0.6],
  checkTime: [-1.25, 0.3],
  watch: [-1.25, 0.3],
  bag: [-1.35, 0.7, 0.14, 2.4],
  rummage: [-0.9, 0.35, 0.3, 4.5],
  crossArms: [-0.75, 0.3],
  sulk: [-0.75, 0.3],
  jealous: [-0.75, 0.3],
  angry: [-0.5, 0.4],
  shrug: [-0.6, 0.7],
  shoulders: [-0.35, 0.5, 0.2, 2.2],
  stretch: [-2.6, 0.3, 0.15, 1.2],
  fidget: [-0.85, 0.2, 0.15, 3.4],
  button: [-1.0, 0.25, 0.12, 3],
  tie: [-0.4, 0.2, 0.2, 3.5],
  bagFeet: [-0.35, 0.15],
  offer: [-1.4, 0.5],
  point: [-1.6, 0.5],
  wave: [-2.6, 0.5, 0.4, 5],
  bow: [-0.3, 0.1],
  argue: [-1.5, 0.45, 0.3, 5.5],
  scold: [-1.55, 0.45, 0.35, 6],
  fight: [-1.4, 0.35, 0.5, 9],
  shove: [-1.5, 0.3, 0.35, 3.2],
  stumble: [-1.5, 0.55],
  fall: [-1.7, 0.6],
  slip: [-1.6, 0.6],
};

function crowdArmTarget(action: PaxAction, t: number): [number, number] | null {
  const motion = ACTION_BY_ID.get(action)?.motion;
  const g = motion ? CROWD_ARMS[motion] : undefined;
  if (!g) return null;
  const wob = g[2] != null && g[3] != null ? Math.sin(t * g[3]) * g[2] : 0;
  return [g[0] + wob, g[1]];
}

export function ProceduralPlatformCrowd() {
  initPlatformCrowd();
  // Le côté de la foule est celui du quai présent (platformIndex), pas
  // store.doorSide : celui-ci bascule vers la gare suivante en début de
  // croisière, alors que ce quai — et sa foule — défilent encore.
  const platformIndex = useStore((s) => s.platformIndex);
  const doorSide = DOOR_SIDE[platformIndex];
  const wrap = useRef<THREE.Group>(null);

  // Un support stable par slot : le corps y est greffé, et remplacé quand le
  // slot change d'identité (relais des portes, cf. systems/platformCrowd).
  const holders = useMemo(() => crowdList.map(() => new THREE.Group()), []);
  const bodies = useRef<THREE.Group[]>([]);
  const identities = useRef<number[]>([]);
  if (bodies.current.length === 0) {
    bodies.current = crowdList.map((p, i) => {
      const g = buildPerson(p.appearance, p.identity);
      g.visible = false;
      holders[i].add(g);
      return g;
    });
    identities.current = crowdList.map((p) => p.identity);
  }

  useFrame(() => {
    if (wrap.current) {
      wrap.current.visible = runtime.platformFade > 0.02;
      wrap.current.position.z = runtime.platformSlide;
      wrap.current.rotation.y = doorSide === 1 ? 0 : Math.PI;
    }
    for (let i = 0; i < crowdList.length; i++) {
      const p = crowdList[i];
      if (identities.current[i] !== p.identity) {
        disposeOwned(bodies.current[i]);
        bodies.current[i].removeFromParent();
        const rebuilt = buildPerson(p.appearance, p.identity);
        rebuilt.visible = false;
        holders[i].add(rebuilt);
        bodies.current[i] = rebuilt;
        identities.current[i] = p.identity;
      }
      const g = bodies.current[i];
      if (!g) continue;
      if (p.state === 'hidden' || runtime.platformFade < 0.04) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      // p.y : négatif dans une trémie d'escalier, où l'on descend vraiment.
      g.position.set(p.pos.x, PLATFORM_Y + p.y + p.bob, p.pos.z);
      // YXZ : cap, puis buste dans le repère du personnage (cf. LibraryPassengers).
      g.rotation.set(p.bodyLean, p.yaw, p.bodyRoll, 'YXZ');
      applyBodyPivot(g, p.bodyPivot, p.height);
      const head = g.getObjectByName('crowd-head');
      if (head) {
        head.rotation.x = p.headPitch;
        head.rotation.y = p.lookYaw * 0.5;
        head.rotation.z = p.headRoll;
      }
      // Le bras du quai suit les mêmes familles de gestes que la rame (le
      // corps de secours n'a qu'un bras articulé : c'est le droit qui joue).
      const act = p.action === 'shift' ? 'none' : p.action;
      const onPhone = usesHeldPose(act) && p.state === 'waiting';
      const arm = p.state === 'waiting' ? crowdArmTarget(act, p.actionT) : null;
      const armR = g.getObjectByName('crowd-arm-r');
      if (armR) {
        armR.rotation.x = arm ? arm[0] : 0;
        armR.rotation.z = arm ? arm[1] : 0.12;
      }
      const phone = g.getObjectByName('crowd-phone');
      if (phone) phone.visible = onPhone;
    }
  });

  return (
    <group ref={wrap} visible={false}>
      {holders.map((g, i) => (
        <primitive key={crowdList[i].id} object={g} />
      ))}
    </group>
  );
}
