// Les halls souterrains sont déjà praticables, mais restent un chantier de
// contenu. Le niveau du joueur vit dans `runtime` (mis à jour à chaque pas),
// donc cette interface ne s'abonne au store que pour la langue et observe la
// transition de niveau sans provoquer de rendu à chaque image.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { runtime } from '../systems/runtime';

export function StationDevelopmentNotice() {
  const [inConcourse, setInConcourse] = useState(() => runtime.playerLevel === 'concourse');
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

  return (
    <aside className="station-development" role="status" aria-live="polite">
      <span className="station-development-icon" aria-hidden="true">
        🚧
      </span>
      <span>
        <strong>{t.hud.stationDevelopment.title}</strong>
        <small>{t.hud.stationDevelopment.detail}</small>
      </span>
    </aside>
  );
}
