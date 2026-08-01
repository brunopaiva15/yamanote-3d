// La volée qui MONTE au niveau de correspondance.
//
// Cinq gares en tranchée et Nippori ont leur billetterie au-dessus des voies,
// sur le bâtiment qui les enjambe : la rue y est plus haute que le quai. C'est
// l'inverse exact d'une gare de viaduc, et ce n'est pas la trémie avec un signe
// changé - c'est un autre ouvrage :
//
//   · elle ne perce PAS la dalle, elle se POSE dessus. Pas de joues qui coiffent
//     un percement, pas de linteau, pas de voile de tête ;
//   · sa sous-face est visible, et c'est même la première chose qu'on en voit en
//     marchant sur le quai : une volée montante se lit par en dessous ;
//   · elle perce en revanche l'auvent, aux deux tiers de sa hauteur, et c'est ce
//     percement-là que la gare doit ménager (three/station/Station) ;
//   · elle monte cinq mètres au lieu de trois et demi, en deux volées séparées
//     par un palier de mi-étage - une seule volée de vingt-neuf marches sans
//     repos n'existe dans aucune gare.
//
// Le profil vient de `data/stationGeometry`, comme celui de la descente, et
// pour la même raison : trois consommateurs doivent voir le même escalier - ce
// rendu, la marche du joueur (systems/walkable) et le raccord du hall
// (data/stationInterior). Une volée dessinée ici et une autre sous les pieds se
// verrait au premier pas.

import {
  ASCENT_LANDING_LEN,
  ASCENT_LANDING_Y,
  ASCENT_LEN,
  ASCENT_STEPS_A,
  ASCENT_STEPS_B,
  PLATFORM_TOP,
  STAIR_CLEAR_HALF_X,
  STAIR_GOING,
  STAIR_HALF_X,
  STAIR_HALF_Z,
  STAIR_HANDRAIL_H,
  STAIR_PARAPET_H,
  STAIR_RISE,
} from '../../data/stationGeometry';
import type { Placed } from '../../systems/stationPlacement';
import type { Mats } from './materials';

/** Nez de la volée, en repère local : le premier giron est au ras de la dalle. */
const NOSE = -STAIR_HALF_Z;
/** Pente de la volée : c'est elle qui incline joues, mains courantes et sous-face. */
const PITCH = Math.atan2(STAIR_RISE, STAIR_GOING);
/** Épaisseur de la paillasse - le voile de béton sous les marches. */
const SLAB_T = 0.32;
/** Demi-largeur du bloc de marche : il mord d'un centimètre dans chaque joue. */
const FLIGHT_HALF_X = STAIR_CLEAR_HALF_X + 0.01;
/** Épaisseur d'une joue. */
const CHEEK_T = STAIR_HALF_X - STAIR_CLEAR_HALF_X;
const CHEEK_X = (STAIR_HALF_X + STAIR_CLEAR_HALF_X) / 2;
/** Saillie et hauteur d'une bande antidérapante de nez de marche. */
const NOSING_D = 0.055;

interface Flight {
  /** Marches de la volée. */
  steps: number;
  /** `t` du pied de la volée, et altitude à ce pied. */
  t0: number;
  y0: number;
}

const FLIGHT_A: Flight = { steps: ASCENT_STEPS_A, t0: 0, y0: 0 };
const FLIGHT_B: Flight = {
  steps: ASCENT_STEPS_B,
  t0: (ASCENT_STEPS_A + 0.5) * STAIR_GOING + ASCENT_LANDING_LEN,
  y0: ASCENT_LANDING_Y,
};

/** Marches d'une volée : le giron, et la bande jaune de son nez. */
function treads(f: Flight) {
  return Array.from({ length: f.steps }, (_, i) => {
    const k = i + 1;
    return {
      k,
      y: f.y0 + k * STAIR_RISE,
      z: NOSE + f.t0 + (k + 0.5) * STAIR_GOING,
    };
  });
}

/** Paillasse inclinée d'une volée : sa longueur et son milieu, en repère local. */
function slabOf(f: Flight) {
  const len = (f.steps + 0.5) * STAIR_GOING;
  const t = f.t0 + len / 2;
  return {
    len: len / Math.cos(PITCH),
    z: NOSE + t,
    y: f.y0 + (len / 2) * Math.tan(PITCH) - SLAB_T / 2 / Math.cos(PITCH),
  };
}

