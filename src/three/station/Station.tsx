// La gare : quai praticable de 224 m, un gabarit par gare.
//
// Remplace l'ancien Platform.tsx, qui décrivait un quai unique de 96 m pensé
// pour n'être vu que par les vitres. Maintenant qu'on y marche, il faut sa
// vraie longueur (onze voitures de 20 m), de quoi occuper les yeux d'un bout à
// l'autre, et une gare de viaduc qui ne ressemble pas à une gare en tranchée.
//
// Le quai est un ÎLOT dans vingt-neuf cas sur trente : deux bords
// d'embarquement, l'ossature au milieu, et derrière soi non pas un mur mais une
// voie puis un autre quai. Harajuku seul est un quai latéral, avec un vrai mur
// de fond. Voir FarEdge et FarSide en fin de fichier.
//
// Construit côté +x puis retourné d'un demi-tour selon le côté d'ouverture, et
// glissant le long de la voie — comme avant. Tout ce qui se répète (murets de
// portes palières, vantaux, piliers, poutres, néons, bancs, marquages au sol)
// passe par un InstancedMesh : le quai a beau être deux fois et demie plus
// long, il coûte dix fois moins d'appels de rendu.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { DOOR_SIDE } from '../../data/stations';
import { runtime } from '../../systems/runtime';
import { psdDoorPos, psdGateLag } from '../../systems/doorMotion';
import { placementFor, stairTopZ, type Placed } from '../../systems/stationPlacement';
import { platformDetail } from '../../systems/perf';
import { layoutFor, type StationLayout } from '../../data/stationLayouts';
import {
  GAUGE_HALF,
  OPP_DEPTH,
  PLATFORM_TOP,
  PSD_H,
  PSD_LEAF_TRAVEL,
  PSD_LEAF_W,
  PSD_X,
  SLAB_H,
  STAIR_GOING,
  STAIR_OPENING_INSET,
  STAIR_RISE,
  STAIR_SHAFT_DEPTH,
  STAIR_STEPS,
  STAIR_WALK_LEN,
  STAIR_WALK_STEPS,
  TRACK_HALF,
} from '../../data/stationGeometry';
import { makeAdTexture, makePlatformFloorTexture, makeTactileTexture } from '../../textures/procedural';
import { Barrier } from './Barrier';
import { makeStationMaterials, type Mats } from './materials';
import { stationAd } from './adPool';
import { mat, matFacingTrack, useInstances } from './instancing';
import { OverheadSigns } from './OverheadSigns';
import { PlatformAds } from './PlatformAds';
import { PlatformKit } from './PlatformKit';
import { PlatformSignage } from './PlatformSignage';
import { Signature } from './signatures';
import { psdLayout } from './psdLayout';

const UP = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();


/** Recul du panneau de limite derrière la limite de marche réelle (m). */
const BARRIER_STANDOFF = 0.35;

/** Voies du faisceau, au-delà du quai d'en face, là où rien ne ferme la travée. */
const YARD_TRACKS = 4;
/** Entraxe de ces voies (m). */
const YARD_PITCH = 4.6;

