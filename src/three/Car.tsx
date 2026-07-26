// Coque du wagon E235 : sol clair à joints, plafond à caisson central, parois
// laquées avec fenêtres, zone prioritaire rose aux extrémités, bandeau LED,
// bandes tactiles à picots, parois d'about vitrées.

import { useMemo } from 'react';
import * as THREE from 'three';
import { CABIN_SPEAKERS, CONFIG } from '../data/config';
import { FREE_SPACE } from '../systems/seats';
import { roundedRect } from './shapes';
import {
  makeFloorTexture,
  makeTactileTexture,
  makePriorityFloorTexture,
  makeFreeSpaceFloorTexture,
  makePrioritySignTexture,
  makeSurfaceTexture,
  makeRoughnessMap,
  makeVentTexture,
  makeSpeakerTexture,
  makeDoorStickerTexture,
  makeSosTexture,
  makeCarNumberTexture,
  makeExtinguisherTexture,
  makeAdTexture,
  PRIORITY_FLOOR_COLOR,
  FREE_FLOOR_COLOR,
} from '../textures/procedural';

const HL = CONFIG.carHalfLength; // 10
const HW = CONFIG.carHalfWidth; // 1.4
const H = CONFIG.carHeight; // 2.3
const DOOR_HW = CONFIG.doorHalfWidth; // 0.66
const DOOR_H = 1.95;

// Segments de paroi entre les ouvertures de portes (portes à ±2.5 et ±7.5).
// Les segments d'extrémité (index 0 et 4) sont en zone prioritaire (rose).
const WALL_SEGMENTS: { z0: number; z1: number; pink: boolean }[] = [
  { z0: -HL, z1: -7.5 - DOOR_HW, pink: true },
  { z0: -7.5 + DOOR_HW, z1: -2.5 - DOOR_HW, pink: false },
  { z0: -2.5 + DOOR_HW, z1: 2.5 - DOOR_HW, pink: false },
  { z0: 2.5 + DOOR_HW, z1: 7.5 - DOOR_HW, pink: false },
  { z0: 7.5 + DOOR_HW, z1: HL, pink: true },
];

const WINDOW_BOTTOM = 0.85;
const WINDOW_TOP = 1.75;
const PILLAR_W = 0.14;

// Les baies du E235 sont à coins largement adoucis. La paroi est donc percée
// d'un seul tenant sur toute la bande vitrée, plutôt que composée de montants
// droits : le bandeau déborde de BAND_MARGIN au-dessus et en dessous de la
// vitre pour que l'arrondi de l'ouverture reste entièrement dans la matière.
const BAND_MARGIN = 0.07;
const BAND_BOTTOM = WINDOW_BOTTOM - BAND_MARGIN;
const BAND_TOP = WINDOW_TOP + BAND_MARGIN;
const WINDOW_RADIUS = 0.11;
const WALL_THICKNESS = 0.08;

// Diffuseur linéaire de climatisation : même emprise que le caisson central.
const DUCT_LENGTH = HL * 2 - 0.8;

// --- Sols teintés des travées d'about ---
// La limite entre rouge et magenta n'est pas l'axe du wagon : le rouge
// prioritaire traverse l'ouverture de la porte d'intercirculation et s'arrête
// à son montant opposé, le magenta n'occupe que le reste. Le rouge est donc
// nettement le plus large des deux.
const HALF_FLOOR = HW + 0.06;
const GANGWAY_HALF = 0.42; // demi-ouverture de la porte d'about
// Largeur de la bande qui porte le marquage, côté banquettes : le dégagement
// entre l'axe de l'allée et le nez des sièges (ils commencent vers x = 0,80).
const MARK_W = 0.86;

interface FloorStrip {
  key: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  free: boolean;
  marked: boolean;
}

function buildEndFloors(): FloorStrip[] {
  const out: FloorStrip[] = [];
  for (const e of [1, -1] as const) {
    const z0 = e === 1 ? 7.5 + DOOR_HW : -HL;
    const z1 = e === 1 ? HL : -7.5 - DOOR_HW;
    // Côté de la zone libre à cette extrémité, s'il y en a une.
    const freeSide = FREE_SPACE !== null && FREE_SPACE.z0 * e > 0 ? FREE_SPACE.side : 0;
    const push = (key: string, x0: number, x1: number, free: boolean, marked: boolean) => {
      if (Math.abs(x1 - x0) > 0.01) out.push({ key: `${e}${key}`, x0, x1, z0, z1, free, marked });
    };
    if (freeSide === 0) {
      // Places prioritaires des deux côtés : rouge sur toute la travée.
      for (const side of [1, -1] as const) {
        push(`p${side}`, 0, side * MARK_W, false, true);
        push(`pw${side}`, side * MARK_W, side * HALF_FLOOR, false, false);
      }
    } else {
      const f = freeSide;
      // Magenta : du montant de porte opposé jusqu'à la paroi, marquage compris.
      push('f', f * GANGWAY_HALF, f * HALF_FLOOR, true, true);
      // Rouge : tout le reste, y compris la traversée de l'ouverture de porte.
      push('rg', f * GANGWAY_HALF, 0, false, false);
      push('r', 0, -f * MARK_W, false, true);
      push('rw', -f * MARK_W, -f * HALF_FLOOR, false, false);
    }
  }
  return out;
}