export function Overbridge({ s, m }: { s: Placed; m: Mats }) {
  const landingZ = NOSE + FLIGHT_A.t0 + (ASCENT_STEPS_A + 0.5) * STAIR_GOING + ASCENT_LANDING_LEN / 2;

  return (
    <group name="volée-montante" position={[s.x, PLATFORM_TOP, s.z]}>
      {[FLIGHT_A, FLIGHT_B].map((f, fi) => {
        const slab = slabOf(f);
        return (
          <group key={`flight${fi}`}>
            {/* Paillasse : c'est ELLE qu'on voit du quai, pas les marches. */}
            <mesh
              position={[0, slab.y, slab.z]}
              rotation={[-PITCH, 0, 0]}
              material={m.stair}
              castShadow
            >
              <boxGeometry args={[STAIR_HALF_X * 2, SLAB_T, slab.len]} />
            </mesh>
            {/* Marches, posées dessus. */}
            {treads(f).map((t) => (
              <group key={`t${fi}-${t.k}`}>
                <mesh position={[0, t.y - 0.05, t.z]} material={m.stair}>
                  <boxGeometry args={[FLIGHT_HALF_X * 2, 0.1, STAIR_GOING]} />
                </mesh>
                <mesh
                  position={[0, t.y + 0.007, t.z - STAIR_GOING / 2 + NOSING_D / 2]}
                  material={m.stairNose}
                >
                  <boxGeometry args={[FLIGHT_HALF_X * 2 - 0.1, 0.014, NOSING_D]} />
                </mesh>
              </group>
            ))}
            {/* Joues et mains courantes, inclinées avec la pente. */}
            {[-1, 1].map((d) => (
              <group key={`side${fi}${d}`}>
                <mesh
                  position={[
                    d * CHEEK_X,
                    slab.y + (STAIR_PARAPET_H + SLAB_T) / 2 / Math.cos(PITCH),
                    slab.z,
                  ]}
                  rotation={[-PITCH, 0, 0]}
                  material={m.wall}
                >
                  <boxGeometry args={[CHEEK_T, STAIR_PARAPET_H, slab.len]} />
                </mesh>
                <mesh
                  position={[
                    d * (CHEEK_X - CHEEK_T * 0.1),
                    slab.y
                      + (STAIR_PARAPET_H + SLAB_T) / 2 / Math.cos(PITCH)
                      + STAIR_PARAPET_H / 2
                      + 0.04,
                    slab.z,
                  ]}
                  rotation={[-PITCH, 0, 0]}
                  material={m.metal}
                >
                  <boxGeometry args={[CHEEK_T + 0.06, 0.07, slab.len]} />
                </mesh>
                {/* Main courante intérieure : celle qu'on tient réellement. */}
                <mesh
                  position={[
                    d * (STAIR_CLEAR_HALF_X - 0.06),
                    slab.y + (STAIR_HANDRAIL_H + SLAB_T) / 2 / Math.cos(PITCH) + 0.34,
                    slab.z,
                  ]}
                  rotation={[-PITCH, 0, 0]}
                  material={m.metal}
                >
                  <boxGeometry args={[0.05, 0.05, slab.len - 0.3]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}

      {/* Palier de mi-étage : le repos, et le seul endroit où l'on se retourne
          pour voir le quai d'en haut. */}
      <mesh
        position={[0, ASCENT_LANDING_Y - SLAB_T / 2, landingZ]}
        material={m.stair}
        castShadow
      >
        <boxGeometry args={[STAIR_HALF_X * 2, SLAB_T, ASCENT_LANDING_LEN + 0.2]} />
      </mesh>
      <mesh position={[0, ASCENT_LANDING_Y + 0.005, landingZ]} material={m.slab}>
        <boxGeometry args={[FLIGHT_HALF_X * 2, 0.02, ASCENT_LANDING_LEN]} />
      </mesh>
      {[-1, 1].map((d) => (
        <mesh
          key={`lp${d}`}
          position={[d * CHEEK_X, ASCENT_LANDING_Y + STAIR_PARAPET_H / 2, landingZ]}
          material={m.wall}
        >
          <boxGeometry args={[CHEEK_T, STAIR_PARAPET_H, ASCENT_LANDING_LEN + 0.2]} />
        </mesh>
      ))}

      {/* Poteaux de reprise : une volée de cinq mètres ne tient pas en l'air.
          Ils descendent jusqu'à la dalle sous le palier et sous le haut de la
          seconde volée, aux deux endroits où la charge passe vraiment. */}
      {[landingZ, NOSE + ASCENT_LEN - 1.2].map((z, i) => (
        <group key={`post${i}`}>
          {[-1, 1].map((d) => (
            <mesh
              key={d}
              position={[d * (STAIR_HALF_X - 0.18), (i === 0 ? ASCENT_LANDING_Y : ASCENT_LANDING_Y * 2) / 2, z]}
              material={m.column}
            >
              <boxGeometry args={[0.26, i === 0 ? ASCENT_LANDING_Y : ASCENT_LANDING_Y * 2, 0.26]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
