// Modules d'assise E235, fidèles au design réel : coussins gris matelassés,
// traversin de dossier en moquette damier verte (rouge en zone prioritaire),
// panneaux d'extrémité blancs laqués ajourés, porte-bagages, arceaux chromés
// montant au plafond, radiateurs sous les assises.

import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Instances, Instance } from '@react-three/drei';
import { CONFIG } from '../data/config';
import { roundedRect } from './shapes';
import { BENCHES, FREE_SPACE, SEAT_SLOTS } from '../systems/seats';
import {
  makeCheckerTexture,
  makeQuiltTexture,
  makePriorityBadgeTexture,
  makeFreeSpaceSignTexture,
  makeSurfaceTexture,
  makeRoughnessMap,
  CHECKER_CELLS,
  GREEN_CHECKER,
  RED_CHECKER,
} from '../textures/procedural';

const WALL_X = CONFIG.carHalfWidth; // 1.4

// Porte-bagages (棚) : centre de la nappe de tubes, et pente qui la fait monter
// vers la paroi. u est le décalage dans l'épaisseur, compté depuis ce centre et
// croissant vers la paroi : u = -0,22 tombe sur la lisse de maintien avant
// (x 0,95 / y 1,70), u = +0,22 sur le bord haut côté paroi.
const RACK_X = 1.17;
const RACK_Y = 1.8;
const RACK_TILT = 0.36;
const RACK_BAR_OFFSETS = [-0.18, -0.09, 0, 0.09, 0.18];

// Dossier : panneau garni quasi vertical, du haut de l'assise à hauteur
// d'omoplates. La rame n'a pas de traversin roulé — c'est une plaque.
const BACK_X = WALL_X - 0.155; // 1,245 : centre du panneau
const BACK_Y = 0.675; // centre : le bas affleure le coussin (0,455), le haut à 0,90
const BACK_DEPTH = 0.1;
const BACK_HEIGHT = 0.45;

// Poteau vertical au bord de chaque panneau d'about : il prolonge l'arceau
// jusqu'au sol, à l'aplomb du départ de la courbe (x 0,76 à y 1,40).
const POLE_X = 0.765;
const POLE_TOP = 1.42;

// Répétitions de la tuile de moquette par mètre, pour des carreaux d'environ
// 2,5 cm de côté — la maille d'un tissu de siège, pas d'une mosaïque.
const CHECKER_PER_M = 1 / (CHECKER_CELLS * 0.025);

// Pas d'une banquette de n places, lu sur les segments réels : les coussins
// sont taillés dessus pour se toucher.
function benchPitch(n: number): number {
  const bench = BENCHES.find((b) => b.n === n);
  return bench ? (bench.z1 - bench.z0) / n : 0.5;
}

// Baie du panneau d'about, dans le repère du panneau (x = profondeur depuis la
// paroi, y = hauteur).
const PANEL_WINDOW = { x: 0.34, y: 1.0, w: 0.42, h: 0.5 };

// --- Panneau d'extrémité (袖仕切り) : silhouette ajourée extrudée ---
function makePanelGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Contour (x = profondeur depuis la paroi, y = hauteur).
  shape.moveTo(0, 0.07);
  shape.lineTo(0.5, 0.07);
  shape.quadraticCurveTo(0.68, 0.1, 0.66, 0.42);
  shape.lineTo(0.62, 1.02);
  shape.quadraticCurveTo(0.6, 1.34, 0.4, 1.42);
  shape.quadraticCurveTo(0.2, 1.47, 0, 1.46);
  shape.lineTo(0, 0.07);
  // Grand hublot vitré : sur l'E235 le panneau d'about est percé d'une baie
  // largement arrondie, pas d'un simple oculus — c'est elle qui donne au
  // panneau sa silhouette et qui laisse passer le regard vers la porte.
  shape.holes.push(roundedRect(PANEL_WINDOW.w, PANEL_WINDOW.h, 0.13, PANEL_WINDOW.x, PANEL_WINDOW.y));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.008,
    bevelSegments: 2,
    curveSegments: 14,
  });
  return geo;
}

