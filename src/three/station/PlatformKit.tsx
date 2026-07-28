// La trousse réglementaire du quai.
//
// Tout ce qu'on ne remarque qu'en son absence, et qui manquait : diffuseurs de
// la sonorisation, caméras en dôme, coffrets d'extincteur, boutons d'arrêt
// d'urgence, armoires électriques, téléphone ferroviaire, bacs de tri,
// descentes d'eau, gouttière, chemin de câbles, ligne verte de guidage et
// repères de voiture peints au sol.
//
// Aucun de ces objets ne change d'une gare à l'autre — ce sont des modèles JR
// standard — mais leur nombre et leur répartition, si : ils suivent les piliers,
// les accès et l'affluence, que systems/stationPlacement calcule déjà pour le
// mobilier et pour la marche du joueur.
//
// Tout ce qui se répète passe par un InstancedMesh. Sur un quai de 224 m la
// trousse représente une centaine d'exemplaires ; elle coûte une quinzaine
// d'appels de rendu.

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../data/stationGeometry';
import type { StationLayout } from '../../data/stationLayouts';
import type { StationPlacement } from '../../systems/stationPlacement';
import {
  makeCabinetTexture,
  makeCarMarkTexture,
  makeEmergencyStopTexture,
  makeExtinguisherTexture,
  makeRailPhoneTexture,
  makeSpeakerTexture,
} from '../../textures/procedural';
import {
  FACING_BACK,
  FACING_DOWN,
  mat,
  matFacing,
  matFacingTrack,
  useInstances,
} from './instancing';

interface Props {
  place: StationPlacement;
  layout: StationLayout;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
  materials: {
    metal: THREE.Material;
    frame: THREE.Material;
    wall: THREE.Material;
    bin: THREE.Material;
  };
}

/** Couvercles des bacs de tri : bouteilles, papiers, tout-venant. */
const BIN_LIDS = ['#2f6fb5', '#d8b52a', '#4b5157'] as const;
/** Écartement des trois bacs d'une même batterie (m). */
const BIN_STEP = 0.44;
/** Face pleine des portes palières, côté quai : les murets font 10 cm. */
const STOP_X = PSD_X + 0.05;

