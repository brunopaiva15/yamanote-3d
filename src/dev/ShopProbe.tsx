// Page de probe DEV (voir /shop-probe.html) : les deux commerces de gare, seuls,
// sous une caméra qu'on tourne autour.
//
// POURQUOI UNE PAGE. Le konbini est au fond du hall, deux niveaux sous le quai,
// derrière une trémie, une ligne de portillons et quarante mètres de couloir :
// pour juger d'un centimètre de comptoir, il fallait descendre l'y chercher à
// chaque essai. Le kiosque est plus accessible, mais il est sur l'épine, entre
// deux bords d'embarquement, et l'on ne peut pas s'en écarter de plus de deux
// mètres. Ni l'un ni l'autre ne se regarde correctement en jeu.
//
// C'est le même besoin que /car-probe.html - voir l'ouvrage seul, sous le vrai
// éclairage, et tourner autour - et c'est la même réponse.
//
//   /shop-probe.html            → les deux, côte à côte
//   /shop-probe.html?only=kiosk → le kiosque seul
//   /shop-probe.html?h=21       → de nuit
//   /shop-probe.html?station=4  → l'enseigne d'Ueno

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import { CONFIG } from '../data/config';
import { runtime } from '../systems/runtime';
import { layoutFor } from '../data/stationLayouts';
import { PLATFORM_TOP } from '../data/stationGeometry';
import { placementFor } from '../systems/stationPlacement';
import { psdGates } from '../three/station/psdLayout';
import { makeAdTexture, makePlatformFloorTexture, makeTactileTexture } from '../textures/procedural';
import { makeStationMaterials } from '../three/station/materials';
import { Konbini } from '../three/station/Konbini';
import { Kiosk } from '../three/station/Kiosk';

const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => {
  const v = parseFloat(q.get(key) ?? '');
  return Number.isFinite(v) ? v : fallback;
};

const station = Math.round(num('station', 12));
const only = q.get('only') ?? 'both';
runtime.clockMin = num('h', CONFIG.clockStart / 60) * 60;

/** `?cam=x,y,z` et `?at=x,y,z` : le point de vue, pour rejouer un cadrage. */
const triple = (key: string, fallback: [number, number, number]): [number, number, number] => {
  const parts = (q.get(key) ?? '').split(',').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite)
    ? [parts[0], parts[1], parts[2]]
    : fallback;
};
const CAM = triple('cam', [0, 2.4, 9]);
const AT = triple('at', [0, 1.4, 0]);

export function ShopProbe() {
  const layout = useMemo(() => layoutFor(station), []);
  const m = useMemo(() => {
    const floor = makePlatformFloorTexture();
    const tactile = makeTactileTexture();
    return makeStationMaterials(layout.palette, {
      floor,
      tactile,
      ads: [makeAdTexture(4102, true, true)],
    });
  }, [layout]);

  // L'emprise réelle, lue là où le jeu la lit : un commerce jugé sur des cotes
  // inventées pour la probe ne prouverait rien.
  const place = useMemo(() => placementFor(station, psdGates()), []);
  const konbini = place.interior.fixtures.find((f) => f.kind === 'konbini');
  const kw = konbini ? konbini.rect.z1 - konbini.rect.z0 : 7.8;
  const kd = konbini ? konbini.rect.x1 - konbini.rect.x0 : 3.4;

  return (
    <Canvas
      shadows={false}
      camera={{ position: CAM, fov: 55 }}
      gl={{ antialias: true }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#141820');
      }}
    >
      {/* L'éclairage du hall, approché : un ambiant franc et une directionnelle
          douce. Les surfaces imprimées sont hors éclairage de toute façon. */}
      <ambientLight intensity={1.15} />
      <directionalLight position={[6, 9, 5]} intensity={0.7} />
      <OrbitControls target={AT} />

      {/* Le sol, pour que rien ne flotte. */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.slab}>
        <planeGeometry args={[60, 40]} />
      </mesh>

      {(only === 'both' || only === 'konbini') && (
        <group position={[only === 'both' ? -5.5 : 0, 0, 0]}>
          <Konbini w={kw} d={kd} height={3.2} station={station} m={m} />
        </group>
      )}
      {(only === 'both' || only === 'kiosk') && (
        <group position={[only === 'both' ? 6.5 : 0, -PLATFORM_TOP, 0]}>
          <Kiosk
            k={{ x: 0, z: 0, halfX: place.kiosk?.halfX ?? 1.5, halfZ: place.kiosk?.halfZ ?? 3.2 }}
            m={m}
            station={station}
          />
        </group>
      )}
    </Canvas>
  );
}
