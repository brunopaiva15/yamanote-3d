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

import { useEffect, useState } from 'react';
import type { StationInterior } from '../../data/stationInterior';
import { visibleShells } from '../../data/stationConcourseBuild';
import { runtime } from '../../systems/runtime';
import type { ConcourseNetwork as Network } from '../../data/stationConcourseBuild';
import { Concourse } from './Concourse';
import { Ouvrage } from './Ouvrage';
import type { Mats } from './materials';

/**
 * Le joueur est-il DANS le hall ? Relu à l'image près, sans passer par le store.
 *
 * `runtime.playerLevel` change à chaque pas et n'est pas réactif : c'est le même
 * guet que celui de `ui/StationDevelopmentNotice`, et pour la même raison — on
 * ne veut pas d'un rendu React par image, seulement savoir quand on bascule.
 */
function useInConcourse(): boolean {
  const [inside, setInside] = useState(() => runtime.playerLevel === 'concourse');
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = runtime.playerLevel === 'concourse';
      setInside((cur) => (cur === next ? cur : next));
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  return inside;
}

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
  const inConcourse = useInConcourse();
  // AU PALIER LE PLUS BAS, LE HALL RESTE — DÈS QU'ON Y EST.
  //
  // Il sautait entièrement à « très basse », et le joueur qui descendait s'y
  // retrouvait debout dans le vide : la marche ne connaît pas le palier de
  // qualité (c'est la règle de la phase 25), donc le sol était là et rien ne le
  // dessinait. C'est l'exigence #17 prise à l'envers — non pas un obstacle
  // invisible, mais un PLANCHER invisible, ce qui est pire.
  //
  // On garde l'économie là où elle a un sens : depuis le quai, à ce palier-là,
  // le hall reste du fond de champ et ne se dessine pas. Dès qu'on y descend,
  // il existe.
  if (detail > 2 && !inConcourse) return null;
  const shells = visibleShells(
    net,
    runtime.playerLevel === 'concourse',
    runtime.playerPlatX,
    runtime.playerPlatZ,
  );
  // ET LES OUVRAGES QUI LES JOIGNENT. Un volume est continu par définition —
  // c'est ce que `shellsOf` regroupe — donc ce qui joint DEUX volumes n'est
  // dans aucun des deux, et personne ne le dessinait. La marche, elle, en fait
  // du sol depuis la phase 9 : on y descendait dans un trou de trois mètres par
  // lequel on voyait le ballast. Un plancher qu'on foule et qu'on ne dessine
  // pas est le symétrique du mur invisible.
  const seen = new Set(shells.flatMap((s) => s.rooms.map((r) => r.id)));
  // UN SEUL DES DEUX BOUTS SUFFIT. Exiger que les deux volumes soient visibles
  // effaçait l'ouvrage au moment précis où l'on y est : depuis l'intérieur,
  // l'occlusion ne garde que le volume vers lequel on va, et l'on se retrouvait
  // à marcher sur un plancher qui n'existait plus.
  const links = net.joins.filter(
    (j) => j.walkable && (seen.has(j.from) || seen.has(j.to)),
  );
  return (
    <>
      {shells.map((shell) => (
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
      {links.map((j) => (
        <Ouvrage
          key={j.id}
          join={j}
          net={net}
          m={m}
          ceilY={Math.max(
            ...net.rooms
              .filter((r) => r.id === j.from || r.id === j.to)
              .map((r) => r.ceilY),
          )}
        />
      ))}
    </>
  );
}