export function Station() {
  // La gare rendue est celle dont le quai est physiquement là (platformIndex),
  // pas la prochaine du trajet (index) : au départ, index avance dès le coup de
  // sifflet alors que le quai défile encore le long des vitres — reconstruire
  // ici sur index transformait la gare sous les yeux du joueur. Le côté
  // d'ouverture suit la même logique : store.doorSide bascule vers la gare
  // suivante en début de croisière, quand ce quai-ci est encore visible.
  const index = useStore((s) => s.platformIndex);
  const doorSide = DOOR_SIDE[index];
  const root = useRef<THREE.Group>(null);

  const layout = layoutFor(index);
  const { segs, gaps } = useMemo(() => psdLayout(layout.length), [layout.length]);
  const place = useMemo(() => placementFor(index, gaps), [index, gaps]);
  const detail = platformDetail();
  const halfZ = layout.length / 2;
  const backX = place.backX;
  const depth = layout.depth;
  const canopyY = layout.canopyY;

  // Portes de quai : Shinjuku et Shibuya n'en ont toujours pas. Sans elles, le
  // bord est nu et c'est la bande podotactile qui prend le relais — nettement
  // plus large, comme sur tout quai japonais non équipé.
  const hasPsd = layout.psd !== 'none';
  const tactileW = hasPsd ? 0.42 : 0.86;

  // --- Textures et matériaux, refaits à chaque changement de gare ---
  const textures = useMemo(() => {
    const floor = makePlatformFloorTexture();
    floor.repeat.set(3, Math.round(layout.length / 7));
    const tactile = makeTactileTexture();
    // Les picots gardent leur pas quelle que soit la largeur de la bande :
    // étirée sans ce rapport, elle donnait des ovales sur un quai sans portes.
    tactile.repeat.set(tactileW / 0.42, Math.round(layout.length / 3.4));
    // Fonds francs, comme les caissons du quai : le distributeur et le kiosque
    // portent des affiches, pas des aplats crème sur un décor déjà clair.
    return { floor, tactile, ads: [makeAdTexture(4101, true, true), makeAdTexture(4102, true, true)] };
  }, [layout.length, tactileW]);

  const m = useMemo(() => makeStationMaterials(layout.palette, textures), [layout.palette, textures]);

  // --- Dalle percée au droit des trémies -------------------------------
  // Une boîte ne peut pas avoir de trou : la dalle est extrudée depuis un
  // contour à trous. Les UV sont ensuite normalisées comme celles d'une boîte,
  // pour que la texture de sol garde exactement la densité d'avant.
  const slabGeo = useMemo(() => {
    const half = layout.length / 2;
    const x0 = PSD_X;
    const x1 = PSD_X + depth;
    const shape = new THREE.Shape();
    shape.moveTo(x0, -half);
    shape.lineTo(x1, -half);
    shape.lineTo(x1, half);
    shape.lineTo(x0, half);
    shape.closePath();
    for (const s of place.stairs) {
      const ix = s.halfX - STAIR_OPENING_INSET;
      // Le premier giron est la dalle elle-même : l'ouverture ne commence qu'au
      // nez de la première marche, sinon on marcherait sur le vide.
      const zNear = stairTopZ(s) + STAIR_GOING;
      const zFar = s.z + s.halfZ - STAIR_OPENING_INSET;
      const hole = new THREE.Path();
      hole.moveTo(s.x - ix, zNear);
      hole.lineTo(s.x - ix, zFar);
      hole.lineTo(s.x + ix, zFar);
      hole.lineTo(s.x + ix, zNear);
      hole.closePath();
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: SLAB_H, bevelEnabled: false });
    // Le plan de tracé (x, z) se couche à l'horizontale, l'extrusion descend.
    g.rotateX(Math.PI / 2);
    g.translate(0, PLATFORM_TOP, 0);
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) - x0) / depth;
      uv[i * 2 + 1] = (pos.getZ(i) + half) / layout.length;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }, [layout.length, depth, place.stairs]);

  // Les matériaux, textures et géométries d'une gare quittée ne resservent pas.
  useLayoutEffect(() => {
    const mats = Object.values(m);
    const texs = [textures.floor, textures.tactile, ...textures.ads];
    return () => {
      for (const x of mats) x.dispose();
      for (const t of texs) t.dispose();
    };
  }, [m, textures]);
  useLayoutEffect(() => () => slabGeo.dispose(), [slabGeo]);

  // --- Matrices des éléments répétés ---
  const psdSegs = useMemo(
    () => segs.map((s) => mat(PSD_X, PLATFORM_TOP + PSD_H / 2, (s.z0 + s.z1) / 2, 0.1, PSD_H, s.z1 - s.z0)),
    [segs],
  );
  const psdGlass = useMemo(
    () =>
      segs.map((s) =>
        mat(PSD_X + 0.02, PLATFORM_TOP + PSD_H * 0.72, (s.z0 + s.z1) / 2, 0.02, PSD_H * 0.42, s.z1 - s.z0 - 0.16),
      ),
    [segs],
  );
  const psdBand = useMemo(
    () =>
      segs.map((s) =>
        mat(PSD_X - 0.005, PLATFORM_TOP + PSD_H - 0.07, (s.z0 + s.z1) / 2, 0.12, 0.1, s.z1 - s.z0),
      ),
    [segs],
  );
  const columns = useMemo(
    () =>
      place.columns.map((z) =>
        mat(backX - 0.55, PLATFORM_TOP + (canopyY - PLATFORM_TOP) / 2, z, 0.3, canopyY - PLATFORM_TOP, 0.3),
      ),
    [place.columns, backX, canopyY],
  );
  const columnBands = useMemo(
    () => place.columns.map((z) => mat(backX - 0.55, PLATFORM_TOP + 1.4, z, 0.33, 0.16, 0.33)),
    [place.columns, backX],
  );
  const beams = useMemo(
    () => place.columns.map((z) => mat(PSD_X + depth / 2, canopyY - 0.09, z, depth - 0.2, 0.18, 0.24)),
    [place.columns, depth, canopyY],
  );
  // Néons : le tube AFFLEURE la sous-face de l'auvent (elle est à canopyY) au
  // lieu de flotter huit centimètres dessous, et se décale toujours des
  // poutres — au droit d'un pilier il disparaissait purement et simplement
  // dans la poutre transversale.
  const lamps = useMemo(() => {
    const y = canopyY - 0.025;
    const off = layout.columnSpacing;
    return place.columns.flatMap((z) =>
      detail >= 2
        ? [mat(PSD_X + depth * 0.5, y, z + off * 0.5, 1.7, 0.05, 0.14)]
        : [
            mat(PSD_X + depth * 0.28, y, z + off * 0.3, 1.7, 0.05, 0.14),
            mat(PSD_X + depth * 0.72, y, z + off * 0.7, 1.7, 0.05, 0.14),
          ],
    );
  }, [place.columns, depth, canopyY, layout.columnSpacing, detail]);
  const queue = useMemo(
    () => place.queueMarks.map((q) => mat(q.x, PLATFORM_TOP + 0.006, q.z, 0.9, 1, 0.5)),
    [place.queueMarks],
  );
  const benchSeat = useMemo(
    () => place.benches.map((b) => mat(b.x, PLATFORM_TOP + 0.42, b.z, 0.55, 0.08, 2.4)),
    [place.benches],
  );
  const benchBack = useMemo(
    () => place.benches.map((b) => mat(b.x + 0.2, PLATFORM_TOP + 0.72, b.z, 0.08, 0.55, 2.4)),
    [place.benches],
  );
  const benchLegs = useMemo(
    () =>
      place.benches.flatMap((b) =>
        [-0.9, 0.9].map((dz) => mat(b.x, PLATFORM_TOP + 0.2, b.z + dz, 0.45, 0.4, 0.08)),
      ),
    [place.benches],
  );
  const vending = useMemo(
    () => place.vending.map((v) => mat(v.x, PLATFORM_TOP + 0.9, v.z, 0.8, 1.8, 1.4)),
    [place.vending],
  );
  // Façade éclairée du distributeur : le plan doit REGARDER LA VOIE. Posé sans
  // rotation, il était dressé perpendiculairement à la machine et la traversait
  // de part en part comme un panneau planté là.
  const vendingFace = useMemo(
    () => place.vending.map((v) => matFacingTrack(v.x - 0.41, PLATFORM_TOP + 1.05, v.z, 1.2, 1.1)),
    [place.vending],
  );

  const psdRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const columnRef = useRef<THREE.InstancedMesh>(null);
  const columnBandRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);
  const queueRef = useRef<THREE.InstancedMesh>(null);
  const seatRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const legRef = useRef<THREE.InstancedMesh>(null);
  const vendRef = useRef<THREE.InstancedMesh>(null);
  const vendFaceRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  useInstances(psdRef, psdSegs);
  useInstances(glassRef, psdGlass);
  useInstances(bandRef, psdBand);
  useInstances(columnRef, columns);
  useInstances(columnBandRef, columnBands);
  useInstances(beamRef, beams);
  useInstances(lampRef, lamps);
  useInstances(queueRef, queue);
  useInstances(seatRef, benchSeat);
  useInstances(backRef, benchBack);
  useInstances(legRef, benchLegs);
  useInstances(vendRef, vending);
  useInstances(vendFaceRef, vendingFace);

  // --- Vantaux des portes palières, animés ---
  const leafMat = useRef(new THREE.Matrix4());
  const leafCount = gaps.length * 2;
  useFrame(() => {
    const presence = runtime.platformFade;
    if (root.current) {
      root.current.visible = presence > 0.02;
      root.current.position.z = runtime.platformSlide;
    }
    const im = leafRef.current;
    if (!im || presence <= 0.02) return;
    const mm = leafMat.current;
    let k = 0;
    for (let g = 0; g < gaps.length; g++) {
      const open = psdDoorPos(psdGateLag(g)) * PSD_LEAF_TRAVEL;
      for (const dir of [1, -1] as const) {
        mm.compose(
          V.set(PSD_X + 0.08, PLATFORM_TOP + PSD_H / 2, gaps[g] + dir * (PSD_LEAF_W / 2 + open)),
          UP,
          S.set(0.07, PSD_H - 0.06, PSD_LEAF_W),
        );
        im.setMatrixAt(k++, mm);
      }
    }
    im.count = leafCount;
    im.instanceMatrix.needsUpdate = true;
  });

  const midX = PSD_X + depth * 0.55;
  const wallH = canopyY - 0.07 - PLATFORM_TOP;

  return (
    <group ref={root} name="gare" rotation={[0, doorSide === 1 ? 0 : Math.PI, 0]} visible={false}>
      {/* --- Dalle (percée au droit des trémies), bord de quai, bande tactile --- */}
      <mesh name="dalle" geometry={slabGeo} material={m.slab} receiveShadow />
      <mesh position={[PSD_X + 0.12, PLATFORM_TOP + 0.01, 0]} material={m.rubber}>
        <boxGeometry args={[0.16, 0.04, layout.length]} />
      </mesh>
      <mesh position={[PSD_X + 0.24, PLATFORM_TOP + 0.006, 0]} material={m.edge}>
        <boxGeometry args={[0.12, 0.012, layout.length]} />
      </mesh>
      <mesh
        position={[PSD_X + 0.29 + tactileW / 2, PLATFORM_TOP + 0.008, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={m.tactile}
      >
        <planeGeometry args={[tactileW, layout.length]} />
      </mesh>
      {/* Joue de rive : la dalle s'arrête 44 cm sous le sol du quai et le
          ballast est 65 cm plus bas encore. Derrière un muret de portes
          palières on ne l'a jamais vu ; penché au-dessus d'un bord nu, si. */}
      <mesh position={[PSD_X + 0.03, PLATFORM_TOP - SLAB_H - 0.32, 0]} material={m.wallDark}>
        <boxGeometry args={[0.07, 0.66, layout.length]} />
      </mesh>
      {/* Repères d'attente peints au sol, deux par baie */}
      <instancedMesh name="repères-attente" ref={queueRef} args={[undefined, undefined, Math.max(1, queue.length)]} material={m.queue}>
        <boxGeometry args={[1, 0.004, 1]} />
      </instancedMesh>

      {/* --- Portes palières, là où elles existent --- */}
      {hasPsd && (
        <>
      <instancedMesh name="muret-psd" ref={psdRef} args={[undefined, undefined, Math.max(1, psdSegs.length)]} material={m.psd}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="vitrage-psd" ref={glassRef} args={[undefined, undefined, Math.max(1, psdGlass.length)]} material={m.glass}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="bandeau-psd" ref={bandRef} args={[undefined, undefined, Math.max(1, psdBand.length)]} material={m.accent}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="vantaux-psd" ref={leafRef} args={[undefined, undefined, Math.max(1, leafCount)]} material={m.psd}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
        </>
      )}

      {/* --- Le bord d'en face, sur notre propre quai -------------------
          Vingt-neuf des trente gares sont des îlots : ce qu'on a dans le dos
          n'est pas un mur, c'est un SECOND BORD D'EMBARQUEMENT. Il reçoit donc
          exactement le même traitement que celui-ci — liseré, bande
          podotactile, muret de portes palières — mais retourné. */}
      {place.farEdgeX !== null && (
        <FarEdge
          farX={place.farEdgeX}
          len={layout.length}
          tactileW={tactileW}
          hasPsd={hasPsd}
          segs={segs}
          m={m}
        />
      )}

      {/* --- Ce qu'on voit au-delà : voie, quai d'en face, clôture --- */}
      <FarSide layout={layout} place={place} wallH={wallH} m={m} detail={detail} segs={segs} />

      {/* --- Auvent, poutres, piliers, néons --- */}
      <mesh name="auvent" position={[PSD_X + depth / 2, canopyY + 0.07, 0]} material={m.canopy} receiveShadow>
        <boxGeometry args={[depth + 0.4, 0.14, layout.length]} />
      </mesh>
      <instancedMesh name="poutre" ref={beamRef} args={[undefined, undefined, Math.max(1, beams.length)]} material={m.beam}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        name="pilier"
        ref={columnRef}
        args={[undefined, undefined, Math.max(1, columns.length)]}
        material={m.column}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="bague-pilier" ref={columnBandRef} args={[undefined, undefined, Math.max(1, columnBands.length)]} material={m.accent}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="néon" ref={lampRef} args={[undefined, undefined, Math.max(1, lamps.length)]} material={m.lamp}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* --- Mobilier --- */}
      <instancedMesh name="banc" ref={seatRef} args={[undefined, undefined, Math.max(1, benchSeat.length)]} material={m.bench}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="banc-dossier" ref={backRef} args={[undefined, undefined, Math.max(1, benchBack.length)]} material={m.bench}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="banc-pied" ref={legRef} args={[undefined, undefined, Math.max(1, benchLegs.length)]} material={m.metal}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="distributeur" ref={vendRef} args={[undefined, undefined, Math.max(1, vending.length)]} material={m.vending}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="distributeur-face" ref={vendFaceRef} args={[undefined, undefined, Math.max(1, vendingFace.length)]} material={m.vendingFace}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>

      {/* Trémies d'escalier : la dalle est percée, donc elles font partie de la
          structure — jamais retirées par un palier de qualité. */}
      {place.stairs.map((s, i) => (
        <Stairwell key={`stair${i}`} s={s} m={m} station={index} />
      ))}

      {/* Affichage publicitaire : caissons du mur, colonnes habillées,
          bannières suspendues, allèges de portes palières. */}
      <PlatformAds place={place} layout={layout} segs={segs} station={index} detail={detail} />

      {/* Potences d'orientation : sorties en jaune, correspondances en blanc. */}
      <OverheadSigns place={place} layout={layout} station={index} detail={detail} />

      {/* La trousse réglementaire : sonorisation, caméras, extincteurs, bornes
          d'urgence, armoires, bacs de tri, gouttières, marquages au sol. */}
      <PlatformKit place={place} layout={layout} detail={detail} materials={m} />

      {detail <= 2 && <Amenities place={place} canopyY={canopyY} m={m} />}

      {/* Limites de zone : bouts du quai et pied de chaque volée. Le panneau
          est posé un peu AU-DELÀ de la limite de marche — collé dessus, le
          joueur aurait le nez dans le halo et n'en verrait plus la trame. */}
      {[-1, 1].map((d) => (
        <Barrier
          key={`end${d}`}
          x={(place.walkX0 + place.walkX1) / 2}
          y={PLATFORM_TOP + 1.25}
          z={d * (place.walkHalfZ + BARRIER_STANDOFF)}
          width={place.walkX1 - place.walkX0}
          height={2.5}
        />
      ))}
      {place.stairs.map((s, i) => (
        <Barrier
          key={`lim${i}`}
          // Le panneau tient dans la trémie : il monte du giron où l'on
          // s'arrête jusqu'à hauteur de dalle, pas au-delà.
          x={s.x}
          y={PLATFORM_TOP - STAIR_WALK_STEPS * STAIR_RISE + 1.0}
          z={stairTopZ(s) + STAIR_WALK_LEN + BARRIER_STANDOFF}
          width={(s.halfX - STAIR_OPENING_INSET) * 2}
          height={2.0}
        />
      ))}

      {/* Charpente propre à la gare, quand elle en a une. Elle était réservée
          aux deux paliers les plus riches ; elle porte maintenant l'essentiel
          du caractère de quatorze gares, et descend donc d'un cran. */}
      {layout.signature && detail <= 1 && (
        <Signature layout={layout} place={place} m={m} />
      )}

      <PlatformSignage
        hangX={midX + 0.7}
        canopyY={canopyY}
        halfZ={halfZ}
        totemX={PSD_X + depth * 0.32}
        bandX={backX}
        detail={detail}
        ground={place.obstacles}
        frame={m.frame}
        metal={m.metal}
        accent={m.accent}
      />
    </group>
  );
}

