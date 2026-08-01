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
// glissant le long de la voie - comme avant. Tout ce qui se répète (murets de
// portes palières, vantaux, piliers, poutres, néons, bancs, marquages au sol)
// passe par un InstancedMesh : le quai a beau être deux fois et demie plus
// long, il coûte dix fois moins d'appels de rendu.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { DOOR_SIDE } from '../../data/stations';
import { runtime } from '../../systems/runtime';
import { psdDoorPosAt, psdGateLag } from '../../systems/doorMotion';
import {
  gantryZs,
  placementFor,
  trackSignZs,
  type Placed,
} from '../../systems/stationPlacement';
import { platformDetail } from '../../systems/perf';
import { BOARDABLE_GATES } from '../../systems/wrongDoor';
import { layoutFor, type StationLayout } from '../../data/stationLayouts';
import {
  ASCENT_LEN,
  ESCALATOR_CLEAR_HALF_X,
  ESCALATOR_DROP,
  ESCALATOR_LANDING,
  ESCALATOR_OPENING_HALF_X,
  ESCALATOR_OPENING_Z0,
  ESCALATOR_OPENING_Z1,
  ESCALATOR_RUN,
  ESCALATOR_SLOPE,
  GAUGE_HALF,
  OPP_DEPTH,
  PLATFORM_TOP,
  PSD_H,
  PSD_LEAF_JOINT_W,
  PSD_LEAF_T,
  PSD_LEAF_TIP_INSET,
  PSD_LEAF_TRAVEL,
  PSD_LEAF_W,
  PSD_WALL_T,
  PSD_X,
  SLAB_H,
  STAIR_HALF_X,
  STAIR_HALF_Z,
  STAIR_OPENING_HALF_X,
  STAIR_OPENING_Z0,
  STAIR_OPENING_Z1,
  STAIR_LINTEL_Y,
  STAIR_PARAPET_H,
  TRACK_HALF,
} from '../../data/stationGeometry';
import { makeAdTexture, makePlatformFloorTexture, makeTactileTexture } from '../../textures/procedural';
import { DADO_MODULE, WALL_MODULE } from '../../textures/stationWall';
import { EdgeBarrier, GateBarrier } from './Barrier';
import { makeStationMaterials, type Mats } from './materials';
import { useWallBox } from './wallBox';
import { WallDetails, type WallObstacle } from './WallDetails';
import { mat, useInstances } from './instancing';
import { OverheadSigns } from './OverheadSigns';
import { PlatformAds } from './PlatformAds';
import { PlatformKit } from './PlatformKit';
import { PlatformSignage } from './PlatformSignage';
import { VendingMachines } from './VendingMachines';
import { Signature } from './signatures';
import { Stairwells } from './Stairwell';
import { Overbridge } from './Overbridge';
import { Concourse } from './Concourse';
import { Kiosk } from './Kiosk';
import { GatePlates } from './GatePlates';
import { psdLayout } from './psdLayout';
import { psdLeafFrameGeometry, psdLeafGlassGeometry } from './psdParts';

const UP = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

/** Référence stable pour les gares sans charpente signature. */
const EMPTY_AVOID: { z: number; r: number }[] = [];


/** Voies du faisceau, au-delà du quai d'en face, là où rien ne ferme la travée. */
const YARD_TRACKS = 4;
/** Entraxe de ces voies (m). */
const YARD_PITCH = 4.6;

