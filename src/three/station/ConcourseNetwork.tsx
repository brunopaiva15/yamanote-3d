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
// UN SEUL ARCHÉTYPE AUJOURD'HUI, et c'est voulu : `Concourse`, le hall
// longitudinal, celui qui existe. Les phases 14 à 16 en ajouteront d'autres —
// hall compact, dessous de viaduc, pont-concourse, hall transversal, mezzanine
// — et c'est ici, et nulle part ailleurs, qu'on choisira lequel.

import type { StationInterior } from '../../data/stationInterior';
import { shellsOf } from '../../data/stationConcourseBuild';
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
      {shellsOf(net).map((shell) => (
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
