// Ce qu'on montre quand la toile n'a pas voulu démarrer.
//
// C'est le dernier recours, après les remontages silencieux de Game : le
// navigateur a refusé le contexte WebGL autant de fois qu'on le lui a demandé,
// et il n'y a plus rien à tenter tout seul.
//
// Le fond est OPAQUE, et c'est le point. Sans lui, le joueur reste devant son
// HUD - gare, heure, température, taux de remplissage - posé sur du noir : tout
// y annonce un jeu qui tourne, sauf que rien ne bouge, et il n'y a aucune raison
// de penser à recharger la page plutôt qu'à attendre. Le carton dit ce qui s'est
// passé et donne les deux gestes qui marchent : réessayer, ou recharger.
//
// Même carton blanc cerné d'encre que l'écran d'accueil et le voile d'attente :
// c'est la troisième page de la même histoire.

import { useRenderHealth, retryRenderer } from '../systems/renderHealth';
import { useT } from '../i18n';

export function RenderFailure() {
  const status = useRenderHealth((s) => s.status);
  const reason = useRenderHealth((s) => s.reason);
  const t = useT();

  if (status !== 'failed') return null;

  return (
    <div className="render-fail" role="alert">
      <div className="render-fail-card">
        <strong>{t.render.failedTitle}</strong>
        <p>{t.render.failedBody}</p>
        <div className="render-fail-actions">
          <button className="render-fail-button" onClick={retryRenderer}>
            {t.render.retry}
          </button>
          <button
            className="render-fail-button render-fail-reload"
            onClick={() => window.location.reload()}
          >
            {t.render.reload}
          </button>
        </div>
        {/* Le message du navigateur, quand il y en a un : illisible pour la
            plupart, mais c'est la seule chose exploitable dans un rapport de
            bug, et elle ne coûte qu'une ligne discrète. */}
        {reason && <small className="render-fail-reason">{reason}</small>}
      </div>
    </div>
  );
}
