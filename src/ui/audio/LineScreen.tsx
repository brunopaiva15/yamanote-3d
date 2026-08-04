// L'afficheur de bord, dans la page.
//
// C'est LE parti pris de la version sonore : plutôt qu'un tableau de bord
// inventé pour l'occasion, on montre l'écran que le voyageur a réellement
// au-dessus de la porte. Le même. Pas une évocation, pas une adaptation - le
// canevas de `three/lineScreen`, peint par la même fonction, cadencé par la
// même rotation (`three/lineScreenCycle`) que les dalles de la rame.
//
// Ce qui le rend possible tient en une ligne : ces deux mille lignes de
// peinture ne dessinaient déjà que du canevas 2D. Elles ne demandaient à three
// qu'un objet `CanvasTexture` pour envoyer le résultat au GPU - et cet
// emballage-là est parti dans `three/screenSurface`. Ici, la même surface est
// simplement une balise `<canvas>` de la page.
//
// Le format est celui de la dalle réelle, 768 × 432 : un 16:9, pas un
// panoramique. Il est tenu par le CSS (`aspect-ratio`), et c'est aussi le
// repère dans lequel la peinture travaille - toutes ses cotes sont relevées au
// pixel sur cette grille-là. La RÉSOLUTION, elle, n'y est pas liée : voir
// `paintScale` plus bas, qui est ce qui permet de mettre la dalle en plein
// écran sans qu'elle devienne une capture d'écran agrandie.

import { useCallback, useEffect, useRef } from 'react';
import { LCD_CUTOFF, SCREEN_H, SCREEN_W } from '../../three/lineScreen';
import {
  ANIM_PERIOD,
  ANIM_PHASES,
  MOTION_STEP,
  bandFills,
  lineScreenFrame,
  lineScreenKey,
  lineScreenPageKey,
  newScreenAnim,
  paintLineScreen,
  resetScreenAnim,
  screenLoops,
  stepScreenAnim,
} from '../../three/lineScreenCycle';
import { paintBlended } from '../../three/screenFade';
import { runtime } from '../../systems/runtime';
import { useStore } from '../../store';

/**
 * Le côté de la dalle qu'on regarde.
 *
 * Une rame a deux parois et deux dalles, qui ne diffèrent que sur le plan du
 * quai : chacune dit si les portes qui s'ouvrent sont de SON côté. Ici il n'y
 * a qu'un écran, et on choisit celle du côté qui s'ouvre - c'est celle qu'on
 * regarde quand on s'apprête à descendre, et la seule des deux qui apprenne
 * quelque chose.
 */
function watchedSide(): 1 | -1 {
  return useStore.getState().doorSide;
}

/**
 * Combien de pixels réels pour un pixel de la grille de peinture.
 *
 * La dalle est dessinée dans un repère de 768 × 432, parce que c'est là qu'ont
 * été relevées toutes ses cotes. Rien n'oblige pour autant le canevas à ne
 * faire que 768 pixels de large : on agrandit la mémoire d'image et on pose une
 * transformation d'échelle avant de peindre. Le texte, les traits et les
 * pictogrammes sont alors tracés À LA RÉSOLUTION DEMANDÉE - c'est du vectoriel,
 * pas une image qu'on étire -, et un afficheur en plein écran est net.
 *
 * L'échelle suit la taille RÉELLE à l'écran, densité de l'écran comprise. En
 * plein écran sur une dalle de 1920, cela donne un canevas de 1920 × 1080 :
 * chaque pixel dessiné est un pixel affiché.
 *
 * Le plafond n'est pas de la prudence excessive : la peinture coûte en surface,
 * et cette version est justement celle qu'on choisit sur une machine modeste.
 * Trois fois la grille - 2304 × 1296 - couvre le 1440p sans réserve, et
 * au-delà l'œil ne distingue plus rien sur un caractère de gare.
 */
const MAX_PAINT_SCALE = 3;

function paintScale(el: HTMLCanvasElement | null): number {
  if (!el) return 1;
  const shown = el.getBoundingClientRect().width;
  if (shown <= 0) return 1;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(MAX_PAINT_SCALE, Math.max(1, (shown * dpr) / SCREEN_W));
}

