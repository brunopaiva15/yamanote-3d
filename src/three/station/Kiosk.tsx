// Le kiosque de quai.
//
// C'était une boîte blanche de 2,50 × 4,80 avec une affiche collée sur un
// flanc, et personne ne pouvait dire ce que c'était. Un vrai kiosque de quai
// japonais - NEWDAYS KIOSK - se reconnaît sans lire une lettre, à quatre
// choses :
//
//   · il est OUVERT sur sa longueur : pas de vitrine, un comptoir bas et un
//     auvent qui avance au-dessus, sous lequel on se glisse en passant ;
//   · ce comptoir est couvert de présentoirs - journaux à plat, magazines
//     debout, paniers de sucreries à hauteur de main ;
//   · le fond est un mur de rayonnages éclairé, et une armoire réfrigérée
//     vitrée à une extrémité ;
//   · au-dessus, un bandeau d'enseigne allumé qui court sur toute la longueur,
//     avec les prix des journaux affichés en petit.
//
// Rien de tout cela ne coûte cher : le kiosque est UNIQUE par gare, donc tout y
// est en géométrie franche plutôt qu'en instances, et les seules textures sont
// celles que le hall utilise déjà.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP } from '../../data/stationGeometry';
import type { Placed } from '../../systems/stationPlacement';
import { makeKioskSignTexture, makeKonbiniInteriorTexture } from '../../textures/concourse';
import type { Mats } from './materials';
import { stationAd } from './adPool';

/** Hauteur du comptoir : celle de toute caisse où l'on pose une pièce. */
const COUNTER_H = 1.0;
/** Hauteur sous auvent, et hauteur du bandeau d'enseigne. */
const CANOPY_Y = 2.12;
const SIGN_H = 0.34;
/** Hauteur totale de la boîte du fond. */
const BACK_H = 2.46;

