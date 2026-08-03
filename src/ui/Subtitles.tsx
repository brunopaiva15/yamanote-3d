// Le bandeau de sous-titres, commun aux deux versions du jeu.
//
// Trois voies, empilées du haut vers le bas dans l'ordre où l'oreille les
// hiérarchise :
//
//   1. le SON nommé - [ピンポーン], [発車メロディ] -, en petit et entre
//      crochets, comme un sous-titrage pour sourds et malentendants ;
//   2. la voix du QUAI, quand elle parle ;
//   3. la voix de la RAME, la plus proche, donc la dernière lue.
//
// Les deux sonorisations peuvent parler EN MÊME TEMPS - c'est même ce qui
// arrive à chaque arrêt, assis porte ouverte - et les deux lignes coexistent
// donc au lieu de se remplacer. Chacune porte sa provenance : sans elle, on ne
// saurait pas laquelle des deux gares annonce quoi.
//
// Le texte est celui du clip joué, dans la langue où il est dit (systems/
// subtitles). Il n'est PAS traduit dans la langue de l'interface, et ce n'est
// pas un oubli : une annonce ferroviaire japonaise se dit en japonais puis en
// anglais, la séquence porte déjà sa propre traduction, et sous-titrer 「次は。
// 渋谷。」 par « Prochain arrêt : Shibuya » ferait lire au joueur autre chose
// que ce qu'il entend.

import { useStore } from '../store';
import { usePublishedHeight } from './usePublishedHeight';
import { useT } from '../i18n';
import { useSubtitles, type SoundCue } from '../systems/subtitles';

/** Étiquette d'un son, dans la langue de l'interface. */
function cueLabel(t: ReturnType<typeof useT>, cue: SoundCue): string {
  return t.subtitles.cues[cue];
}

export function Subtitles({ className = '' }: { className?: string }) {
  const on = useStore((s) => s.subtitles);
  const t = useT();
  const cabin = useSubtitles((s) => s.cabin);
  const platform = useSubtitles((s) => s.platform);
  const cue = useSubtitles((s) => s.cue);
  const shown = on && Boolean(cabin || platform || cue);
  // La hauteur du bandeau est publiée tant qu'il est là : c'est ce qui permet
  // au journal de la version sonore de réserver la place exacte sous lui, au
  // lieu de disparaître dessous dès qu'une annonce japonaise prend deux lignes.
  const ref = usePublishedHeight<HTMLDivElement>('--subtitles-h', shown);

  if (!shown) return null;

  return (
    // `aria-live` : un lecteur d'écran doit annoncer la ligne quand elle
    // arrive, sans que rien n'ait le focus. `polite` et non `assertive` - une
    // annonce de gare ne coupe pas la parole à ce que l'utilisateur est en
    // train de faire.
    <div className={`subtitles ${className}`} ref={ref} aria-live="polite" aria-atomic="false">
      {cue && (
        <p className="subtitle-cue" key={cue.id}>
          [{cueLabel(t, cue.cue)}
          {cue.detail ? ` - ${cue.detail}` : ''}]
        </p>
      )}
      {platform && (
        <p className="subtitle-line subtitle-platform" key={platform.id}>
          <span className="subtitle-source">{t.subtitles.platform}</span>
          <span className="subtitle-text" lang={platform.lang}>
            {platform.text}
          </span>
        </p>
      )}
      {cabin && (
        <p className="subtitle-line subtitle-cabin" key={cabin.id}>
          <span className="subtitle-source">{t.subtitles.cabin}</span>
          <span className="subtitle-text" lang={cabin.lang}>
            {cabin.text}
          </span>
        </p>
      )}
    </div>
  );
}
