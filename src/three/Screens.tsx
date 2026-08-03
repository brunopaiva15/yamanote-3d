// Doubles écrans LCD au-dessus des portes (E235) : écran gauche = publicités
// en boucle (comme dans les vraies rames, il n'affiche jamais la prochaine
// station), écran droit = écran de ligne fidèle au vrai afficheur JR East.
//
// Ce fichier ne peint rien : il tient la machine à états du cycle, la coupure
// d'alimentation des dalles et les maillages. Toute la peinture est dans
// `lineScreen.ts`. Deux CanvasTexture partagées, redessinées uniquement aux
// changements.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { runtime } from '../systems/runtime';
import {
  ANIM_PERIOD,
  ANIM_PHASES,
  AD_LOOP_COUNT,
  AD_LOOP_FIRST_SEED,
  END_AD_COUNT,
  END_AD_FIRST_SEED,
  LCD_CUTOFF,
  LCD_READY,
  SCREEN_H,
  SCREEN_W,
} from './lineScreen';
import {
  MOTION_STEP,
  bandFills,
  lineScreenFrame,
  lineScreenKey,
  lineScreenPageKey,
  newScreenAnim,
  paintLineScreen,
  resetScreenAnim,
  stepScreenAnim,
} from './lineScreenCycle';
import { paintBlended } from './screenFade';
import { makeScreen } from './screenSurface';
import { WEATHER_EVERY, drawLeftAd, drawWeatherPanel, tomorrowDayOf } from './adScreen';
import { forecastSlots } from '../systems/weather';
import { tokyoForecastSlots } from '../systems/tokyoForecast';

