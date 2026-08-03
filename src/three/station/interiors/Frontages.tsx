// CE QUE LE HALL VEND, ET CE QU'ON A LE DROIT D'EN DIRE.
//
// Le hall générique déduit ses commerces de l'AFFLUENCE : un konbini dès que la
// gare dépasse 1,2, une galerie dès qu'une enseigne est déclarée. C'est le
// constat D8 du plan, et le défaut n'est pas qu'il se trompe — il place
// plutôt bien — c'est qu'il ne distingue pas ce qu'il SAIT de ce qu'il SUPPOSE.
// Sept gares déclarent `ecute`/`atre`, dont trois n'ont pas la place, et rien
// dans le dessin ne dit laquelle est laquelle.
//
// Le relevé, lui, a lu les plans. `CommerceStatus` est une échelle de VÉRITÉ et
// non de taille, et c'est elle qui décide ce que la devanture porte :
//
//   · `namedVerified` — l'enseigne est sur le plan officiel : on l'écrit ;
//   · `gallery` — une galerie structurante, `atre vie Sugamo`, `GRANSTA TOKYO`,
//     `Dila Osaki`. Elle donne son échelle au hall, et son bandeau est long ;
//   · `categoryVerified` — on sait que c'est un konbini, pas lequel. Le bandeau
//     porte la catégorie, et pas un mot de plus ;
//   · `generic` et `facade` — remplissage assumé, ou façade qu'on ne fait que
//     voir. Bandeau ÉCLAIRÉ ET MUET. Un nom plausible serait un mensonge, et un
//     mur nu serait un oubli ; une devanture anonyme est ce qu'on voit vraiment
//     quand on passe devant sans lever les yeux.
//
// `enterable` tranche la dernière question : une devanture où l'on entre a sa
// baie ouverte au milieu, une devanture qu'on longe est vitrée d'un bout à
// l'autre. Ni l'une ni l'autre ne se franchit — la marche les tient toutes pour
// des obstacles (`stationConcourseBuild`), parce qu'il n'y a rien derrière.
//
// RIEN NE S'AFFICHE SUR LES TRENTE GARES AUJOURD'HUI : le chemin `legacy` n'a
// aucune devanture relevée, et son mobilier porte déjà ses commerces déduits.
// Tout ce qui suit attend le branchement des relevés.

import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import type {
  ConcourseFrontage,
  ConcourseNetwork,
  ConcourseShell,
} from '../../../data/stationConcourseBuild';
import { makeFrontageSign } from '../../../textures/concourse';
import type { Mats } from '../materials';

/** Hauteur d'une vitrine de gare : haute, et jusqu'au bandeau. */
const GLASS_H = 2.42;
/** Hauteur du bandeau d'enseigne, posé sur la vitrine. */
const BAND_H = 0.52;
/** Largeur de la baie d'entrée, quand on entre. */
const DOOR_W = 1.6;
/** Épaisseur du meneau et du nez de bandeau. */
const MULLION = 0.08;

/** L'axe long d'une devanture, et sa profondeur. */
function measure(f: ConcourseFrontage): { len: number; depth: number } {
  const dx = f.rect.x1 - f.rect.x0;
  const dz = f.rect.z1 - f.rect.z0;
  return f.along === 'z' ? { len: dz, depth: dx } : { len: dx, depth: dz };
}

/**
 * Les vantaux de la vitrine, le long de l'axe de la devanture.
 *
 * Une devanture où l'on entre garde sa baie au milieu ; une devanture qu'on
 * longe est vitrée d'un bout à l'autre. Les cotes sont exprimées en écart au
 * milieu, ce qui les rend indépendantes de l'axe.
 */
function panes(len: number, enterable: boolean): { at: number; w: number }[] {
  if (!enterable || len < DOOR_W + 1.2) return [{ at: 0, w: len }];
  const side = (len - DOOR_W) / 2;
  return [
    { at: -(DOOR_W / 2 + side / 2), w: side },
    { at: DOOR_W / 2 + side / 2, w: side },
  ];
}

