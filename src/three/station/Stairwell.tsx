// Trémie d'escalier : la dalle du quai est vraiment percée, et la volée
// s'enfonce dessous vers la salle des billets.
//
// C'est le seul endroit d'une gare où le décor doit tenir EN COUPE. Partout
// ailleurs, un volume mal calé se rattrape à l'œil ; ici, le joueur descend
// dedans, la tête passe sous le niveau du quai, et la moindre cote fausse se
// lit comme un trou. D'où trois règles, tenues sur tout le fichier :
//
//   1. Le profil ne se redéduit pas. Marches, ligne des nez, palier, longueur
//      praticable : tout vient de data/stationGeometry, qui sert aussi au
//      percement de la dalle et à la marche du joueur.
//   2. Rien n'affleure. Les joues et le voile de tête COIFFENT le chant du
//      percement de deux centimètres, le bloc de la volée mord d'un
//      centimètre dans les joues. Aucune face de la trémie n'est coplanaire
//      avec une face de la dalle.
//   3. La volée est un BLOC PLEIN, pas un empilement de plateaux. Chaque
//      marche descend jusqu'à la sous-face commune : la volée ferme donc
//      d'elle-même le vide qu'elle surplombe, et il n'y a ni gaine à modéliser
//      ni fond à voir.
//
// Repère local : origine au centre de l'emprise, y = 0 au sol du quai. La
// volée descend vers +z ; l'entrée est côté −z.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  PLATFORM_TOP,
  STAIR_CLEAR_HALF_X,
  STAIR_CLEAR_Z1,
  STAIR_GOING,
  STAIR_HALF_X,
  STAIR_HALF_Z,
  STAIR_HANDRAIL_H,
  STAIR_LANDING_Y,
  STAIR_LAP,
  STAIR_OPENING_Z1,
  STAIR_PARAPET_H,
  STAIR_RISE,
  STAIR_SOFFIT_Y,
  STAIR_STEPS,
  stairPitchY,
} from '../../data/stationGeometry';
import type { Placed } from '../../systems/stationPlacement';
import { makeExitSign } from '../../textures/procedural';
import { stationAd } from './adPool';
import type { Mats } from './materials';

// --- Cotes dérivées, calculées une fois pour toutes les gares ------------

/** Nez de l'emprise : l'origine des `t`, en repère local. */
const NOSE = -STAIR_HALF_Z;

/** Joues : du nu intérieur, qui coiffe le percement, au nu extérieur. */
const CHEEK_T = STAIR_HALF_X - STAIR_CLEAR_HALF_X;
const CHEEK_X = (STAIR_HALF_X + STAIR_CLEAR_HALF_X) / 2;
/**
 * Une joue est d'un seul tenant, de la sous-face de la volée au couronnement :
 * garde-corps au-dessus de la dalle, voile de gaine en dessous. C'est le même
 * ouvrage, et le couper en deux au niveau de la dalle n'aurait fabriqué qu'un
 * joint de plus à faire coïncider.
 */
const CHEEK_H = STAIR_PARAPET_H - STAIR_SOFFIT_Y;
const CHEEK_Y = (STAIR_PARAPET_H + STAIR_SOFFIT_Y) / 2;

/** Voile de tête : le fond de la volée, qui ferme le palier bas. */
const HEAD_T = STAIR_HALF_Z - STAIR_CLEAR_Z1;
const HEAD_Z = (STAIR_HALF_Z + STAIR_CLEAR_Z1) / 2;
/** Il déborde dans les joues, comme les joues débordent dans la dalle. */
const HEAD_HALF_X = STAIR_CLEAR_HALF_X + STAIR_LAP;

/** Le bloc de la volée mord d'un centimètre dans chaque joue. */
const FLIGHT_HALF_X = STAIR_CLEAR_HALF_X + 0.01;

/** Couronnement métallique posé sur les joues et sur le voile de tête. */
const CAP_Y = STAIR_PARAPET_H + 0.035;
const CAP_H = 0.07;
const CAP_W = CHEEK_T + 0.04;

/**
 * Marches. Chacune est un bloc plein, du giron à la sous-face commune, et
 * remonte de STAIR_LAP sous la marche précédente — sous la DALLE, pour la
 * première : c'est ce recouvrement qui masque le chant du percement côté
 * entrée, le seul des quatre que les joues et le voile de tête ne coiffent pas.
 */
