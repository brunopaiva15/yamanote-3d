// HUD sobre en français : horloge, prochaine station, phase, remplissage,
// réglages son, s'asseoir, plein écran. Réticule central discret.

import { useEffect, useState } from 'react';
import { useStore, type Phase } from '../store';
import { STATIONS } from '../data/stations';
import { BAND_COLOR } from '../data/occupancy';
import { runtime } from '../systems/runtime';
import { currentSegmentOccupancy } from '../systems/occupancy';
import { setVolume as setAudioVolume, setMuted } from '../systems/audioEngine';
import { applySpeechVolume, cancelSpeech } from '../systems/speech';
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

function useOccupancy(): { percent: number; label: string; color: string } {
  const [occ, setOcc] = useState({ percent: 0, label: '', color: BAND_COLOR.moderate });
  const index = useStore((s) => s.index);
  const phase = useStore((s) => s.phase);
  useEffect(() => {
    const tick = () => {
      const e = currentSegmentOccupancy();
      setOcc({ percent: e.percent, label: e.label, color: BAND_COLOR[e.band] });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [index, phase]);
  return occ;
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
  const occupancy = useOccupancy();

  // Répercuter le mute et le volume sur l'audio et la voix.
  useEffect(() => {
    setMuted(muted);
    if (muted) cancelSpeech();
  }, [muted]);
  useEffect(() => {
    setAudioVolume(volume);
    applySpeechVolume();
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
        <div
          className="hud-occupancy"
          style={{ borderColor: occupancy.color, color: occupancy.color }}
          title="Estimation calibrée (±8–12 pts un jour normal)"
        >
          <span className="hud-occupancy-pct">~{occupancy.percent}&nbsp;%</span>
          <span className="hud-occupancy-label">{occupancy.label}</span>
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
