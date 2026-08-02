// Quand peut-on dire qu'un moteur est prêt ?
//
// Pas quand le paquet est téléchargé : la scène n'existe pas encore. Pas quand
// la scène est construite : les textures se peignent encore au canevas et, en
// WebGPU, les nuanceurs se compilent. Pas même à la première image dessinée -
// au premier essai, ce composant rendait la main après trois images, soit au
// bout de 113 ms, alors que la plus grosse interruption du démarrage - onze
// secondes d'affilée - arrivait douze secondes PLUS TARD. Le voile se levait
// avant la course et le joueur regardait un écran figé.
//
// Le seul critère qui ne mente pas est celui qu'on cherchait vraiment : le jeu
// TOURNE. On attend donc quelques images d'affilée dont l'intervalle est
// raisonnable. Une gare qui se construit, un nuanceur qui se compile ou une
// texture qu'on peint au canevas bloquent le fil principal ; l'image suivante
// arrive avec un intervalle énorme, et le compte repart à zéro.
//
// Corollaire commode : pendant qu'un blocage dure, le navigateur ne repeint
// rien. Ce qui reste à l'écran est donc la dernière image peinte - le voile,
// s'il est encore là. Il suffit de ne pas l'avoir levé trop tôt.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { endRenderBoot } from '../systems/renderBoot';
import { markRenderAlive } from '../systems/renderHealth';

/**
 * Intervalle au-delà duquel une image ne compte pas comme « le jeu tourne »
 * (s). Quatre images par seconde : c'est bas, et c'est voulu - le seuil est là
 * pour repérer un BLOCAGE d'une demi-seconde ou plus, pas pour juger de la
 * fluidité sur une machine modeste.
 */
const SMOOTH_DT = 0.25;
/** Images consécutives sous ce seuil avant de rendre la main. */
const CALM_FRAMES = 6;
/**
 * Durée minimale d'affichage du voile (ms).
 *
 * Sans elle, six images bon marché rendues avant que la scène ne soit vraiment
 * peuplée suffisent à lever le voile, et il clignote. Quatre dixièmes de
 * seconde : assez pour que la première image RÉELLE ait eu lieu, trop peu pour
 * qu'on attende quand tout va bien.
 */
const MIN_VISIBLE = 400;

export function RenderBootSignal(): null {
  const calm = useRef(0);
  const done = useRef(false);
  const since = useRef(performance.now());

  useFrame((_, dt) => {
    // Une image, une seule, suffit à prouver que la toile n'est pas morte-née :
    // c'est ce que guette le chien de garde (systems/renderHealth), et il n'a
    // rien à voir avec le voile, qui attend lui que le jeu TOURNE.
    markRenderAlive();
    if (done.current) return;
    calm.current = dt > 0 && dt < SMOOTH_DT ? calm.current + 1 : 0;
    if (calm.current < CALM_FRAMES) return;
    if (performance.now() - since.current < MIN_VISIBLE) return;
    done.current = true;
    endRenderBoot();
  });

  return null;
}
