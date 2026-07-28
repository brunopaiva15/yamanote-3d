// Potences d'orientation, en travers du quai.
//
// C'est l'élément qui manquait pour que la gare se lise comme japonaise avant
// même qu'on déchiffre un caractère : une traverse suspendue à l'auvent, un
// panneau JAUNE de sortie avec sa flèche, un panneau BLANC de correspondances
// avec les pastilles de lignes. Le quai n'avait que son panneau de nom de gare
// et son tableau des départs.
//
// Une potence au droit de chaque trémie et de chaque escalier mécanique : c'est
// là qu'elles servent, puisqu'elles indiquent par où sortir. Recto-verso, avec
// la MÊME texture des deux côtés — un panneau imprimé en miroir se remarque
// tout de suite.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../data/stationGeometry';
import type { StationLayout } from '../../data/stationLayouts';
import { runtime } from '../../systems/runtime';
import type { StationPlacement } from '../../systems/stationPlacement';
import { makeExitSign, makePlatformNumberSign, makeTransferSign } from '../../textures/procedural';

/** Hauteur libre sous les panneaux : on passe dessous sans se baisser. */
const SIGN_BOTTOM = 2.35;
const SIGN_H = 0.62;

interface Props {
  place: StationPlacement;
  layout: StationLayout;
  station: number;
}

export function OverheadSigns({ place, layout, station }: Props) {
  // Deux sorties + un tableau de correspondances, redessinés au changement de
  // gare et non reconstruits : une seule texture par panneau pour la session.
  const signs = useMemo(
    () => ({
      exits: [makeExitSign(0), makeExitSign(1)],
      transfer: makeTransferSign(),
      track: makePlatformNumberSign(),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      exits: signs.exits.map(
        (s) => new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false }),
      ),
      transfer: new THREE.MeshBasicMaterial({ map: signs.transfer.texture, toneMapped: false }),
      track: new THREE.MeshBasicMaterial({ map: signs.track.texture, toneMapped: false }),
      frame: new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.5, metalness: 0.3 }),
      strut: new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.4, metalness: 0.6 }),
    }),
    [signs],
  );

  useEffect(() => {
    for (const s of signs.exits) s.redraw(station);
    signs.transfer.redraw(station);
    signs.track.redraw(station);
  }, [signs, station]);

  // Les panneaux ne s'allument pas tant que le quai n'est pas là : redessiner
  // un canvas est gratuit, mais une gare invisible n'a pas à coûter un rendu.
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (root.current) root.current.visible = runtime.platformFade > 0.02;
  });

  // Une potence par accès. Décalée d'un mètre vers le milieu du quai : plantée
  // pile au-dessus de la trémie, elle serait masquée par le fléchage de sortie
  // qui coiffe déjà celle-ci.
  const gantries = useMemo(() => {
    const spots = [
      ...place.stairs.map((s) => ({ z: s.z - s.halfZ - 1.6, i: 0 })),
      ...place.escalators.map((e) => ({ z: e.z - e.halfZ - 1.6, i: 1 })),
    ];
    return spots.sort((a, b) => a.z - b.z);
  }, [place.stairs, place.escalators]);

  // Largeur utile : du bord du quai au mur du fond, moins les abouts.
  const x0 = PSD_X + 0.75;
  const x1 = place.backX - 0.75;
  const span = Math.max(2.4, x1 - x0);
  const midX = (x0 + x1) / 2;
  // Panneau de sortie côté voie, correspondances côté fond : c'est l'ordre de
  // lecture quand on arrive du train.
  const panelW = Math.min(2.05, span / 2 - 0.12);
  const top = SIGN_BOTTOM + SIGN_H;

  // Panneaux 番線, suspendus près du bord de quai. Centrés sur le milieu du
  // quai et espacés de trente-six mètres : quel que soit l'endroit où l'on
  // descend de la rame, il y en a toujours un dans le champ — c'est le repère
  // qu'on cherche des yeux en arrivant sur un quai.
  const trackSigns = useMemo(() => {
    const out: number[] = [];
    const halfZ = place.walkHalfZ;
    for (let k = -3; k <= 3; k++) {
      const z = k * 36;
      if (Math.abs(z) <= halfZ - 8) out.push(z);
    }
    return out;
  }, [place.walkHalfZ]);

  return (
    <group ref={root}>
      {trackSigns.map((z) => (
        <group key={`tk${z}`} position={[PSD_X + 1.5, PLATFORM_TOP + SIGN_BOTTOM + 0.34, z]}>
          {[-1, 1].map((d) => {
            const hangH = layout.canopyY - PLATFORM_TOP - SIGN_BOTTOM - 0.71;
            return (
              <mesh key={d} position={[d * 1.05, 0.37 + hangH / 2, 0]} material={mats.strut}>
                <boxGeometry args={[0.05, Math.max(0.1, hangH), 0.05]} />
              </mesh>
            );
          })}
          <mesh material={mats.frame}>
            <boxGeometry args={[3.24, 0.74, 0.09]} />
          </mesh>
          {[1, -1].map((d) => (
            <mesh
              key={d}
              position={[0, 0, d * 0.051]}
              rotation={[0, d === 1 ? 0 : Math.PI, 0]}
              material={mats.track}
            >
              <planeGeometry args={[3.16, 0.66]} />
            </mesh>
          ))}
        </group>
      ))}

      {gantries.map(({ z, i }) => (
        <group key={`ov${z}`} position={[0, PLATFORM_TOP, z]}>
          {/* Traverse et suspentes jusqu'à la sous-face de l'auvent. */}
          <mesh position={[midX, top + 0.09, 0]} material={mats.strut}>
            <boxGeometry args={[span, 0.1, 0.1]} />
          </mesh>
          {[-1, 1].map((d) => {
            const hx = midX + d * span * 0.34;
            const hangH = layout.canopyY - PLATFORM_TOP - top - 0.09;
            return (
              <mesh key={d} position={[hx, top + 0.14 + hangH / 2, 0]} material={mats.strut}>
                <boxGeometry args={[0.06, Math.max(0.1, hangH), 0.06]} />
              </mesh>
            );
          })}

          {/* Deux caissons côte à côte, chacun imprimé des deux faces. */}
          {[
            { x: midX - panelW / 2 - 0.06, mat: mats.exits[i % mats.exits.length] },
            { x: midX + panelW / 2 + 0.06, mat: mats.transfer },
          ].map((panel, k) => (
            <group key={k} position={[panel.x, SIGN_BOTTOM + SIGN_H / 2, 0]}>
              <mesh material={mats.frame}>
                <boxGeometry args={[panelW + 0.06, SIGN_H + 0.06, 0.09]} />
              </mesh>
              <mesh position={[0, 0, 0.051]} material={panel.mat}>
                <planeGeometry args={[panelW, SIGN_H]} />
              </mesh>
              <mesh position={[0, 0, -0.051]} rotation={[0, Math.PI, 0]} material={panel.mat}>
                <planeGeometry args={[panelW, SIGN_H]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