export function PlatformKit({ place, layout, detail, materials: m }: Props) {
  const kit = place.kit;
  const backX = place.backX;
  const depth = layout.depth;
  const canopyY = layout.canopyY;
  const len = layout.length;

  // Abscisses partagées par tout le fichier. Les descentes d'eau et la
  // gouttière se tiennent DERRIÈRE la limite de marche (walkX1) : un tuyau
  // planté au milieu du passage, on lui rentre dedans.
  const pipeX = backX - 0.28;
  const trayX = backX - 0.95;
  const speakerX = PSD_X + depth * 0.28;
  const wallFaceX = backX - 0.1;

  // --- Textures et matériaux propres à la trousse ---------------------
  // Les repères de voiture sont onze visuels distincts : ils ne s'instancient
  // pas, mais ne coûtent que onze plans posés au sol, au palier le plus riche.
  const tex = useMemo(
    () => ({
      speaker: makeSpeakerTexture(),
      extinguisher: makeExtinguisherTexture(),
      stop: makeEmergencyStopTexture(),
      cabinet: makeCabinetTexture(),
      phone: makeRailPhoneTexture(),
      carMarks: kit.carMarks.map((c) => makeCarMarkTexture(c.car)),
    }),
    [kit.carMarks],
  );

  const mats = useMemo(() => {
    const face = (map: THREE.Texture, transparent = false) =>
      new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent });
    return {
      speaker: face(tex.speaker),
      extinguisher: face(tex.extinguisher),
      stop: face(tex.stop),
      cabinet: face(tex.cabinet),
      phone: face(tex.phone),
      carMarks: tex.carMarks.map(
        (t) =>
          new THREE.MeshBasicMaterial({
            map: t,
            toneMapped: false,
            transparent: true,
            // Le marquage est PEINT sur la dalle : sans ce décalage il se bat
            // avec elle et clignote dès qu'on s'éloigne.
            polygonOffset: true,
            polygonOffsetFactor: -3,
          }),
      ),
      // Ligne verte de guidage, peinte comme les repères d'attente.
      guide: new THREE.MeshBasicMaterial({
        color: '#4f9b28',
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
      // Optique de caméra : noir laqué, un rien brillant.
      dome: new THREE.MeshStandardMaterial({ color: '#26292e', roughness: 0.22, metalness: 0.35 }),
      // Miroir de départ : verre sombre. Sans carte d'environnement il ne
      // reflète rien, mais son grain de métal poli le distingue d'un panneau.
      mirror: new THREE.MeshStandardMaterial({
        color: '#8e979c',
        roughness: 0.12,
        metalness: 0.92,
        emissive: '#20262a',
        emissiveIntensity: 0.35,
      }),
      lids: BIN_LIDS.map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.12 }),
      ),
    };
  }, [tex]);

  useLayoutEffect(() => {
    const all = [
      mats.speaker,
      mats.extinguisher,
      mats.stop,
      mats.cabinet,
      mats.phone,
      mats.guide,
      mats.dome,
      mats.mirror,
      ...mats.carMarks,
      ...mats.lids,
    ];
    const texs = [tex.speaker, tex.extinguisher, tex.stop, tex.cabinet, tex.phone, ...tex.carMarks];
    return () => {
      for (const x of all) x.dispose();
      for (const t of texs) t.dispose();
    };
  }, [mats, tex]);

  // --- Matrices ------------------------------------------------------
  // Diffuseurs : plaque affleurant la sous-face de l'auvent, grille tournée
  // vers le bas — c'est de là que sortent réellement les annonces.
  const speakerPlates = useMemo(
    () => kit.speakers.map((z) => mat(speakerX, canopyY - 0.04, z, 0.4, 0.07, 0.4)),
    [kit.speakers, speakerX, canopyY],
  );
  const speakerGrilles = useMemo(
    () => kit.speakers.map((z) => matFacing(FACING_DOWN, speakerX, canopyY - 0.079, z, 0.34, 0.34)),
    [kit.speakers, speakerX, canopyY],
  );

  // Caméras en dôme, au droit d'un pilier sur trois. Suspendues SOUS les
  // poutres transversales (leur sous-face est à canopyY - 0,18) : posées à
  // ras de l'auvent, elles s'enfonçaient dedans une fois sur trois.
  const cameraPlates = useMemo(
    () => kit.cameras.map((z) => mat(backX - 1.0, canopyY - 0.27, z, 0.3, 0.06, 0.3)),
    [kit.cameras, backX, canopyY],
  );
  const cameraDomes = useMemo(
    () => kit.cameras.map((z) => mat(backX - 1.0, canopyY - 0.34, z, 0.22, 0.16, 0.22)),
    [kit.cameras, backX, canopyY],
  );

  // Coffrets d'extincteur, plaqués au fond du quai.
  const extBoxes = useMemo(
    () => kit.extinguishers.map((z) => mat(wallFaceX - 0.08, PLATFORM_TOP + 0.95, z, 0.17, 0.78, 0.32)),
    [kit.extinguishers, wallFaceX],
  );
  const extFaces = useMemo(
    () => kit.extinguishers.map((z) => matFacingTrack(wallFaceX - 0.17, PLATFORM_TOP + 0.95, z, 0.3, 0.74)),
    [kit.extinguishers, wallFaceX],
  );

  // Boutons d'arrêt d'urgence, plaqués sur la face pleine des portes palières
  // et tournés vers le quai : on doit les voir en marchant, pas en se
  // retournant vers la voie. Rien au sol, donc rien dans une file d'attente.
  const stopHeads = useMemo(
    () => kit.emergencyStops.map((z) => mat(STOP_X, PLATFORM_TOP + 0.94, z, 0.09, 0.4, 0.31)),
    [kit.emergencyStops],
  );
  const stopFaces = useMemo(
    () =>
      kit.emergencyStops.map((z) =>
        matFacing(FACING_BACK, STOP_X + 0.05, PLATFORM_TOP + 0.94, z, 0.28, 0.37),
      ),
    [kit.emergencyStops],
  );

  // Armoires électriques, adossées au fond.
  const cabBodies = useMemo(
    () => place.cabinets.map((c) => mat(c.x, PLATFORM_TOP + 0.88, c.z, c.halfX * 2, 1.76, c.halfZ * 2)),
    [place.cabinets],
  );
  const cabFaces = useMemo(
    () =>
      place.cabinets.map((c) =>
        matFacingTrack(c.x - c.halfX - 0.01, PLATFORM_TOP + 0.92, c.z, c.halfZ * 1.85, 1.6),
      ),
    [place.cabinets],
  );

  // Bacs de tri : trois par batterie, sous une même armature.
  const binBodies = useMemo(
    () =>
      place.bins.flatMap((b) =>
        [-1, 0, 1].map((k) => mat(b.x, PLATFORM_TOP + 0.41, b.z + k * BIN_STEP, 1, 1, 1)),
      ),
    [place.bins],
  );
  const binLids = useMemo(
    () =>
      [-1, 0, 1].map((k) =>
        place.bins.map((b) => mat(b.x, PLATFORM_TOP + 0.85, b.z + k * BIN_STEP, 1, 1, 1)),
      ),
    [place.bins],
  );
  const binRails = useMemo(
    () => place.bins.map((b) => mat(b.x, PLATFORM_TOP + 0.94, b.z, 0.44, 0.05, BIN_STEP * 2 + 0.42)),
    [place.bins],
  );

  // Descentes d'eau pluviale, plaquées derrière les piliers.
  const pipes = useMemo(
    () =>
      kit.downpipes.map((z) =>
        mat(pipeX, PLATFORM_TOP + (canopyY - PLATFORM_TOP) / 2, z, 1, canopyY - PLATFORM_TOP, 1),
      ),
    [kit.downpipes, pipeX, canopyY],
  );

  // Repères de voiture peints au sol : posés à plat, un peu au-dessus de la
  // dalle, entre la bande podotactile et l'axe de circulation.
  const carMarkMats = useMemo(
    () =>
      kit.carMarks.map((c, i) => ({
        z: c.z,
        m: mats.carMarks[i],
      })),
    [kit.carMarks, mats.carMarks],
  );

  const speakerPlateRef = useRef<THREE.InstancedMesh>(null);
  const speakerGrilleRef = useRef<THREE.InstancedMesh>(null);
  const camPlateRef = useRef<THREE.InstancedMesh>(null);
  const camDomeRef = useRef<THREE.InstancedMesh>(null);
  const extBoxRef = useRef<THREE.InstancedMesh>(null);
  const extFaceRef = useRef<THREE.InstancedMesh>(null);
  const stopHeadRef = useRef<THREE.InstancedMesh>(null);
  const stopFaceRef = useRef<THREE.InstancedMesh>(null);
  const cabBodyRef = useRef<THREE.InstancedMesh>(null);
  const cabFaceRef = useRef<THREE.InstancedMesh>(null);
  const binBodyRef = useRef<THREE.InstancedMesh>(null);
  const binRailRef = useRef<THREE.InstancedMesh>(null);
  const pipeRef = useRef<THREE.InstancedMesh>(null);
  const lid0 = useRef<THREE.InstancedMesh>(null);
  const lid1 = useRef<THREE.InstancedMesh>(null);
  const lid2 = useRef<THREE.InstancedMesh>(null);
  const lidRefs = [lid0, lid1, lid2];

  useInstances(speakerPlateRef, speakerPlates);
  useInstances(speakerGrilleRef, speakerGrilles);
  useInstances(camPlateRef, cameraPlates);
  useInstances(camDomeRef, cameraDomes);
  useInstances(extBoxRef, extBoxes);
  useInstances(extFaceRef, extFaces);
  useInstances(stopHeadRef, stopHeads);
  useInstances(stopFaceRef, stopFaces);
  useInstances(cabBodyRef, cabBodies);
  useInstances(cabFaceRef, cabFaces);
  useInstances(binBodyRef, binBodies);
  useInstances(binRailRef, binRails);
  useInstances(pipeRef, pipes);
  useInstances(lid0, binLids[0]);
  useInstances(lid1, binLids[1]);
  useInstances(lid2, binLids[2]);

  return (
    <group>
      {/* --- Toujours là : ce qui structure le quai --------------------- */}

      {/* Ligne verte de guidage, dans l'axe de circulation. Avec la bande
          podotactile du bord, c'est le couple qui dit « quai japonais ». */}
      <mesh position={[PSD_X + depth * 0.55 - 0.2, PLATFORM_TOP + 0.007, 0]} material={mats.guide}>
        <boxGeometry args={[0.11, 0.005, len - 4]} />
      </mesh>

      {/* Gouttière en tête de pilier, et ses descentes. */}
      <mesh position={[pipeX, canopyY - 0.06, 0]} material={m.metal}>
        <boxGeometry args={[0.17, 0.13, len - 1]} />
      </mesh>
      <instancedMesh ref={pipeRef} args={[undefined, undefined, Math.max(1, pipes.length)]} material={m.metal}>
        <cylinderGeometry args={[0.055, 0.055, 1, 8]} />
      </instancedMesh>

      {/* Chemin de câbles, dans l'ombre de l'auvent — et sous les poutres. */}
      <mesh position={[trayX, canopyY - 0.32, 0]} material={m.metal}>
        <boxGeometry args={[0.42, 0.11, len - 6]} />
      </mesh>
      {[-0.1, 0.1].map((dx) => (
        <mesh key={dx} position={[trayX + dx, canopyY - 0.25, 0]} material={m.frame}>
          <boxGeometry args={[0.07, 0.06, len - 6.4]} />
        </mesh>
      ))}

      {/* Bacs de tri : trois par batterie, couvercles de couleur. */}
      <instancedMesh ref={binBodyRef} args={[undefined, undefined, Math.max(1, binBodies.length)]} material={m.bin}>
        <cylinderGeometry args={[0.185, 0.2, 0.82, 12]} />
      </instancedMesh>
      {BIN_LIDS.map((c, k) => (
        <instancedMesh
          key={c}
          ref={lidRefs[k]}
          args={[undefined, undefined, Math.max(1, binLids[k].length)]}
          material={mats.lids[k]}
        >
          <cylinderGeometry args={[0.2, 0.19, 0.08, 12]} />
        </instancedMesh>
      ))}
      <instancedMesh ref={binRailRef} args={[undefined, undefined, Math.max(1, binRails.length)]} material={m.metal}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* --- Équipements réglementaires -------------------------------- */}
      {detail <= 2 && (
        <group>
          <instancedMesh
            ref={speakerPlateRef}
            args={[undefined, undefined, Math.max(1, speakerPlates.length)]}
            material={m.metal}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
          <instancedMesh
            ref={speakerGrilleRef}
            args={[undefined, undefined, Math.max(1, speakerGrilles.length)]}
            material={mats.speaker}
          >
            <planeGeometry args={[1, 1]} />
          </instancedMesh>

          <instancedMesh
            ref={extBoxRef}
            args={[undefined, undefined, Math.max(1, extBoxes.length)]}
            material={m.frame}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
          <instancedMesh
            ref={extFaceRef}
            args={[undefined, undefined, Math.max(1, extFaces.length)]}
            material={mats.extinguisher}
          >
            <planeGeometry args={[1, 1]} />
          </instancedMesh>

          <instancedMesh
            ref={stopHeadRef}
            args={[undefined, undefined, Math.max(1, stopHeads.length)]}
            material={m.frame}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
          <instancedMesh
            ref={stopFaceRef}
            args={[undefined, undefined, Math.max(1, stopFaces.length)]}
            material={mats.stop}
          >
            <planeGeometry args={[1, 1]} />
          </instancedMesh>

          <instancedMesh
            ref={cabBodyRef}
            args={[undefined, undefined, Math.max(1, cabBodies.length)]}
            material={m.wall}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
          <instancedMesh
            ref={cabFaceRef}
            args={[undefined, undefined, Math.max(1, cabFaces.length)]}
            material={mats.cabinet}
          >
            <planeGeometry args={[1, 1]} />
          </instancedMesh>

          {/* Téléphone ferroviaire : il n'y en a qu'un, il ne s'instancie pas. */}
          {kit.phone !== null && (
            <group position={[wallFaceX, PLATFORM_TOP + 1.32, kit.phone]}>
              <mesh position={[-0.07, 0, 0]} material={m.frame}>
                <boxGeometry args={[0.16, 0.62, 0.46]} />
              </mesh>
              <mesh position={[-0.155, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={mats.phone}>
                <planeGeometry args={[0.42, 0.56]} />
              </mesh>
            </group>
          )}
        </group>
      )}

      {/* --- Détail fin : caméras, miroirs, repères peints -------------- */}
      {detail <= 1 && (
        <group>
          <instancedMesh
            ref={camPlateRef}
            args={[undefined, undefined, Math.max(1, cameraPlates.length)]}
            material={m.metal}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
          <instancedMesh
            ref={camDomeRef}
            args={[undefined, undefined, Math.max(1, cameraDomes.length)]}
            material={mats.dome}
          >
            <sphereGeometry args={[0.5, 12, 8]} />
          </instancedMesh>

          {/* Miroirs de départ, au droit des cabines de conduite : suspendus
              à l'auvent au-dessus du bord de quai, la glace penchée pour que le
              conducteur voie toute la ligne des portes. Sur un mât planté au
              sol ils se seraient dressés en plein dans une file d'attente. */}
          {kit.mirrors.map((z, k) => (
            <group key={`mir${k}`} position={[PSD_X + 0.42, canopyY, z]}>
              <mesh position={[0, -0.34, 0]} material={m.metal}>
                <boxGeometry args={[0.07, 0.68, 0.07]} />
              </mesh>
              <mesh position={[0.24, -0.66, 0]} material={m.metal}>
                <boxGeometry args={[0.5, 0.07, 0.07]} />
              </mesh>
              <mesh position={[0, -0.72, 0]} rotation={[0, Math.PI / 2, -0.42]} material={mats.mirror}>
                <circleGeometry args={[0.33, 20]} />
              </mesh>
              <mesh position={[0, -0.72, 0]} rotation={[0, -Math.PI / 2, 0.42]} material={m.frame}>
                <circleGeometry args={[0.36, 20]} />
              </mesh>
            </group>
          ))}

          {/* Repères de voiture peints au sol. */}
          {carMarkMats.map(({ z, m: mm }, k) => (
            <mesh
              key={`car${k}`}
              position={[PSD_X + 1.52, PLATFORM_TOP + 0.008, z]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={mm}
            >
              <planeGeometry args={[0.62, 0.78]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
