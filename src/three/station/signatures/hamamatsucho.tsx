// JY28 浜松町 — le vertical, et le neuf greffé sur l'ancien.
//
// Deux choses font Hamamatsuchō. La première est la verticalité : des immeubles
// étroits et hauts serrés contre la gare, si près qu'on ne voit plus le ciel
// qu'en bande. La seconde est le chantier permanent — une moitié de quai sous
// une couverture ancienne et sombre, l'autre sous une charpente neuve et claire,
// et une jonction franche entre les deux.
//
// La poutre du monorail est déjà dans le décor de quartier (three/Landmarks) :
// elle n'a pas à être dessinée ici.

import { useMemo } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP, PSD_X } from '../../../data/stationGeometry';
import { bays, clearSpineSpans, siteCut, useSigMaterials, type SigProps } from './kit';

/** Abscisse de la jonction ancien / neuf, en fraction de la longueur. */
const JOINT = -0.06;

export function Hamamatsucho({ layout, place }: SigProps) {
  const { outerX, oppBackX } = siteCut(place);
  const top = layout.canopyY;
  const len = layout.length;
  const jointZ = len * JOINT;
  const x0 = PSD_X - 0.4;
  const x1 = outerX + 0.4;
  const span = x1 - x0;
  const midX = (x0 + x1) / 2;

  // Les poutrelles balaient toute la largeur : elles passent au large des
  // piliers génériques (et des caméras qui y sont vissées), des gaines
  // d'escalier mécanique et des débouchés d'accès où pend une plaque.
  const clearBay = useMemo(() => {
    const solids = [
      ...place.columns.map((z) => ({ z, r: 0.55 })),
      ...place.escalators.map((e) => ({ z: e.z, r: e.halfZ + 0.6 })),
      ...place.accesses.map((a) => ({ z: a.z - a.halfZ + 0.1, r: 0.6 })),
    ];
    return (z: number) => !solids.some((s) => Math.abs(z - s.z) < s.r);
  }, [place.columns, place.escalators, place.accesses]);

  // Le longeron de la moitié ancienne s'interrompt au droit des bandes
  // directionnelles, des débouchés d'accès et des gaines d'escalier mécanique,
  // qu'il transperçait (voir clearSpineSpans).
  const spineSpans = useMemo(
    () => clearSpineSpans(-len / 2 + 2, jointZ - 0.8, len, place),
    [len, jointZ, place],
  );

  const s = useSigMaterials(
    () => ({
      // L'ancien : acier peint sombre, poutrelles serrées.
      old: new THREE.MeshStandardMaterial({ color: '#4e544f', roughness: 0.88, metalness: 0.3 }),
      // Le neuf : profilés clairs, largement espacés.
      fresh: new THREE.MeshStandardMaterial({
        color: '#c8ccc9',
        roughness: 0.58,
        metalness: 0.3,
        emissive: '#a9aeab',
        emissiveIntensity: 0.2,
      }),
      // Immeubles serrés : sombres, sans détail, ils ferment le ciel.
      slab: new THREE.MeshStandardMaterial({ color: '#6b6f74', roughness: 0.94 }),
      pane: new THREE.MeshStandardMaterial({
        color: '#8fa4b4',
        roughness: 0.24,
        metalness: 0.2,
        emissive: '#54646f',
        emissiveIntensity: 0.28,
      }),
    }),
    [],
  );

  return (
    <group>
      {/* Moitié ancienne : poutrelles tous les quatre mètres, très présentes —
          amincies et PLAQUÉES à la sous-face : plus creuses, elles balayaient
          la bande directionnelle, la gouttière et les bannières. */}
      {bays(len, 4, -0.5, JOINT).filter(clearBay).map((z) => (
        <mesh key={`o${z}`} position={[midX, top - 0.12, z]} material={s.old}>
          <boxGeometry args={[span, 0.16, 0.2]} />
        </mesh>
      ))}
      {spineSpans.map((sp) => (
        <mesh key={`sp${sp.z0}`} position={[midX, top - 0.52, (sp.z0 + sp.z1) / 2]} material={s.old}>
          <boxGeometry args={[0.28, 0.3, sp.z1 - sp.z0]} />
        </mesh>
      ))}

      {/* Moitié neuve : deux profilés larges, et rien d'autre. */}
      {bays(len, 9, JOINT, 0.5).filter(clearBay).map((z) => (
        <mesh key={`n${z}`} position={[midX, top - 0.12, z]} material={s.fresh}>
          <boxGeometry args={[span, 0.2, 0.42]} />
        </mesh>
      ))}

      {/* La jonction : un portique franc, là où l'un s'arrête et l'autre commence.
          C'est ce joint qu'on remarque en marchant le long du quai. Le montant
          côté voie se tient EN RETRAIT du bord : planté à l'ancienne place, il
          mordait sur le gabarit de la rame. */}
      <mesh position={[midX, top - 0.42, jointZ]} material={s.fresh}>
        <boxGeometry args={[span + 0.6, 0.6, 0.7]} />
      </mesh>
      {[PSD_X + 0.3, x1].map((x) => (
        <mesh
          key={`j${x}`}
          position={[x, PLATFORM_TOP + (top - PLATFORM_TOP) / 2, jointZ]}
          material={s.fresh}
        >
          <boxGeometry args={[0.4, top - PLATFORM_TOP, 0.4]} />
        </mesh>
      ))}

      {/* Les immeubles, serrés contre la gare : c'est eux qui ferment le ciel.
          Ils commencent au-delà de la poutre de monorail, que le décor de
          quartier range juste derrière l'emprise bâtie — plus près, ils
          l'auraient avalée. */}
      {bays(len, 22).map((z, k) => (
        <group key={`t${z}`} position={[oppBackX + 9 + (k % 2) * 2.4, 0, z]}>
          <mesh position={[0, 9 + (k % 3) * 4, 0]} material={s.slab}>
            <boxGeometry args={[7, 22 + (k % 3) * 8, 15]} />
          </mesh>
          <mesh position={[-3.6, 9 + (k % 3) * 4, 0]} material={s.pane}>
            <boxGeometry args={[0.2, 19 + (k % 3) * 7, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
