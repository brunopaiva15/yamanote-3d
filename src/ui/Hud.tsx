// HUD sobre en français : horloge, prochaine station, phase, réglages son,
// s'asseoir, avance rapide, plein écran. Réticule central discret.

import { useEffect, useState } from 'react';
import { useStore, type Phase } from '../store';
import { STATIONS } from '../data/stations';
import { runtime } from '../systems/runtime';
import { fastForward } from '../systems/stationCycle';
import { setVolume as setAudioVolume, setMuted } from '../systems/audioEngine';
import { cancelSpeech } from '../systems/speech';
import { input } from '../systems/input';

const PHASE_LABEL: Record<Phase, string> = {
  cruise: 'En route',
  brake: 'Arrivée',
  dwell: 'À quai',
  depart: 'Départ',
};

function useClock(): string {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const id = window.setInterval(() => {
      const total = Math.floor(runtime.clockMin) % (24 * 60);
      const h = Math.floor(total / 60);
      const m = total % 60;
      setClock(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}

export function Hud() {
  const started = useStore((s) => s.started);
  const index = useStore((s) => s.index);
  const phase = useStore((s) => s.phase);
  const muted = useStore((s) => s.muted);
  const volume = useStore((s) => s.volume);
  const seated = useStore((s) => s.seated);
  const toggleMute = useStore((s) => s.toggleMute);
  const setVolume = useStore((s) => s.setVolume);
  const clock = useClock();

  // Répercuter le mute et le volume sur l'audio et la voix.
  useEffect(() => {
    setMuted(muted);
    if (muted) cancelSpeech();
  }, [muted]);
  useEffect(() => {
    setAudioVolume(volume);
  }, [volume]);

  if (!started) return null;

  const st = STATIONS[index];
  const label = phase === 'dwell' ? 'Station actuelle' : 'Prochaine station';

  return (
    <>
      <div className="hud-top">
        <div className="hud-clock">{clock}</div>
        <div className="hud-station">
          <span className="hud-station-label">{label}</span>
          <span className="hud-station-name">
            <span className="hud-jy">{st.jy}</span> {st.romaji} <span className="hud-kanji">{st.kanji}</span>
          </span>
        </div>
        <div className={`hud-phase hud-phase-${phase}`}>{PHASE_LABEL[phase]}</div>
      </div>

      <div className="hud-reticle" aria-hidden="true" />

      <div className="hud-bottom">
        <button className="hud-button" onClick={toggleMute} title="Couper ou rétablir le son (M)">
          {muted ? 'Son coupé' : 'Son actif'}
        </button>
        <input
          className="hud-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          title="Volume"
        />
        <button
          className="hud-button"
          onClick={() => {
            input.sitRequest = true;
          }}
        >
          {seated ? 'Se lever' : "S'asseoir"}
        </button>
        <button className="hud-button" onClick={fastForward} title="Sauter à la station suivante">
          Avance rapide
        </button>
        <button
          className="hud-button"
          onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
          title="Plein écran (F)"
        >
          Plein écran
        </button>
      </div>
    </>
  );
}