const TREADS = Array.from({ length: STAIR_STEPS }, (_, i) => {
  const k = i + 1;
  const top = -k * STAIR_RISE;
  const z0 = NOSE + k * STAIR_GOING - STAIR_LAP;
  // La dernière se prolonge en palier bas, jusqu'au voile de tête.
  const z1 = k === STAIR_STEPS ? STAIR_OPENING_Z1 : NOSE + (k + 1) * STAIR_GOING;
  return {
    k,
    y: (top + STAIR_SOFFIT_Y) / 2,
    h: top - STAIR_SOFFIT_Y,
    z: (z0 + z1) / 2,
    d: z1 - z0,
  };
});

/**
 * Nez de marche antidérapants — la bande jaune de toute volée JR, et ce qui
 * fait qu'on LIT une volée au lieu d'y deviner un dégradé de gris.
 *
 * Le nez de la marche k est l'arête HAUTE de sa contremarche : il appartient
 * donc au giron PRÉCÉDENT, et le tout premier est peint sur la dalle du quai,
 * au ras du vide. Posé sur le giron de la marche k, il aurait été un cran trop
 * bas et un giron trop loin sur toute la volée.
 */
const NOSING_D = 0.07;
/** Retrait sur l'arête : sans lui, le chant du nez et celui de la
    contremarche étaient deux faces coplanaires sur toute la volée. */
const NOSING_SET = 0.005;
const NOSINGS = Array.from({ length: STAIR_STEPS }, (_, i) => {
  const k = i + 1;
  return {
    k,
    y: -(k - 1) * STAIR_RISE,
    z: NOSE + k * STAIR_GOING - NOSING_D / 2 - NOSING_SET,
  };
});

// --- La rampe : tout ce qui suit la pente --------------------------------
//
// La main courante descend AVEC les marches. Une rotation autour de x d'un
// angle POSITIF envoie +z vers le bas (three fait tourner y vers −z) : c'est
// exactement l'inverse de l'escalier mécanique voisin, qui monte vers +z et
// prend donc un angle négatif. Au mauvais signe, la main courante ressortait
// à soixante-quinze centimètres au-dessus du quai au pied de la volée, et
// s'enterrait d'un mètre trente sous les marches à son sommet.

/** Premier et dernier nez : les deux bouts de la partie rampante. */
const RAKE_T0 = STAIR_GOING;
const RAKE_T1 = STAIR_STEPS * STAIR_GOING;
const RAKE_ANGLE = Math.atan2(STAIR_RISE, STAIR_GOING);
const RAKE_LEN = ((RAKE_T1 - RAKE_T0) / STAIR_GOING) * Math.hypot(STAIR_GOING, STAIR_RISE);
const RAKE_MID_T = (RAKE_T0 + RAKE_T1) / 2;

/** Un point calé sur la pente, à `h` au-dessus de la ligne des nez. */
const onRake = (t: number, h: number): [number, number] => [stairPitchY(t) + h, NOSE + t];

const RAIL_X = STAIR_CLEAR_HALF_X - 0.06;
const RAIL_R = 0.024;
const [RAIL_TOP_Y, RAIL_TOP_Z] = onRake(RAKE_T0, STAIR_HANDRAIL_H);
const [RAIL_BOT_Y, RAIL_BOT_Z] = onRake(RAKE_T1, STAIR_HANDRAIL_H);
/**
 * Retours horizontaux. Une main courante ne s'arrête jamais dans le vide : au
 * sommet elle repart au-dessus du palier d'entrée, en bas elle accompagne
 * jusqu'au voile de tête. Sans eux, deux barres flottaient en biais dans la
 * trémie sans rien toucher à leurs extrémités.
 */
const RETURN_TOP_Z0 = NOSE + 0.07;
const RETURN_BOT_Z1 = STAIR_CLEAR_Z1 - 0.07;

/** Consoles : la main courante est vissée à la joue, pas suspendue. */
const BRACKET_X = (RAIL_X + STAIR_CLEAR_HALF_X) / 2;
const BRACKET_W = STAIR_CLEAR_HALF_X - RAIL_X + 0.02;
const BRACKETS = [1, 4, 7, 10].map((k) => onRake(k * STAIR_GOING, STAIR_HANDRAIL_H));

