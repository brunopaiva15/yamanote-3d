// Sélecteur de qualité SONORE. Il ne se règle qu'ici, avant de monter à bord,
// et c'est voulu : le réglage qui compte vraiment - la taille du tampon de
// sortie - se fige à l'ouverture du contexte audio, et un contexte ne se
// retaille pas. Le proposer dans le HUD ferait croire à un effet immédiat qu'il
// n'aurait pas.
//
// « Automatique » est le bon choix pour tout le monde et c'est le réglage par
// défaut : le moteur mesure sa propre charge et descend d'un cran au premier
// craquement (systems/audioLoad). Les trois autres existent pour qui veut
// trancher sans attendre la mesure - forcer la spatialisation complète sur une
// machine qu'on sait bonne, ou forcer le mode le plus sûr sur une machine qu'on
// sait fragile.

import { useEffect, useState } from 'react';
import { AUDIO_PREFS, setAudioPref, useAudioLoad, type AudioPref } from '../systems/audioLoad';
import { useT } from '../i18n';

export function AudioQualitySelect({ className = '' }: { className?: string }) {
  const pref = useAudioLoad((s) => s.pref);
  const t = useT();

  return (
    <select
      className={`quality-select ${className}`.trim()}
      value={pref}
      onChange={(e) => setAudioPref(e.target.value as AudioPref)}
      title={t.audioQuality.label}
      aria-label={t.audioQuality.label}
    >
      {AUDIO_PREFS.map((p) => (
        <option key={p} value={p}>
          {t.audioQuality.levels[p]}
        </option>
      ))}
    </select>
  );
}

/** Durée d'affichage du message en cours de trajet (ms). */
const LINGER = 12000;

/**
 * Ce que le moteur a fait de lui-même, quand il l'a fait.
 *
 * On ne le dit QUE si le son a été allégé sans qu'on le demande : le joueur
 * vient d'entendre une gare devenir plus sèche, et sans un mot il se demandera
 * si quelque chose est cassé. C'est aussi ce qui lui apprend qu'il peut trancher
 * lui-même au prochain embarquement.
 *
 * `transient` est la version du HUD : le message s'efface de lui-même, comme
 * celui du rendu (voir QualityNotice) - il informe d'un événement passé, il n'a
 * pas à rester sur l'écran tout le trajet.
 */
export function AudioQualityNotice({
  className = '',
  transient = false,
}: {
  className?: string;
  transient?: boolean;
}) {
  const lowered = useAudioLoad((s) => s.lowered);
  const t = useT();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!transient || !lowered) return;
    setExpired(false);
    const id = window.setTimeout(() => setExpired(true), LINGER);
    return () => window.clearTimeout(id);
  }, [transient, lowered]);

  if (!lowered || (transient && expired)) return null;
  const style = transient ? 'quality-note' : 'start-mode-note';
  return (
    <p className={`${style} ${className}`.trim()} role="status" aria-live="polite">
      {t.audioQuality.lowered}
    </p>
  );
}
