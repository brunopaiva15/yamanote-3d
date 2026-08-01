// Sélecteur de qualité vidéo : sept préréglages (Très basse → Extraordinaire),
// choisis par le joueur depuis l'écran de démarrage ou le HUD. Le choix
// s'applique immédiatement et est mémorisé pour les visites suivantes.
//
// Le dernier, « Extraordinaire », n'est pas un cran de plus sur la même
// échelle : c'est le rendu WebGPU, en bêta. Il est grisé là où il ne tiendrait
// pas - sur téléphone, et là où le navigateur ne sait pas l'afficher. Offrir un
// mode qui n'ouvrirait qu'un diaporama ou un écran noir serait pire que ne pas
// l'offrir du tout, et l'infobulle dit laquelle des deux raisons s'applique.

import {
  QUALITIES,
  extraordinaryBlock,
  setQuality,
  usePerf,
  type Quality,
} from '../systems/perf';
import { useT } from '../i18n';

export function QualitySelect({ className = '' }: { className?: string }) {
  const quality = usePerf((s) => s.quality);
  const t = useT();
  const blocked = extraordinaryBlock();

  const betaTitle =
    blocked === 'mobile'
      ? t.quality.extraordinaryMobile
      : blocked === 'unsupported'
        ? t.quality.extraordinaryUnsupported
        : t.quality.extraordinaryBeta;

  return (
    <select
      className={`quality-select ${className}`.trim()}
      value={quality}
      onChange={(e) => setQuality(e.target.value as Quality)}
      title={t.quality.label}
      aria-label={t.quality.label}
    >
      {QUALITIES.map((q) => {
        const beta = q === 'extraordinary';
        return (
          <option key={q} value={q} disabled={beta && blocked !== null} title={beta ? betaTitle : undefined}>
            {t.quality.levels[q]}
          </option>
        );
      })}
    </select>
  );
}