// --- Arceau chromé du panneau vers le rail plafond ---
function makeStanchionGeometry(side: 1 | -1): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.76, 1.4, 0),
    new THREE.Vector3(side * 0.63, 1.74, 0),
    new THREE.Vector3(side * 0.47, 2.04, 0),
  ]);
  return new THREE.TubeGeometry(curve, 14, 0.017, 10);
}

// --- Arceau intermédiaire (banquettes de 7) : du bord d'assise au plafond ---
function makeMidStanchionGeometry(side: 1 | -1): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.99, 0.46, 0),
    new THREE.Vector3(side * 0.95, 1.1, 0),
    new THREE.Vector3(side * 0.72, 1.7, 0),
    new THREE.Vector3(side * 0.47, 2.05, 0),
  ]);
  return new THREE.TubeGeometry(curve, 20, 0.016, 10);
}

// --- Console chromée du porte-bagages : part du haut de la paroi (près du
// bandeau publicitaire) et descend en avant porter la lisse de maintien, sous
// le bord avant de la tablette inclinée. ---
function makeRackBracketGeometry(side: 1 | -1): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 1.37, 1.87, 0),
    new THREE.Vector3(side * 1.16, 1.8, 0),
    new THREE.Vector3(side * 0.95, 1.7, 0),
  ]);
  return new THREE.TubeGeometry(curve, 14, 0.013, 8);
}

