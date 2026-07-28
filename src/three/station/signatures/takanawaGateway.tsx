// JY26 高輪ゲートウェイ — la seule gare de la boucle dont l'architecture est
// entièrement propre.
//
// Kengo Kuma. Une immense toiture blanche, décrite par JR East comme inspirée
// de l'origami et des panneaux japonais en papier : des versants pliés qui
// enjambent d'un seul tenant les deux quais et les voies, portés par une
// résille d'acier blanc et doublés en dessous de bois clair. Entre les plis,
// du verre : c'est de là que vient la lumière, et c'est ce qui fait de
// Takanawa Gateway la gare la plus claire des trente.
//
// Le pli est instancié : vingt-cinq travées de deux versants sur deux cent
// vingt mètres, cela ne mérite pas cinquante appels de rendu.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { matOriented, tiltZ, useInstances } from '../instancing';
import { bays, siteCut, useSigMaterials, type SigProps } from './kit';

/** Entraxe des plis (m) : la trame de la toiture. */
const FOLD = 9;
/** Pente d'un versant. Faible : la toiture est un pliage, pas une bâche. */
const PITCH = 0.26;

export function TakanawaGateway({ layout, place, m }: SigProps) {
  const { oppBackX } = siteCut(place);
  const top = layout.canopyY;
  // La toiture couvre tout le site, débords compris.
  const x0 = PSD_X - 1.4;
  const x1 = oppBackX + 1.4;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;
  const half = span / 2;
  /** Hauteur du faîte au-dessus de la sous-face d'auvent. */
  const rise = half * Math.tan(PITCH);

  const s = useSigMaterials(
    () => ({
      // Acier blanc mat : la résille et les versants.
      white: new THREE.MeshStandardMaterial({
        color: '#f2f1ec',
        roughness: 0.62,
        metalness: 0.18,
        emissive: '#e8e6de',
        emissiveIntensity: 0.24,
      }),
      // Bois clair de la sous-face — c'est lui qu'on voit depuis le quai.
      wood: new THREE.MeshStandardMaterial({
        color: '#d8b98a',
        roughness: 0.78,
        emissive: '#c9a877',
        emissiveIntensity: 0.2,
      }),
      // Verre des noues : très transparent, il ne doit rien assombrir.
      pane: new THREE.MeshStandardMaterial({
        color: '#dfeaf0',
        roughness: 0.08,
        metalness: 0.02,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    }),
    [],
  );

  const foldZ = useMemo(() => bays(layout.length, FOLD), [layout.length]);

  // Deux versants par pli, inclinés en sens contraire : le faîte au milieu du
  // site, les égouts au-dessus de chaque bord de quai.
  const upQ = useMemo(() => tiltZ(PITCH), []);
  const downQ = useMemo(() => tiltZ(-PITCH), []);
  const slopeLen = half / Math.cos(PITCH);

  const panels = useMemo(
    () =>
      foldZ.flatMap((z) => [
        matOriented(upQ, midX - half / 2, top + 1.1 + rise / 2, z, slopeLen, 0.16, FOLD * 0.94),
        matOriented(downQ, midX + half / 2, top + 1.1 + rise / 2, z, slopeLen, 0.16, FOLD * 0.94),
      ]),
    [foldZ, upQ, downQ, midX, half, top, rise, slopeLen],
  );
  const linings = useMemo(
    () =>
      foldZ.flatMap((z) => [
        matOriented(upQ, midX - half / 2, top + 0.98 + rise / 2, z, slopeLen * 0.97, 0.07, FOLD * 0.8),
        matOriented(downQ, midX + half / 2, top + 0.98 + rise / 2, z, slopeLen * 0.97, 0.07, FOLD * 0.8),
      ]),
    [foldZ, upQ, downQ, midX, half, top, rise, slopeLen],
  );

  const panelRef = useRef<THREE.InstancedMesh>(null);
  const liningRef = useRef<THREE.InstancedMesh>(null);
  useInstances(panelRef, panels);
  useInstances(liningRef, linings);

  return (
    <group>
      {/* Les versants pliés, et leur doublage de bois clair juste en dessous. */}
      <instancedMesh ref={panelRef} args={[undefined, undefined, Math.max(1, panels.length)]} material={s.white}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={liningRef} args={[undefined, undefined, Math.max(1, linings.length)]} material={s.wood}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      {/* Verrière de faîte : une bande continue au sommet du pliage. */}
      <mesh position={[midX, top + 1.1 + rise, 0]} material={s.pane}>
        <boxGeometry args={[2.4, 0.08, layout.length - 6]} />
      </mesh>

      {/* Poutre de faîte et pannes d'égout : ce qui tient le pliage. */}
      <mesh position={[midX, top + 0.94 + rise, 0]} material={s.white}>
        <boxGeometry args={[0.5, 0.4, layout.length - 4]} />
      </mesh>
      {[x0 + 0.6, x1 - 0.6].map((x) => (
        <mesh key={x} position={[x, top + 1.05, 0]} material={s.white}>
          <boxGeometry args={[0.42, 0.34, layout.length - 4]} />
        </mesh>
      ))}

      {/* Résille : deux obliques par pli, du bord de quai vers le faîte. */}
      {foldZ.map((z) => (
        <group key={`w${z}`} position={[0, 0, z]}>
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[midX + d * half * 0.5, top + 0.5 + rise * 0.5, 0]}
              rotation={[0, 0, -d * PITCH]}
              material={s.white}
            >
              <boxGeometry args={[slopeLen * 0.9, 0.12, 0.12]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Mâts d'appui : au droit de l'épine et du fond de la travée d'en face,
          jamais dans un passage. Leur trame vient du plan (data/stationLayouts),
          qui les écarte des accès — l'un d'eux se dressait au beau milieu d'un
          escalier mécanique. */}
      {(layout.sigPlan?.posts ?? []).map(({ z }) =>
        [place.backX, oppBackX].map((x) => (
          <mesh
            key={`p${x}-${z}`}
            position={[x, PLATFORM_TOP + (top + 1.05 - PLATFORM_TOP) / 2, z]}
            material={s.white}
          >
            <boxGeometry args={[0.26, top + 1.05 - PLATFORM_TOP, 0.26]} />
          </mesh>
        )),
      )}

      {/* Passerelles vitrées au-dessus de la voie d'en face : le grand hall du
          deuxième niveau se voit depuis le quai, et c'est voulu. La seconde se
          tient au-delà de la troisième bande directionnelle — à 0,2 de la
          longueur, son vitrage la chevauchait. */}
      {[-layout.length * 0.22, layout.length * 0.26].map((z) => (
        <group key={`br${z}`} position={[0, 0, z]}>
          <mesh position={[(place.backX + oppBackX) / 2, 4.5, 0]} material={s.white}>
            <boxGeometry args={[oppBackX - place.backX, 0.24, 4.2]} />
          </mesh>
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[(place.backX + oppBackX) / 2, 5.1, d * 2.05]}
              material={s.pane}
            >
              <boxGeometry args={[oppBackX - place.backX, 1.1, 0.08]} />
            </mesh>
          ))}
          <mesh position={[(place.backX + oppBackX) / 2, 4.72, 0]} material={s.wood}>
            <boxGeometry args={[oppBackX - place.backX - 0.4, 0.06, 3.6]} />
          </mesh>
        </group>
      ))}

      {/* Le quai lui-même reçoit son bandeau lumineux d'égout — calé SOUS les
          poutres transversales : au ras de la sous-face, il les traversait
          toutes. */}
      {[PSD_X + 0.8, place.farEdgeX !== null ? place.farEdgeX - 0.8 : place.backX].map((x) => (
        <mesh key={`l${x}`} position={[x, top - 0.215, 0]} material={m.lamp}>
          <boxGeometry args={[0.42, 0.07, layout.length - 8]} />
        </mesh>
      ))}
    </group>
  );
}