export function Station() {
  // La gare rendue est celle dont le quai est physiquement là (platformIndex),
  // pas la prochaine du trajet (index) : au départ, index avance dès le coup de
  // sifflet alors que le quai défile encore le long des vitres - reconstruire
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

  /**
   * La charpente signature couvre-t-elle VRAIMENT le quai en ce moment ?
   *
   * `sigCanopy` dit qu'elle en a la charge (Takanawa Gateway), mais elle n'est
   * dessinée qu'aux paliers de qualité les plus riches. Aux autres, la déclarer
   * suffisante laissait le quai à ciel ouvert - pas de toiture pliée, et plus
   * d'auvent non plus. La dalle générique reprend donc du service dès que la
   * charpente n'est pas là.
   */
  const hasSignature = layout.signature !== undefined && detail <= 1;
  const sigRoof = layout.sigCanopy && hasSignature;

  // Portes de quai : Shinjuku et Shibuya n'en ont toujours pas. Sans elles, le
  // bord est nu et c'est la bande podotactile qui prend le relais - nettement
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
    // Fond franc, comme les caissons du quai : le kiosque porte une affiche,
    // pas un aplat crème sur un décor déjà clair.
    return { floor, tactile, ads: [makeAdTexture(4102, true, true)] };
  }, [layout.length, tactileW]);

  const m = useMemo(() => makeStationMaterials(layout.palette, textures), [layout.palette, textures]);

  /**
   * Les trémies qui DESCENDENT réellement.
   *
   * Là où l'accès principal monte, son emprise reste dans `place.stairs` - la
   * marche et le mobilier la contournent - mais il n'y a ni percement, ni
   * couloir bas, ni fléchage de fond de cage à dessiner : il n'y a pas de cage.
   */
  const descending = useMemo(
    () => (place.mainRise === 'up'
      ? { ...place, stairs: place.stairs.filter((s) => s !== place.mainStair) }
      : place),
    [place],
  );


  /**
   * Auvent, percé au droit d'une volée montante.
   *
   * Une boîte ne peut pas avoir de trou, et c'est le même problème que la dalle
   * du quai : on extrude un contour à trous. Sans percement, la volée traversait
   * l'auvent de part en part - trois marches dedans, la main courante ressortant
   * au-dessus - dans les six gares dont le hall est en haut.
   */
  const canopyGeo = useMemo(() => {
    const half = layout.length / 2;
    const x0 = PSD_X - 0.2;
    const x1 = PSD_X + depth + 0.2;
    const shape = new THREE.Shape();
    shape.moveTo(x0, -half);
    shape.lineTo(x1, -half);
    shape.lineTo(x1, half);
    shape.lineTo(x0, half);
    shape.closePath();
    if (place.mainRise === 'up') {
      const s = place.mainStair;
      // La trémie plus une marge : ce qui passe au travers, ce sont les joues
      // et les mains courantes, plus larges que la volée elle-même.
      const ix = STAIR_HALF_X + 0.25;
      const hole = new THREE.Path();
      hole.moveTo(s.x - ix, s.z - STAIR_HALF_Z - 0.3);
      hole.lineTo(s.x - ix, s.z - STAIR_HALF_Z + ASCENT_LEN + 0.4);
      hole.lineTo(s.x + ix, s.z - STAIR_HALF_Z + ASCENT_LEN + 0.4);
      hole.lineTo(s.x + ix, s.z - STAIR_HALF_Z - 0.3);
      hole.closePath();
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
    // Le plan de tracé se couche, et l'extrusion descend depuis l'origine - la
    // même mécanique que la dalle du quai. La dalle d'auvent doit donc être
    // posée par son DESSUS, sinon elle tombe de son épaisseur et vient buter
    // dans tout ce qui pend à sa sous-face : poutres, néons, caméras, miroirs,
    // diffuseurs, potences.
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.14, 0);
    return g;
  }, [layout.length, depth, place.mainRise, place.mainStair]);

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
      // Une volée MONTANTE ne perce rien : elle se pose sur la dalle. Son
      // emprise reste dans `stairs` - la marche et le mobilier la contournent
      // toujours -, mais il n'y a pas de trou à ménager dessous.
      if (place.mainRise === 'up' && s === place.mainStair) continue;
      // Le percement vient tel quel du gabarit de la trémie : le premier giron
      // est la dalle elle-même, l'ouverture ne commence donc qu'au nez de la
      // première contremarche, et ses quatre chants sont coiffés par les joues,
      // le voile de tête et la première marche (three/station/Stairwell).
      const ix = STAIR_OPENING_HALF_X;
      const zNear = s.z + STAIR_OPENING_Z0;
      const zFar = s.z + STAIR_OPENING_Z1;
      const hole = new THREE.Path();
      hole.moveTo(s.x - ix, zNear);
      hole.lineTo(s.x - ix, zFar);
      hole.lineTo(s.x + ix, zFar);
      hole.lineTo(s.x + ix, zNear);
      hole.closePath();
      shape.holes.push(hole);
    }
    // Les escaliers mécaniques percent la dalle comme les trémies : ils
    // descendent au même couloir. Le percement suit donc le même palier de
    // qualité que la volée qui le remplit (voir Amenities) - sans elle, le
    // quai n'aurait plus qu'un trou.
    if (detail <= 2) {
      for (const e of place.escalators) {
        const ix = ESCALATOR_OPENING_HALF_X;
        const hole = new THREE.Path();
        hole.moveTo(e.x - ix, e.z + ESCALATOR_OPENING_Z0);
        hole.lineTo(e.x - ix, e.z + ESCALATOR_OPENING_Z1);
        hole.lineTo(e.x + ix, e.z + ESCALATOR_OPENING_Z1);
        hole.lineTo(e.x + ix, e.z + ESCALATOR_OPENING_Z0);
        hole.closePath();
        shape.holes.push(hole);
      }
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
  }, [layout.length, depth, place.stairs, place.escalators, place.mainRise, place.mainStair, detail]);

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
    () => segs.map((s) => mat(PSD_X, PLATFORM_TOP + PSD_H / 2, (s.z0 + s.z1) / 2, PSD_WALL_T, PSD_H, s.z1 - s.z0)),
    [segs],
  );
  const psdGlass = useMemo(
    () =>
      segs.map((s) =>
        mat(PSD_X + 0.02, PLATFORM_TOP + PSD_H * 0.72, (s.z0 + s.z1) / 2, 0.02, PSD_H * 0.42, s.z1 - s.z0 - 0.16),
      ),
    [segs],
  );
  // Bandeau vert du muret : six millimètres PLUS COURT que le muret qu'il
  // couronne. À égalité, ses deux bouts tombaient dans le plan des bouts du
  // muret - deux faces confondues, en pleine vue depuis la baie de porte, là
  // où le regard se pose en montant.
  const psdBand = useMemo(
    () =>
      segs.map((s) =>
        mat(
          PSD_X - 0.005,
          PLATFORM_TOP + PSD_H - 0.07,
          (s.z0 + s.z1) / 2,
          0.12,
          0.1,
          s.z1 - s.z0 - 0.012,
        ),
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
  /**
   * Ce qui fait qu'un pilier n'est pas une boîte : un SOCLE, des CORNIÈRES et
   * un CHAPITEAU.
   *
   * Aucun des trois n'est décoratif. Le socle est un ouvrage de béton coulé
   * plus large que le fût, et sans lui le poteau semble posé sur la dalle comme
   * un meuble. Les cornières d'angle sont de l'inox vissé sur les quatre arêtes
   * jusqu'à hauteur d'épaule : elles existent parce qu'on cogne les valises
   * dedans, et ce sont elles qui attrapent la lumière rasante d'un quai - un
   * fût nu reste un aplat gris quelle que soit l'heure. Le chapiteau, enfin,
   * élargit la tête du poteau sous la poutre - mais celui-là, on s'en passe :
   * la poutre transversale POSE déjà sur le poteau et en tient lieu, et un
   * chapiteau de plus venait buter dans la gouttière qui court à la même cote.
   */
  const columnPlinths = useMemo(
    () => place.columns.map((z) => mat(backX - 0.55, PLATFORM_TOP + 0.07, z, 0.42, 0.14, 0.42)),
    [place.columns, backX],
  );
  const columnGuards = useMemo(() => {
    // Elles s'arrêtent à 1,60 m : au-delà, plus rien ne cogne, et une cornière
    // qui monterait jusqu'à la poutre ferait un poteau d'acier, pas de béton.
    const h = 1.6;
    const c = 0.145;
    return place.columns.flatMap((z) =>
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dx, dz]) =>
        mat(backX - 0.55 + dx * c, PLATFORM_TOP + h / 2, z + dz * c, 0.05, h, 0.05),
      ),
    );
  }, [place.columns, backX]);
  const beams = useMemo(
    () => place.columns.map((z) => mat(PSD_X + depth / 2, canopyY - 0.09, z, depth - 0.2, 0.18, 0.24)),
    [place.columns, depth, canopyY],
  );
  // Néons : le tube AFFLEURE la sous-face de l'auvent (elle est à canopyY) au
  // lieu de flotter huit centimètres dessous, et se décale toujours des
  // poutres - au droit d'un pilier il disparaissait purement et simplement
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
    // Deux millimètres au-dessus de la bande podotactile : les deux se
    // recouvrent au ras du bord de quai, et à hauteur égale leurs faces
    // supérieures étaient rigoureusement dans le même plan.
    () => place.queueMarks.map((q) => mat(q.x, PLATFORM_TOP + 0.008, q.z, 0.9, 1, 0.5)),
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
  const psdRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const columnRef = useRef<THREE.InstancedMesh>(null);
  const columnBandRef = useRef<THREE.InstancedMesh>(null);
  const plinthRef = useRef<THREE.InstancedMesh>(null);
  const guardRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);
  const queueRef = useRef<THREE.InstancedMesh>(null);
  const seatRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const legRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const leafGlassRef = useRef<THREE.InstancedMesh>(null);
  const leafJointRef = useRef<THREE.InstancedMesh>(null);

  useInstances(psdRef, psdSegs);
  useInstances(glassRef, psdGlass);
  useInstances(bandRef, psdBand);
  useInstances(columnRef, columns);
  useInstances(columnBandRef, columnBands);
  useInstances(plinthRef, columnPlinths);
  useInstances(guardRef, columnGuards);
  useInstances(beamRef, beams);
  useInstances(lampRef, lamps);
  useInstances(queueRef, queue);
  useInstances(seatRef, benchSeat);
  useInstances(backRef, benchBack);
  useInstances(legRef, benchLegs);

  // --- Vantaux des portes palières, animés ---
  //
  // Un vantail est un CADRE et une VITRE, posés par la même matrice : deux
  // traverses, deux montants, du verre entre les quatre. C'est ce qui fait
  // qu'on voit arriver la rame derrière une baie fermée.
  //
  // Il coulisse à mi-épaisseur du MURET, pas devant : rentré, il est enfermé
  // dans son muret au lieu d'en raser la face, et la plaque de baie peut se
  // coller sur cette face sans être traversée deux fois par arrêt.
  const leafFrameGeo = useMemo(() => psdLeafFrameGeometry(), []);
  const leafGlassGeo = useMemo(() => psdLeafGlassGeometry(), []);
  useLayoutEffect(
    () => () => {
      leafFrameGeo.dispose();
      leafGlassGeo.dispose();
    },
    [leafFrameGeo, leafGlassGeo],
  );
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
    const gm = leafGlassRef.current;
    const jm = leafJointRef.current;
    const mm = leafMat.current;
    let k = 0;
    for (let g = 0; g < gaps.length; g++) {
      // La baie en face d'une porte bloquée suit cette porte-là, pas l'ensemble.
      const open = psdDoorPosAt(gaps[g], psdGateLag(g)) * PSD_LEAF_TRAVEL;
      for (const dir of [1, -1] as const) {
        // Le vantail rentre de PSD_LEAF_TIP_INSET derrière son montant de rive :
        // les deux chants tombaient dans le même plan et le bout du vantail
        // clignotait dès que le portique s'ouvrait.
        mm.compose(
          V.set(
            PSD_X,
            PLATFORM_TOP + PSD_H / 2,
            gaps[g] + dir * (PSD_LEAF_W / 2 + open + PSD_LEAF_TIP_INSET),
          ),
          UP,
          S.set(PSD_LEAF_T, PSD_H - 0.06, PSD_LEAF_W),
        );
        im.setMatrixAt(k, mm);
        // La vitre est portée par le cadre : même matrice, à la géométrie près.
        if (gm) gm.setMatrixAt(k, mm);
        // Montant de rive, calé sur le BORD DE FERMETURE du vantail : il suit
        // donc la porte.
        if (jm) {
          mm.compose(
            V.set(
              PSD_X,
              PLATFORM_TOP + PSD_H / 2,
              gaps[g] + dir * (open + PSD_LEAF_JOINT_W / 2),
            ),
            UP,
            // Plus épais que le MURET, et non plus que le seul vantail : c'est
            // la seule pièce du portique qui doit rester visible quand la porte
            // est rentrée. Le vantail, lui, disparaît dans le muret ; son joint
            // de rive dépasse d'un centimètre et tient le jambage, comme le
            // caoutchouc noir au bord d'une vraie ホームドア ouverte. Fermé, les
            // deux joints se touchent et tracent la ligne sombre qui partage le
            // portique en deux.
            S.set(PSD_WALL_T + 0.02, PSD_H - 0.05, PSD_LEAF_JOINT_W),
          );
          jm.setMatrixAt(k, mm);
        }
        k++;
      }
    }
    im.count = leafCount;
    im.instanceMatrix.needsUpdate = true;
    if (gm) {
      gm.count = leafCount;
      gm.instanceMatrix.needsUpdate = true;
    }
    if (jm) {
      jm.count = leafCount;
      jm.instanceMatrix.needsUpdate = true;
    }
  });

  const midX = PSD_X + depth * 0.55;
  const wallH = canopyY - 0.07 - PLATFORM_TOP;

  // Ce que les totems doivent contourner : le mobilier au sol, mais aussi
  // l'aplomb des panneaux 番線 et des potences - leur chapeau montait pile
  // dans les caissons suspendus.
  const signageGround = useMemo(
    () => [
      ...place.obstacles,
      ...trackSignZs(place).map((z) => ({ z, halfZ: 0.3 })),
      ...gantryZs(place).map((z) => ({ z, halfZ: 0.3 })),
    ],
    [place],
  );

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
      <instancedMesh
        name="vantaux-psd"
        ref={leafRef}
        args={[undefined, undefined, Math.max(1, leafCount)]}
        geometry={leafFrameGeo}
        material={m.psd}
      />
      <instancedMesh
        name="vitre-vantaux-psd"
        ref={leafGlassRef}
        args={[undefined, undefined, Math.max(1, leafCount)]}
        geometry={leafGlassGeo}
        material={m.psdGlass}
      />
      <instancedMesh
        name="joint-vantaux-psd"
        ref={leafJointRef}
        args={[undefined, undefined, Math.max(1, leafCount)]}
        material={m.psdJoint}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {/* La plaque 「N号車 M番ドア」 de chaque baie, sur le muret de gauche.
          Elle saute au palier de qualité le plus bas, comme les affiches : à ce
          niveau-là, on ne s'arrête plus devant une porte pour la lire. */}
      {detail <= 2 && <GatePlates gates={gaps} segs={segs} />}
        </>
      )}

      {/* --- Le bord d'en face, sur notre propre quai -------------------
          Vingt-neuf des trente gares sont des îlots : ce qu'on a dans le dos
          n'est pas un mur, c'est un SECOND BORD D'EMBARQUEMENT. Il reçoit donc
          exactement le même traitement que celui-ci - liseré, bande
          podotactile, muret de portes palières - mais retourné. */}
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
      <FarSide layout={layout} place={place} wallH={wallH} m={m} detail={detail} segs={segs} sigRoof={sigRoof} />

      {/* --- Auvent, poutres, piliers, néons ---
          La dalle tombe là où la charpente signature fait toit (Takanawa
          Gateway) : elle masquait la seule chose qui fasse cette gare-là. La
          trame de poutres et de néons reste - c'est à elle que pend toute la
          signalétique. */}
      {!sigRoof && (
        <mesh name="auvent" position={[0, canopyY, 0]} geometry={canopyGeo} material={m.canopy} receiveShadow />
      )}
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
      {/* Socle et cornières d'angle : deux instances de plus pour toute la
          gare, et le pilier cesse d'être une boîte. */}
      <instancedMesh name="socle-pilier" ref={plinthRef} args={[undefined, undefined, Math.max(1, columnPlinths.length)]} material={m.wallDark}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh name="cornière-pilier" ref={guardRef} args={[undefined, undefined, Math.max(1, columnGuards.length)]} material={m.metal}>
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

      {/* Distributeurs : vitrine rétroéclairée, monnayeurs, volet de retrait.
          Ils portent leur propre jeu de textures - voir VendingMachines. */}
      <VendingMachines place={place} station={index} detail={detail} m={m} />

      {/* Trémies d'escalier : la dalle est percée, donc elles font partie de la
          structure - jamais retirées par un palier de qualité. La volée
          MONTANTE, elle, n'est pas une trémie : elle se dessine à part. */}
      <Stairwells place={descending} m={m} station={index} detail={detail} />
      {place.mainRise === 'up' && <Overbridge s={place.mainStair} m={m} />}

      {/* Le niveau de correspondance, au bout du couloir de la trémie
          principale. Il n'existe que là où l'on peut y aller : une gare dont le
          hall est au-dessus du quai le déclare sans le construire, faute de
          volée montante (data/stationInterior). Comme le reste du fond de
          champ, il saute au palier de qualité le plus bas. */}
      {place.interior.built && detail <= 2 && (
        <Concourse it={place.interior} m={m} station={index} detail={detail} />
      )}

      {/* Affichage publicitaire : caissons du mur, colonnes habillées,
          bannières suspendues, allèges de portes palières. */}
      <PlatformAds place={place} layout={layout} segs={segs} station={index} detail={detail} />

      {/* Potences d'orientation : sorties en jaune, correspondances en blanc. */}
      <OverheadSigns place={place} layout={layout} station={index} detail={detail} />

      {/* La trousse réglementaire : sonorisation, caméras, extincteurs, bornes
          d'urgence, armoires, bacs de tri, gouttières, marquages au sol. */}
      <PlatformKit place={place} layout={layout} detail={detail} materials={m} />

      {detail <= 2 && <Amenities place={place} canopyY={canopyY} m={m} station={index} />}

      {/* Bords de quai NUS - Shinjuku et Shibuya, les deux seules gares sans
          portes palières. Partout ailleurs, le muret arrête l'œil en même temps
          que le pas ; ici la marche s'arrêtait au ras du liseré blanc sans que
          rien ne le dise, des deux côtés de l'îlot. Le bord d'embarquement
          s'ouvre au droit des quatre SEULS seuils franchissables - ceux de la
          voiture du joueur - et reste dressé devant les dix autres voitures ;
          celui d'en face, où aucune rame ne se présente, reste continu. */}
      {!hasPsd && (
        <>
          <EdgeBarrier x={PSD_X} length={layout.length} gates={BOARDABLE_GATES} />
          {place.farEdgeX !== null && <EdgeBarrier x={place.farEdgeX} length={layout.length} />}
        </>
      )}

      {/* Portes palières par lesquelles on ne peut pas monter : une seule
          voiture est modélisée, et les quarante autres baies s'ouvraient sur un
          mur invisible. La limite ne se dresse que quand on va vraiment vers
          l'une d'elles. */}
      {hasPsd && <GateBarrier length={layout.length} />}

      {/* Charpente propre à la gare, quand elle en a une. Elle était réservée
          aux deux paliers les plus riches ; elle porte maintenant l'essentiel
          du caractère de quatorze gares, et descend donc d'un cran. */}
      {hasSignature && <Signature layout={layout} place={place} m={m} />}

      <PlatformSignage
        place={place}
        hangX={midX + 0.7}
        canopyY={canopyY}
        halfZ={halfZ}
        totemX={PSD_X + depth * 0.32}
        // Mêmes abscisses que la trousse du quai : les poteaux sont à
        // backX - 0,55 et font 0,30 de côté, donc leur face vers la voie est à
        // 0,15 devant leur axe.
        postFaceX={backX - 0.55 - 0.15}
        columns={place.columns}
        // À Harajuku la bande est suspendue DEVANT le mur de fond : calée sur
        // backX comme sur un îlot, elle était entièrement noyée dedans.
        bandX={place.hasBackWall ? backX - 0.3 : backX}
        detail={detail}
        ground={signageGround}
        avoid={layout.sigPlan?.keepOut ?? EMPTY_AVOID}
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
 * animés - aucune rame ne s'y présente, et à huit mètres un portique fermé se
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
              franche à la hauteur exacte des vitres de porte de la rame - qui
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
 * Jusqu'ici, quatre familles de rendu abstraites - mur, garde-corps, paroi de
 * tranchée, « deuxième voie » - dont vingt-neuf gares tiraient à peu près le
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
  sigRoof,
}: {
  layout: ReturnType<typeof layoutFor>;
  place: ReturnType<typeof placementFor>;
  wallH: number;
  m: Mats;
  detail: number;
  segs: { z0: number; z1: number }[];
  /** La charpente signature couvre tout le site : pas d'auvent d'en face. */
  sigRoof: boolean;
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
    return (
      <BackWall
        backX={place.backX}
        wallH={wallH}
        len={len}
        m={m}
        detail={detail}
        obstacles={place.obstacles}
      />
    );
  }

  const trackX = far + TRACK_HALF;
  const oppEdge = far + 2 * TRACK_HALF;
  const oppBack = oppEdge + OPP_DEPTH;
  const hasPsd = layout.psd !== 'none';
  // À Ōsaki, la voie d'en face est la voie SECONDAIRE : celle qui n'a pas
  // encore ses portes. C'est précisément là que ça se voit.
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
          palier le plus léger, où la silhouette du quai suffit - et là où la
          charpente signature couvre le site d'un seul tenant, il n'y en a
          jamais eu. */}
      {detail <= 2 && !sigRoof && (
        <mesh position={[(oppEdge + oppBack) / 2, layout.canopyY + 0.07, 0]} material={m.canopy}>
          <boxGeometry args={[OPP_DEPTH + 0.4, 0.14, len]} />
        </mesh>
      )}

      {/* Faisceau : là où rien ne ferme la travée, des voies encore, jusqu'au
          bord du champ. C'est la perspective dégagée de Nippori et d'Ueno, et
          les huit voies parallèles de Shimbashi - qu'un mur escamotait. */}
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

      {/* Ce qui ferme la travée, selon le niveau où court la voie - au fond du
          quai d'en face, ou au bout du faisceau quand il y en a un. */}
      <Closure
        x={oppBack + (layout.openFarSide ? YARD_TRACKS * YARD_PITCH : 0)}
        elevation={layout.elevation}
        wallH={wallH}
        len={len}
        m={m}
        detail={detail}
        sigRoof={sigRoof}
      />
    </group>
  );
}