/**
 * Le bord d'embarquement d'en face, sur un quai en îlot.
 *
 * Même dessin qu'au bord près, retourné : liseré caoutchouc, ligne blanche,
 * bande podotactile et muret de portes palières. Les vantaux, eux, ne sont pas
 * animés — aucune rame ne s'y présente, et à huit mètres un portique fermé se
 * lit comme un muret continu.
 */
function FarEdge({
  farX,
  len,
  tactileW,
  hasPsd,
  segs,
  m,
}: {
  farX: number;
  len: number;
  tactileW: number;
  hasPsd: boolean;
  segs: { z0: number; z1: number }[];
  m: Mats;
}) {
  const band = useMemo(
    () =>
      segs.map((sg) =>
        mat(farX - 0.045, PLATFORM_TOP + PSD_H - 0.07, (sg.z0 + sg.z1) / 2, 0.12, 0.1, sg.z1 - sg.z0),
      ),
    [segs, farX],
  );
  const bandRef = useRef<THREE.InstancedMesh>(null);
  useInstances(bandRef, band);
  return (
    <group name="bord-opposé">
      <mesh position={[farX - 0.12, PLATFORM_TOP + 0.01, 0]} material={m.rubber}>
        <boxGeometry args={[0.16, 0.04, len]} />
      </mesh>
      <mesh position={[farX - 0.24, PLATFORM_TOP + 0.006, 0]} material={m.edge}>
        <boxGeometry args={[0.12, 0.012, len]} />
      </mesh>
      <mesh
        position={[farX - 0.29 - tactileW / 2, PLATFORM_TOP + 0.008, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={m.tactile}
      >
        <planeGeometry args={[tactileW, len]} />
      </mesh>
      {hasPsd && (
        <>
          <mesh position={[farX - 0.05, PLATFORM_TOP + PSD_H / 2, 0]} material={m.psd}>
            <boxGeometry args={[0.1, PSD_H, len]} />
          </mesh>
          <mesh position={[farX - 0.11, PLATFORM_TOP + PSD_H * 0.72, 0]} material={m.glass}>
            <boxGeometry args={[0.02, PSD_H * 0.42, len - 0.4]} />
          </mesh>
          {/* Le bandeau uguisu est INTERROMPU à chaque baie, comme au bord près.
              Continu sur deux cent vingt mètres, il traçait une barre verte
              franche à la hauteur exacte des vitres de porte de la rame — qui
              ne sont opaques qu'à neuf pour cent : vues du wagon, elles
              viraient au vert d'un bout à l'autre du quai. */}
          <instancedMesh
            name="bandeau-psd-opposé"
            ref={bandRef}
            args={[undefined, undefined, Math.max(1, band.length)]}
            material={m.accent}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
        </>
      )}
    </group>
  );
}

/**
 * Ce qu'on a derrière soi quand on regarde la voie.
 *
 * Jusqu'ici, quatre familles de rendu abstraites — mur, garde-corps, paroi de
 * tranchée, « deuxième voie » — dont vingt-neuf gares tiraient à peu près le
 * même fond gris. La vérité est ailleurs : la Yamanote n'a qu'UN quai latéral
 * sur toute la boucle, Harajuku. Partout ailleurs on est sur un îlot, et
 * derrière soi il y a une voie, puis un autre quai.
 *
 * Laquelle change tout : à Tokyo, Ueno ou Yūrakuchō c'est la Keihin-Tōhoku qui
 * passe là, sur un quai qu'on partage avec elle ; à Kanda ou Mejiro c'est la
 * Yamanote elle-même, en sens inverse ; à Ikebukuro et Ōsaki c'est une
 * deuxième paire de voies Yamanote, celles des départs et des terminus.
 */
function FarSide({
  layout,
  place,
  wallH,
  m,
  detail,
  segs,
}: {
  layout: ReturnType<typeof layoutFor>;
  place: ReturnType<typeof placementFor>;
  wallH: number;
  m: Mats;
  detail: number;
  segs: { z0: number; z1: number }[];
}) {
  const len = layout.length;
  const far = place.farEdgeX;

  // Les crochets se déclarent AVANT le retour anticipé d'Harajuku : après, ils
  // ne seraient pas appelés à chaque rendu et React s'en plaindrait.
  const oppBand = useMemo(
    () =>
      far === null
        ? []
        : segs.map((sg) =>
            mat(
              far + 2 * TRACK_HALF + 0.045,
              PLATFORM_TOP + PSD_H - 0.07,
              (sg.z0 + sg.z1) / 2,
              0.12,
              0.1,
              sg.z1 - sg.z0,
            ),
          ),
    [segs, far],
  );
  const oppBandRef = useRef<THREE.InstancedMesh>(null);
  useInstances(oppBandRef, oppBand);

  // Harajuku : le seul quai latéral de la boucle. Un vrai mur, un vrai
  // soubassement carrelé, et rien à voir au-delà.
  if (far === null) {
    const backX = place.backX;
    return (
      <group>
        <mesh position={[backX, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
          <boxGeometry args={[0.18, wallH, len]} />
        </mesh>
        <Wainscot backX={backX - 0.09} len={len} m={m} />
        <mesh position={[backX - 0.02, PLATFORM_TOP + wallH - 0.6, 0]} material={m.wallDark}>
          <boxGeometry args={[0.2, 0.35, len]} />
        </mesh>
        <mesh position={[backX - 0.03, PLATFORM_TOP + wallH - 0.92, 0]} material={m.accent}>
          <boxGeometry args={[0.08, 0.1, len]} />
        </mesh>
      </group>
    );
  }

  const trackX = far + TRACK_HALF;
  const oppEdge = far + 2 * TRACK_HALF;
  const oppBack = oppEdge + OPP_DEPTH;
  const hasPsd = layout.psd !== 'none';
  // À Ikebukuro et Ōsaki, la voie d'en face est la voie SECONDAIRE : celle qui
  // n'a pas encore ses portes. C'est précisément là que ça se voit.
  const oppPsd = hasPsd && layout.psd !== 'partial';
  return (
    <group name="travée-opposée">
      {/* Joue de rive du bord d'en face. */}
      <mesh position={[far - 0.03, PLATFORM_TOP - SLAB_H - 0.32, 0]} material={m.wallDark}>
        <boxGeometry args={[0.07, 0.66, len]} />
      </mesh>

      {/* La voie : ballast et deux files de rails. */}
      <mesh position={[trackX, PLATFORM_TOP - SLAB_H - 0.86, 0]} material={m.liner}>
        <boxGeometry args={[TRACK_HALF * 2, 0.42, len]} />
      </mesh>
      {[-1, 1].map((d) => (
        <mesh key={d} position={[trackX + d * GAUGE_HALF, -1.11, 0]} material={m.metal}>
          <boxGeometry args={[0.08, 0.16, len]} />
        </mesh>
      ))}

      {/* Le quai d'en face : dalle, joue, muret de portes, auvent. */}
      <mesh
        position={[(oppEdge + oppBack) / 2, PLATFORM_TOP - SLAB_H / 2, 0]}
        material={m.slab}
      >
        <boxGeometry args={[OPP_DEPTH, SLAB_H, len]} />
      </mesh>
      <mesh position={[oppEdge + 0.03, PLATFORM_TOP - SLAB_H - 0.32, 0]} material={m.wallDark}>
        <boxGeometry args={[0.07, 0.66, len]} />
      </mesh>
      {oppPsd && (
        <>
          <mesh position={[oppEdge + 0.05, PLATFORM_TOP + PSD_H / 2, 0]} material={m.psd}>
            <boxGeometry args={[0.1, PSD_H, len]} />
          </mesh>
          {/* Bandeau interrompu, pour la même raison qu'au bord d'en face. */}
          <instancedMesh
            name="bandeau-psd-opposé"
            ref={oppBandRef}
            args={[undefined, undefined, Math.max(1, oppBand.length)]}
            material={m.accent}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
        </>
      )}
      {/* L'auvent d'en face : on le voit, on n'y marche pas. Il tombe au
          palier le plus léger, où la silhouette du quai suffit. */}
      {detail <= 2 && (
        <mesh position={[(oppEdge + oppBack) / 2, layout.canopyY + 0.07, 0]} material={m.canopy}>
          <boxGeometry args={[OPP_DEPTH + 0.4, 0.14, len]} />
        </mesh>
      )}

      {/* Faisceau : là où rien ne ferme la travée, des voies encore, jusqu'au
          bord du champ. C'est la perspective dégagée de Nippori et d'Ueno, et
          les huit voies parallèles de Shimbashi — qu'un mur escamotait. */}
      {layout.openFarSide && (
        <group>
          <mesh
            position={[oppBack + (YARD_TRACKS * YARD_PITCH) / 2, PLATFORM_TOP - SLAB_H - 0.86, 0]}
            material={m.liner}
          >
            <boxGeometry args={[YARD_TRACKS * YARD_PITCH, 0.42, len]} />
          </mesh>
          {/* Les rails du faisceau : huit longs prismes qu'on distingue à
              peine au-delà de vingt mètres. Le ballast, lui, reste toujours. */}
          {detail <= 2 &&
            Array.from({ length: YARD_TRACKS }, (_, k) => {
              const x = oppBack + (k + 0.5) * YARD_PITCH;
              return [-1, 1].map((d) => (
                <mesh key={`yr${k}${d}`} position={[x + d * GAUGE_HALF, -1.11, 0]} material={m.metal}>
                  <boxGeometry args={[0.08, 0.16, len]} />
                </mesh>
              ));
            })}
        </group>
      )}

      {/* Ce qui ferme la travée, selon le niveau où court la voie — au fond du
          quai d'en face, ou au bout du faisceau quand il y en a un. */}
      <Closure x={oppBack + (layout.openFarSide ? YARD_TRACKS * YARD_PITCH : 0)} elevation={layout.elevation} wallH={wallH} len={len} m={m} />
    </group>
  );
}

/** La paroi qui ferme la travée : ce qu'on voit tout au fond. */
function Closure({
  x,
  elevation,
  wallH,
  len,
  m,
}: {
  x: number;
  elevation: StationLayout['elevation'];
  wallH: number;
  len: number;
  m: Mats;
}) {
  if (elevation === 'trench') {
    // Tranchée : la paroi de soutènement monte bien au-delà de l'auvent.
    return (
      <group>
        <mesh position={[x, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
          <boxGeometry args={[0.24, wallH, len]} />
        </mesh>
        <Wainscot backX={x - 0.13} len={len} m={m} />
        <mesh position={[x + 0.12, PLATFORM_TOP + wallH + 1.7, 0]} material={m.wallDark}>
          <boxGeometry args={[0.42, 3.4, len]} />
        </mesh>
      </group>
    );
  }
  if (elevation === 'elevated') {
    // Viaduc : garde-corps ajouré, la ville se voit par-dessus.
    return (
      <group>
        <mesh position={[x, PLATFORM_TOP + 0.6, 0]} material={m.wall}>
          <boxGeometry args={[0.18, 1.2, len]} />
        </mesh>
        <mesh position={[x, PLATFORM_TOP + 1.24, 0]} material={m.metal}>
          <boxGeometry args={[0.1, 0.08, len]} />
        </mesh>
        <mesh position={[x, PLATFORM_TOP + 1.9, 0]} material={m.metal}>
          <boxGeometry args={[0.08, 0.06, len]} />
        </mesh>
      </group>
    );
  }
  // Au sol : un mur de fond ordinaire, avec sa faïence.
  return (
    <group>
      <mesh position={[x, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
        <boxGeometry args={[0.2, wallH, len]} />
      </mesh>
      <Wainscot backX={x - 0.11} len={len} m={m} />
    </group>
  );
}

/**
 * Soubassement carrelé du mur de fond : un aplat chaud d'un mètre de haut,
 * couronné du liseré uguisu de la ligne. Sans lui le fond du quai est un aplat
 * de béton clair sur toute sa hauteur — le « trop blanc et gris » du décor.
 */
function Wainscot({ backX, len, m }: { backX: number; len: number; m: Mats }) {
  return (
    <group>
      <mesh position={[backX - 0.015, PLATFORM_TOP + 0.52, 0]} material={m.tile}>
        <boxGeometry args={[0.05, 1.04, len]} />
      </mesh>
      <mesh position={[backX - 0.025, PLATFORM_TOP + 1.07, 0]} material={m.accent}>
        <boxGeometry args={[0.07, 0.07, len]} />
      </mesh>
    </group>
  );
}

/**
 * Trémie d'escalier, dalle réellement percée.
 *
 * On descend la volée sur cinq marches ; au-delà, la limite de zone
 * (three/station/Barrier) prend le relais et les marches continuent de
 * s'enfoncer vers la salle des billets, hors d'atteinte.
 *
 * Repère local : origine au centre de l'emprise, au niveau du sol du quai. La
 * volée descend vers +z ; l'entrée est donc côté -z, dégagée.
 */
function Stairwell({ s, m, station }: { s: Placed; m: Mats; station: number }) {
  const ix = s.halfX - STAIR_OPENING_INSET; // demi-largeur de l'ouverture
  const width = ix * 2 - 0.04;
  const nose = -s.halfZ; // nez de la volée, en repère local
  const bottom = -STAIR_STEPS * STAIR_RISE;

  return (
    <group name="trémie" position={[s.x, PLATFORM_TOP, s.z]}>
      {/* Gaine sous la dalle, vue de l'intérieur : la trémie a un fond. */}
      <mesh position={[0, -STAIR_SHAFT_DEPTH / 2 - 0.02, 0]} material={m.shaft}>
        <boxGeometry args={[ix * 2, STAIR_SHAFT_DEPTH, (s.halfZ - STAIR_OPENING_INSET) * 2]} />
      </mesh>
      {/* Volée. Le premier giron est la dalle : la marche k descend de k
          contremarches et couvre le giron qui suit son nez. */}
      {Array.from({ length: STAIR_STEPS }, (_, i) => {
        const k = i + 1;
        const y = -k * STAIR_RISE;
        const z0 = nose + k * STAIR_GOING;
        return (
          <group key={k}>
            <mesh position={[0, y + 0.03, z0 + STAIR_GOING / 2]} material={m.wall} receiveShadow>
              <boxGeometry args={[width, 0.06, STAIR_GOING]} />
            </mesh>
            <mesh position={[0, y + STAIR_RISE / 2, z0]} material={m.wallDark}>
              <boxGeometry args={[width, STAIR_RISE, 0.05]} />
            </mesh>
          </group>
        );
      })}
      {/* Petit palier au fond de la volée modélisée. */}
      <mesh position={[0, bottom - 0.03, nose + (STAIR_STEPS + 1) * STAIR_GOING + 0.4]} material={m.wall}>
        <boxGeometry args={[width, 0.06, 0.9]} />
      </mesh>

      {/* Caisson publicitaire plaqué sur le garde-corps côté voie : sur un vrai
          quai c'est la surface la plus rentable de la trémie, et elle est en
          plein dans le champ de quiconque marche le long du quai. */}
      <mesh position={[-(s.halfX - 0.005), 0.53, 0]} material={m.frame}>
        <boxGeometry args={[0.06, 0.86, s.halfZ * 2 - 0.3]} />
      </mesh>
      <mesh
        position={[-(s.halfX + 0.036), 0.53, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        material={stationAd(station, 5)}
      >
        <planeGeometry args={[s.halfZ * 2 - 0.42, 0.76]} />
      </mesh>

      {/* Garde-corps sur le bandeau de dalle qui borde l'ouverture. */}
      {[-1, 1].map((d) => (
        <group key={`r${d}`}>
          <mesh position={[d * (s.halfX - 0.07), 0.5, 0]} material={m.wall}>
            <boxGeometry args={[0.14, 1, s.halfZ * 2]} />
          </mesh>
          <mesh position={[d * (s.halfX - 0.07), 1.03, 0]} material={m.metal}>
            <boxGeometry args={[0.18, 0.07, s.halfZ * 2]} />
          </mesh>
          {/* Main courante intérieure : elle DESCEND avec les marches — d'où
              le signe négatif, sans lequel elle ressortait en l'air. */}
          <mesh
            position={[
              d * (ix - 0.09),
              -(STAIR_STEPS / 2 + 1) * STAIR_RISE + 0.92,
              nose + (STAIR_STEPS / 2 + 1) * STAIR_GOING,
            ]}
            rotation={[-Math.atan2(STAIR_RISE, STAIR_GOING), 0, 0]}
            material={m.metal}
          >
            <boxGeometry args={[0.05, 0.05, STAIR_STEPS * Math.hypot(STAIR_GOING, STAIR_RISE)]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.5, s.halfZ - 0.07]} material={m.wall}>
        <boxGeometry args={[s.halfX * 2, 1, 0.14]} />
      </mesh>

      {/* Affiches sur les joues de la gaine : c'est ce qu'on a sous les yeux en
          descendant, et sans elles la trémie n'est qu'un puits gris.
          Chacune est calée SUR SA MARCHE — la hauteur de joue disponible varie
          tout au long de la volée, une affiche posée à hauteur fixe se
          retrouverait à moitié enterrée dans les girons. */}
      {[
        { d: 1, t: 1.87, w: 0.62, h: 0.6 },
        { d: -1, t: 3.4, w: 0.7, h: 1.0 },
      ].map(({ d, t, w, h }, k) => {
        const tread = -Math.floor(t / STAIR_GOING) * STAIR_RISE;
        return (
          <mesh
            key={`ad${d}`}
            position={[d * (ix - 0.02), tread + h / 2 + 0.14, nose + t]}
            rotation={[0, d === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={stationAd(station, k + 1, true)}
          >
            <planeGeometry args={[w, h]} />
          </mesh>
        );
      })}

      {/* Fléchage de sortie, porté par deux montants qui prennent appui sur
          la balustrade — il pendait jusqu'ici en l'air. */}
      {[-1, 1].map((d) => (
        <mesh key={`post${d}`} position={[d * (s.halfX - 0.12), 1.66, s.halfZ - 0.07]} material={m.metal}>
          <boxGeometry args={[0.07, 1.52, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, 2.25, s.halfZ - 0.07]} material={m.accent}>
        <boxGeometry args={[1.5, 0.34, 0.08]} />
      </mesh>
    </group>
  );
}

/** Ce qui ne se répète pas : kiosque, escalators, ascenseur, horloge. */
function Amenities({
  place,
  canopyY,
  m,
}: {
  place: ReturnType<typeof placementFor>;
  canopyY: number;
  m: Mats;
}) {
  return (
    <group>
      {/* Escaliers mécaniques : la volée monte vers la mezzanine. */}
      {place.escalators.map((e, i) => (
        <Escalator key={`esc${i}`} e={e} canopyY={canopyY} m={m} />
      ))}

      {/* Ascenseur vitré. */}
      {place.elevator && (
        <group name="ascenseur" position={[place.elevator.x, PLATFORM_TOP, place.elevator.z]}>
          <mesh position={[0, 1.2, 0]} material={m.glass}>
            <boxGeometry args={[1.7, 2.4, 1.7]} />
          </mesh>
          <mesh position={[0, 2.44, 0]} material={m.metal}>
            <boxGeometry args={[1.8, 0.12, 1.8]} />
          </mesh>
        </group>
      )}

      {/* Kiosque de quai. */}
      {place.kiosk && (
        <group name="kiosque" position={[place.kiosk.x, PLATFORM_TOP, place.kiosk.z]}>
          <mesh position={[0, 1.2, 0]} material={m.kiosk}>
            <boxGeometry args={[place.kiosk.halfX * 2, 2.4, place.kiosk.halfZ * 2]} />
          </mesh>
          <mesh position={[-place.kiosk.halfX - 0.05, 1.55, 0]} rotation={[0, -Math.PI / 2, 0]} material={m.ad}>
            <planeGeometry args={[place.kiosk.halfZ * 1.7, 1.2]} />
          </mesh>
          <mesh position={[0, 2.5, 0]} material={m.accent}>
            <boxGeometry args={[place.kiosk.halfX * 2 + 0.2, 0.22, place.kiosk.halfZ * 2 + 0.2]} />
          </mesh>
        </group>
      )}

      {/* Horloge de quai, suspendue à l'auvent — par une vraie potence : le
          boîtier flottait à trente-cinq centimètres du plafond, sans rien. */}
      {place.layout.amenities.clock && (
        <group name="horloge" position={[place.backX - 1.6, canopyY - 0.62, 0]}>
          <mesh position={[0, 0.45, 0]} material={m.metal}>
            <boxGeometry args={[0.05, 0.36, 0.05]} />
          </mesh>
          <mesh material={m.metal}>
            <boxGeometry args={[0.09, 0.55, 0.55]} />
          </mesh>
          <mesh position={[-0.06, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={m.kiosk}>
            <circleGeometry args={[0.24, 20]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Pente normalisée d'un escalier mécanique : 30°. */
const ESCALATOR_SLOPE = Math.PI / 6;

/**
 * Un escalier mécanique montant, d'un seul tenant : palier bas au ras du quai,
 * poutre porteuse qui part du sol, marches posées dessus, balustrades de même
 * pente, et une trémie qui rejoint la sous-face de l'auvent.
 *
 * La version précédente empilait trois éléments indépendants — une rampe qui
 * commençait sous la dalle et s'arrêtait à 2,90 m en plein ciel, neuf marches
 * suspendues soixante centimètres au-dessus d'elle, deux balustrades encore
 * plus longues : de loin, un tas de planches flottantes.
 */
function Escalator({ e, canopyY, m }: { e: Placed; canopyY: number; m: Mats }) {
  const run = e.halfZ * 2 - 0.8; // volée utile, dans l'emprise de collision
  const rise = run * Math.tan(ESCALATOR_SLOPE);
  const incline = run / Math.cos(ESCALATOR_SLOPE);
  /** Hauteur libre sous l'auvent, depuis le sol du quai. */
  const clear = canopyY - PLATFORM_TOP;
  const hoodH = Math.max(0.3, clear - rise);
  const hoodZ = (run / 2 + e.halfZ) / 2;
  const hoodLen = Math.max(0.3, e.halfZ - run / 2);
  const STEPS = 12;

  return (
    <group name="escalator" position={[e.x, PLATFORM_TOP, e.z]}>
      {/* Palier bas : plaque à peigne, au ras du sol. */}
      <mesh position={[0, 0.03, -run / 2 - 0.3]} material={m.metal}>
        <boxGeometry args={[1.3, 0.06, 0.6]} />
      </mesh>
      {/* Poutre porteuse : son extrémité basse s'enfonce sous la dalle. */}
      <mesh position={[0, rise / 2 - 0.22, 0]} rotation={[-ESCALATOR_SLOPE, 0, 0]} material={m.metal}>
        <boxGeometry args={[1.2, 0.44, incline]} />
      </mesh>
      {/* Marches, posées SUR la poutre. */}
      {Array.from({ length: STEPS }, (_, k) => {
        const t = (k + 0.5) / STEPS;
        return (
          <mesh key={k} position={[0, t * rise + 0.03, -run / 2 + t * run]} material={m.metal}>
            <boxGeometry args={[1.02, 0.06, run / STEPS]} />
          </mesh>
        );
      })}
      {/* Balustrades vitrées, exactement la pente de la volée. */}
      {[-1, 1].map((d) => (
        <mesh
          key={d}
          position={[d * 0.62, rise / 2 + 0.5, 0]}
          rotation={[-ESCALATOR_SLOPE, 0, 0]}
          material={m.glass}
        >
          <boxGeometry args={[0.05, 0.95, incline]} />
        </mesh>
      ))}
      {/* Trémie de sortie : joues et fond jusqu'à l'auvent, retombée devant. */}
      {[-1, 1].map((d) => (
        <mesh key={`h${d}`} position={[d * 0.63, rise + hoodH / 2, hoodZ]} material={m.wall}>
          <boxGeometry args={[0.11, hoodH, hoodLen]} />
        </mesh>
      ))}
      <mesh position={[0, rise + hoodH / 2, e.halfZ - 0.06]} material={m.wall}>
        <boxGeometry args={[1.37, hoodH, 0.12]} />
      </mesh>
      <mesh position={[0, clear - 0.26, run / 2 + 0.06]} material={m.wallDark}>
        <boxGeometry args={[1.37, 0.52, 0.12]} />
      </mesh>
    </group>
  );
}
