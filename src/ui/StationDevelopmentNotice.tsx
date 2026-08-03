// CE QUE L'ON DIT AU JOUEUR DU HALL OÙ IL SE TIENT.
//
// Cet avertissement disait « Gare en cours de développement — cet espace de la
// gare est encore en construction », à toutes les gares et sans condition. Il
// était vrai le jour où il a été écrit : le hall était alors une boîte
// générique meublée à l'estime. Il ne l'est plus. Les trente gares passent par
// leur relevé, avec leurs niveaux, leurs groupes de portillons, leurs sorties
// nommées et leurs correspondances — et un bandeau « en construction » posé
// par-dessus est devenu un mensonge affiché en permanence.
//
// CE QU'IL RESTE DE VRAI À DIRE, et qui est utile : quatre gares sur trente ont
// été lues sur un document ANCIEN — Uguisudani (juin 2022), Okachimachi,
// Nishi-Nippori et Tabata (2024) —, quand les vingt-six autres portent la date
// de référence du chantier. Leur topologie tient, mais leur disposition a pu
// changer depuis. C'est exactement ce qu'un joueur gagne à savoir, et c'est la
// seule chose que cette interface ait encore à dire.
//
// Le niveau du joueur vit dans `runtime` (mis à jour à chaque pas) : cette
// interface ne s'abonne au store que pour la langue et la gare, et observe la
// transition de niveau sans provoquer de rendu à chaque image.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { profileConfidence } from '../data/stationConcourseWired';
import { runtime } from '../systems/runtime';

export function StationDevelopmentNotice() {
  const [inConcourse, setInConcourse] = useState(() => runtime.playerLevel === 'concourse');
  const index = useStore((s) => s.platformIndex);
  const t = useT();

  useEffect(() => {
    const update = () => {
      const next = runtime.playerLevel === 'concourse';
      setInConcourse((current) => (current === next ? current : next));
    };
    const id = window.setInterval(update, 100);
    return () => window.clearInterval(id);
  }, []);

  if (!inConcourse) return null;
  if (profileConfidence(index) !== 'approximate') return null;

  return (
    <aside className="station-development" role="status" aria-live="polite">
      <span className="station-development-icon" aria-hidden="true">
        📐
      </span>
      <span>
        <strong>{t.hud.stationDevelopment.title}</strong>
        <small>{t.hud.stationDevelopment.detail}</small>
      </span>
    </aside>
  );
}
