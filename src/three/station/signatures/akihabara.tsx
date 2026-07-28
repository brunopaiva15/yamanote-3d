// JY03 秋葉原 — la structure superposée emblématique de la boucle.
//
// Les voies 5 et 6 de la Chūō–Sōbu franchissent PERPENDICULAIREMENT le site, à
// un niveau supérieur. C'est le seul endroit de la Yamanote où l'on voit un
// viaduc en enjamber un autre, et c'est l'événement du quai : poutres maîtresses
// à âme pleine, sous-face rivetée sombre, piles massives, et cette impression
// d'être au fond d'une faille entre deux ouvrages.
//
// Les piles se posent hors de tout quai et de toute voie — ni dans le passage
// du joueur, ni au milieu du ballast.

import * as THREE from 'three';
import { PLATFORM_TOP } from '../../../data/stationGeometry';
import { siteCut, useSigMaterials, type SigProps } from './kit';

/** Altitude de la sous-face du tablier (m au-dessus du plancher du wagon). */
const DECK_SOFFIT = 7.6;
/** Largeur du franchissement, dans l'axe de la Yamanote. */
const DECK_W = 15;
/** Position du croisement le long du quai. */
const DECK_Z = -8;

export function Akihabara({ place, m }: SigProps) {
  const { oppBackX } = siteCut(place);
  // Le tablier traverse tout le site et se perd des deux côtés.
  const x0 = -6.5;
  const x1 = oppBackX + 5;
  const midX = (x0 + x1) / 2;
  const span = x1 - x0;

  const s = useSigMaterials(
    () => ({
      // Acier de pont ancien : gris-vert sombre, mat, riveté.
      steel: new THREE.MeshStandardMaterial({ color: '#4a5450', roughness: 0.82, metalness: 0.34 }),
      // Sous-face du tablier, plus sombre encore : rien ne l'éclaire.
      soffit: new THREE.MeshStandardMaterial({ color: '#2f3634', roughness: 0.95 }),
      pier: new THREE.MeshStandardMaterial({ color: '#6d6f6a', roughness: 0.9 }),
    }),
    [],
  );

  /** Hauteur d'une pile, du ballast à la sous-face des poutres. */
  const pierH = DECK_SOFFIT - 1.6 + 1.3;

  return (
    <group position={[0, 0, DECK_Z]}>
      {/* Tablier : la dalle du viaduc supérieur, vue par en dessous. */}
      <mesh position={[midX, DECK_SOFFIT + 0.45, 0]} material={s.soffit}>
        <boxGeometry args={[span, 0.9, DECK_W]} />
      </mesh>
      {/* Parapets du viaduc, seuls visibles depuis le quai. */}
      {[-1, 1].map((d) => (
        <mesh key={d} position={[midX, DECK_SOFFIT + 1.5, d * (DECK_W / 2 - 0.2)]} material={s.steel}>
          <boxGeometry args={[span, 1.2, 0.3]} />
        </mesh>
      ))}

      {/* Poutres maîtresses à âme pleine, sous le tablier. */}
      {[-1, 1].map((d) => (
        <mesh key={`g${d}`} position={[midX, DECK_SOFFIT - 0.75, d * 5.2]} material={s.steel}>
          <boxGeometry args={[span, 1.7, 0.9]} />
        </mesh>
      ))}
      {/* Entretoises transversales : la trame rivetée qu'on voit d'en bas. */}
      {[-5.5, -1.8, 1.8, 5.5].map((k) => (
        <mesh key={k} position={[midX + k * (span / 14), DECK_SOFFIT - 0.35, 0]} material={s.steel}>
          <boxGeometry args={[0.45, 0.55, DECK_W - 1.6]} />
        </mesh>
      ))}

      {/* Piles. Volontairement AU-DELÀ des quais et des voies : une pile plantée
          sur le quai barrerait le passage, dans le ballast elle serait fausse. */}
      {[x0 + 1.2, x1 - 1.2].map((x) => (
        <group key={`p${x}`} position={[x, 0, 0]}>
          <mesh position={[0, -1.3 + pierH / 2, 0]} material={s.pier}>
            <boxGeometry args={[1.5, pierH, 3.2]} />
          </mesh>
          {/* Chapiteau évasé, sous les poutres. */}
          <mesh position={[0, DECK_SOFFIT - 1.72, 0]} material={s.pier}>
            <boxGeometry args={[2.1, 0.5, 11.6]} />
          </mesh>
        </group>
      ))}

      {/* Sous le franchissement, le plafond du quai descend et s'assombrit :
          c'est la zone basse et sourde d'Akihabara. */}
      <mesh position={[place.backX, PLATFORM_TOP + 3.3, 0]} material={m.wallDark}>
        <boxGeometry args={[3.2, 0.14, DECK_W - 3]} />
      </mesh>
    </group>
  );
}
