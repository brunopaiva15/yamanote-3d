// L'OUVRAGE QUI JOINT DEUX VOLUMES, et qui n'était dessiné nulle part.
//
// La phase 9 a fait d'un lien du SOL : `joinFloorAt` rend une altitude, la
// marche l'accepte, la foule le descend. Le RENDU, lui, ne dessinait que les
// volumes — `shellsOf` regroupe les pièces continues, et un ouvrage n'est pas
// une pièce. Cela n'a rien coûté pendant vingt phases : sur les trente gares,
// treize liens sont relevés et un seul est PRATICABLE, celui de la mezzanine
// d'Okachimachi (phase 29).
//
// Le jour où il a été branché, le défaut s'est vu tout de suite : trois mètres
// de vide entre deux volumes clos, par lesquels on voyait le ballast et la
// ville. Un plancher sur lequel on marche et qu'on ne dessine pas est le
// symétrique exact du mur invisible — et tout aussi grave.
//
// CE QUI SE DESSINE ICI est ce que la marche lit, à la marche près : le profil
// vient de `joinFloorProfile`, l'axe de `joinAxis`, et les deux sont dans la
// donnée. Le reste ferme le volume : deux joues, un plafond, une plinthe.

import { useMemo } from 'react';
import {
  joinAxis,
  joinFloorProfile,
  type ConcourseJoin,
  type ConcourseNetwork,
} from '../../data/stationConcourseBuild';
import { STAIR_RISE } from '../../data/stationGeometry';
import type { Mats } from './materials';

/** Épaisseur des joues et de la dalle : celle du hall qu'il prolonge. */
const WALL_T = 0.18;
/** Hauteur de la plinthe, et sa saillie. */
const SKIRT_H = 0.14;

/**
 * Le nombre de contremarches d'une volée intérieure.
 *
 * La même règle que partout ailleurs dans cette gare : on divise la hauteur par
 * un nombre entier de contremarches (`data/stationGeometry`). Un mètre cinq en
 * fait six, à 17,5 cm — la contremarche du dépôt, sans un millimètre d'écart.
 */
function stepsOf(j: ConcourseJoin): number {
  if (j.kind !== 'stairs') return 0;
  return Math.max(1, Math.round(Math.abs(j.toY - j.fromY) / STAIR_RISE));
}

