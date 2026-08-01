// Ce qu'il faut dire au joueur du mode Extraordinaire, et rien de plus.
//
// Deux messages, jamais les deux à la fois :
//
//   · le mode est SÉLECTIONNÉ : on annonce que c'est une bêta et ce qu'elle
//     coûte. Le libellé du sélecteur porte déjà un ⚠︎, mais un symbole ne dit
//     pas qu'on vient d'activer un pipeline non optimisé. Ce message-là n'a sa
//     place que devant le sélecteur, à l'écran d'accueil ;
//   · le mode a ÉCHOUÉ : WebGPU n'a pas démarré et la qualité vient d'être
//     ramenée à Ultra toute seule. Sans un mot, le joueur croirait que son
//     choix n'a pas été pris en compte - et celui-là doit se voir même en
//     pleine course, d'où `failureOnly` pour le HUD.

import { useEffect, useState } from 'react';
import { usePerf } from '../systems/perf';
import { useT } from '../i18n';

/** Durée d'affichage du message d'échec en cours de partie (ms). */
const FAILURE_LINGER = 12000;

export function QualityNotice({
  className = '',
  failureOnly = false,
}: {
  className?: string;
  failureOnly?: boolean;
}) {
  const quality = usePerf((s) => s.quality);
  const failed = usePerf((s) => s.webgpuFailed);
  const t = useT();
  const [expired, setExpired] = useState(false);

  // En cours de partie, le message d'échec s'efface de lui-même : il informe
  // d'un événement passé, il n'a pas à rester sur l'écran tout le trajet.
  useEffect(() => {
    if (!failureOnly || !failed) return;
    setExpired(false);
    const id = window.setTimeout(() => setExpired(true), FAILURE_LINGER);
    return () => window.clearTimeout(id);
  }, [failureOnly, failed]);

  const message =
    failed && !(failureOnly && expired)
      ? t.quality.extraordinaryFailed
      : !failureOnly && quality === 'extraordinary'
        ? t.quality.extraordinaryBeta
        : null;
  if (!message) return null;

  return (
    <p className={`quality-note ${className}`.trim()} role="status" aria-live="polite">
      {message}
    </p>
  );
}