/**
 * Bandeau lumineux plaqué sur chaque joue, sous la main courante. C'est la
 * seule lumière propre de la trémie : sans lui, la volée n'est éclairée que
 * par le jour qui tombe du percement et devient un puits noir dès la sixième
 * marche — juste après l'endroit où le joueur s'arrête.
 */
const GLOW_LIFT = 0.34;
const [GLOW_Y, GLOW_Z] = onRake(RAKE_MID_T, GLOW_LIFT);

/**
 * Affiches sur les joues, calées SUR LA PENTE et non à hauteur fixe : la joue
 * s'enfonce de dix-sept centimètres par marche, une affiche posée à cote
 * constante finissait à moitié enterrée dans les girons.
 *
 * Elles se logent AU-DESSUS de la main courante, dans la moitié basse de la
 * volée : c'est la seule bande de joue assez haute pour les recevoir, et la
 * seule où elles ne traversent pas le bandeau lumineux. `lift` mesure, comme
 * partout ici, la hauteur au-dessus de la ligne des nez.
 */
const ADS = [
  { d: 1, t: 9 * STAIR_GOING, w: 1.06, h: 0.62, lift: 1.2 },
  { d: -1, t: 11.5 * STAIR_GOING, w: 0.72, h: 0.92, lift: 1.35 },
];

/** Caisson publicitaire plaqué sur la joue côté voie. */
const AD_BOX_X = STAIR_HALF_X - 0.01;
const AD_BOX_LEN = STAIR_HALF_Z * 2 - 0.3;

/** Panneau de sortie du palier bas, au fond de la volée. */
const EXIT_W = 1.6;
const EXIT_H = EXIT_W * (320 / 1024);
const EXIT_Y = STAIR_LANDING_Y + 1.12;

// --- Rendu ---------------------------------------------------------------

interface Props {
  place: { stairs: Placed[] };
  m: Mats;
  station: number;
}

/**
 * Les trémies d'une gare. Le panneau de sortie du fond est dessiné UNE FOIS et
 * partagé : il porte le nom de sortie de la gare courante, identique d'une
 * trémie à l'autre, et redessiner un canvas de mille pixels par trémie à
 * chaque arrêt n'aurait rien ajouté.
 */
export function Stairwells({ place, m, station }: Props) {
  const sign = useMemo(() => makeExitSign(0), []);
  const exitMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: sign.texture, toneMapped: false }),
    [sign],
  );
  useEffect(() => sign.redraw(station), [sign, station]);
  useEffect(
    () => () => {
      exitMat.dispose();
      sign.texture.dispose();
    },
    [exitMat, sign],
  );

  return (
    <>
      {place.stairs.map((s, i) => (
        <Stairwell key={`stair${i}`} s={s} m={m} station={station} exitMat={exitMat} />
      ))}
    </>
  );
}