export function Seats() {
  const geos = useMemo(
    () => ({
      panel: makePanelGeometry(),
      panelGlass: new THREE.ShapeGeometry(
        roundedRect(PANEL_WINDOW.w - 0.01, PANEL_WINDOW.h - 0.01, 0.125, PANEL_WINDOW.x, PANEL_WINDOW.y),
        16,
      ),
      stanchionR: makeStanchionGeometry(1),
      stanchionL: makeStanchionGeometry(-1),
      midR: makeMidStanchionGeometry(1),
      midL: makeMidStanchionGeometry(-1),
      // Coussins : jointifs, à la longueur exacte du pas de la banquette, pour
      // former une assise continue creusée d'un sillon par place — c'est ce que
      // montre la rame, pas une file de galettes séparées par des jours.
      cushion7: new RoundedBoxGeometry(0.45, 0.11, benchPitch(7), 3, 0.03),
      cushion3: new RoundedBoxGeometry(0.45, 0.11, benchPitch(3), 3, 0.03),
      // Consoles chromées du porte-bagages, une géométrie par côté.
      bracketR: makeRackBracketGeometry(1),
      bracketL: makeRackBracketGeometry(-1),
    }),
    [],
  );

  // Porte-bagages : pas une tablette pleine mais un claire-voie de tubes
  // longitudinaux, comme sur la rame — on voit au travers, et le plafond reste
  // lisible depuis l'allée. Un tube unitaire (hauteur 1, axe Y) instancié
  // partout : une seule géométrie, un seul draw call pour tout le wagon, la
  // longueur étant portée par l'échelle de chaque instance.
  const barGeo = useMemo(() => new THREE.CylinderGeometry(0.011, 0.011, 1, 8), []);

  // Dossiers : un panneau par banquette, longueur variable.
  const backGeos = useMemo(
    () => BENCHES.map((b) => new RoundedBoxGeometry(BACK_DEPTH, BACK_HEIGHT, b.z1 - b.z0 - 0.06, 3, 0.025)),
    [],
  );
  const rackBars = useMemo(() => {
    const out: { x: number; y: number; z: number; len: number }[] = [];
    for (const s of [1, -1] as const) {
      for (const b of BENCHES) {
        const len = b.z1 - b.z0 - 0.04;
        const z = (b.z0 + b.z1) / 2;
        for (const u of RACK_BAR_OFFSETS) {
          out.push({
            x: s * (RACK_X + u * Math.cos(RACK_TILT)),
            y: RACK_Y + u * Math.sin(RACK_TILT),
            z,
            len,
          });
        }
      }
    }
    return out;
  }, []);

  const materials = useMemo(() => {
    const green = makeCheckerTexture(GREEN_CHECKER);
    const red = makeCheckerTexture(RED_CHECKER);
    const quilt = makeQuiltTexture();
    const badge = makePriorityBadgeTexture();
    const rough = makeRoughnessMap();
    return {
      green: new THREE.MeshStandardMaterial({ map: green, roughness: 0.95 }),
      red: new THREE.MeshStandardMaterial({ map: red, roughness: 0.95 }),
      quilt: new THREE.MeshStandardMaterial({ map: quilt, roughness: 0.9 }),
      // FRP peint satiné, pas laqué : grain + rugosité bruitée.
      shell: new THREE.MeshStandardMaterial({
        map: makeSurfaceTexture('#eceae4', 0.8),
        roughnessMap: rough,
        roughness: 0.62,
        metalness: 0.02,
      }),
      // Inox brossé plutôt que chrome miroir.
      chrome: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.3, metalness: 0.9 }),
      yellowGrip: new THREE.MeshStandardMaterial({ color: '#e0b23c', roughness: 0.68 }),
      panelGlass: new THREE.MeshStandardMaterial({
        color: '#cfd8da',
        transparent: true,
        opacity: 0.16,
        roughness: 0.12,
        metalness: 0.1,
        side: THREE.DoubleSide,
      }),
      heater: new THREE.MeshStandardMaterial({ color: '#585b60', roughness: 0.65, metalness: 0.35 }),
      badge: new THREE.MeshBasicMaterial({ map: badge, transparent: true, toneMapped: false }),
      freeSpaceSign: new THREE.MeshBasicMaterial({ map: makeFreeSpaceSignTexture(), toneMapped: false }),
    };
  }, []);

  const checkerByN = useMemo(() => {
    const cache = new Map<string, THREE.MeshStandardMaterial>();
    for (const priority of [false, true]) {
      for (const n of [3, 7]) {
        const src = priority ? materials.red : materials.green;
        const m = src.clone();
        const tex = (src.map as THREE.Texture).clone();
        // Le dossier est une face de boîte : U court sur la longueur, V sur la
        // hauteur. Le pas se calcule donc en mètres, pas en nombre de places —
        // la tuile fait 16 carreaux, on vise des carreaux de ~4,5 cm.
        const bench = BENCHES.find((b) => b.n === n);
        const len = bench ? bench.z1 - bench.z0 - 0.06 : 1;
        tex.repeat.set(CHECKER_PER_M * len, CHECKER_PER_M * BACK_HEIGHT);
        tex.needsUpdate = true;
        m.map = tex;
        cache.set(`${priority}-${n}`, m);
      }
    }
    return cache;
  }, [materials]);

  const sides: (1 | -1)[] = [1, -1];
  const seats7 = SEAT_SLOTS.filter((sl) => !sl.priority);
  const seats3 = SEAT_SLOTS.filter((sl) => sl.priority);

  return (
    <group>
      {/* Coussins individuels : un module arrondi par place assise */}
      <Instances geometry={geos.cushion7} material={materials.quilt} limit={seats7.length}>
        {seats7.map((sl, i) => (
          <Instance key={`c7-${i}`} position={[sl.side * 1.02, 0.4, sl.z]} />
        ))}
      </Instances>
      <Instances geometry={geos.cushion3} material={materials.quilt} limit={seats3.length}>
        {seats3.map((sl, i) => (
          <Instance key={`c3-${i}`} position={[sl.side * 1.02, 0.4, sl.z]} />
        ))}
      </Instances>
      {/* Tubes du porte-bagages, tous côtés et toutes banquettes confondus :
          le cylindre unitaire est couché selon z par la rotation, sa longueur
          vient de l'échelle. */}
      <Instances geometry={barGeo} material={materials.chrome} limit={rackBars.length}>
        {rackBars.map((bar, i) => (
          <Instance
            key={`bar${i}`}
            position={[bar.x, bar.y, bar.z]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[1, bar.len, 1]}
          />
        ))}
      </Instances>
      {/* Zone libre : ni assise ni dossier, une main courante murale sur
          potelets, un poteau côté allée et les marquages fauteuil / poussette. */}
      {FREE_SPACE && (
        <group>
          {(() => {
            const s = FREE_SPACE.side;
            const zc = (FREE_SPACE.z0 + FREE_SPACE.z1) / 2;
            const len = FREE_SPACE.z1 - FREE_SPACE.z0;
            const railX = s * (WALL_X - 0.09);
            return (
              <>
                {/* Main courante horizontale, à hauteur d'appui */}
                <mesh position={[railX, 0.82, zc]} rotation={[Math.PI / 2, 0, 0]} material={materials.chrome}>
                  <cylinderGeometry args={[0.019, 0.019, len - 0.1, 12]} />
                </mesh>
                {/* Potelets qui la portent */}
                {[FREE_SPACE.z0 + 0.16, FREE_SPACE.z1 - 0.16].map((z, k) => (
                  <mesh key={`leg${k}`} position={[railX, 0.41, z]} material={materials.chrome}>
                    <cylinderGeometry args={[0.016, 0.016, 0.82, 10]} />
                  </mesh>
                ))}
                {/* Poteau vertical côté allée, du sol au plafond */}
                <mesh position={[s * 0.86, 1.15, FREE_SPACE.z0 + 0.08]} material={materials.chrome}>
                  <cylinderGeometry args={[0.019, 0.019, 2.3, 12]} />
                </mesh>
                {/* Panneau sur la paroi */}
                <mesh
                  position={[s * (WALL_X - 0.045), 1.36, zc]}
                  rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                  material={materials.freeSpaceSign}
                >
                  <planeGeometry args={[0.4, 0.25]} />
                </mesh>
              </>
            );
          })()}
        </group>
      )}
      {sides.map((s) =>
        BENCHES.map((b, bi) => {
          if (b.freeSpaceSide === s) return null; // banquette remplacée par la zone libre
          const len = b.z1 - b.z0;
          const zc = (b.z0 + b.z1) / 2;
          const checkerMat = checkerByN.get(`${b.priority}-${b.n}`) ?? materials.green;
          const stanchionMat = b.priority ? materials.yellowGrip : materials.chrome;
          const seatDepth = 0.46;
          const seatX = s * (WALL_X - 0.15 - seatDepth / 2);
          // Arceaux intermédiaires des banquettes de 7 (division 2-3-2).
          const midZs = b.n === 7 ? [b.z0 + (len * 2) / 7, b.z0 + (len * 5) / 7] : [];
          return (
            <group key={`bench${s}-${bi}`}>
              {/* Coque blanche cantilever sous l'assise */}
              <mesh position={[seatX, 0.3, zc]} material={materials.shell}>
                <boxGeometry args={[seatDepth + 0.06, 0.07, len]} />
              </mesh>
              {/* Radiateur incliné sous l'assise */}
              <mesh position={[s * (WALL_X - 0.42), 0.16, zc]} rotation={[0, 0, s * 0.35]} material={materials.heater}>
                <boxGeometry args={[0.3, 0.16, len - 0.3]} />
              </mesh>
              {/* Dossier : panneau garni de moquette damier, arêtes adoucies */}
              <mesh geometry={backGeos[bi]} position={[s * BACK_X, BACK_Y, zc]} material={checkerMat} />
              {/* Coque blanche derrière le dossier */}
              <mesh position={[s * (WALL_X - 0.05), 0.92, zc]} material={materials.shell}>
                <boxGeometry args={[0.05, 0.95, len]} />
              </mesh>
              {/* Badges 優先席 sur le dossier des places prioritaires */}
              {b.priority &&
                Array.from({ length: b.n }, (_, k) => {
                  const zSeat = b.z0 + (len / b.n) * (k + 0.5);
                  return (
                    <mesh
                      key={`badge${k}`}
                      position={[s * (BACK_X - BACK_DEPTH / 2 - 0.004), 0.79, zSeat]}
                      rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
                      material={materials.badge}
                    >
                      <planeGeometry args={[0.17, 0.115]} />
                    </mesh>
                  );
                })}
              {/* Panneaux d'extrémité laqués ajourés */}
              {[b.z0, b.z1].map((z, k) => (
                <mesh
                  key={`panel${k}`}
                  geometry={geos.panel}
                  material={materials.shell}
                  position={[s * WALL_X, 0, z - 0.0175]}
                  rotation={[0, s === 1 ? Math.PI : 0, 0]}
                />
              ))}
              {/* Vitre du hublot */}
              {[b.z0, b.z1].map((z, k) => (
                <mesh
                  key={`panelglass${k}`}
                  geometry={geos.panelGlass}
                  material={materials.panelGlass}
                  position={[s * WALL_X, 0, z]}
                  rotation={[0, s === 1 ? Math.PI : 0, 0]}
                />
              ))}
              {/* Arceaux chromés (jaunes en zone prioritaire) vers le plafond,
                  et le poteau droit qui les prolonge jusqu'au sol : c'est la
                  barre que l'on empoigne debout près des portes. L'arceau part
                  de 1,40 m, le poteau couvre tout ce qui est en dessous. */}
              {[b.z0, b.z1].map((z, k) => (
                <mesh
                  key={`stan${k}`}
                  geometry={s === 1 ? geos.stanchionR : geos.stanchionL}
                  material={stanchionMat}
                  position={[0, 0, z]}
                />
              ))}
              {[b.z0, b.z1].map((z, k) => (
                <mesh
                  key={`pole${k}`}
                  position={[s * POLE_X, POLE_TOP / 2, z]}
                  material={stanchionMat}
                >
                  <cylinderGeometry args={[0.017, 0.017, POLE_TOP, 12]} />
                </mesh>
              ))}
              {midZs.map((z, k) => (
                <mesh
                  key={`mid${k}`}
                  geometry={s === 1 ? geos.midR : geos.midL}
                  material={materials.chrome}
                  position={[0, 0, z]}
                />
              ))}
              {/* --- Porte-bagages E235 (棚) --- Claire-voie de tubes inclinée
                  qui monte vers la paroi, au ras du linteau des fenêtres, sous
                  les écrans publicitaires (les tubes eux-mêmes sont instanciés
                  plus bas, hors de cette boucle). Sa lisse de maintien chromée
                  court le long du bord avant (à 1,70 m, bien au-dessus des têtes
                  assises, elle sert aussi de barre de maintien pour les voyageurs
                  debout) et repose sur des consoles chromées incurvées. Présent
                  sur toute la longueur, y compris au-dessus des places
                  prioritaires. */}
              {/* Lisse de maintien avant */}
              <mesh
                position={[s * 0.95, 1.7, zc]}
                rotation={[Math.PI / 2, 0, 0]}
                material={materials.chrome}
              >
                <cylinderGeometry args={[0.016, 0.016, len - 0.06, 10]} />
              </mesh>
              {/* Consoles chromées incurvées (aux extrémités, + milieux pour 7) */}
              {(b.n === 7 ? [b.z0 + 0.18, zc, b.z1 - 0.18] : [b.z0 + 0.14, b.z1 - 0.14]).map(
                (z, k) => (
                  <mesh
                    key={`brk${k}`}
                    geometry={s === 1 ? geos.bracketR : geos.bracketL}
                    material={materials.chrome}
                    position={[0, 0, z]}
                  />
                ),
              )}
            </group>
          );
        }),
      )}
    </group>
  );
}