export function Screens() {
  const left = useMemo(() => makeScreen(512, 288), []);
  // DEUX canevas pour l'écran de droite : à l'approche, chaque paroi indique
  // si les portes qui s'ouvrent sont de SON côté. C'est la seule vue qui
  // diffère physiquement d'un côté à l'autre de la rame.
  const rightA = useMemo(() => makeScreen(SCREEN_W, SCREEN_H), []);
  const rightB = useMemo(() => makeScreen(SCREEN_W, SCREEN_H), []);
  // Dalle des abouts : une seule texture pour les deux extrémités, on n'en voit
  // jamais deux à la fois de près.
  const end = useMemo(() => makeScreen(512, 288), []);
  const lastKey = useRef('');
  const lastAd = useRef(-1);
  const lastEndAd = useRef(-1);
  const acc = useRef(0);
  /** Phase courante de l'animation des écrans (vantaux, repères clignotants). */
  const animPhase = useRef(0);
  /** Fondu enchaîné et remplissage du ruban : voir `three/lineScreenAnim`. */
  const motion = useRef(newScreenAnim());
  /** Temps accumulé depuis le dernier pas de l'écran droit. */
  const stepAcc = useRef(0);
  /** Quelque chose bougeait au pas précédent : il faut une dernière image. */
  const wasMoving = useRef(false);
  /** Vrai tant que les dalles sont éteintes : sert à forcer le redessin au retour. */
  const wasDark = useRef(false);
  /** Vrai quand les canevas ont déjà été peints en noir pour le redémarrage. */
  const blanked = useRef(false);

  const leftMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: left.texture, toneMapped: false }),
    [left.texture],
  );
  const rightMatA = useMemo(
    () => new THREE.MeshBasicMaterial({ map: rightA.texture, toneMapped: false }),
    [rightA.texture],
  );
  const rightMatB = useMemo(
    () => new THREE.MeshBasicMaterial({ map: rightB.texture, toneMapped: false }),
    [rightB.texture],
  );
  const endMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: end.texture, toneMapped: false }),
    [end.texture],
  );

  useFrame((_, dt) => {
    // Une dalle LCD n'a pas de demi-teinte : son rétroéclairage tient ou il ne
    // tient pas. Sous le seuil le panneau est NOIR - pas gris, pas en veille :
    // éteint. C'est pour ça que le niveau est une MARCHE et non une rampe, et
    // c'est ce qui rend le décrochage lisible : les tubes du plafond
    // s'affaissent progressivement pendant que les écrans, eux, claquent.
    const power = runtime.carPower;
    const lit = power > LCD_CUTOFF ? 1 : 0;
    leftMat.color.setScalar(lit);
    rightMatA.color.setScalar(lit);
    rightMatB.color.setScalar(lit);
    endMat.color.setScalar(lit);
    if (power <= LCD_CUTOFF) {
      wasDark.current = true;
      // La dalle éteinte n'est pas une page : au retour, l'image doit revenir
      // d'un coup et non monter en fondu depuis le noir.
      resetScreenAnim(motion.current);
      return;
    }

    // Le rétroéclairage est revenu, l'image pas encore. Une dalle ne rallume
    // pas son contenu : elle rallume sa lampe, et le contrôleur redémarre
    // derrière. Tant que la tension n'est pas franchement établie, on peint
    // donc du noir - sinon chaque battement de contacteur ferait réapparaître,
    // le temps d'un éclat, l'image d'avant la coupure.
    if (wasDark.current) {
      if (power < LCD_READY) {
        if (!blanked.current) {
          blanked.current = true;
          for (const s of [left, rightA, rightB, end]) {
            s.g.fillStyle = '#05070a';
            s.g.fillRect(0, 0, s.w, s.h);
            s.texture.needsUpdate = true;
          }
        }
        return;
      }
      // Tension établie : le contrôleur repart et redessine tout.
      wasDark.current = false;
      blanked.current = false;
      lastKey.current = '';
      lastAd.current = -1;
      lastEndAd.current = -1;
      // Le contenu n'arrive pas avec la lumière : on laisse au panneau son
      // quart de seconde d'amorçage, dalle noire allumée.
      acc.current = 0;
      return;
    }

    // Le BATTEMENT de la rame : une demi-seconde. Il rythme les vantaux du plan
    // de quai, le clignotement des repères de position et la boucle
    // publicitaire - tout ce qui, sur la rame, avance par crans.
    acc.current += dt;
    const beat = acc.current >= ANIM_PERIOD;
    if (beat) {
      acc.current = 0;
      // Horloge d'animation : elle avance d'une phase à chaque réveil. Elle
      // entre dans la clé de redessin, sinon rien ne bougerait tant que la
      // minute affichée reste la même.
      animPhase.current = (animPhase.current + 1) % ANIM_PHASES;
    }
    const anim = animPhase.current;

    if (beat) {
      // Écran gauche : une pub toutes les ~15 s, boucle de AD_LOOP_COUNT spots -
      // et, un passage sur WEATHER_EVERY, le bulletin de la chaîne de bord à la
      // place du spot. C'est la seule chose que cet écran dise de vrai, et la
      // seule qu'on puisse aller vérifier par la fenêtre.
      const adSeed = AD_LOOP_FIRST_SEED + (Math.floor(runtime.clockMin * 4) % AD_LOOP_COUNT);
      if (adSeed !== lastAd.current) {
        lastAd.current = adSeed;
        if ((adSeed - AD_LOOP_FIRST_SEED) % WEATHER_EVERY === 0) {
          // Réel si la journée jouée a eu lieu, plausible sinon : le modèle du
          // jeu prend le relais pour les dates à venir.
          const slots = tokyoForecastSlots(6) ?? forecastSlots(6);
          const d = runtime.tokyoDate;
          drawWeatherPanel(left, slots, d, tomorrowDayOf(d));
        } else {
          drawLeftAd(left, adSeed);
        }
        left.texture.needsUpdate = true;
      }

      // Dalles des abouts : même boucle publicitaire, mais décalée d'un tiers de
      // spot pour qu'elles ne basculent pas en même temps que celles des portes.
      const endSeed = END_AD_FIRST_SEED + (Math.floor(runtime.clockMin * 4 + 2) % END_AD_COUNT);
      if (endSeed !== lastEndAd.current) {
        lastEndAd.current = endSeed;
        drawLeftAd(end, endSeed);
        end.texture.needsUpdate = true;
      }
    }

    // Écran droit : il a son PROPRE pas, plus fin que le battement.
    //
    // Le fondu d'une page à la suivante dure un dixième de seconde et le vert
    // met une seconde à remonter la bande : à un réveil toutes les demi-
    // secondes, le premier serait une coupure et le second un escalier de deux
    // marches. On repeint donc jusqu'à MOTION_STEP tant que quelque chose bouge
    // - et pas une image de plus : hors de ces deux animations, la dalle
    // retrouve exactement le battement d'avant.
    stepAcc.current += dt;
    if (!beat && (!wasMoving.current || stepAcc.current < MOTION_STEP)) return;
    const stepDt = stepAcc.current;
    stepAcc.current = 0;

    // Ce qui est à l'antenne vient de la rotation partagée
    // (three/lineScreenCycle), que la version sonore du jeu lit aussi. Les
    // deux afficheurs montrent donc le même écran au même moment - c'est le
    // même équipement de bord, regardé de deux endroits.
    const frame = lineScreenFrame();
    const page = `${lineScreenPageKey(frame, 1)}||${lineScreenPageKey(frame, -1)}`;
    const step = stepScreenAnim(motion.current, page, bandFills(frame.state), stepDt);
    // Une image de plus APRÈS la fin d'une animation : celle qui pose le ruban
    // plein. Sans elle, la dernière image peinte serait celle d'avant le
    // dernier pas, et la bande s'arrêterait à un cheveu de son bout.
    const moving = step.busy || wasMoving.current;
    wasMoving.current = step.busy;

    // Les états animés (plan du quai, plans de ligne) entrent dans la clé avec
    // leur phase : eux seuls se redessinent à chaque battement, les écrans
    // fixes gardent leur texture tant que rien d'autre ne change. La clé porte
    // le côté, parce que le plan du quai n'est pas le même des deux parois.
    const key = `${lineScreenKey(frame, anim, 1)}||${lineScreenKey(frame, anim, -1)}`;
    if (key === lastKey.current && !moving) return;
    lastKey.current = key;

    for (const [side, screen] of [
      [1, rightA],
      [-1, rightB],
    ] as const) {
      paintBlended(screen, step.blend, (surface) =>
        paintLineScreen(surface, frame, anim, side, step.fill),
      );
      screen.texture.needsUpdate = true;
    }
  });

  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1b1f24', roughness: 0.45 }), []);
  const surroundMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#eeece6', roughness: 0.62, metalness: 0.02 }),
    [],
  );

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <group
            key={`scr${s}-${z}`}
            position={[s * (CONFIG.carHalfWidth - 0.05), 2.11, z]}
            rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            {/* Grand panneau blanc de propreté au-dessus de la porte : sur la
                rame les dalles ne sont pas posées sur la paroi, elles y sont
                ENCASTRÉES, avec de la réserve blanche tout autour. */}
            <mesh position={[0, 0, -0.035]} material={surroundMat}>
              <boxGeometry args={[1.36, 0.5, 0.07]} />
            </mesh>
            {/* Deux dalles en retrait dans le panneau, chacune dans sa feuillure.
                Format 16:9 : ce sont deux dalles de télévision, pas deux
                panoramiques - la proportion 0,58 × 0,326 est celle des
                captures de l'afficheur réel, et c'est elle qui décide si le
                contenu dessiné dessus est à l'échelle ou étiré. */}
            {([-1, 1] as const).map((k) => (
              <group key={`half${k}`} position={[k * 0.335, 0, 0]}>
                <mesh position={[0, 0, -0.012]} material={frameMat}>
                  <boxGeometry args={[0.62, 0.366, 0.03]} />
                </mesh>
                <mesh position={[0, 0, 0.004]} material={k === -1 ? leftMat : s === 1 ? rightMatA : rightMatB}>
                  <planeGeometry args={[0.58, 0.32625]} />
                </mesh>
              </group>
            ))}
          </group>
        )),
      )}

      {/* Dalle unique au-dessus de la porte d'intercirculation, aux deux
          abouts du wagon : c'est l'écran qu'on a en face de soi quand on est
          adossé à la paroi d'about, et le seul qu'on voie depuis le fond de la
          travée prioritaire. Format 16:9, encastré dans l'imposte rose.

          Le groupe est décalé d'un centimètre EN AVANT de la face intérieure de
          l'imposte (à ±0,045 du plan d'about), comme les dalles des portes le
          sont de leur paroi. Posé à 0,045 pile, le panneau blanc et l'imposte
          se partageaient exactement le même plan : les deux surfaces se
          disputaient le pixel et la bordure scintillait. */}
      {sides.map((e) => (
        <group
          key={`endscr${e}`}
          position={[0, 2.12, e * (CONFIG.carHalfLength - 0.055)]}
          rotation={[0, e === 1 ? Math.PI : 0, 0]}
        >
          <mesh position={[0, 0, -0.032]} material={surroundMat}>
            <boxGeometry args={[0.68, 0.4, 0.064]} />
          </mesh>
          <mesh position={[0, 0, -0.012]} material={frameMat}>
            <boxGeometry args={[0.6, 0.345, 0.03]} />
          </mesh>
          <mesh position={[0, 0, 0.004]} material={endMat}>
            <planeGeometry args={[0.56, 0.315]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}