/**
 * Le mur de fond d'un quai latéral - Harajuku, et elle seule.
 *
 * On le longe sur toute sa longueur, à un mètre : c'est le mur le plus REGARDÉ
 * de la boucle. D'où les UV à l'échelle réelle (three/station/wallBox) plutôt
 * qu'une tuile étirée sur deux cent vingt-quatre mètres, et la quincaillerie
 * de WallDetails - sans elle, un plan de béton texturé reste un plan.
 */
function BackWall({
  backX,
  wallH,
  len,
  m,
  detail,
  obstacles,
}: {
  backX: number;
  wallH: number;
  len: number;
  m: Mats;
  detail: number;
  obstacles: readonly WallObstacle[];
}) {
  const geo = useWallBox(0.18, wallH, len, WALL_MODULE);
  return (
    <group name="mur-fond">
      <mesh position={[backX, PLATFORM_TOP + wallH / 2, 0]} geometry={geo} material={m.wall} />
      <Wainscot backX={backX - 0.09} len={len} m={m} />
      <WallDetails
        faceX={backX - 0.09}
        dir={-1}
        y0={PLATFORM_TOP}
        h={wallH}
        len={len}
        m={m}
        detail={detail}
        obstacles={obstacles}
      />
      <mesh position={[backX - 0.02, PLATFORM_TOP + wallH - 0.6, 0]} material={m.wallDark}>
        <boxGeometry args={[0.2, 0.35, len]} />
      </mesh>
      <mesh position={[backX - 0.03, PLATFORM_TOP + wallH - 0.92, 0]} material={m.accent}>
        <boxGeometry args={[0.08, 0.1, len]} />
      </mesh>
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
  detail,
  sigRoof,
}: {
  x: number;
  elevation: StationLayout['elevation'];
  wallH: number;
  len: number;
  m: Mats;
  detail: number;
  /** La charpente signature couvre-t-elle le site d'un seul tenant ? */
  sigRoof: boolean;
}) {
  if (elevation === 'elevated') return <Parapet x={x} len={len} m={m} />;
  // Tranchée ou au sol : le même mur, à l'épaisseur près - et, en tranchée, un
  // couronnement qui monte bien au-delà de l'auvent.
  return (
    <ClosureWall
      x={x}
      thickness={elevation === 'trench' ? 0.24 : 0.2}
      crowned={elevation === 'trench'}
      wallH={wallH}
      len={len}
      m={m}
      detail={detail}
      bare={sigRoof}
    />
  );
}