const END_FLOORS = buildEndFloors();

// Bandeau de paroi percé d'une baie à coins arrondis, pour un segment donné.
// Construit à plat (x = longueur, y = hauteur) puis redressé à l'usage par une
// rotation d'un quart de tour ; l'extrusion est recentrée sur l'épaisseur.
function makeWindowWallGeometry(len: number): THREE.ExtrudeGeometry {
  const bandHeight = BAND_TOP - BAND_BOTTOM;
  const outer = new THREE.Shape();
  outer.moveTo(-len / 2, -bandHeight / 2);
  outer.lineTo(len / 2, -bandHeight / 2);
  outer.lineTo(len / 2, bandHeight / 2);
  outer.lineTo(-len / 2, bandHeight / 2);
  outer.closePath();
  outer.holes.push(roundedRect(len - PILLAR_W * 2, WINDOW_TOP - WINDOW_BOTTOM, WINDOW_RADIUS));
  const geo = new THREE.ExtrudeGeometry(outer, { depth: WALL_THICKNESS, bevelEnabled: false });
  geo.translate(0, 0, -WALL_THICKNESS / 2);
  return geo;
}

export function Car() {
  const textures = useMemo(
    () => ({
      floor: makeFloorTexture(),
      tactile: makeTactileTexture(),
      priorityFloor: makePriorityFloorTexture(),
      freeSpaceFloor: makeFreeSpaceFloorTexture(),
      prioritySign: makePrioritySignTexture(),
    }),
    [],
  );

  // Un bandeau percé par segment de paroi (longueurs différentes), partagé
  // entre les deux côtés du wagon.
  const windowWallGeos = useMemo(
    () => WALL_SEGMENTS.map((seg) => makeWindowWallGeometry(seg.z1 - seg.z0)),
    [],
  );

  // Quatre affiches distinctes : deux par about, pour ne pas voir la même
  // image en se retournant.
  const endPosterMats = useMemo(
    () =>
      [0, 1, 2, 3].map(
        (i) => new THREE.MeshStandardMaterial({ map: makeAdTexture(40 + i, false), roughness: 0.88 }),
      ),
    [],
  );

  // Encadrement du hublot de la porte d'intercirculation.
  const gangwayFrameGeo = useMemo(() => {
    const frame = roundedRect(0.66, 1.15, 0.11);
    frame.holes.push(roundedRect(0.56, 1.05, 0.09));
    return new THREE.ShapeGeometry(frame, 16);
  }, []);

  const materials = useMemo(() => {
    // Micro-grain et rugosité bruitée : surfaces peintes, jamais laquées.
    const rough = makeRoughnessMap();
    // La gaine de climatisation court d'un bout à l'autre du wagon : la tuile
    // de persiennes se répète pour garder un pas d'ailettes constant plutôt que
    // de s'étirer sur dix-neuf mètres.
    const ventMap = makeVentTexture();
    ventMap.wrapS = ventMap.wrapT = THREE.RepeatWrapping;
    ventMap.repeat.set(1, DUCT_LENGTH / 0.6);
    return {
      // Un plancher de rame n'est pas mat : il renvoie les rampes lumineuses
      // en une traînée diffuse. La carte de rugosité fait varier ce brillant
      // pour éviter le miroir uniforme.
      floor: new THREE.MeshStandardMaterial({
        map: textures.floor,
        roughnessMap: rough,
        roughness: 0.52,
        metalness: 0.06,
      }),
      wall: new THREE.MeshStandardMaterial({
        map: makeSurfaceTexture('#e4e3dc'),
        roughnessMap: rough,
        roughness: 0.8,
        metalness: 0.02,
      }),
      pinkWall: new THREE.MeshStandardMaterial({
        map: makeSurfaceTexture('#f2c3cf'),
        roughnessMap: rough,
        roughness: 0.82,
        metalness: 0.02,
      }),
      ceiling: new THREE.MeshStandardMaterial({ map: makeSurfaceTexture('#dfe0de'), roughness: 0.78 }),
      ceilingCenter: new THREE.MeshStandardMaterial({ map: makeSurfaceTexture('#e9eae7', 0.7), roughness: 0.65 }),
      partition: new THREE.MeshStandardMaterial({
        map: makeSurfaceTexture('#e6e4de'),
        roughnessMap: rough,
        roughness: 0.8,
      }),
      pinkPartition: new THREE.MeshStandardMaterial({
        map: makeSurfaceTexture('#f2c3cf'),
        roughnessMap: rough,
        roughness: 0.82,
      }),
      steel: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.38, metalness: 0.85 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#cfd8da',
        transparent: true,
        opacity: 0.09,
        roughness: 0.08,
        metalness: 0.1,
        side: THREE.DoubleSide,
      }),
      led: new THREE.MeshStandardMaterial({
        color: '#fff4e2',
        emissive: '#ffeed2',
        // Rampes lumineuses continues : c'est la source visuelle du wagon, elle
        // doit se lire comme un néon franc et non comme un bandeau blanchâtre.
        emissiveIntensity: 1.9,
        roughness: 0.4,
      }),
      vent: new THREE.MeshStandardMaterial({ map: ventMap, roughness: 0.72, metalness: 0.15 }),
      speaker: new THREE.MeshStandardMaterial({ map: makeSpeakerTexture(), roughness: 0.8, metalness: 0.1 }),
      speakerRim: new THREE.MeshStandardMaterial({ color: '#8f918c', roughness: 0.6, metalness: 0.25 }),
      seam: new THREE.MeshStandardMaterial({ color: '#c4c3bc', roughness: 0.7 }),
      sticker: new THREE.MeshBasicMaterial({
        map: makeDoorStickerTexture(),
        transparent: true,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      ventSlot: new THREE.MeshStandardMaterial({ color: '#3c3f44', roughness: 0.8 }),
      tactile: new THREE.MeshStandardMaterial({
        map: textures.tactile,
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      // Sols d'about : revêtement teinté à part entière, donc éclairé comme le
      // reste du plancher et aussi brillant que lui — pas un décalque plat.
      priorityFloor: new THREE.MeshStandardMaterial({
        map: textures.priorityFloor,
        roughness: 0.42,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      freeSpaceFloor: new THREE.MeshStandardMaterial({
        map: textures.freeSpaceFloor,
        roughness: 0.42,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      prioritySign: new THREE.MeshBasicMaterial({ map: textures.prioritySign, toneMapped: false }),
      priorityFloorPlain: new THREE.MeshStandardMaterial({
        color: PRIORITY_FLOOR_COLOR,
        roughness: 0.42,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      freeFloorPlain: new THREE.MeshStandardMaterial({
        color: FREE_FLOOR_COLOR,
        roughness: 0.42,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      darkCap: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.9 }),
      posterFrame: new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.5, metalness: 0.3 }),
      sos: new THREE.MeshStandardMaterial({ map: makeSosTexture(), roughness: 0.7 }),
      carNumber: new THREE.MeshStandardMaterial({ map: makeCarNumberTexture('クハE234-10'), roughness: 0.6, metalness: 0.2 }),
      extinguisher: new THREE.MeshStandardMaterial({ map: makeExtinguisherTexture(), roughness: 0.55, metalness: 0.05 }),
    };
  }, [textures]);

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {/* Sol */}
      <mesh position={[0, -0.05, 0]} material={materials.floor}>
        <boxGeometry args={[HW * 2, 0.1, HL * 2]} />
      </mesh>

      {/* Sols teintés des travées d'about. Sur l'E235 ce ne sont pas des
          stickers posés sur le gris : tout le plancher de la travée est rouge
          côté places prioritaires, magenta côté zone libre, chaque demi-largeur
          traitée séparément. */}
      {END_FLOORS.map((f) => (
        <mesh
          key={`ef${f.key}`}
          position={[(f.x0 + f.x1) / 2, 0.004, (f.z0 + f.z1) / 2]}
          rotation={[-Math.PI / 2, 0, f.z1 > 0 ? Math.PI : 0]}
          material={
            f.marked
              ? f.free
                ? materials.freeSpaceFloor
                : materials.priorityFloor
              : f.free
                ? materials.freeFloorPlain
                : materials.priorityFloorPlain
          }
        >
          <planeGeometry args={[Math.abs(f.x1 - f.x0), f.z1 - f.z0]} />
        </mesh>
      ))}

      {/* Plafond et caisson central */}
      <mesh position={[0, H + 0.05, 0]} material={materials.ceiling}>
        <boxGeometry args={[HW * 2, 0.1, HL * 2]} />
      </mesh>
      <mesh position={[0, H - 0.012, 0]} material={materials.ceilingCenter}>
        <boxGeometry args={[1.05, 0.025, HL * 2 - 0.8]} />
      </mesh>
      {/* Fentes de ventilation le long du caisson */}
      {sides.map((s) => (
        <mesh key={`slot${s}`} position={[s * 0.56, H - 0.008, 0]} material={materials.ventSlot}>
          <boxGeometry args={[0.05, 0.018, HL * 2 - 1.2]} />
        </mesh>
      ))}

      {/* Bandeau LED : deux lignes émissives, LA source visuelle. */}
      {sides.map((s) => (
        <mesh key={`led${s}`} position={[s * 0.78, H - 0.03, 0]} material={materials.led}>
          <boxGeometry args={[0.17, 0.03, HL * 2 - 1]} />
        </mesh>
      ))}

      {/* Gaine de climatisation : un diffuseur linéaire continu au milieu du
          caisson, d'un bout à l'autre du wagon — pas quatre grilles isolées. */}
      <mesh position={[0, H - 0.028, 0]} material={materials.vent}>
        <boxGeometry args={[0.5, 0.03, DUCT_LENGTH]} />
      </mesh>

      {/* Diffuseurs de la sonorisation : une grille perforée encastrée dans le
          plafond de part et d'autre du caisson, au droit de chaque porte.
          Mêmes positions que les Panner3D du moteur audio — c'est de ces
          grilles-là que sortent carillons et annonces. */}
      {CABIN_SPEAKERS.map(([x, y, z]) => (
        <group key={`spk${x}-${z}`} position={[x, y, z]}>
          <mesh material={materials.speaker}>
            <cylinderGeometry args={[0.132, 0.132, 0.026, 24]} />
          </mesh>
          <mesh position={[0, 0.012, 0]} material={materials.speakerRim}>
            <cylinderGeometry args={[0.148, 0.148, 0.032, 24]} />
          </mesh>
        </group>
      ))}

      {/* Parois latérales : segments entre portes, fenêtres cadrées. */}
      {sides.map((s) =>
        WALL_SEGMENTS.map((seg, i) => {
          const len = seg.z1 - seg.z0;
          const zc = (seg.z0 + seg.z1) / 2;
          const glassLen = Math.max(0.2, len - PILLAR_W * 2);
          const wallMat = seg.pink ? materials.pinkWall : materials.wall;
          return (
            <group key={`wall${s}-${i}`}>
              <mesh position={[s * HW, BAND_BOTTOM / 2, zc]} material={wallMat}>
                <boxGeometry args={[WALL_THICKNESS, BAND_BOTTOM, len]} />
              </mesh>
              <mesh position={[s * HW, (BAND_TOP + H) / 2, zc]} material={wallMat}>
                <boxGeometry args={[WALL_THICKNESS, H - BAND_TOP, len]} />
              </mesh>
              {/* Bandeau percé d'une baie à coins arrondis : il tient lieu de
                  montants aux deux extrémités du segment. */}
              <mesh
                geometry={windowWallGeos[i]}
                material={wallMat}
                position={[s * HW, (BAND_BOTTOM + BAND_TOP) / 2, zc]}
                rotation={[0, Math.PI / 2, 0]}
              />
              <mesh position={[s * (HW - 0.01), (WINDOW_BOTTOM + WINDOW_TOP) / 2, zc]} material={materials.glass}>
                <boxGeometry args={[0.02, WINDOW_TOP - WINDOW_BOTTOM, glassLen]} />
              </mesh>
              {/* Jonctions de panneaux : fines lignes au seuil et au linteau */}
              {[BAND_BOTTOM - 0.006, BAND_TOP + 0.006].map((y) => (
                <mesh key={`seam${y}`} position={[s * (HW - 0.038), y, zc]} material={materials.seam}>
                  <boxGeometry args={[0.012, 0.014, len]} />
                </mesh>
              ))}
              {/* Petit autocollant d'information près des portes */}
              <mesh
                position={[s * (HW - 0.038), 1.32, seg.z0 + PILLAR_W / 2]}
                rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                material={materials.sticker}
              >
                <planeGeometry args={[0.1, 0.1]} />
              </mesh>
              {/* Panneau 優先席 sur le montant haut des segments roses */}
              {seg.pink && (
                <mesh
                  position={[s * (HW - 0.045), 1.98, zc]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.prioritySign}
                >
                  <planeGeometry args={[0.34, 0.21]} />
                </mesh>
              )}
            </group>
          );
        }),
      )}

      {/* Linteaux au-dessus des portes */}
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <mesh key={`lintel${s}-${z}`} position={[s * HW, (DOOR_H + H) / 2, z]} material={materials.wall}>
            <boxGeometry args={[0.08, H - DOOR_H, DOOR_HW * 2]} />
          </mesh>
        )),
      )}

      {/* Bandes tactiles jaunes à picots devant chaque porte */}
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <mesh key={`tact${s}-${z}`} position={[s * (HW - 0.28), 0.004, z]} material={materials.tactile}>
            <boxGeometry args={[0.42, 0.008, DOOR_HW * 2]} />
          </mesh>
        )),
      )}

      {/* Parois d'about (roses, zone prioritaire) avec porte d'intercirculation */}
      {[-1, 1].map((e) => (
        <group key={`end${e}`}>
          <mesh position={[-0.91, H / 2, e * HL]} material={materials.pinkPartition}>
            <boxGeometry args={[0.98, H, 0.1]} />
          </mesh>
          <mesh position={[0.91, H / 2, e * HL]} material={materials.pinkPartition}>
            <boxGeometry args={[0.98, H, 0.1]} />
          </mesh>

          {/* Équipements de la paroi d'about : affiches encadrées de part et
              d'autre de la porte, interphone SOS, plaque de numéro de voiture,
              coffret d'extincteur. C'est ce qui peuple la travée sur la rame. */}
          {([-1, 1] as const).map((sx) => (
            <group key={`endkit${sx}`}>
              {/* Affiche encadrée à hauteur de regard */}
              <mesh position={[sx * 0.93, 1.42, e * (HL - 0.055)]} rotation={[0, e === 1 ? Math.PI : 0, 0]} material={materials.posterFrame}>
                <planeGeometry args={[0.56, 0.4]} />
              </mesh>
              <mesh position={[sx * 0.93, 1.42, e * (HL - 0.06)]} rotation={[0, e === 1 ? Math.PI : 0, 0]} material={endPosterMats[(e + 1) / 2 + (sx + 1)]}>
                <planeGeometry args={[0.5, 0.34]} />
              </mesh>
            </group>
          ))}
          {/* Interphone SOS, au-dessus de la porte côté gauche */}
          <mesh position={[-0.5, 1.92, e * (HL - 0.056)]} rotation={[0, e === 1 ? Math.PI : 0, 0]} material={materials.sos}>
            <planeGeometry args={[0.12, 0.15]} />
          </mesh>
          {/* Plaque de numéro de voiture */}
          <mesh position={[0.95, 2.12, e * (HL - 0.056)]} rotation={[0, e === 1 ? Math.PI : 0, 0]} material={materials.carNumber}>
            <planeGeometry args={[0.32, 0.072]} />
          </mesh>
          {/* Coffret d'extincteur, au sol contre la porte */}
          <mesh position={[-0.62, 0.62, e * (HL - 0.09)]} rotation={[0, e === 1 ? Math.PI : 0, 0]} material={materials.extinguisher}>
            <boxGeometry args={[0.24, 0.62, 0.07]} />
          </mesh>
          <mesh position={[0, 2.05, e * HL]} material={materials.pinkPartition}>
            <boxGeometry args={[0.84, 0.5, 0.1]} />
          </mesh>
          <mesh position={[0, 0.95, e * HL - e * 0.01]} material={materials.steel}>
            <boxGeometry args={[0.84, 1.9, 0.06]} />
          </mesh>
          {/* Encadrement du hublot, mêmes angles adoucis que les vitres de
              porte : sans lui la porte d'intercirculation reste une plaque. */}
          <mesh
            geometry={gangwayFrameGeo}
            position={[0, 1.25, e * HL - e * 0.042]}
            rotation={[0, e === 1 ? Math.PI : 0, 0]}
            material={materials.seam}
          />
          <mesh position={[0, 1.25, e * HL - e * 0.045]} material={materials.glass}>
            <boxGeometry args={[0.56, 1.05, 0.02]} />
          </mesh>
          {/* Barres verticales de part et d'autre de la porte d'about */}
          {[-0.52, 0.52].map((x) => (
            <mesh key={`gb${x}`} position={[x, 1.15, e * (HL - 0.09)]} material={materials.steel}>
              <cylinderGeometry args={[0.017, 0.017, 2.3, 12]} />
            </mesh>
          ))}
          {/* Cap sombre derrière la vitre : silhouette du wagon suivant */}
          <mesh position={[0, 1.1, e * (HL + 0.6)]} material={materials.darkCap}>
            <boxGeometry args={[2.4, 2.3, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
