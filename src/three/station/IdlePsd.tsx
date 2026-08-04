// Les portes palières d'un bord qu'on ne dessert pas.
//
// Il y en a deux en vue permanente, et aucun des deux n'avait de portes : le
// second bord de notre îlot, qu'on longe à deux mètres, et le quai d'en face,
// de l'autre côté de la voie. Les deux se contentaient d'un muret continu de
// deux cent vingt mètres - « à huit mètres, un portique fermé se lit comme un
// muret », disait le code. C'est faux : ce qui se lit d'un portique fermé,
// c'est la RAINURE tous les cinq mètres, la trame de vantaux blancs et de
// joints noirs qui donne au quai son échelle. Sans elle, le bord d'en face est
// une plinthe, et la gare a l'air deux fois plus petite qu'elle n'est.
//
// Ces portes-là ne s'animent PAS : aucune rame ne se présente à ces bords, et
// elles sont donc fermées une fois pour toutes. D'où un jeu de matrices calculé
// à l'arrivée en gare et plus jamais touché - là où le bord près recalcule les
// siennes à chaque frame.

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  PLATFORM_TOP,
  PSD_BAND_T,
  PSD_H,
  PSD_JOINT_T,
  PSD_LEAF_JOINT_W,
  PSD_LEAF_T,
  PSD_LEAF_TIP_INSET,
  PSD_LEAF_W,
  PSD_WALL_T,
} from '../../data/stationGeometry';
import { mat, useInstances } from './instancing';
import { psdBandRows, type PsdBandStyle } from './psdBand';
import type { Mats } from './materials';
import type { PsdSpan } from './psdLayout';
import { psdLeafFrameGeometry, psdLeafGlassGeometry } from './psdParts';

export interface IdlePsdProps {
  /** Axe du muret, repère LOCAL du quai. */
  x: number;
  /** De quel côté est la VOIE depuis ce muret : -1 vers -x, +1 vers +x. */
  trackSide: 1 | -1;
  /** Murets pleins et axes des baies, la même trame qu'au bord près. */
  segs: readonly PsdSpan[];
  gaps: readonly number[];
  m: Mats;
  /** Nom des tampons dans la scène, pour s'y retrouver dans une sonde. */
  name: string;
  /**
   * Dessiner les vantaux, ou s'en tenir au muret et à son bandeau.
   *
   * Le quai d'en face les perd au palier de qualité le plus bas, comme son
   * auvent : à douze mètres et à travers une voie, ce qui reste lisible est la
   * silhouette du quai. Le bord de NOTRE îlot les garde toujours - on le longe
   * à deux mètres.
   */
  doors?: boolean;
  /**
   * Dessin du liseré uguisu : trait simple côté 内回り, trait double côté
   * 外回り. Sur un îlot Yamanote, ce bord-ci dessert l'AUTRE sens que le nôtre,
   * et porte donc l'autre dessin - c'est là qu'on voit les deux à la fois.
   * Ailleurs (îlot partagé, quai d'en face), l'appelant laisse le défaut.
   */
  band?: PsdBandStyle;
}

export function IdlePsd({
  x,
  trackSide,
  segs,
  gaps,
  m,
  name,
  doors = true,
  band = 'single',
}: IdlePsdProps) {
  const walls = useMemo(
    () =>
      segs.map((s) =>
        mat(x, PLATFORM_TOP + PSD_H / 2, (s.z0 + s.z1) / 2, PSD_WALL_T, PSD_H, s.z1 - s.z0),
      ),
    [segs, x],
  );
  // Bandeau uguisu, INTERROMPU à chaque baie et six millimètres plus court que
  // le muret qu'il couronne - les deux raisons sont celles du bord près. Son
  // dessin, simple ou double, dit le sens que ce bord dessert.
  const bands = useMemo(
    () =>
      segs.flatMap((s) =>
        psdBandRows(band).map((row) =>
          mat(
            x + trackSide * 0.005,
            PLATFORM_TOP + PSD_H + row.dy,
            (s.z0 + s.z1) / 2,
            PSD_BAND_T,
            row.h,
            s.z1 - s.z0 - 0.012,
          ),
        ),
      ),
    [segs, x, trackSide, band],
  );
  // Vantaux FERMÉS : leur chant de fermeture se touche au milieu de la baie,
  // au retrait de montant près.
  const leaves = useMemo(
    () =>
      gaps.flatMap((gz) =>
        [1, -1].map((dir) =>
          mat(
            x,
            PLATFORM_TOP + PSD_H / 2,
            gz + dir * (PSD_LEAF_W / 2 + PSD_LEAF_TIP_INSET),
            PSD_LEAF_T,
            PSD_H - 0.06,
            PSD_LEAF_W,
          ),
        ),
      ),
    [gaps, x],
  );
  const joints = useMemo(
    () =>
      gaps.flatMap((gz) =>
        [1, -1].map((dir) =>
          mat(
            x,
            PLATFORM_TOP + PSD_H / 2,
            gz + dir * (PSD_LEAF_JOINT_W / 2),
            PSD_JOINT_T,
            PSD_H - 0.05,
            PSD_LEAF_JOINT_W,
          ),
        ),
      ),
    [gaps, x],
  );

  const frameGeo = useMemo(() => psdLeafFrameGeometry(), []);
  const glassGeo = useMemo(() => psdLeafGlassGeometry(), []);
  useLayoutEffect(
    () => () => {
      frameGeo.dispose();
      glassGeo.dispose();
    },
    [frameGeo, glassGeo],
  );

  const wallRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const jointRef = useRef<THREE.InstancedMesh>(null);
  useInstances(wallRef, walls);
  useInstances(bandRef, bands);
  useInstances(leafRef, leaves);
  useInstances(glassRef, leaves);
  useInstances(jointRef, joints);

  return (
    <group name={name}>
      <instancedMesh ref={wallRef} args={[undefined, undefined, Math.max(1, walls.length)]} material={m.psd}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={bandRef} args={[undefined, undefined, Math.max(1, bands.length)]} material={m.accent}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {doors && (
        <>
          <instancedMesh
            ref={leafRef}
            args={[undefined, undefined, Math.max(1, leaves.length)]}
            geometry={frameGeo}
            material={m.psd}
          />
          <instancedMesh
            ref={glassRef}
            args={[undefined, undefined, Math.max(1, leaves.length)]}
            geometry={glassGeo}
            material={m.psdGlass}
          />
          <instancedMesh
            ref={jointRef}
            args={[undefined, undefined, Math.max(1, joints.length)]}
            material={m.psdJoint}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
        </>
      )}
    </group>
  );
}
