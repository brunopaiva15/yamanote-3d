// Menu principal, composé comme un ekimeiban (panneau de nom de gare) JR East :
// panneau blanc sur fond sombre, logo en pièce maîtresse, bande à la couleur
// de la ligne avec les deux sens de circulation, puis les commandes et le
// bouton qui débloque l'audio (contrainte navigateur) avant de lancer
// l'expérience. La bande et les mentions 内回り／外回り restent en japonais :
// c'est de la signalétique, pas de l'interface (cf. src/i18n).

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { startAudio, setVolume, setPlatformSide } from '../systems/audioEngine';
import { initSpeech } from '../systems/speech';
import { seedPassengers } from '../systems/passengers';
import { runtime, tokyoNow } from '../systems/runtime';
import { randomizeEntry } from '../systems/stationCycle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { QualitySelect } from './QualitySelect';
import { Logo } from './Logo';

// Horloge de Tokyo affichée en pied de carte : l'heure réelle là-bas, celle
// dans laquelle la boucle va démarrer.
function useTokyoClock(): string {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = tokyoNow();
      const total = Math.floor(now.minutes) % (24 * 60);
      setClock(
        `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
      );
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}

export function StartScreen() {
  const start = useStore((s) => s.start);
  const t = useT();
  const tokyoClock = useTokyoClock();
  const [loading, setLoading] = useState(false);

  const board = async () => {
    setLoading(true);
    initSpeech();
    // Horloge Tokyo avant peuplement et tirage : densité selon heure/jour réels.
    const now = tokyoNow();
    runtime.clockMin = now.minutes;
    runtime.tokyoDate = {
      year: now.year,
      month: now.month,
      day: now.day,
      weekday: now.weekday,
    };
    try {
      await startAudio();
      setVolume(useStore.getState().volume);
    } catch {
      /* l'expérience reste jouable sans audio */
    }
    // Point aléatoire sur la boucle (en route, freinage, à quai, départ…) :
    // plus de message d'accueil fixe ni de départ systématique à l'arrêt.
    randomizeEntry();
    setPlatformSide(useStore.getState().doorSide);
    // Densité PNJ après le tirage, pour le tronçon / la phase choisis.
    seedPassengers();
    start();
  };

  return (
    <div className="start-screen">
      <div className="start-board">
        <LanguageSwitcher className="lang-switch-board" />
        <Logo />
        <p className="start-tagline">{t.start.tagline}</p>
        <div className="board-band" aria-hidden="true" lang="ja">
          <span>◀ 内回り</span>
          <span>外回り ▶</span>
        </div>
        <p className="start-text">{t.start.intro}</p>
        <button className="start-button" onClick={() => void board()} disabled={loading}>
          {loading ? t.start.loading : t.start.board}
        </button>
        <ul className="start-controls">
          {t.start.controls.map((hint) => (
            <li key={hint.action}>
              <span className="start-keys">
                {hint.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
              <span className="start-action">{hint.action}</span>
            </li>
          ))}
        </ul>
        <div className="start-quality">
          <span className="start-quality-label">{t.quality.label}</span>
          <QualitySelect />
        </div>
        <p className="start-foot">
          {t.start.tokyoTime}
          <strong>{tokyoClock}</strong>
        </p>
      </div>
    </div>
  );
}
