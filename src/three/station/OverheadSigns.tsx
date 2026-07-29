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
import { PLATFORM_TOP, PSD_X, SIGN_BOTTOM } from '../../data/stationGeometry';
import type { StationLayout } from '../../data/stationLayouts';
import { runtime } from '../../systems/runtime';
import {
  GANTRY_PULL,
  trackSignBox,
  trackSignZs,
  type StationPlacement,
} from '../../systems/stationPlacement';
import {
  makeAccessPlate,
  makeExitSign,
  makePlatformNumberSign,
  makeTransferSign,
} from '../../textures/procedural';

/** Hauteur des panneaux de potence (la cote du bas est partagée : SIGN_BOTTOM). */
const SIGN_H = 0.62;

interface Props {
  place: StationPlacement;
  layout: StationLayout;
  station: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
}

export function OverheadSigns({ place, layout, station, detail }: Props) {
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
  // Une plaque par accès, refaite au changement de gare : leur nombre et leurs
  // lettres en dépendent. Ce sont de petits canvas, et il y en a au plus cinq.
  const plates = useMemo(
    () => place.accesses.map((a) => makeAccessPlate(a.letter, a.kind)),
    [place.accesses],
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
      plates: plates.map((t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false })),
    }),
    [signs, plates],
  );

  // Rien d'une gare quittée ne ressert. `mats` se reconstruit à chaque gare
  // puisque les plaques en dépendent : c'est TOUT l'objet qu'il faut rendre,
  // pas seulement les plaques — sinon les cinq autres matériaux s'accumulaient
  // à chaque arrêt, un tour de boucle après l'autre.
  useEffect(() => {
    const all = [mats.transfer, mats.track, mats.frame, mats.strut, ...mats.exits, ...mats.plates];
    return () => {
      for (const x of all) x.dispose();
      for (const t of plates) t.dispose();
    };
  }, [mats, plates]);

  // Emprise de la rangée du bord de voie, partagée avec le 発車標 qui s'y
  // aligne (systems/stationPlacement).
  const { x: trackX, w: trackW, hx: trackHx } = trackSignBox(place);

  useEffect(() => {
    for (const s of signs.exits) s.redraw(station);
    signs.transfer.redraw(station);
    // Le caisson 番線 se raccourcit sur les quais étroits : la texture se
    // recompose à sa proportion au lieu de s'y écraser.
    signs.track.redraw(station, trackW);
  }, [signs, station, trackW]);

  // Les panneaux ne s'allument pas tant que le quai n'est pas là : redessiner
  // un canvas est gratuit, mais une gare invisible n'a pas à coûter un rendu.
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (root.current) root.current.visible = runtime.platformFade > 0.02;
  });

  // Une potence par accès. Décalée d'un mètre vers le milieu du quai : plantée
  // pile au-dessus de la trémie, elle serait masquée par le fléchage de sortie
  // qui coiffe déjà celle-ci. Chacune porte la lettre de l'accès qu'elle
  // annonce — c'est par elle qu'on se repère sur deux cent vingt mètres.
  const gantries = useMemo(
    () =>
      place.accesses
        // L'ascenseur n'a pas de potence : on ne l'annonce pas de loin, on le
        // trouve à sa cage vitrée. Sa plaque, elle, reste posée dessus.
        .map((a, k) => ({ ...a, plate: k }))
        .filter((a) => a.kind !== 'elevator')
        .map((a) => ({
          z: a.z - a.halfZ - GANTRY_PULL,
          i: a.kind === 'stairs' ? 0 : 1,
          plate: a.plate,
        })),
    [place.accesses],
  );

  // Largeur utile : d'un bord de quai à l'autre, moins les abouts. Sur un îlot
  // la potence enjambe les DEUX bords — calée sur l'épine centrale, elle n'en
  // couvrait que la moitié et les panneaux se retrouvaient tous du même côté.
  const x0 = PSD_X + 0.75;
  const x1 = (place.farEdgeX ?? place.backX) - 0.75;
  const span = Math.max(2.4, x1 - x0);
  const midX = (x0 + x1) / 2;
  // Panneau de sortie côté voie, correspondances côté fond : c'est l'ordre de
  // lecture quand on arrive du train.
  const panelW = Math.min(2.05, span / 2 - 0.12);
  const top = SIGN_BOTTOM + SIGN_H;
  /**
   * Hauteur d'une plaque d'accès. Sur une trémie, à 2,62 m, on la lit sans
   * lever la tête ; sur l'ascenseur elle se pose SUR la cage — au même niveau,
   * elle s'enfonçait de vingt centimètres dans le chapeau (2,50 m).
   */
  const plateY = (kind: string): number => (kind === 'elevator' ? 2.83 : 2.62);

  // Panneaux 番線, suspendus près du bord de quai et espacés de trente-six
  // mètres : quel que soit l'endroit où l'on descend de la rame, il y en a
  // toujours un dans le champ — c'est le repère qu'on cherche des yeux en
  // arrivant sur un quai. Leurs abscisses viennent du placement, qui les
  // écarte des bannières, du kiosque et de l'horloge — et que les totems
  // consultent à leur tour pour ne pas se dresser dessous.
  const trackSigns = useMemo(() => trackSignZs(place), [place]);

  return (
    <group ref={root} name="orientation">
      {trackSigns.map((z) => (
        <group name="panneau-番線" key={`tk${z}`} position={[trackX, PLATFORM_TOP + SIGN_BOTTOM + 0.34, z]}>
          {[-1, 1].map((d) => {
            // Du haut du caisson à la SOUS-FACE de l'auvent, ni plus ni moins.
            const hangH = Math.max(0.06, layout.canopyY - PLATFORM_TOP - SIGN_BOTTOM - 0.71);
            return (
              <mesh key={d} position={[d * trackHx, 0.37 + hangH / 2, 0]} material={mats.strut}>
                <boxGeometry args={[0.05, hangH, 0.05]} />
              </mesh>
            );
          })}
          <mesh material={mats.frame}>
            <boxGeometry args={[trackW, 0.74, 0.09]} />
          </mesh>
          {[1, -1].map((d) => (
            <mesh
              key={d}
              position={[0, 0, d * 0.051]}
              rotation={[0, d === 1 ? 0 : Math.PI, 0]}
              material={mats.track}
            >
              <planeGeometry args={[trackW - 0.08, 0.66]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Plaque de balisage au-dessus de chaque accès : la lettre du plan JR,
          posée là où l'on débouche. C'est par elle qu'on se donne rendez-vous
          sur un quai de deux cent vingt mètres. */}
      {detail <= 2 && place.accesses.map((a, k) => {
        const hang = Math.max(0.06, layout.canopyY - PLATFORM_TOP - plateY(a.kind) - 0.31);
        return (
        <group name="plaque-accès" key={`ap${k}`} position={[a.x, PLATFORM_TOP + plateY(a.kind), a.z - a.halfZ + 0.1]}>
          {/* Suspente jusqu'à l'auvent : la plaque flottait, sans rien. */}
          <mesh position={[0, 0.31 + hang / 2, 0]} material={mats.strut}>
            <boxGeometry args={[0.05, hang, 0.05]} />
          </mesh>
          <mesh material={mats.frame}>
            <boxGeometry args={[0.5, 0.62, 0.07]} />
          </mesh>
          {[1, -1].map((d) => (
            <mesh
              key={d}
              position={[0, 0, d * 0.041]}
              rotation={[0, d === 1 ? 0 : Math.PI, 0]}
              material={mats.plates[k]}
            >
              <planeGeometry args={[0.44, 0.56]} />
            </mesh>
          ))}
        </group>
        );
      })}

      {gantries.map(({ z, i, plate }) => (
        <group name="potence" key={`ov${z}`} position={[0, PLATFORM_TOP, z]}>
          {/* Traverse et suspentes jusqu'à la sous-face de l'auvent. */}
          <mesh position={[midX, top + 0.09, 0]} material={mats.strut}>
            <boxGeometry args={[span, 0.1, 0.1]} />
          </mesh>
          {[-1, 1].map((d) => {
            const hx = midX + d * span * 0.34;
            // La suspente s'arrête à la sous-face de l'auvent : calculée à
            // longueur libre, elle la traversait et ressortait sur le toit.
            const hangH = Math.max(0.06, layout.canopyY - PLATFORM_TOP - top - 0.14);
            return (
              <mesh key={d} position={[hx, top + 0.14 + hangH / 2, 0]} material={mats.strut}>
                <boxGeometry args={[0.06, hangH, 0.06]} />
              </mesh>
            );
          })}

          {/* La lettre de l'accès, en bout de traverse : on la lit de loin,
              avant même de déchiffrer le nom de la sortie. */}
          <group position={[midX - panelW - 0.36, SIGN_BOTTOM + SIGN_H / 2, 0]}>
            <mesh material={mats.frame}>
              <boxGeometry args={[0.46, SIGN_H + 0.06, 0.09]} />
            </mesh>
            {[1, -1].map((d) => (
              <mesh
                key={d}
                position={[0, 0, d * 0.051]}
                rotation={[0, d === 1 ? 0 : Math.PI, 0]}
                material={mats.plates[plate]}
              >
                <planeGeometry args={[0.4, SIGN_H]} />
              </mesh>
            ))}
          </group>

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
