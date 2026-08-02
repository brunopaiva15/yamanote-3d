// CE QUI FERME LE MONDE JOUABLE, et qui doit le dire au lieu de le taire.
//
// Le périmètre visitable est étroit et assumé : un accès, une zone payante, un
// contrôle, une portion de zone libre, les premières marches d'une bouche.
// Tout le reste de la gare réelle continue — d'autres halls, d'autres lignes,
// d'autres ailes — et le joueur doit le COMPRENDRE sans y aller.
//
// `Depiction` est le vocabulaire fermé de cette limite (`data/stationConcourseTypes`).
// Ce fichier en dessine les trois formes que la phase 16 traite :
//
//   · LA CORRESPONDANCE. Elle se voit, elle ne se prend pas. Ce qui compte est
//     sa DIRECTION — qu'on comprenne, depuis le hall, que le Ginza est en l'air
//     et le Chiyoda tout en bas — et la couleur de ses lignes. Sept gares du
//     relevé ont en plus une LIGNE DE CONTRÔLE entre exploitants : à Tokyo on
//     franchit un 改札 pour passer au Shinkansen, à Nippori pour passer au
//     Keisei. Une correspondance gardée porte donc ses bornes ;
//   · LE CHANTIER. Huit gares en ont un, et le plan officiel le délimite. Une
//     gare en travaux n'est pas une gare abîmée : c'est une gare AUTRE, et
//     l'oublier changerait ce qu'on montre. La palissade est le message ;
//   · rien d'autre. Les bouches de sortie restent à `Concourse`, qui les perce
//     dans sa paroi.
//
// RIEN NE S'AFFICHE SUR LES TRENTE GARES AUJOURD'HUI : le hall générique ne
// connaît ni correspondance ni chantier (constat D7), et son réseau les rend
// vides. Tout ce qui suit attend le branchement des relevés.

import * as THREE from 'three';
import { useMemo } from 'react';
import { LINES } from '../../../data/lines';
import type {
  ConcourseNetwork,
  ConcourseShell,
} from '../../../data/stationConcourseBuild';
import type { Mats } from '../materials';

/** Hauteur d'un seuil de correspondance : celle d'une porte de couloir. */
const PORTAL_H = 2.4;
const PORTAL_W = 2.6;
/** Bandeau de couleur au-dessus du seuil : c'est lui qui nomme la ligne. */
const BAND_H = 0.26;
/** Hauteur d'une palissade de chantier, et sa bande d'avertissement. */
const HOARD_H = 2.4;
const HOARD_BAND = 0.22;

/** La couleur d'une ligne, ou le gris de ce qu'on ne sait pas nommer. */
function lineColor(key: string): string {
  return LINES[key]?.color ?? '#8a9096';
}

export function Limits({
  shell,
  net,
  m,
}: {
  shell: ConcourseShell;
  net: ConcourseNetwork;
  m: Mats;
}) {
  const ids = useMemo(() => new Set(shell.rooms.map((r) => r.id)), [shell]);
  const transfers = net.transfers.filter((t) => ids.has(t.fromRoomId));
  const hoardings = net.hoardings.filter((h) => ids.has(h.roomId));

  // Une couleur par ligne citée : les matériaux sont créés une fois pour le
  // volume, pas un par panneau — une gare peut en citer six.
  const bands = useMemo(() => {
    const out = new Map<string, THREE.MeshBasicMaterial>();
    for (const t of transfers) {
      for (const key of t.lines) {
        if (!out.has(key)) {
          out.set(key, new THREE.MeshBasicMaterial({ color: lineColor(key), toneMapped: false }));
        }
      }
    }
    return out;
  }, [transfers]);

  return (
    <group name="gare/hall/limites">
      {transfers.map((t) => {
        // Sans emprise déclarée, le portail se range contre le fond de la pièce
        // qu'il quitte : le relevé dit la DIRECTION, pas la cote.
        const room = shell.rooms.find((r) => r.id === t.fromRoomId);
        if (!room) return null;
        const r = t.rect ?? {
          x0: room.rect.x1 - PORTAL_W,
          x1: room.rect.x1,
          z0: (room.rect.z0 + room.rect.z1) / 2 - 0.3,
          z1: (room.rect.z0 + room.rect.z1) / 2 + 0.3,
        };
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const w = Math.min(PORTAL_W, Math.max(1.6, r.x1 - r.x0));
        // Un panneau seul ne perce rien : il nomme, et c'est tout.
        const opens = t.depiction !== 'signOnly';
        return (
          <group key={t.id} position={[cx, shell.floorY, cz]}>
            {opens && (
              <mesh position={[0, PORTAL_H / 2, 0]} material={m.wallDark}>
                <boxGeometry args={[w, PORTAL_H, 0.5]} />
              </mesh>
            )}
            {/* Les bornes d'une correspondance GARDÉE : sept gares du relevé en
                ont une, et l'on y franchit un 改札 sans repasser en zone libre.
                Elles ne s'ouvrent pas pour le joueur — c'est une limite. */}
            {t.gated && [-1, 1].map((d) => (
              <mesh
                key={`cab${d}`}
                position={[(d * w) / 2 - d * 0.18, 0.52, 0.36]}
                material={m.frame}
              >
                <boxGeometry args={[0.36, 1.04, 1.6]} />
              </mesh>
            ))}
            {/* Le bandeau : une bande par ligne, dans sa couleur. C'est tout ce
                qu'un voyageur qui ne lit pas le japonais a besoin de voir. */}
            {t.lines.map((key, k) => (
              <mesh
                key={key}
                position={[
                  0,
                  PORTAL_H + BAND_H / 2 + 0.06,
                  -0.26 - k * 0.001,
                ]}
                material={bands.get(key)}
              >
                <planeGeometry args={[w / t.lines.length - 0.06, BAND_H]} />
              </mesh>
            ))}
          </group>
        );
      })}

      {hoardings.map((h) => {
        const cx = (h.rect.x0 + h.rect.x1) / 2;
        const cz = (h.rect.z0 + h.rect.z1) / 2;
        const w = h.rect.x1 - h.rect.x0;
        const d = h.rect.z1 - h.rect.z0;
        return (
          <group key={h.id} position={[cx, shell.floorY, cz]}>
            {/* La palissade elle-même : pleine hauteur, et opaque. Ce qu'il y a
                derrière n'est pas « pas encore fait », c'est FERMÉ. */}
            <mesh position={[0, HOARD_H / 2, 0]} material={m.hall}>
              <boxGeometry args={[w, HOARD_H, d]} />
            </mesh>
            {/* La bande d'avertissement, à hauteur d'œil : jaune sur toutes les
                palissades de chantier de JR East. */}
            <mesh position={[0, 1.55, d / 2 + 0.01]} material={m.accent}>
              <boxGeometry args={[w - 0.1, HOARD_BAND, 0.02]} />
            </mesh>
            <mesh position={[0, 1.55, -d / 2 - 0.01]} material={m.accent}>
              <boxGeometry args={[w - 0.1, HOARD_BAND, 0.02]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
