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
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { CLOSE_ANNOUNCE_LEAD, dwellDuration } from '../systems/stationCycle';
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
  drawBackpackManner,
  drawDelayCert,
  drawDoorClosing,
  drawApproach,
  drawEmergencyInfo,
  drawHeadphoneManner,
  drawLeftAd,
  drawLineStatus,
  drawLoopMap,
  drawNextStationLang,
  drawOutageInfo,
  drawPhoneManner,
  drawPriorityNotice,
  drawRoute,
  drawSafetyNotice,
  drawTrafficInfo,
  drawTransfers,
  fmtClock,
  makeScreen,
  secondsToArrival,
  trafficNotice,
  type ScreenStatus,
} from './lineScreen';

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

    acc.current += dt;
    if (acc.current < ANIM_PERIOD) return;
    acc.current = 0;
    // Horloge d'animation : elle avance d'une phase à chaque réveil, et c'est
    // ELLE qui rythme les vantaux du plan de quai et le clignotement des
    // repères de position. Elle entre dans la clé de redessin, sinon rien ne
    // bougerait tant que la minute affichée reste la même.
    animPhase.current = (animPhase.current + 1) % ANIM_PHASES;
    const anim = animPhase.current;
    const { index, phase, doorSide, loopDirection } = useStore.getState();

    // Écran gauche : une pub toutes les ~15 s, boucle de AD_LOOP_COUNT spots.
    const adSeed = AD_LOOP_FIRST_SEED + (Math.floor(runtime.clockMin * 4) % AD_LOOP_COUNT);
    if (adSeed !== lastAd.current) {
      lastAd.current = adSeed;
      drawLeftAd(left, adSeed);
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

    // Écran droit : machine à états calée sur la phase du cycle.
    //
    //  à quai      → ただいま, plans jp/en, écrans zh/ko et plan du quai,
    //                puis avertissement de FERMETURE DES PORTES en toute fin
    //                d'arrêt ;
    //  en route    → つぎは, cycle quadrilingue complet, correspondances,
    //                écrans de courtoisie et manières ; si une AUTRE ligne
    //                est perturbée : info trafic, état des lignes et
    //                certificat de retard ;
    //  à l'approche→ まもなく, côté d'ouverture, alterné avec le plan du quai.
    //
    // L'arrêt d'urgence (急停車) est un événement RÉEL de la simulation
    // (stationCycle) : quand il est actif, l'écran rouge remplace toute la
    // rotation, en alternance JP/EN. La coupure de caténaire a son propre
    // écran rouge, qu'on ne voit qu'au retour de la tension - pendant la
    // coupure, la dalle est simplement éteinte et rien n'est dessiné.
    //
    // Les autres états dégradés de la propre ligne (retard persistant,
    // interruption planifiée) restent non rendus : la simulation n'a pas ces
    // incidents, les afficher serait annoncer au voyageur quelque chose qui
    // n'arrive pas.
    const tick = Math.floor(runtime.clockMin * 4);
    const clock = fmtClock(runtime.clockMin);
    const countdown = Math.round(secondsToArrival(phase, runtime.phaseT, index, loopDirection));

    const notice = trafficNotice(runtime.clockMin);
    // Visuel manières du moment : change d'un passage du cycle à l'autre.
    const mannerVariant = Math.floor(tick / 10) % 3;
    const emergency = runtime.emergencyStop;
    let state: string;
    let status: ScreenStatus;
    if (emergency.stage !== 'none') {
      status = 'next';
      // Une coupure et un coup de frein ne s'affichent pas de la même façon -
      // et surtout, la coupure ne s'affiche qu'une fois le courant revenu,
      // puisque avant cela on n'est même pas arrivé jusqu'ici.
      const kind = emergency.kind === 'outage' ? 'outage' : 'emergency';
      state = tick % 2 === 0 ? `${kind}JP` : `${kind}EN`;
    } else if (phase === 'brake') {
      status = 'soon';
      // À l'approche, l'écran ne montre QUE le plan du quai, et il alterne
      // ses deux moitiés basses : avis d'ouverture des portes en japonais,
      // correspondances en anglais - c'est le cycle du vrai afficheur.
      state = tick % 2 === 0 ? 'approachJP' : 'approachEN';
    } else if (phase === 'dwell') {
      status = 'now';
      // L'écran passe au pictogramme « portes qui ferment » avec l'annonce.
      state =
        runtime.phaseT >= dwellDuration(index) - CLOSE_ANNOUNCE_LEAD
          ? 'doorClosing'
          : ['loopJP', 'loopEN', 'nextZH', 'nextKO', 'zoomJP', 'zoomEN', 'approachEN'][tick % 7];
    } else {
      status = 'next';
      const rotation = notice
        ? [
            'loopJP', 'zoomJP', 'nextZH', 'nextKO', 'transfers',
            'trafficJP', 'statusJP', 'certJP',
            'loopEN', 'zoomEN',
            'trafficEN', 'statusEN', 'certEN',
            'priority', 'zoomJP', 'manner', 'loopJP', 'safety',
          ]
        : [
            'loopJP', 'zoomJP', 'nextZH', 'nextKO', 'transfers',
            'loopEN', 'zoomEN', 'priority', 'zoomJP', 'manner', 'loopJP', 'safety',
          ];
      state = rotation[tick % rotation.length];
    }

    // Les états animés (plan du quai, plans de ligne) entrent dans la clé avec
    // leur phase : eux seuls se redessinent à chaque battement, les écrans
    // fixes gardent leur texture tant que rien d'autre ne change.
    const animated = state.startsWith('approach') || state.startsWith('loop') || state.startsWith('zoom');
    const key = `${index}|${phase}|${state}|${mannerVariant}|${clock}|${doorSide}|${animated ? anim : 0}|${state.startsWith('loop') || state.startsWith('zoom') ? countdown : 0}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    for (const [side, screen] of [
      [1, rightA],
      [-1, rightB],
    ] as const) {
      const g = screen;
      switch (state) {
        case 'approachJP':
          drawApproach(g, index, clock, 'jp', doorSide === side, loopDirection, anim);
          break;
        case 'approachEN':
          drawApproach(g, index, clock, 'en', doorSide === side, loopDirection, anim);
          break;
        case 'doorClosing':
          drawDoorClosing(g, index, clock, loopDirection);
          break;
        case 'transfers':
          drawTransfers(g, index, clock, loopDirection);
          break;
        case 'priority':
          drawPriorityNotice(g, index, clock, loopDirection);
          break;
        case 'safety':
          drawSafetyNotice(g, index, clock, loopDirection);
          break;
        case 'manner':
          [drawPhoneManner, drawBackpackManner, drawHeadphoneManner][mannerVariant](g, index, clock, loopDirection);
          break;
        case 'nextZH':
          drawNextStationLang(g, index, clock, status, 'zh', loopDirection);
          break;
        case 'nextKO':
          drawNextStationLang(g, index, clock, status, 'ko', loopDirection);
          break;
        case 'trafficJP':
          if (notice) drawTrafficInfo(g, index, clock, 'jp', notice, loopDirection);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'jp', loopDirection, anim);
          break;
        case 'trafficEN':
          if (notice) drawTrafficInfo(g, index, clock, 'en', notice, loopDirection);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'en', loopDirection, anim);
          break;
        case 'statusJP':
          if (notice) drawLineStatus(g, index, clock, 'jp', notice, loopDirection);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'jp', loopDirection, anim);
          break;
        case 'statusEN':
          if (notice) drawLineStatus(g, index, clock, 'en', notice, loopDirection);
          else drawLoopMap(g, index, phase, countdown, clock, status, 'en', loopDirection, anim);
          break;
        case 'certJP':
          drawDelayCert(g, index, clock, 'jp', loopDirection);
          break;
        case 'certEN':
          drawDelayCert(g, index, clock, 'en', loopDirection);
          break;
        case 'emergencyJP':
          drawEmergencyInfo(g, index, clock, 'jp', emergency.reason, loopDirection);
          break;
        case 'emergencyEN':
          drawEmergencyInfo(g, index, clock, 'en', emergency.reason, loopDirection);
          break;
        case 'outageJP':
          drawOutageInfo(g, index, clock, 'jp', loopDirection);
          break;
        case 'outageEN':
          drawOutageInfo(g, index, clock, 'en', loopDirection);
          break;
        case 'loopJP':
          drawLoopMap(g, index, phase, countdown, clock, status, 'jp', loopDirection, anim);
          break;
        case 'loopEN':
          drawLoopMap(g, index, phase, countdown, clock, status, 'en', loopDirection, anim);
          break;
        case 'zoomEN':
          drawRoute(g, index, phase, countdown, clock, status, 'en', loopDirection, anim);
          break;
        default:
          drawRoute(g, index, phase, countdown, clock, status, 'jp', loopDirection, anim);
      }
      g.texture.needsUpdate = true;
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


