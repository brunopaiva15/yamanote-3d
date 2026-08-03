// CE DONT ON SE SOUVIENT D'UNE GARE.
//
// Les quatorze modules de `three/station/signatures/` dessinent ce qu'on voit
// DEPUIS LE QUAI : la toiture pliée de Takanawa Gateway, le viaduc qui enjambe
// Akihabara, la halle rivetée d'Ueno. Il n'y avait rien pour l'INTÉRIEUR —
// c'était le constat R3 du plan — et un hall reconnaissable ne se fait pas
// qu'avec des cotes justes.
//
// Le relevé note quarante repères sur les trente gares, en sept catégories. Ils
// ont une particularité qui commande tout ce fichier : **aucun n'a d'emprise
// cotée**. Un plan officiel ne cote pas une horloge — il l'écrit. On ne peut
// donc pas les poser au centimètre, et prétendre le contraire serait inventer.
//
// Ce qui suit dessine les trois qu'on sait poser SANS INVENTER DE COTE :
//
//   · `clock` — l'horloge suspendue. Une seule gare en a une au relevé, et ce
//     n'est pas un hasard : le 三角時計 de Shinagawa est nommé sur le plan
//     officiel, juste à côté du Central Gate, parce que c'est LE point de
//     rendez-vous de la gare. Elle se pose au milieu de la pièce, sous le
//     plafond, à deux faces — on la lit des deux côtés du hall ;
//   · `artwork` — le panneau d'art public, contre la paroi la plus longue ;
//   · `column` — la file de poteaux qui fait le lieu, le long de la pièce.
//
// ET IL SE TAIT SUR LES QUATRE AUTRES, exprès :
//
//   · `ceiling` et `material` ne sont pas des OBJETS : ce sont des qualités du
//     volume — « la grande toiture pliée, douze mètres plus haut », « acier
//     blanc, cèdre clair, verre ». Elles appartiennent à la hauteur libre du
//     relevé et à la palette de la gare, pas à un maillage de plus ;
//   · `trackView` est déjà dessiné : c'est l'archétype `overbridge` et son
//     appui à 1,10 m (`interiors/hallStyle`), et le redoubler ne montrerait
//     rien de neuf ;
//   · `void` demande une trémie dans le plancher, donc une emprise — et c'est
//     précisément ce que le relevé ne donne pas.
//
// Un repère qu'on ne sait pas dessiner ne se dessine pas approximativement.

import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import type {
  ConcourseNetwork,
  ConcourseShell,
} from '../../../data/stationConcourseBuild';
import { makeClockFace } from '../../../textures/concourse';
import type { Mats } from '../materials';

/** Diamètre du cadran d'une horloge de hall (m). */
const CLOCK_D = 1.15;
/** Hauteur du panneau d'art, et son retrait de la paroi. */
const ART_H = 2.2;
const ART_OUT = 0.06;
/** Jeu laissé au pied et en tête du fût (m). */
const COLUMN_CLEAR = 0.06;