/** Viaduc : garde-corps ajouré, la ville se voit par-dessus. */
function Parapet({ x, len, m }: { x: number; len: number; m: Mats }) {
  const geo = useWallBox(0.18, 1.2, len, WALL_MODULE);
  return (
    <group>
      <mesh position={[x, PLATFORM_TOP + 0.6, 0]} geometry={geo} material={m.wall} />
      <mesh position={[x, PLATFORM_TOP + 1.24, 0]} material={m.metal}>
        <boxGeometry args={[0.1, 0.08, len]} />
      </mesh>
      <mesh position={[x, PLATFORM_TOP + 1.9, 0]} material={m.metal}>
        <boxGeometry args={[0.08, 0.06, len]} />
      </mesh>
    </group>
  );
}

function ClosureWall({
  x,
  thickness,
  crowned,
  wallH,
  len,
  m,
  detail,
  bare,
}: {
  x: number;
  thickness: number;
  crowned: boolean;
  wallH: number;
  len: number;
  m: Mats;
  detail: number;
  /** Mur nu : quelque chose d'autre occupe déjà ce nu. */
  bare: boolean;
}) {
  const geo = useWallBox(thickness, wallH, len, WALL_MODULE);
  const faceX = x - thickness / 2;
  return (
    <group>
      <mesh position={[x, PLATFORM_TOP + wallH / 2, 0]} geometry={geo} material={m.wall} />
      <Wainscot backX={faceX - 0.01} len={len} m={m} />
      {/* La quincaillerie est vue d'en face, par-dessus deux voies : ce sont
          ses ombres portées qui la font lire, pas son détail. Elle tombe donc
          au palier le plus léger, où le mur redevient un plan texturé.

          Et elle disparaît là où la charpente signature couvre tout le site :
          à Takanawa Gateway, ce nu-là n'est pas une paroi de soutènement mais
          la file de piles de la halle, et les descentes d'eau génériques s'y
          plantaient dedans sur toute la longueur. */}
      {detail <= 2 && !bare && (
        <WallDetails
          faceX={faceX}
          dir={-1}
          y0={PLATFORM_TOP}
          h={wallH}
          len={len}
          m={m}
          detail={detail}
        />
      )}
      {crowned && (
        <mesh position={[x + 0.12, PLATFORM_TOP + wallH + 1.7, 0]} material={m.wallDark}>
          <boxGeometry args={[0.42, 3.4, len]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Soubassement carrelé du mur de fond : un aplat chaud d'un mètre de haut,
 * couronné du liseré uguisu de la ligne. Sans lui le fond du quai est un aplat
 * de béton clair sur toute sa hauteur - le « trop blanc et gris » du décor.
 */
function Wainscot({ backX, len, m }: { backX: number; len: number; m: Mats }) {
  const geo = useWallBox(0.05, 1.04, len, DADO_MODULE);
  return (
    <group>
      <mesh
        position={[backX - 0.015, PLATFORM_TOP + 0.52, 0]}
        geometry={geo}
        material={m.tile}
      />
      {/* Le liseré déborde de cinq millimètres du nu de la faïence : il la
          couronne comme une moulure. À nu commun, sa face avant et celle du
          carrelage étaient dans le même plan sur les deux cent vingt mètres du
          mur de fond - une ligne qui scintillait droit devant soi. */}
      <mesh position={[backX - 0.02, PLATFORM_TOP + 1.07, 0]} material={m.accent}>
        <boxGeometry args={[0.07, 0.07, len]} />
      </mesh>
    </group>
  );
}

/** Ce qui ne se répète pas : kiosque, escalators, ascenseur, horloge. */
function Amenities({
  place,
  canopyY,
  m,
  station,
}: {
  place: ReturnType<typeof placementFor>;
  canopyY: number;
  m: Mats;
  station: number;
}) {
  return (
    <group>
      {/* Escaliers mécaniques : la volée descend au niveau de la billetterie,
          par un percement de la dalle - comme la trémie d'à côté. */}
      {place.escalators.map((e, i) => (
        <Escalator key={`esc${i}`} e={e} m={m} />
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

      {/* Kiosque de quai : comptoirs ouverts des deux côtés, présentoirs,
          armoire réfrigérée, auvent et bandeau d'enseigne. Il était une boîte
          blanche avec une affiche collée sur un flanc. */}
      {place.kiosk && (
        <Kiosk k={place.kiosk} m={m} station={station} />
      )}

      {/* Horloge de quai, suspendue à l'auvent - par une vraie potence : le
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

// --- L'escalier mécanique ------------------------------------------------
//
// Il DESCEND, et la dalle est réellement percée sous lui : le profil vient de
// data/stationGeometry, qui sert aussi au percement ci-dessus. Il menait
// auparavant à la sous-face de l'auvent, sans rien percer ni desservir - une
// volée de 2,77 m coiffée d'une gaine borgne, et rien au-dessus.
//
// Les règles sont celles de la trémie voisine, pour la même raison : ici aussi
// le décor doit tenir EN COUPE. Les joues et le voile de tête COIFFENT le chant
// du percement de deux centimètres ; aucune face de la gaine n'est coplanaire
// avec une face de la dalle ; le puits est CLOS, sinon on verrait le ballast
// par-dessous le quai.

/** Nez de la volée, pied de la volée : les deux bouts de la partie inclinée. */
const ESC_Z0 = ESCALATOR_OPENING_Z0;
const ESC_Z1 = ESC_Z0 + ESCALATOR_RUN;
/** Longueur mesurée SUR la pente : celle des balustrades et de la poutre. */
const ESC_INCLINE = ESCALATOR_RUN / Math.cos(ESCALATOR_SLOPE);
/** Marches modélisées : une tous les quarante centimètres de volée. */
const ESC_STEPS = 16;
const ESC_STEP_D = ESCALATOR_RUN / ESC_STEPS;

/** Joues : du nu intérieur, qui coiffe le percement, au nu extérieur. */
const ESC_CHEEK_T = 0.18;
const ESC_CHEEK_X = ESCALATOR_CLEAR_HALF_X + ESC_CHEEK_T / 2;
/**
 * Sol du puits : le niveau du couloir bas, celui où débouche la trémie. C'est
 * lui qui a dicté la longueur de la volée, pas l'inverse (stationGeometry).
 */
const ESC_PIT_Y = -ESCALATOR_DROP;
/** Sous-face commune de tout ce qui borde le puits. */
const ESC_BOTTOM = ESC_PIT_Y - 0.36;
/** Une joue est d'un seul tenant : garde-corps dessus, voile de puits dessous. */
const ESC_CHEEK_Z0 = ESC_Z0 - 0.24;
const ESC_CHEEK_Z1 = ESCALATOR_OPENING_Z1;
const ESC_CHEEK_LEN = ESC_CHEEK_Z1 - ESC_CHEEK_Z0;
const ESC_CHEEK_Z = (ESC_CHEEK_Z0 + ESC_CHEEK_Z1) / 2;
const ESC_CHEEK_H = STAIR_PARAPET_H - ESC_BOTTOM;
const ESC_CHEEK_Y = (STAIR_PARAPET_H + ESC_BOTTOM) / 2;
/** Couronnement métallique posé sur les joues, comme sur celles d'une trémie. */
const ESC_CAP_Y = STAIR_PARAPET_H + 0.035;

/** Voile de tête : il coiffe le chant du fond, et ferme le puits derrière. */
const ESC_HEAD_HALF_X = ESCALATOR_CLEAR_HALF_X + 0.02;
const ESC_HEAD_T = 0.26;
const ESC_HEAD_Z = ESCALATOR_OPENING_Z1 + ESC_HEAD_T / 2 - 0.02;

/**
 * Un escalier mécanique descendant, d'un seul tenant : palier de peigne de
 * plain-pied avec le quai, poutre porteuse qui plonge sous la dalle, marches
 * posées dessus, balustrades de même pente, joues qui coiffent le percement, et
 * un puits clos et éclairé au pied.
 */
function Escalator({ e, m }: { e: Placed; m: Mats }) {
  return (
    <group name="escalator" position={[e.x, PLATFORM_TOP, e.z]}>
      {/* Palier haut : plaque à peigne, de plain-pied avec la dalle. */}
      <mesh position={[0, 0.008, (-e.halfZ + ESC_Z0) / 2]} material={m.metal}>
        <boxGeometry args={[1.4, 0.016, ESCALATOR_LANDING]} />
      </mesh>
      {/* Nez de peigne : il DÉBORDE dans le percement, et c'est lui qui coiffe
          le seul des quatre chants que ni les joues ni le voile de tête ne
          reprennent. Sur un vrai escalier mécanique il recouvre aussi la
          première marche - c'est la même pièce. */}
      <mesh position={[0, -0.14, ESC_Z0 + 0.04]} material={m.metal}>
        <boxGeometry args={[2 * ESCALATOR_OPENING_HALF_X + 0.04, 0.34, 0.28]} />
      </mesh>
      <mesh position={[0, 0.022, ESC_Z0 - 0.06]} material={m.stairNose}>
        <boxGeometry args={[1.3, 0.02, 0.09]} />
      </mesh>

      {/* Poutre porteuse. Une rotation autour de x d'un angle POSITIF envoie
          +z vers le bas : c'est l'inverse exact de la volée montante d'à côté
          (three/station/Overbridge), et au mauvais signe la poutre ressortait
          au-dessus du quai. */}
      <mesh
        position={[0, -ESCALATOR_DROP / 2 - 0.26, (ESC_Z0 + ESC_Z1) / 2]}
        rotation={[ESCALATOR_SLOPE, 0, 0]}
        material={m.metal}
      >
        <boxGeometry args={[1.2, 0.44, ESC_INCLINE]} />
      </mesh>

      {/* Marches : des BLOCS, du giron à la poutre. En plaques de six
          centimètres, une volée vue de dessus - et c'est ainsi qu'on voit une
          volée descendante - n'était qu'une pile de lames flottantes. */}
      {Array.from({ length: ESC_STEPS }, (_, k) => {
        const t = (k + 0.5) / ESC_STEPS;
        const y = -t * ESCALATOR_DROP;
        const z = ESC_Z0 + t * ESCALATOR_RUN;
        return (
          <group key={k}>
            <mesh position={[0, y - 0.12, z]} material={m.metal}>
              <boxGeometry args={[1.02, 0.24, ESC_STEP_D]} />
            </mesh>
            {/* Nez de marche : sur le bord AVAL du giron, celui d'où part la
                contremarche. Sur le bord amont, il se collait contre la marche
                précédente et la volée n'était plus qu'un dégradé de gris. */}
            <mesh position={[0, y + 0.005, z + ESC_STEP_D / 2 - 0.03]} material={m.stairNose}>
              <boxGeometry args={[0.98, 0.01, 0.05]} />
            </mesh>
          </group>
        );
      })}

      {/* Balustrades vitrées et leur main courante, à la pente de la volée. */}
      {[-1, 1].map((d) => (
        <group key={`b${d}`}>
          <mesh
            position={[d * 0.62, -ESCALATOR_DROP / 2 + 0.48, (ESC_Z0 + ESC_Z1) / 2]}
            rotation={[ESCALATOR_SLOPE, 0, 0]}
            material={m.glass}
          >
            <boxGeometry args={[0.05, 0.95, ESC_INCLINE]} />
          </mesh>
          <mesh
            position={[d * 0.62, -ESCALATOR_DROP / 2 + 0.99, (ESC_Z0 + ESC_Z1) / 2]}
            rotation={[ESCALATOR_SLOPE, 0, 0]}
            material={m.metal}
          >
            <boxGeometry args={[0.11, 0.07, ESC_INCLINE]} />
          </mesh>
        </group>
      ))}

      {/* Joues : garde-corps au-dessus de la dalle, voile de puits en dessous.
          C'est le même ouvrage, et le couper au niveau de la dalle n'aurait
          fabriqué qu'un joint de plus à faire coïncider. */}
      {[-1, 1].map((d) => (
        <group key={`c${d}`}>
          <mesh position={[d * ESC_CHEEK_X, ESC_CHEEK_Y, ESC_CHEEK_Z]} material={m.wall}>
            <boxGeometry args={[ESC_CHEEK_T, ESC_CHEEK_H, ESC_CHEEK_LEN]} />
          </mesh>
          <mesh position={[d * ESC_CHEEK_X, ESC_CAP_Y, ESC_CHEEK_Z]} material={m.metal}>
            <boxGeometry args={[ESC_CHEEK_T + 0.04, 0.07, ESC_CHEEK_LEN]} />
          </mesh>
          {/* Bandeau lumineux, à la pente : sans lui le puits est un trou noir
              dès la troisième marche, juste là où l'œil s'y engage. */}
          <mesh
            position={[
              d * (ESCALATOR_CLEAR_HALF_X - 0.02),
              -ESCALATOR_DROP / 2 + 1.26,
              (ESC_Z0 + ESC_Z1) / 2,
            ]}
            rotation={[ESCALATOR_SLOPE, 0, 0]}
            material={m.lamp}
          >
            <boxGeometry args={[0.06, 0.055, ESC_INCLINE - 0.4]} />
          </mesh>
        </group>
      ))}

      {/* Voile de tête, et fermeture derrière le palier haut : le puits est
          clos sur ses quatre côtés, sinon on verrait le vide par-dessous la
          dalle du quai. */}
      <mesh
        position={[0, (STAIR_PARAPET_H + ESC_BOTTOM) / 2, ESC_HEAD_Z]}
        material={m.wall}
      >
        <boxGeometry args={[ESC_HEAD_HALF_X * 2, ESC_CHEEK_H, ESC_HEAD_T]} />
      </mesh>
      <mesh position={[0, ESC_CAP_Y, ESC_HEAD_Z]} material={m.metal}>
        <boxGeometry args={[ESC_HEAD_HALF_X * 2, 0.07, ESC_HEAD_T + 0.04]} />
      </mesh>
      {/* Fermeture derrière le palier haut. Elle monte JUSQUE DANS le nez de
          peigne : arrêtée à la sous-face de la dalle, elle laissait une fente
          de dix-sept centimètres par laquelle on voyait sous le quai. */}
      <mesh
        position={[0, (-0.28 + ESC_BOTTOM) / 2, ESC_Z0 - 0.11]}
        material={m.wall}
      >
        <boxGeometry args={[ESC_HEAD_HALF_X * 2, -0.28 - ESC_BOTTOM, 0.22]} />
      </mesh>

      {/* Fond du puits, au niveau du couloir bas. Il MORD dans les deux voiles
          qui le bordent : à nu commun, les deux faces se disputaient le tampon
          de profondeur au fond du puits, là où l'œil descend. */}
      <mesh
        position={[0, ESC_PIT_Y - 0.06, (ESC_Z0 - 0.15 + ESC_CHEEK_Z1 + 0.1) / 2]}
        material={m.slab}
      >
        <boxGeometry args={[ESC_HEAD_HALF_X * 2, 0.12, ESC_CHEEK_Z1 + 0.1 - ESC_Z0 + 0.15]} />
      </mesh>
      {/* Soubassement de faïence sur le voile de tête : le seul rappel de
          couleur du fond de puits, et ce qui dit qu'on regarde une GARE. */}
      <mesh
        position={[0, ESC_PIT_Y + 0.55, ESC_HEAD_Z - ESC_HEAD_T / 2 - 0.025]}
        material={m.tile}
      >
        <boxGeometry args={[ESC_HEAD_HALF_X * 2 - 0.1, 1.1, 0.05]} />
      </mesh>
      <mesh position={[0, STAIR_LINTEL_Y - 0.14, ESC_Z1 + 0.3]} material={m.lamp}>
        <boxGeometry args={[0.9, 0.08, 0.3]} />
      </mesh>
    </group>
  );
}
