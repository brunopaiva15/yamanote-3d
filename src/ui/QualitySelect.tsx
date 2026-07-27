// Sélecteur de qualité vidéo : six préréglages (Très basse → Ultra), choisis
// par le joueur depuis l'écran de démarrage ou le HUD. Le choix s'applique
// immédiatement et est mémorisé pour les visites suivantes.

import { QUALITIES, setQuality, usePerf, type Quality } from '../systems/perf';
import { useT } from '../i18n';

export function QualitySelect({ className = '' }: { className?: string }) {
  const quality = usePerf((s) => s.quality);
  const t = useT();

  return (
    <select
      className={`quality-select ${className}`.trim()}
      value={quality}
      onChange={(e) => setQuality(e.target.value as Quality)}
      title={t.quality.label}
      aria-label={t.quality.label}
    >
      {QUALITIES.map((q) => (
        <option key={q} value={q}>
          {t.quality.levels[q]}
        </option>
      ))}
    </select>
  );
}