export function Frontages({
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
   * LE CORPS RESTE À TOUS LES PALIERS : une devanture est un obstacle du
   * réseau, et une vitrine qu'on traverse parce que la machine est lente
   * serait pire qu'une vitrine sans bandeau. Ce qui s'allège est ce qui se
   * regarde — le verre, le meneau, l'enseigne.
   */
  detail: number;
}) {
  const ids = useMemo(() => new Set(shell.rooms.map((r) => r.id)), [shell]);
  const list = useMemo(
    () => net.frontages.filter((f) => ids.has(f.roomId)),
    [net, ids],
  );

  // Un bandeau par devanture : ils ne se partagent pas, puisqu'ils ne disent
  // pas la même chose. Il y en a au plus quatre par volume dans tout le relevé.
  // Au palier le plus bas, on n'en cuit aucun.
  const named = detail <= 2;
  const bands = useMemo(
    () =>
      (named ? list : []).map((f) =>
        new THREE.MeshBasicMaterial({
          map: makeFrontageSign(f.status, f.category, f.brand),
          toneMapped: false,
        }),
      ),
    [list, named],
  );
  useEffect(
    () => () => {
      for (const b of bands) {
        b.map?.dispose();
        b.dispose();
      }
    },
    [bands],
  );

  return (
    <group name="gare/hall/devantures">
      {list.map((f, k) => {
        const { len, depth } = measure(f);
        if (len < 0.8 || depth < 0.4) return null;
        const cx = (f.rect.x0 + f.rect.x1) / 2;
        const cz = (f.rect.z0 + f.rect.z1) / 2;
        // Le sens dans lequel la vitrine REGARDE : vers l'intérieur de la
        // pièce, donc à l'opposé de la paroi contre laquelle elle s'adosse.
        const out = f.side === 'x0' || f.side === 'z0' ? 1 : -1;
        const half = depth / 2;
        /** Une cote sur l'axe long, ramenée au repère du hall. */
        const along = (v: number): [number, number, number] =>
          f.along === 'z' ? [0, 0, v] : [v, 0, 0];
        /** Une cote sur l'axe de la PROFONDEUR, dans le même repère. */
        const deep = (v: number): [number, number, number] =>
          f.along === 'z' ? [out * v, 0, 0] : [0, 0, out * v];
        const add = (
          a: [number, number, number],
          b: [number, number, number],
          y: number,
        ): [number, number, number] => [a[0] + b[0], y, a[2] + b[2]];
        /** Un volume dont on donne la longueur, la hauteur et la profondeur. */
        const box = (l: number, h: number, d: number): [number, number, number] =>
          f.along === 'z' ? [d, h, l] : [l, h, d];

        return (
          <group key={f.id} position={[cx, shell.floorY, cz]}>
            {/* LE CORPS : ce qu'il y a derrière la vitrine, et où l'on n'entre
                pas. Opaque, plein, jusqu'au plafond du bandeau — un commerce de
                gare n'est jamais une boîte posée, il est encastré. */}
            <mesh
              position={add(along(0), deep(-MULLION / 2), (GLASS_H + BAND_H) / 2)}
              material={m.hall}
            >
              <boxGeometry args={box(len, GLASS_H + BAND_H, Math.max(0.2, depth - MULLION))} />
            </mesh>

            {/* LA VITRINE : un ou deux vantaux, selon qu'on entre ou qu'on
                longe. Le verre est du décor — la marche s'arrête au corps. */}
            {detail <= 1 && panes(len, f.enterable).map((p, i) => (
              <mesh
                key={`pane${i}`}
                position={add(along(p.at), deep(half - 0.02), GLASS_H / 2)}
                material={m.glass}
              >
                <boxGeometry args={box(p.w - MULLION, GLASS_H, 0.04)} />
              </mesh>
            ))}

            {/* Le meneau du bas : le socle de la vitrine, qu'on voit toujours. */}
            {detail <= 1 && <mesh
              position={add(along(0), deep(half), 0.12)}
              material={m.metal}
            >
              <boxGeometry args={box(len, 0.24, MULLION)} />
            </mesh>}

            {/* LE BANDEAU. C'est lui le sujet : il porte l'enseigne LUE, la
                catégorie établie, ou rien du tout — et « rien du tout » est une
                information, pas un manque. */}
            {bands[k] && <mesh
              position={add(along(0), deep(half + 0.01), GLASS_H + BAND_H / 2)}
              rotation={
                f.along === 'z'
                  ? [0, out > 0 ? Math.PI / 2 : -Math.PI / 2, 0]
                  : [0, out > 0 ? 0 : Math.PI, 0]
              }
              material={bands[k]}
            >
              <planeGeometry args={[len, BAND_H]} />
            </mesh>}
          </group>
        );
      })}
    </group>
  );
}
