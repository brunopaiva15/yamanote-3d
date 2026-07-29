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
  STAIR_LINTEL_Y,
  STAIR_LOWER_CEIL_Y,
  STAIR_LOWER_END,
  STAIR_LOWER_HALF_X,
  STAIR_LOWER_STEPS,
  STAIR_LOWER_Y,
  STAIR_LOWER_Z0,
  STAIR_LOWER_Z1,
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
const CHEEK_BOTTOM = STAIR_LOWER_Y - 0.3;
const CHEEK_H = STAIR_PARAPET_H - CHEEK_BOTTOM;
const CHEEK_Y = (STAIR_PARAPET_H + CHEEK_BOTTOM) / 2;

/**
 * Voile de tête. Ce n'est plus un fond : c'est un LINTEAU. Il coiffe le chant
 * du percement et porte le garde-corps, mais il s'arrête à la sous-face de la
 * dalle — dessous, la volée continue vers le niveau inférieur.
 */
const HEAD_T = STAIR_HALF_Z - STAIR_CLEAR_Z1;
const HEAD_Z = (STAIR_HALF_Z + STAIR_CLEAR_Z1) / 2;
/** Il déborde dans les joues, comme les joues débordent dans la dalle. */
const HEAD_HALF_X = STAIR_CLEAR_HALF_X + STAIR_LAP;
const HEAD_H = STAIR_PARAPET_H - STAIR_LINTEL_Y;
const HEAD_Y = (STAIR_PARAPET_H + STAIR_LINTEL_Y) / 2;

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
  // La dernière se prolonge en palier de mi-étage, sous le linteau, jusqu'au
  // nez de la seconde volée : sans quoi le sol s'interrompait sur trente
  // centimètres pile là où l'on passe d'une volée à l'autre.
  const z1 =
    k === STAIR_STEPS ? STAIR_LOWER_Z0 + STAIR_GOING : NOSE + (k + 1) * STAIR_GOING;
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
const NOSING_D_HALF = NOSING_D / 2 + NOSING_SET;
const NOSINGS = Array.from({ length: STAIR_STEPS }, (_, i) => {
  const k = i + 1;
  return {
    k,
    y: -(k - 1) * STAIR_RISE,
    z: NOSE + k * STAIR_GOING - NOSING_D_HALF,
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
const BRACKETS = [1, 4, 7, 10, 13].map((k) => onRake(k * STAIR_GOING, STAIR_HANDRAIL_H));

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

/**
 * Fléchage de sortie, posé sur le linteau AU-DESSUS du passage, comme au-dessus
 * de n'importe quelle porte. Suspendu dans la cage, il pendait à un mètre du
 * sol de la volée : on ne passait pas dessous, et il masquait précisément la
 * seule ouverture par laquelle on aperçoit le niveau inférieur. Au-dessus du
 * niveau du quai, il ne coûte plus un centimètre de hauteur libre et se lit
 * toujours de tout le haut de la volée.
 */
const EXIT_W = 1.5;
const EXIT_H = EXIT_W * (320 / 1024);
const EXIT_Y = 0.36;
const EXIT_Z = STAIR_CLEAR_Z1 - 0.035;

// --- Le niveau inférieur -------------------------------------------------

/**
 * Couloir : parois, plafond, fond. Elles prennent le relais des joues EXACTEMENT
 * là où celles-ci s'arrêtent — bout à bout, jamais à cheval : deux nus communs
 * sur dix-huit centimètres de recouvrement, et le passage se serait bordé du
 * même liseré clignotant que la trémie avant qu'on la refasse.
 */
const LOWER_WALL_T = 0.2;
const LOWER_WALL_X = STAIR_LOWER_HALF_X + LOWER_WALL_T / 2;
const LOWER_BOTTOM = STAIR_LOWER_Y - 0.3;
const LOWER_H = STAIR_LOWER_CEIL_Y - LOWER_BOTTOM;
const LOWER_Y = (STAIR_LOWER_CEIL_Y + LOWER_BOTTOM) / 2;
const LOWER_Z0 = STAIR_HALF_Z;
const LOWER_MID_Z = (LOWER_Z0 + STAIR_LOWER_END) / 2;
const LOWER_LEN = STAIR_LOWER_END - LOWER_Z0;

/** Seconde volée : mêmes blocs pleins, sous la dalle du quai. */
const LOWER_TREADS = Array.from({ length: STAIR_LOWER_STEPS }, (_, i) => {
  const k = i + 1;
  const top = STAIR_LANDING_Y - k * STAIR_RISE;
  const z0 = STAIR_LOWER_Z0 + k * STAIR_GOING - STAIR_LAP;
  const z1 =
    k === STAIR_LOWER_STEPS ? STAIR_LOWER_END : STAIR_LOWER_Z0 + (k + 1) * STAIR_GOING;
  return {
    k,
    y: (top + LOWER_BOTTOM) / 2,
    h: top - LOWER_BOTTOM,
    z: (z0 + z1) / 2,
    d: z1 - z0,
    noseY: top + STAIR_RISE,
    noseZ: STAIR_LOWER_Z0 + k * STAIR_GOING - NOSING_D_HALF,
  };
});


/**
 * Caissons publicitaires du couloir : ce qui dit « gare » et pas « tunnel ».
 *
 * Une ligne de portillons faisait le même office, mais aucune vraie gare n'en
 * pose au pied des marches — on descend, on marche, et les portillons sont
 * bien plus loin, hors de tout ce qu'on peut voir d'ici. Un couloir de
 * correspondance, lui, est bordé de caissons rétroéclairés, et ceux-là tombent
 * pile dans la bande visible.
 *
 * Cette bande est étroite et se referme vite : depuis le haut de la volée, le
 * rayon rasant part de la sous-face du linteau et rejoint le sol vers neuf
 * mètres. Les caissons se tiennent donc à hauteur d'affiche — un mètre du sol —
 * et pas plus loin que sept.
 */
const AD_LOW = [
  { d: 1, z: STAIR_LOWER_Z1 + 0.55, w: 1.3, h: 0.9 },
  { d: -1, z: STAIR_LOWER_Z1 + 2.05, w: 1.3, h: 0.9 },
];
const AD_LOW_Y = STAIR_LOWER_Y + 1.02;

// --- Rendu ---------------------------------------------------------------

interface Props {
  place: { stairs: Placed[] };
  m: Mats;
  station: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
}

/**
 * Les trémies d'une gare. Le panneau de sortie du fond est dessiné UNE FOIS et
 * partagé : il porte le nom de sortie de la gare courante, identique d'une
 * trémie à l'autre, et redessiner un canvas de mille pixels par trémie à
 * chaque arrêt n'aurait rien ajouté.
 */
export function Stairwells({ place, m, station, detail }: Props) {
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
        <Stairwell
          key={`stair${i}`}
          s={s}
          m={m}
          station={station}
          exitMat={exitMat}
          detail={detail}
        />
      ))}
    </>
  );
}