function Stairwell({
  s,
  m,
  station,
  exitMat,
}: {
  s: Placed;
  m: Mats;
  station: number;
  exitMat: THREE.Material;
}) {
  return (
    <group name="trémie" position={[s.x, PLATFORM_TOP, s.z]}>
      {/* Volée : douze blocs pleins, du giron à la sous-face commune. Le
          dernier se prolonge en palier jusqu'au voile de tête. */}
      {TREADS.map((t) => (
        <mesh key={`t${t.k}`} position={[0, t.y, t.z]} material={m.stair} receiveShadow>
          <boxGeometry args={[FLIGHT_HALF_X * 2, t.h, t.d]} />
        </mesh>
      ))}
      {NOSINGS.map((n) => (
        <mesh key={`n${n.k}`} position={[0, n.y, n.z]} material={m.stairNose}>
          <boxGeometry args={[FLIGHT_HALF_X * 2 - 0.1, 0.012, NOSING_D]} />
        </mesh>
      ))}

      {/* Joues : garde-corps au-dessus de la dalle, voile de gaine dessous. */}
      {[-1, 1].map((d) => (
        <group key={`c${d}`}>
          <mesh position={[d * CHEEK_X, CHEEK_Y, 0]} material={m.wall}>
            <boxGeometry args={[CHEEK_T, CHEEK_H, STAIR_HALF_Z * 2]} />
          </mesh>
          <mesh position={[d * CHEEK_X, CAP_Y, 0]} material={m.metal}>
            <boxGeometry args={[CAP_W, CAP_H, STAIR_HALF_Z * 2]} />
          </mesh>

          {/* Main courante : partie rampante, puis les deux retours. */}
          <mesh
            position={[d * RAIL_X, ...onRake(RAKE_MID_T, STAIR_HANDRAIL_H)]}
            rotation={[Math.PI / 2 + RAKE_ANGLE, 0, 0]}
            material={m.metal}
          >
            <cylinderGeometry args={[RAIL_R, RAIL_R, RAKE_LEN, 8]} />
          </mesh>
          <mesh
            position={[d * RAIL_X, RAIL_TOP_Y, (RETURN_TOP_Z0 + RAIL_TOP_Z) / 2]}
            rotation={[Math.PI / 2, 0, 0]}
            material={m.metal}
          >
            <cylinderGeometry args={[RAIL_R, RAIL_R, RAIL_TOP_Z - RETURN_TOP_Z0, 8]} />
          </mesh>
          <mesh
            position={[d * RAIL_X, RAIL_BOT_Y, (RAIL_BOT_Z + RETURN_BOT_Z1) / 2]}
            rotation={[Math.PI / 2, 0, 0]}
            material={m.metal}
          >
            <cylinderGeometry args={[RAIL_R, RAIL_R, RETURN_BOT_Z1 - RAIL_BOT_Z, 8]} />
          </mesh>
          {[
            [RAIL_TOP_Y, RETURN_TOP_Z0 + 0.1] as const,
            ...BRACKETS,
            [RAIL_BOT_Y, RETURN_BOT_Z1 - 0.1] as const,
          ].map(([y, z], k) => (
            <mesh key={`b${k}`} position={[d * BRACKET_X, y, z]} material={m.metal}>
              <boxGeometry args={[BRACKET_W, 0.028, 0.05]} />
            </mesh>
          ))}

          {/* Bandeau lumineux, à la pente de la volée. */}
          <mesh
            position={[d * (STAIR_CLEAR_HALF_X - 0.02), GLOW_Y, GLOW_Z]}
            rotation={[RAKE_ANGLE, 0, 0]}
            material={m.lamp}
          >
            <boxGeometry args={[0.06, 0.055, RAKE_LEN - 0.2]} />
          </mesh>
        </group>
      ))}

      {/* Affiches de joue, calées sur la pente. */}
      {ADS.map((a, k) => {
        const [y, z] = onRake(a.t, a.lift);
        return (
          <mesh
            key={`ad${k}`}
            position={[a.d * (STAIR_CLEAR_HALF_X - 0.012), y, z]}
            rotation={[0, a.d === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={stationAd(station, k + 1, a.h > a.w)}
          >
            <planeGeometry args={[a.w, a.h]} />
          </mesh>
        );
      })}

      {/* Voile de tête : il ferme le palier bas et porte le fléchage de
          sortie, seule chose qu'on lise depuis le haut de la volée. */}
      <mesh position={[0, CHEEK_Y, HEAD_Z]} material={m.wall}>
        <boxGeometry args={[HEAD_HALF_X * 2, CHEEK_H, HEAD_T]} />
      </mesh>
      <mesh position={[0, CAP_Y, HEAD_Z]} material={m.metal}>
        <boxGeometry args={[HEAD_HALF_X * 2, CAP_H, HEAD_T + 0.04]} />
      </mesh>
      <mesh
        position={[0, EXIT_Y, STAIR_CLEAR_Z1 - 0.015]}
        rotation={[0, Math.PI, 0]}
        material={exitMat}
      >
        <planeGeometry args={[EXIT_W, EXIT_H]} />
      </mesh>

      {/* Caisson publicitaire plaqué sur la joue côté voie : sur un vrai quai
          c'est la surface la plus rentable d'une trémie, et elle est en plein
          dans le champ de quiconque marche le long du quai. */}
      <mesh position={[-AD_BOX_X, 0.53, 0]} material={m.frame}>
        <boxGeometry args={[0.06, 0.86, AD_BOX_LEN]} />
      </mesh>
      <mesh
        position={[-(AD_BOX_X + 0.036), 0.53, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        material={stationAd(station, 5)}
      >
        <planeGeometry args={[AD_BOX_LEN - 0.12, 0.76]} />
      </mesh>
    </group>
  );
}
