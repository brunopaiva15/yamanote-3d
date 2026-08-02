// Le niveau de correspondance, DESSINÉ PIÈCE PAR PIÈCE.
//
// `Station` appelait `Concourse` une fois, avec l'intérieur de la gare, et
// `Concourse` enveloppait une boîte : sol, plafond, deux parois, un fond percé,
// une ligne de portillons. C'était le constat R1 du plan — un composant unique
// qui ne sait dessiner qu'un couloir droit.
//
// Ce fichier est la bascule. Il ne dessine rien lui-même : il lit le RÉSEAU
// (`data/stationConcourseBuild`), en tire les VOLUMES CONTINUS, et confie
// chacun à son archétype.
//
// ─────────────────────────────────────────────────────────────────────────
// POURQUOI DES VOLUMES, ET NON DES PIÈCES
//
// Une pièce n'est pas une salle fermée. La zone payante et la zone libre d'un
// hall sont deux pièces — elles n'ont pas le même côté de la ligne — mais elles
// partagent un sol, un plafond et deux parois. Les envelopper séparément
// poserait deux murs au droit du contrôle, là où il n'y a qu'un passage.
//
// `shellsOf` regroupe donc les pièces qui se touchent, directement ou par une
// ligne de portillons franchissable. Le hall générique en donne exactement UN,
// aux cotes d'avant au centimètre près ; Harajuku en donne DEUX — le souterrain
// de Takeshita et le bâtiment de 2020 — qui ne se touchent pas et qu'il serait
// absurde d'envelopper ensemble.
// ─────────────────────────────────────────────────────────────────────────
//
// ET L'ON NE DESSINE QUE CE QU'ON PEUT VOIR (phase 17). Le hall était rendu
// d'un bloc dès qu'il existait — constat R2 — parce qu'il n'y en avait qu'un.
// Avec deux volumes, la question se pose immédiatement : depuis le souterrain
// de Takeshita on ne voit pas le bâtiment de 2020 d'Harajuku, à quatre-vingt-dix
// mètres et douze mètres plus haut. `visibleShells` tranche, et il n'y a rien à
// trancher tant qu'une gare n'a qu'un volume : les trente y passent inchangées.

import type { StationInterior } from '../../data/stationInterior';
import { visibleShells } from '../../data/stationConcourseBuild';
import { runtime } from '../../systems/runtime';
import type { ConcourseNetwork as Network } from '../../data/stationConcourseBuild';
import { Concourse } from './Concourse';
import type { Mats } from './materials';

export function ConcourseNetwork({
  net,
  it,
  m,
  station,
  detail,
}: {
  net: Network;
  /** L'intérieur générique, pour son MOBILIER : voir `Concourse`. */
  it: StationInterior;
  m: Mats;
  station: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
}) {
  return (
    <>
      {visibleShells(
        net,
        runtime.playerLevel === 'concourse',
        runtime.playerPlatX,
        runtime.playerPlatZ,
      ).map((shell) => (
        <Concourse
          key={shell.id}
          shell={shell}
          net={net}
          it={it}
          m={m}
          station={station}
          detail={detail}
        />
      ))}
    </>
  );
}
