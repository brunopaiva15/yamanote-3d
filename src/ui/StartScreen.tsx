// Écran de démarrage : titre, rappel des contrôles, bouton qui débloque
// l'audio (contrainte navigateur) et lance l'expérience.

import { useState } from 'react';
import { useStore } from '../store';
import { startAudio, setVolume } from '../systems/audioEngine';
import { initSpeech, say } from '../systems/speech';
import { welcomeAnnouncement } from '../data/announcements';
import { seedPassengers } from '../systems/passengers';

export function StartScreen() {
  const start = useStore((s) => s.start);
  const [loading, setLoading] = useState(false);

  const board = async () => {
    setLoading(true);
    initSpeech();
    seedPassengers();
    try {
      await startAudio();
      setVolume(useStore.getState().volume);
    } catch {
      /* l'expérience reste jouable sans audio */
    }
    start();
    window.setTimeout(() => say(welcomeAnnouncement()), 900);
  };

  return (
    <div className="start-screen">
      <div className="start-card">
        <div className="start-line-badge">JY</div>
        <h1 className="start-title">山手線</h1>
        <p className="start-subtitle">Yamanote Line Ride</p>
        <p className="start-text">
          Une boucle de trente stations autour de Tokyo, en temps quasi réel. Rien à gagner :
          on s'assoit, on regarde la ville, on écoute les annonces.
        </p>
        <button className="start-button" onClick={() => void board()} disabled={loading}>
          {loading ? 'Préparation…' : 'Monter à bord'}
        </button>
        <ul className="start-controls">
          <li>Regarder : cliquer et glisser avec la souris</li>
          <li>Marcher : ZQSD, WASD ou les flèches</li>
          <li>S'asseoir : un clic net vers une place libre</li>
          <li>Se lever : espace ou un nouveau clic</li>
          <li>Raccourcis : M pour le son, F pour le plein écran</li>
        </ul>
      </div>
    </div>
  );
}
