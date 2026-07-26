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

function buildPerson(app: Appearance, id: number): THREE.Group {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: app.skin, roughness: 0.7 });
  const top = cloth(app.top.color);
  const bottom = cloth(app.bottom.color);
  const shoe = cloth(app.shoes, 0.6);
  const hair = cloth(app.hair.color, 0.88);

  const legX = 0.062;
  const bare = app.bottom.type === 'skirt' || app.bottom.type === 'dress';
  if (bare) {
    const legGeo = new THREE.CylinderGeometry(0.04, 0.034, 0.48, 7);
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
        new THREE.CylinderGeometry(app.build.hipR + 0.01, app.build.hipR + 0.12, 0.34, 14, 1, true),
        bottom,
      );
      skirt.position.y = 0.55;
      root.add(skirt);
    }
  } else {
    const legGeo = new THREE.CylinderGeometry(app.build.legR, app.build.legR * 0.85, 0.5, 8);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, bottom);
      leg.position.set(s * legX, 0.28, 0);
      root.add(leg);
      const sh = new THREE.Mesh(shoeGeo, shoe);
      sh.position.set(s * legX, 0.03, 0.03);
      root.add(sh);
    }
  }

  root.add(new THREE.Mesh(torsoGeometry(app), top));
  const neck = new THREE.Mesh(neckGeo, skin);
  neck.position.y = SHOULDER_Y + 0.14;
  root.add(neck);

  const armGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.5, 7);
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
    new THREE.MeshBasicMaterial({ map: makeFaceTexture(app, id), toneMapped: false }),
  );
  face.position.set(0, 0.02, 0.093);
  headG.add(face);
  if (app.hair.style !== 'bald') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 0.02;
    cap.scale.set(0.95, 0.85, 0.95);
    headG.add(cap);
  }
  root.add(headG);

  if (app.bag === 'backpack') {
    const bag = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.28, 0.12, 2, 0.04), cloth(app.bagColor, 0.75));
    bag.position.set(0, 0.95, -0.16);
    root.add(bag);
  } else if (app.bag !== 'none') {
    const bag = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.18, 0.07, 2, 0.02), cloth(app.bagColor, 0.75));
    bag.position.set(0.18, 0.85, 0.05);
    root.add(bag);
  }

  root.scale.setScalar(app.build.scale);
  return root;
}

export function ProceduralPlatformCrowd() {
  initPlatformCrowd();
  const doorSide = useStore((s) => s.doorSide);
  const wrap = useRef<THREE.Group>(null);

  const people = useMemo(() => {
    return crowdList.map((p) => {
      const g = buildPerson(p.appearance, p.id);
      g.visible = false;
      return g;
    });
  }, []);

  useFrame(() => {
    if (wrap.current) {
      wrap.current.visible = runtime.platformFade > 0.02;
      wrap.current.position.z = runtime.platformSlide;
      wrap.current.rotation.y = doorSide === 1 ? 0 : Math.PI;
    }
    for (let i = 0; i < crowdList.length; i++) {
      const p = crowdList[i];
      const g = people[i];
      if (!g) continue;
      if (p.state === 'hidden' || runtime.platformFade < 0.04) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(p.pos.x, PLATFORM_Y + p.bob, p.pos.z);
      g.rotation.y = p.yaw;
      const head = g.getObjectByName('crowd-head');
      if (head) {
        head.rotation.x = p.headPitch;
        head.rotation.y = p.lookYaw * 0.5;
      }
      const onPhone = p.action === 'phone' && p.state === 'waiting';
      const armR = g.getObjectByName('crowd-arm-r');
      if (armR) {
        armR.rotation.x = onPhone ? -1.15 : 0;
        armR.rotation.z = onPhone ? 0.35 : 0.12;
      }
      const phone = g.getObjectByName('crowd-phone');
      if (phone) phone.visible = onPhone;
    }
  });

  return (
    <group ref={wrap} visible={false}>
      {people.map((g, i) => (
        <primitive key={crowdList[i].id} object={g} />
      ))}
    </group>
  );
}