export function Kiosk({ k, m, station }: { k: Placed; m: Mats; station: number }) {
  // Deux images, construites avec le kiosque et libérées avec lui : une gare
  // sur deux n'en a pas, et les dessiner pour tout le monde serait deux canvas
  // de plus à chaque arrivée en gare.
  const kit = useMemo(() => {
    const signTex = makeKioskSignTexture();
    const shelfTex = makeKonbiniInteriorTexture();
    return {
      sign: new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }),
      shelves: new THREE.MeshBasicMaterial({ map: shelfTex, toneMapped: false }),
    };
  }, []);
  useEffect(
    () => () => {
      kit.sign.map?.dispose();
      kit.shelves.map?.dispose();
      kit.sign.dispose();
      kit.shelves.dispose();
    },
    [kit],
  );
  const { sign, shelves } = kit;

  // Le kiosque est posé sur l'épine : sa longueur suit le quai (z), sa
  // profondeur le traverse (x). Il s'ouvre des DEUX côtés d'un îlot - c'est ce
  // qui en fait un kiosque et non une boutique - mais le fond, lui, est plein.
  const len = k.halfZ * 2;
  const depth = k.halfX * 2;
  return (
    <group name="kiosque" position={[k.x, PLATFORM_TOP, k.z]}>
      {/* Corps du fond : rayonnages, réserve, et la caisse derrière. */}
      <mesh position={[0, BACK_H / 2, 0]} material={m.kiosk}>
        <boxGeometry args={[depth * 0.52, BACK_H, len]} />
      </mesh>
      {/* Le mur de rayonnages, peint, des deux côtés du corps. */}
      {[-1, 1].map((s) => (
        <mesh
          key={`shelf${s}`}
          position={[s * (depth * 0.26 + 0.01), 1.55, 0]}
          rotation={[0, (s * Math.PI) / 2, 0]}
          material={shelves}
        >
          <planeGeometry args={[len - 0.2, 1.15]} />
        </mesh>
      ))}

      {/* Comptoirs, de part et d'autre : c'est là qu'on paie et qu'on prend. */}
      {[-1, 1].map((s) => (
        <group key={`side${s}`}>
          <mesh position={[s * depth * 0.33, COUNTER_H / 2, 0]} material={m.frame}>
            <boxGeometry args={[depth * 0.16, COUNTER_H, len - 0.12]} />
          </mesh>
          {/* Plateau du comptoir, débordant : l'ourlet d'inox qu'on longe. */}
          <mesh position={[s * depth * 0.35, COUNTER_H + 0.02, 0]} material={m.metal}>
            <boxGeometry args={[depth * 0.22, 0.05, len - 0.06]} />
          </mesh>

          {/* Présentoirs sur le comptoir : journaux à plat, magazines debout,
              paniers. La variété tient à trois hauteurs, pas à trois textures. */}
          {[-0.34, 0, 0.34].map((t, i) => (
            <group key={`disp${i}`} position={[s * depth * 0.35, COUNTER_H + 0.06, t * len]}>
              {i === 1 ? (
                // Le râtelier à magazines : incliné, dos au corps.
                <mesh position={[-s * 0.04, 0.19, 0]} rotation={[0, 0, s * 0.32]} material={m.ad}>
                  <planeGeometry args={[0.32, len * 0.24]} />
                </mesh>
              ) : (
                <mesh position={[0, 0.03, 0]} material={m.frame}>
                  <boxGeometry args={[depth * 0.18, 0.06, len * 0.2]} />
                </mesh>
              )}
              {i !== 1 && (
                <mesh
                  position={[0, 0.065, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  material={stationAd(station, i + 4)}
                >
                  <planeGeometry args={[depth * 0.16, len * 0.18]} />
                </mesh>
              )}
            </group>
          ))}

          {/* Armoire réfrigérée vitrée, à un bout du comptoir. */}
          <group position={[s * depth * 0.32, 0, len * 0.36]}>
            <mesh position={[0, 0.82, 0]} material={m.metal}>
              <boxGeometry args={[depth * 0.2, 1.64, len * 0.22]} />
            </mesh>
            <mesh position={[s * depth * 0.1, 0.95, 0]} rotation={[0, (s * Math.PI) / 2, 0]} material={m.glass}>
              <planeGeometry args={[len * 0.19, 1.1]} />
            </mesh>
            <mesh position={[s * depth * 0.09, 0.95, 0]} rotation={[0, (s * Math.PI) / 2, 0]} material={shelves}>
              <planeGeometry args={[len * 0.18, 1.05]} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Auvent : il avance au-dessus des comptoirs, et c'est lui qui abrite. */}
      <mesh position={[0, CANOPY_Y, 0]} material={m.canopy}>
        <boxGeometry args={[depth + 0.5, 0.1, len + 0.24]} />
      </mesh>
      {/* Bandeau d'enseigne, sur les deux longs côtés. */}
      {[-1, 1].map((s) => (
        <group key={`band${s}`}>
          <mesh position={[s * (depth / 2 + 0.24), CANOPY_Y + SIGN_H / 2 + 0.06, 0]} material={m.frame}>
            <boxGeometry args={[0.1, SIGN_H + 0.06, len + 0.18]} />
          </mesh>
          <mesh
            position={[s * (depth / 2 + 0.3), CANOPY_Y + SIGN_H / 2 + 0.06, 0]}
            rotation={[0, (s * Math.PI) / 2, 0]}
            material={sign}
          >
            <planeGeometry args={[len + 0.1, SIGN_H]} />
          </mesh>
        </group>
      ))}
      {/* Réglettes sous l'auvent : un kiosque est toujours plus clair que le
          quai autour, c'est ce qui attire l'œil au milieu d'un îlot. */}
      {[-1, 1].map((s) => (
        <mesh key={`lamp${s}`} position={[s * depth * 0.34, CANOPY_Y - 0.09, 0]} material={m.lamp}>
          <boxGeometry args={[0.16, 0.06, len - 0.4]} />
        </mesh>
      ))}
    </group>
  );
}