export function LineScreen() {
  const canvas = useRef<HTMLCanvasElement>(null);

  /**
   * L'échelle demandée, lue par la boucle de peinture.
   *
   * Une référence et non un état : la boucle tourne hors de React, et un
   * re-rendu par changement de taille de fenêtre ne lui apporterait rien.
   */
  const wanted = useRef(1);
  const remeasure = useCallback(() => {
    wanted.current = paintScale(canvas.current);
  }, []);

  // Le plein écran, le retour en page, un changement de fenêtre : dans les
  // trois cas la dalle change de taille, donc de résolution utile. On suit
  // l'ÉVÉNEMENT plutôt qu'un clic - on peut aussi en sortir par Échap, ou par
  // le navigateur lui-même.
  useEffect(() => {
    const onChange = () => {
      // La taille vient de changer du tout au tout ; la mesure qui décide de la
      // résolution doit attendre que la mise en page ait suivi.
      requestAnimationFrame(remeasure);
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('resize', remeasure);
    remeasure();
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('resize', remeasure);
    };
  }, [remeasure]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext('2d');
    if (!g) return;

    let phase = 0;
    let lastKey = '';
    let dark = false;
    let scale = 0;
    /** Fondu enchaîné et remplissage du ruban : voir `three/lineScreenAnim`. */
    const motion = newScreenAnim();
    /** Temps accumulé depuis le dernier pas, et ce qui bougeait alors. */
    let stepAcc = 0;
    let wasMoving = false;
    let sinceBeat = 0;

    /**
     * Cale la mémoire d'image sur l'échelle voulue, si elle a bougé.
     *
     * Écrire `canvas.width` remet le contexte à zéro - transformation comprise -
     * même quand on y réécrit la même valeur : on ne le fait donc que si
     * l'échelle a réellement changé, et on repose la transformation dans la
     * foulée. Le `lastKey` vidé force le redessin, sans quoi la dalle resterait
     * vide jusqu'au prochain changement d'écran.
     */
    const resize = (): void => {
      const next = wanted.current;
      if (Math.abs(next - scale) < 0.01) return;
      scale = next;
      el.width = Math.round(SCREEN_W * scale);
      el.height = Math.round(SCREEN_H * scale);
      lastKey = '';
      dark = false;
    };

    // Le battement de l'afficheur est le sien : deux fois par seconde, comme
    // sur la rame (ANIM_PERIOD). Ce n'est pas la boucle du jeu - celle-ci
    // tourne à la cadence de l'écran et n'a rien à faire ici -, et c'est
    // volontairement lent : une dalle LCD de train ne rafraîchit pas à 60 Hz,
    // et repeindre deux mille lignes de canevas soixante fois par seconde sur
    // une machine qui a choisi la version sonore serait exactement la dépense
    // qu'on lui a promis d'éviter.
    //
    // Le minuteur, lui, bat plus vite (MOTION_STEP) - mais il ne PEINT pas plus
    // souvent. Il ne sert qu'à donner leurs images aux trois choses qui
    // coulissent : le fondu enchaîné d'une page à l'autre, la remontée du vert
    // sur la bande, et les vantaux du pictogramme de portes. Les deux premières
    // n'occupent qu'un instant par page, la troisième que le freinage
    // d'approche ; le reste du temps il compare deux clés de caractères et
    // s'arrête là. C'est ce qu'il fallait pour que ces animations ne coûtent
    // pas un rafraîchissement permanent.
    const id = window.setInterval(() => {
      // Page cachée : personne ne regarde la dalle, et la repeindre coûterait
      // deux mille lignes de canevas prises sur le fil audio - qui, lui,
      // continue de jouer (systems/audioLoop garde le monde en marche derrière
      // un onglet caché). Au retour, la clé aura changé et l'image se refera.
      if (document.hidden) return;
      resize();
      // La peinture travaille toujours dans la grille de 768 × 432 ; c'est
      // cette transformation qui la porte à la résolution du canevas.
      g.setTransform(scale, 0, 0, scale, 0, 0);
      // Une dalle LCD n'a pas de demi-teinte : son rétroéclairage tient ou il
      // ne tient pas. Sous le seuil, le panneau est NOIR - pas gris, pas en
      // veille : éteint. C'est ce qu'on voit pendant une coupure de caténaire,
      // et c'est la seule image que la version sonore ne peut pas remplacer
      // par du texte : il n'y a rien à dire, il n'y a plus de courant.
      if (runtime.carPower <= LCD_CUTOFF) {
        if (!dark) {
          dark = true;
          lastKey = '';
          g.fillStyle = '#05070a';
          g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        }
        // La dalle éteinte n'est pas une page : au retour, l'image revient d'un
        // coup et non en fondu depuis le noir.
        resetScreenAnim(motion);
        return;
      }
      dark = false;

      // Le battement de la rame, reconstitué sur un minuteur plus fin : c'est
      // lui, et lui seul, qui fait avancer le clignotant et les vantaux.
      sinceBeat += MOTION_STEP;
      const beat = sinceBeat >= ANIM_PERIOD;
      if (beat) {
        sinceBeat = 0;
        phase = (phase + 1) % ANIM_PHASES;
      }
      // Horloge continue : la phase entière, plus la fraction de battement déjà
      // écoulée. Le clignotant n'en lit que l'entier, les vantaux du
      // pictogramme s'en servent tel quel et coulissent entre deux battements.
      const anim = phase + sinceBeat / ANIM_PERIOD;
      stepAcc += MOTION_STEP;
      if (!beat && !wasMoving) return;
      const stepDt = stepAcc;
      stepAcc = 0;

      const shown = lineScreenFrame();
      const side = watchedSide();
      const page = lineScreenPageKey(shown, side);
      const step = stepScreenAnim(motion, page, bandFills(shown.state), stepDt);
      // Le plan des sorties de l'approche ne se pose jamais : son pictogramme
      // de portes tourne en boucle tant qu'il est à l'antenne.
      const loops = screenLoops(shown);
      // Une image de plus APRÈS la fin d'une animation : celle qui pose le
      // ruban plein.
      const moving = step.busy || loops || wasMoving;
      wasMoving = step.busy || loops;

      const key = lineScreenKey(shown, anim, side);
      if (key === lastKey && !moving) return;
      lastKey = key;
      const surface = { g, w: SCREEN_W, h: SCREEN_H };
      paintBlended(surface, step.blend, (s) => paintLineScreen(s, shown, anim, side, step.fill));
    }, MOTION_STEP * 1000);

    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="lcd-frame">
      {/* Le canevas ne porte aucun texte accessible - c'est une image. Ce qui
          s'y dit est déjà lisible ailleurs sur l'écran : la gare visée dans le
          bandeau du HUD, les annonces dans les sous-titres et le journal. */}
      {/* La taille de départ est celle de la grille de peinture : la boucle la
          remplacera dès son premier battement, mais d'ici là le canevas doit
          avoir le bon rapport et non le 300 × 150 par défaut. */}
      <canvas
        className="lcd-canvas"
        ref={canvas}
        width={SCREEN_W}
        height={SCREEN_H}
        role="img"
        aria-label="E235 LCD"
      />
</div>
  );
}
