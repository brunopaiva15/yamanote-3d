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
// panoramique. Il est tenu par le CSS (`aspect-ratio`), et le canevas garde sa
// résolution native quelle que soit la taille à l'écran - une dalle de gare est
// nette, et un afficheur flou serait le seul détail faux de tout l'écran.

import { useEffect, useRef } from 'react';
import { ANIM_PERIOD, ANIM_PHASES, LCD_CUTOFF, SCREEN_H, SCREEN_W } from '../../three/lineScreen';
import { lineScreenFrame, lineScreenKey, paintLineScreen } from '../../three/lineScreenCycle';
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

export function LineScreen() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const g = el.getContext('2d');
    if (!g) return;
    const surface = { g, w: SCREEN_W, h: SCREEN_H };

    let anim = 0;
    let lastKey = '';
    let dark = false;

    // Le battement de l'afficheur est le sien : deux fois par seconde, comme
    // sur la rame (ANIM_PERIOD). Ce n'est pas la boucle du jeu - celle-ci
    // tourne à la cadence de l'écran et n'a rien à faire ici -, et c'est
    // volontairement lent : une dalle LCD de train ne rafraîchit pas à 60 Hz,
    // et repeindre deux mille lignes de canevas soixante fois par seconde sur
    // une machine qui a choisi la version sonore serait exactement la dépense
    // qu'on lui a promis d'éviter.
    const id = window.setInterval(() => {
      // Page cachée : personne ne regarde la dalle, et la repeindre coûterait
      // deux mille lignes de canevas prises sur le fil audio - qui, lui,
      // continue de jouer (systems/audioLoop garde le monde en marche derrière
      // un onglet caché). Au retour, la clé aura changé et l'image se refera.
      if (document.hidden) return;
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
        return;
      }
      dark = false;
      anim = (anim + 1) % ANIM_PHASES;
      const frame = lineScreenFrame();
      const side = watchedSide();
      const key = lineScreenKey(frame, anim, side);
      if (key === lastKey) return;
      lastKey = key;
      paintLineScreen(surface, frame, anim, side);
    }, ANIM_PERIOD * 1000);

    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="lcd-frame">
      {/* Le canevas ne porte aucun texte accessible - c'est une image. Ce qui
          s'y dit est déjà lisible ailleurs sur l'écran : la gare visée dans le
          bandeau du HUD, les annonces dans les sous-titres et le journal. */}
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
