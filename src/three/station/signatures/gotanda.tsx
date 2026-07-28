// JY23 五反田 — la différence de hauteur.
//
// Ce qu'on retient de Gotanda, c'est la Tōkyū Ikegami perchée au quatrième
// niveau : une gare complète — quai, auvent, garde-corps — suspendue une
// dizaine de mètres au-dessus de la Yamanote, et qu'on ne voit qu'en levant
// franchement la tête. Aucune autre gare de la boucle n'a ça.
//
// Contrairement au franchissement d'Akihabara, qui n'est qu'un tablier vu par
// en dessous, ici on voit UNE GARE : c'est ce qui doit se lire.

import * as THREE from 'three';
import { useSigMaterials, siteCut, type SigProps } from './kit';

/** Sous-face du tablier de l'Ikegami. */
const DECK_SOFFIT = 10.4;
/** Largeur de l'ouvrage, dans l'axe de la Yamanote. */
const DECK_W = 19;
/** Position du croisement le long du quai. */
const DECK_Z = 12;

export function Gotanda({ place }: SigProps) {
  const { oppBackX } = siteCut(place);
  const x0 = -7;
  const x1 = oppBackX + 6;
  const midX = (x0 + x1) / 2;
  const span = x1 - x0;

  const s = useSigMaterials(
    () => ({
      deck: new THREE.MeshStandardMaterial({ color: '#5c6469', roughness: 0.9 }),
      steel: new THREE.MeshStandardMaterial({ color: '#79818a', roughness: 0.5, metalness: 0.5 }),
      slab: new THREE.MeshStandardMaterial({ color: '#c9cac4', roughness: 0.92 }),
      roof: new THREE.MeshStandardMaterial({
        color: '#8d949a',
        roughness: 0.85,
        emissive: '#6d7378',
        emissiveIntensity: 0.2,
      }),
      pier: new THREE.MeshStandardMaterial({ color: '#8a8c86', roughness: 0.92 }),
    }),
    [],
  );

  /** Hauteur d'une pile, du ballast à la sous-face du tablier. */
  const pierH = DECK_SOFFIT + 1.3;

  return (
    <group position={[0, 0, DECK_Z]}>
      {/* Tablier et poutres : l'ouvrage porteur. */}
      <mesh position={[midX, DECK_SOFFIT + 0.4, 0]} material={s.deck}>
        <boxGeometry args={[span, 0.8, DECK_W]} />
      </mesh>
      {[-1, 1].map((d) => (
        <mesh key={`g${d}`} position={[midX, DECK_SOFFIT - 0.6, d * 6.6]} material={s.steel}>
          <boxGeometry args={[span, 1.4, 0.7]} />
        </mesh>
      ))}

      {/* Et par-dessus, une gare entière : quai, auvent, garde-corps. C'est ce
          qu'on aperçoit en levant la tête, et c'est l'événement du lieu. */}
      <mesh position={[midX, DECK_SOFFIT + 1.1, 0]} material={s.slab}>
        <boxGeometry args={[span * 0.72, 0.6, 7.2]} />
      </mesh>
      {[-1, 1].map((d) => (
        <mesh key={`r${d}`} position={[midX, DECK_SOFFIT + 2.1, d * 5.4]} material={s.steel}>
          <boxGeometry args={[span * 0.8, 1.1, 0.22]} />
        </mesh>
      ))}
      <mesh position={[midX, DECK_SOFFIT + 4.6, 0]} material={s.roof}>
        <boxGeometry args={[span * 0.66, 0.2, 9]} />
      </mesh>
      {[-6, -2, 2, 6].map((k) => (
        <mesh
          key={k}
          position={[midX + k * (span / 18), DECK_SOFFIT + 3.1, 0]}
          material={s.steel}
        >
          <boxGeometry args={[0.22, 3, 0.22]} />
        </mesh>
      ))}

      {/* Piles, posées hors de tout quai et de toute voie. */}
      {[x0 + 1.4, x1 - 1.4].map((x) => (
        <group key={`p${x}`} position={[x, 0, 0]}>
          <mesh position={[0, -1.3 + pierH / 2, 0]} material={s.pier}>
            <boxGeometry args={[1.7, pierH, 3.4]} />
          </mesh>
          <mesh position={[0, DECK_SOFFIT - 1.5, 0]} material={s.pier}>
            <boxGeometry args={[2.3, 0.55, 14]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