export function Landmarks({
  shell,
  net,
  m,
  detail,
}: {
  shell: ConcourseShell;
  net: ConcourseNetwork;
  m: Mats;
  /**
   * Palier de qualité : 0 = tout, 3 = le strict nécessaire.
   *
   * LES FÛTS RESTENT À TOUS LES PALIERS : ils sont dans les obstacles du
   * réseau, et un poteau qu'on traverse est le pire de tous les défauts —
   * celui qui fait douter du sol lui-même. L'horloge et le panneau d'art, eux,
   * ne barrent rien.
   */
  detail: number;
}) {
  const ids = useMemo(() => new Set(shell.rooms.map((r) => r.id)), [shell]);
  const here = useMemo(
    () => net.landmarks.filter((l) => ids.has(l.roomId)),
    [net, ids],
  );
  const clocks = here.filter((l) => l.kind === 'clock');

  const face = useMemo(
    () => (clocks.length > 0 && detail <= 2
      ? new THREE.MeshBasicMaterial({ map: makeClockFace(), toneMapped: false })
      : null),
    [clocks.length, detail],
  );
  useEffect(
    () => () => {
      face?.map?.dispose();
      face?.dispose();
    },
    [face],
  );

  return (
    <group name="gare/hall/repères">
      {here.map((l) => {
        const room = shell.rooms.find((r) => r.id === l.roomId);
        if (!room) return null;
        const r = l.rect ?? room.rect;
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const long: 'x' | 'z' = r.x1 - r.x0 >= r.z1 - r.z0 ? 'x' : 'z';
        const len = long === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;

        if (l.kind === 'clock' && face) {
          // ELLE PEND DU PLAFOND, ET SA TAILLE EST CELLE DE LA PIÈCE.
          //
          // Le 三角時計 de Shinagawa faisait un mètre quinze de diamètre — la
          // cote d'un hall de gare terminus — sous un plafond à trois mètres
          // dix. Posé « à 3,40 m du sol, ou 1,55 m sous le plafond », il
          // pendait le bas du cadran à quatre-vingt-dix-huit centimètres du
          // sol : une horloge à hauteur de hanche, qu'on rapporte comme « des
          // horloges qui touchent presque par terre », et c'était exact.
          //
          // Une horloge suspendue se règle par le HAUT : la tige part de la
          // sous-face du plafond, et le cadran s'arrête où il s'arrête. Les
          // deux se réduisent avec la hauteur libre — un cadran d'un mètre
          // quinze ne tient pas dans une pièce de trois mètres, et le
          // rétrécir est la seule chose honnête à faire quand aucun plan ne
          // cote une horloge (voir l'en-tête de ce fichier).
          const clear = shell.ceilY - shell.floorY;
          const d = Math.min(CLOCK_D, clear * 0.22);
          const stem = Math.min(0.7, clear * 0.12);
          const y = shell.ceilY - 0.12 - stem - d / 2;
          return (
            <group key={l.id} name="gare/hall/horloge" position={[cx, y, cz]}>
              {/* La tige : une horloge de hall pend, elle n'est pas posée. */}
              <mesh position={[0, d / 2 + stem / 2, 0]} material={m.metal}>
                <boxGeometry args={[0.07, stem, 0.07]} />
              </mesh>
              {/* Le corps, et les deux cadrans : on la lit des deux côtés. */}
              <mesh material={m.frame}>
                <boxGeometry args={[d * 0.82, d, 0.22]} />
              </mesh>
              {[-1, 1].map((k) => (
                <mesh
                  key={`face${k}`}
                  position={[0, 0, k * 0.121]}
                  rotation={[0, k > 0 ? 0 : Math.PI, 0]}
                  material={face}
                >
                  <planeGeometry args={[d * 0.78, d * 0.78]} />
                </mesh>
              ))}
            </group>
          );
        }

        if (l.kind === 'artwork') {
          if (detail > 2) return null;
          // Contre la paroi la plus longue, au milieu : c'est là qu'on l'a mise
          // pour qu'on la voie en traversant.
          const w = Math.min(len * 0.45, 6);
          const at = long === 'x' ? room.rect.z0 + ART_OUT : room.rect.x0 + ART_OUT;
          return (
            <group
              key={l.id}
              name="gare/hall/œuvre"
              position={long === 'x' ? [cx, shell.floorY + 1.55, at] : [at, shell.floorY + 1.55, cz]}
              rotation={[0, long === 'x' ? 0 : Math.PI / 2, 0]}
            >
              <mesh material={m.wallDark}>
                <boxGeometry args={[w, ART_H, 0.09]} />
              </mesh>
              <mesh position={[0, 0, 0.05]} material={m.accent}>
                <boxGeometry args={[w - 0.22, ART_H - 0.22, 0.02]} />
              </mesh>
            </group>
          );
        }

        if (l.kind === 'column') {
          // LES FÛTS VIENNENT DU RÉSEAU, avec leur emprise : ils barrent le
          // passage, donc la marche les connaît, donc le rendu les LIT au lieu
          // de les recalculer (`data/stationConcourseBuild`).
          //
          // Le poteau s'arrête sous la dalle et sur le sol fini : un fût qui
          // pénètre son plafond de douze centimètres se lit comme un défaut, et
          // la sonde le compte comme tel.
          const h = shell.ceilY - shell.floorY - 2 * COLUMN_CLEAR;
          return (
            <group key={l.id} name="gare/hall/poteaux">
              {l.posts.map((post, k) => (
                <mesh
                  key={`col${k}`}
                  position={[
                    (post.x0 + post.x1) / 2,
                    shell.floorY + COLUMN_CLEAR + h / 2,
                    (post.z0 + post.z1) / 2,
                  ]}
                  material={m.column}
                >
                  <boxGeometry args={[post.x1 - post.x0, h, post.z1 - post.z0]} />
                </mesh>
              ))}
            </group>
          );
        }

        // `ceiling`, `material`, `trackView`, `void` : voir l'en-tête. Ce qu'on
        // ne sait pas dessiner sans inventer une cote reste à l'écrit.
        return null;
      })}
    </group>
  );
}
