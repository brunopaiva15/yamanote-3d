// Le journal : les dernières lignes dites ou sonnées, avec l'heure.
//
// Un sous-titre passe - c'est ce qu'on lui demande. Une annonce de bord tient
// une quinzaine de secondes, une annonce de quai peut en cacher une autre, et
// il suffit de lever les yeux au mauvais moment pour la manquer. Le journal est
// le RATTRAPAGE : il ne cherche pas à être lu en continu, il est là quand on
// veut savoir ce qui vient de se dire.
//
// Il vaut aussi pour l'expérience complète - c'est la même mémoire - mais il
// n'y a pas d'endroit pour l'y poser sans manger la scène. Il vit donc dans la
// version sonore, où l'écran est libre.

import { useSubtitles, type SubtitleLogEntry } from '../../systems/subtitles';
import { useT } from '../../i18n';

/** Minutes depuis minuit → HH:MM, la même horloge que le HUD. */
function clockLabel(minutes: number): string {
  const total = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function Entry({ entry, t }: { entry: SubtitleLogEntry; t: ReturnType<typeof useT> }) {
  // Un son n'a pas de sonorisation d'origine : il n'a pas de source à nommer,
  // et son texte est une étiquette d'interface, pas une transcription.
  if (entry.channel === null) {
    const cue = entry.cue ? t.subtitles.cues[entry.cue] : '';
    return (
      <li className="audio-log-row is-cue">
        <span className="audio-log-time">{clockLabel(entry.clockMin)}</span>
        <span className="audio-log-text">
          [{cue}
          {entry.text ? ` - ${entry.text}` : ''}]
        </span>
      </li>
    );
  }
  return (
    <li className="audio-log-row">
      <span className="audio-log-time">{clockLabel(entry.clockMin)}</span>
      <span className={`audio-log-source is-${entry.channel}`}>
        {entry.channel === 'cabin' ? t.subtitles.cabin : t.subtitles.platform}
      </span>
      <span className="audio-log-text" lang={entry.lang}>
        {entry.text}
      </span>
    </li>
  );
}

export function AnnouncementLog() {
  const t = useT();
  const log = useSubtitles((s) => s.log);

  return (
    <section className="audio-log" aria-label={t.audio.logTitle}>
      <header className="audio-panel-head">
        <h2>{t.audio.logTitle}</h2>
      </header>
      {log.length === 0 ? (
        <p className="audio-log-empty">{t.audio.logEmpty}</p>
      ) : (
        // Le plus récent en haut : c'est celui qu'on vient de manquer. Une
        // liste qui se remplit par le bas obligerait à la faire défiler à
        // chaque annonce, ou à décider quand on a le droit de la bouger sous
        // les yeux du lecteur.
        <ol className="audio-log-list">
          {log.map((entry) => (
            <Entry key={entry.id} entry={entry} t={t} />
          ))}
        </ol>
      )}
    </section>
  );
}
