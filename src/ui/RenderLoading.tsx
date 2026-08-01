// L'écran d'attente, entre le clic et la première image.
//
// Il y en avait besoin dans TOUTES les qualités et pas seulement dans le mode
// WebGPU : monter à bord construit trente gabarits de gare, le ruban urbain,
// les textures peintes au canevas et les personnages, et pendant ce temps la
// toile n'existe pas encore - c'est le fond de page qu'on voit. Un rectangle
// gris-noir de plusieurs secondes sans un mot ressemble beaucoup plus à une
// panne qu'à un chargement.
//
// Le mode Extraordinaire y ajoute le téléchargement de son paquet, la
// négociation du périphérique et la compilation des nuanceurs : le trou est
// plus long, et il vaut la peine d'être nommé - d'où les deux libellés.
//
// Le voile reprend le vert de la ligne et le carton blanc cerné d'encre de
// l'écran d'accueil, pour que la bascule se lise comme une suite.

import { useEffect, useState } from 'react';
import { useRenderBoot } from '../systems/renderBoot';
import { usePerf } from '../systems/perf';
import { useT } from '../i18n';

/**
 * Au-delà de cette durée, on rend la main quoi qu'il arrive (ms).
 *
 * Le voile s'efface quand la scène a dessiné ses premières images. Si ce
 * signal n'arrive jamais - un cas qu'on n'a pas prévu -, mieux vaut rendre un
 * jeu peut-être imparfait qu'un carton d'attente éternel : le joueur peut au
 * moins rebasculer sur une autre qualité depuis le HUD.
 */
const GIVE_UP = 30000;

export function RenderLoading() {
  const ready = useRenderBoot((s) => s.ready);
  const quality = usePerf((s) => s.quality);
  const t = useT();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (ready) {
      setGaveUp(false);
      return;
    }
    const id = window.setTimeout(() => setGaveUp(true), GIVE_UP);
    return () => window.clearTimeout(id);
  }, [ready]);

  if (ready || gaveUp) return null;

  const extraordinary = quality === 'extraordinary';

  return (
    <div className="render-boot" role="status" aria-live="polite">
      <div className="render-boot-card">
        <span className="render-boot-spinner" aria-hidden="true" />
        <strong>{extraordinary ? t.quality.extraordinaryLoading : t.start.loading}</strong>
        <small>
          {extraordinary ? t.quality.extraordinaryLoadingNote : t.start.loadingNote}
        </small>
      </div>
    </div>
  );
}