function Stairwell({
  s,
  m,
  station,
  exitMat,
  detail,
}: {
  s: Placed;
  m: Mats;
  station: number;
  exitMat: THREE.Material;
  detail: number;
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

      {/* Linteau : il coiffe le chant du percement et porte le garde-corps,
          mais il s'arrête à la sous-face de la dalle. Dessous, on passe. */}
      <mesh position={[0, HEAD_Y, HEAD_Z]} material={m.wall}>
        <boxGeometry args={[HEAD_HALF_X * 2, HEAD_H, HEAD_T]} />
      </mesh>
      <mesh position={[0, CAP_Y, HEAD_Z]} material={m.metal}>
        <boxGeometry args={[HEAD_HALF_X * 2, CAP_H, HEAD_T + 0.04]} />
      </mesh>

      {/* Fléchage de sortie, sur le linteau au-dessus du passage. */}
      <mesh position={[0, EXIT_Y, EXIT_Z]} material={m.frame}>
        <boxGeometry args={[EXIT_W + 0.06, EXIT_H + 0.06, 0.07]} />
      </mesh>
      <mesh position={[0, EXIT_Y, EXIT_Z - 0.041]} rotation={[0, Math.PI, 0]} material={exitMat}>
        <planeGeometry args={[EXIT_W, EXIT_H]} />
      </mesh>

      {/* Le niveau inférieur est un fond de champ, pas une structure : c'est
          la première chose qui saute sur une machine à la peine. */}
      {detail <= 1 && <LowerLevel m={m} station={station} />}

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

/**
 * Ce qu'il y a EN DESSOUS, et qu'on ne fera qu'apercevoir.
 *
 * Seconde volée, couloir, ligne de portillons : rien n'est praticable, rien
 * n'est éclairé par le jour, et la dalle du quai en coupe les trois quarts.
 * C'est pourtant ce fond de champ qui décide si la trémie est une descente
 * vers une gare ou un trou de deux mètres bouché par une cloison.
 *
 * Tout se tient BAS : depuis le haut de la volée, le rayon rasant part de la
 * sous-face du linteau et descend d'un demi-mètre par mètre. À sept mètres il
 * a rejoint le sol, et ce qui est au-dessus n'existe plus pour personne.
 */
function LowerLevel({ m, station }: { m: Mats; station: number }) {
  return (
    <group>
      {/* Seconde volée, et ses nez — c'est par eux qu'on la lit dans le noir. */}
      {LOWER_TREADS.map((t) => (
        <group key={`lt${t.k}`}>
          <mesh position={[0, t.y, t.z]} material={m.stair}>
            <boxGeometry args={[FLIGHT_HALF_X * 2, t.h, t.d]} />
          </mesh>
          <mesh position={[0, t.noseY, t.noseZ]} material={m.stairNose}>
            <boxGeometry args={[FLIGHT_HALF_X * 2 - 0.1, 0.012, NOSING_D]} />
          </mesh>
        </group>
      ))}

      {/* Parois, plafond et fond du couloir : le volume est clos, sinon on
          verrait le vide par-dessous la dalle. */}
      {[-1, 1].map((d) => (
        <mesh key={`lw${d}`} position={[d * LOWER_WALL_X, LOWER_Y, LOWER_MID_Z]} material={m.wall}>
          <boxGeometry args={[LOWER_WALL_T, LOWER_H, LOWER_LEN]} />
        </mesh>
      ))}
      {/* Soubassement de faïence, le seul rappel de couleur du niveau bas. */}
      {[-1, 1].map((d) => (
        <mesh
          key={`ld${d}`}
          position={[d * (STAIR_LOWER_HALF_X - 0.02), STAIR_LOWER_Y + 0.55, LOWER_MID_Z]}
          material={m.tile}
        >
          <boxGeometry args={[0.05, 1.1, LOWER_LEN]} />
        </mesh>
      ))}
      <mesh position={[0, STAIR_LOWER_CEIL_Y - 0.05, LOWER_MID_Z]} material={m.wallDark}>
        <boxGeometry args={[LOWER_WALL_X * 2, 0.1, LOWER_LEN]} />
      </mesh>
      <mesh
        position={[0, LOWER_Y, STAIR_LOWER_END + 0.1]}
        material={m.wall}
      >
        <boxGeometry args={[LOWER_WALL_X * 2, LOWER_H, 0.2]} />
      </mesh>

      {/* Caissons rétroéclairés sur les parois : la seule lumière du couloir
          qui tombe dans la bande visible — une réglette de plafond, à trois
          mètres du sol, est coupée par la dalle avant d'atteindre l'œil. */}
      {AD_LOW.map((a, k) => (
        <group key={`la${k}`}>
          <mesh
            position={[a.d * (STAIR_LOWER_HALF_X - 0.03), AD_LOW_Y, a.z]}
            material={m.metal}
          >
            <boxGeometry args={[0.06, a.h + 0.1, a.w + 0.1]} />
          </mesh>
          <mesh
            position={[a.d * (STAIR_LOWER_HALF_X - 0.065), AD_LOW_Y, a.z]}
            rotation={[0, a.d === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
            material={stationAd(station, k + 7)}
          >
            <planeGeometry args={[a.w, a.h]} />
          </mesh>
        </group>
      ))}

      {/* Ligne de guidage peinte, dans l'axe du couloir. */}
      <mesh
        position={[0, STAIR_LOWER_Y + 0.008, (STAIR_LOWER_Z1 + STAIR_LOWER_END) / 2]}
        material={m.accent}
      >
        <boxGeometry args={[0.22, 0.016, STAIR_LOWER_END - STAIR_LOWER_Z1]} />
      </mesh>

    </group>
  );
}