export function Ouvrage({
  join,
  net,
  m,
  ceilY,
}: {
  join: ConcourseJoin;
  net: ConcourseNetwork;
  m: Mats;
  /** Plafond des volumes qu'il joint : le sien le prolonge sans décrochement. */
  ceilY: number;
}) {
  const lay = useMemo(() => joinAxis(net, join), [net, join]);
  const treads = useMemo(() => {
    if (!lay) return [];
    const n = stepsOf(join);
    // Une rampe ou un couloir n'a pas de marches : une seule dalle, en pente.
    // On la rend en tranches, ce qui est ce qu'on fait déjà pour la trémie —
    // un escalier de vingt-neuf marches et une rampe de vingt-neuf tranches se
    // dessinent du même geste, et seule la hauteur change.
    const slices = n === 0 ? 8 : n + 1;
    return Array.from({ length: slices }, (_, k) => {
      const t0 = k / slices;
      const t1 = (k + 1) / slices;
      const y = joinFloorProfile(join, (t0 + t1) / 2);
      // L'avancement se compte de `from` vers `to` ; le rectangle, lui, se lit
      // toujours dans le sens des coordonnées croissantes.
      const [a0, a1] = lay.forward ? [t0, t1] : [1 - t1, 1 - t0];
      return { y, a0, a1 };
    });
  }, [join, lay]);

  if (!lay) return null;
  const r = join.rect;
  const lo = lay.alongZ ? r.z0 : r.x0;
  const across0 = lay.alongZ ? r.x0 : r.z0;
  const across1 = lay.alongZ ? r.x1 : r.z1;
  const width = across1 - across0;
  const midAcross = (across0 + across1) / 2;
  const midAlong = (lo + lo + lay.span) / 2;
  const bottom = Math.min(join.fromY, join.toY);
  const top = Math.max(join.fromY, join.toY);

  /** Un point de l'ouvrage, remis dans le repère du quai. */
  const at = (along: number, across: number): [number, number, number] =>
    (lay.alongZ ? [across, 0, along] : [along, 0, across]);
  const box = (along: number, h: number, across: number): [number, number, number] =>
    (lay.alongZ ? [across, h, along] : [along, h, across]);

  return (
    <group name="gare/hall/ouvrage">
      {/* LES MARCHES, ou les tranches d'une rampe. Chacune est un bloc plein
          jusqu'à la sous-face : ce qui est sous une volée est du remplissage,
          et le laisser creux montrerait le dessous du dépôt. */}
      {treads.map((s, k) => {
        const a0 = lo + s.a0 * lay.span;
        const a1 = lo + s.a1 * lay.span;
        const h = s.y - (bottom - 0.9);
        const p = at((a0 + a1) / 2, midAcross);
        return (
          <mesh
            key={`t${k}`}
            position={[p[0], s.y - h / 2, p[2]]}
            material={m.slab}
          >
            <boxGeometry args={box(a1 - a0, h, width)} />
          </mesh>
        );
      })}

      {/* LES DEUX JOUES : c'est par elles qu'on voyait dehors. Elles montent du
          plus bas des deux sols au plafond, et ferment l'ouvrage d'un volume à
          l'autre sans laisser un jour. */}
      {[-1, 1].map((d) => {
        const p = at(midAlong, midAcross + (d * (width + WALL_T)) / 2);
        return (
          <mesh
            key={`joue${d}`}
            position={[p[0], (bottom + ceilY) / 2, p[2]]}
            material={m.hall}
          >
            <boxGeometry args={box(lay.span, ceilY - bottom, WALL_T)} />
          </mesh>
        );
      })}

      {/* LE PLAFOND, au nu de celui des deux volumes : une volée intérieure
          passe sous la même dalle qu'eux. */}
      <mesh
        position={(() => {
          const p = at(midAlong, midAcross);
          return [p[0], ceilY - 0.06, p[2]];
        })()}
        material={m.hallCeil}
      >
        <boxGeometry args={box(lay.span, 0.12, width + 2 * WALL_T)} />
      </mesh>

      {/* La plinthe, comme dans le hall : c'est elle qui distingue un couloir
          fini d'une boîte enduite jusqu'au sol. Elle suit la pente par marches,
          puisque c'est la pente qu'elle borde. */}
      {[-1, 1].map((d) => treads.map((s, k) => {
        const a0 = lo + s.a0 * lay.span;
        const a1 = lo + s.a1 * lay.span;
        const p = at((a0 + a1) / 2, midAcross + (d * (width - 0.02)) / 2);
        return (
          <mesh
            key={`pl${d}.${k}`}
            position={[p[0], s.y + SKIRT_H / 2, p[2]]}
            material={m.wallDark}
          >
            <boxGeometry args={box(a1 - a0, SKIRT_H, 0.04)} />
          </mesh>
        );
      }))}

      {/* La main courante : une volée publique en a une, et de ce côté-ci elle
          est la seule chose qui dise « on descend » avant d'y être. */}
      {[-1, 1].map((d) => {
        const p = at(midAlong, midAcross + (d * (width - 0.12)) / 2);
        return (
          <mesh
            key={`mc${d}`}
            position={[p[0], (bottom + top) / 2 + 0.95, p[2]]}
            rotation={
              lay.alongZ
                ? [Math.atan2(top - bottom, lay.span) * (lay.forward ? 1 : -1), 0, 0]
                : [0, 0, -Math.atan2(top - bottom, lay.span) * (lay.forward ? 1 : -1)]
            }
            material={m.metal}
          >
            <boxGeometry args={box(Math.hypot(lay.span, top - bottom), 0.06, 0.06)} />
          </mesh>
        );
      })}
    </group>
  );
}
