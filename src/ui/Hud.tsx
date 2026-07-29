// HUD sobre : horloge, prochaine station, phase, remplissage, réglages son,
// s'asseoir, plein écran, sélecteur de langue. Réticule central discret.
// Tous les libellés viennent du dictionnaire de la langue courante.

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { STATIONS } from '../data/stations';
import { BAND_COLOR, type OccupancyBand } from '../data/occupancy';
import { useT } from '../i18n';
import { runtime } from '../systems/runtime';
import { currentSegmentOccupancy } from '../systems/occupancy';
import { weather, type WeatherKind } from '../systems/weather';
import { setVolume as setAudioVolume, setMuted } from '../systems/audioEngine';
import { applySpeechVolume, cancelSpeech } from '../systems/speech';
import { input } from '../systems/input';
import { LanguageSwitcher } from './LanguageSwitcher';
import { QualitySelect } from './QualitySelect';

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

// L'arrêt d'urgence vit dans runtime (pas dans le store) : on le sonde comme
// l'horloge. Le badge ne signale l'urgence que freinage / immobilisation,
// tandis que la remontée en vitesse ('resuming') s'affiche déjà « En route ».
type EmergencyStage = typeof runtime.emergencyStop.stage;

function useEmergencyStage(): EmergencyStage {
  const [stage, setStage] = useState<EmergencyStage>('none');
  useEffect(() => {
    const id = window.setInterval(() => setStage(runtime.emergencyStop.stage), 500);
    return () => window.clearInterval(id);
  }, []);
  return stage;
}

/**
 * Le temps qu'il fait, sondé comme l'horloge — il vit dans `systems/weather`,
 * pas dans le store, et il change trop lentement pour mériter un re-render par
 * image. Deux secondes suffisent largement : un ciel ne tourne pas en une
 * seconde, et la température encore moins.
 */
function useWeather(): { kind: WeatherKind; tempC: number } {
  const [w, setW] = useState<{ kind: WeatherKind; tempC: number }>({ kind: 'fair', tempC: 15 });
  useEffect(() => {
    const tick = () => setW({ kind: weather.kind, tempC: weather.tempC });
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, []);
  return w;
}

/**
 * Pictogramme du temps. Un seul caractère, sans couleur : le HUD est sobre, et
 * c'est dehors qu'il faut regarder — le badge ne fait que nommer ce qu'on voit.
 */
const WEATHER_GLYPH: Record<WeatherKind, string> = {
  clear: '☀',
  fair: '⛅',
  overcast: '☁',
  drizzle: '☂',
  rain: '☂',
  downpour: '☂',
  thunder: '⚡',
  sleet: '☂',
  snow: '❄',
};

function useOccupancy(): { percent: number; band: OccupancyBand } {
  const [occ, setOcc] = useState<{ percent: number; band: OccupancyBand }>({
    percent: 0,
    band: 'moderate',
  });
  const index = useStore((s) => s.index);
  const phase = useStore((s) => s.phase);
  useEffect(() => {
    const tick = () => {
      const e = currentSegmentOccupancy();
      setOcc({ percent: e.percent, band: e.band });
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
  const lang = useStore((s) => s.lang);
  const t = useT();
  const clock = useClock();
  const occupancy = useOccupancy();
  const sky = useWeather();
  const emergencyStage = useEmergencyStage();
  const emergency = emergencyStage === 'braking' || emergencyStage === 'stopped';

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
  const label = phase === 'dwell' ? t.hud.currentStation : t.hud.nextStation;
  const color = BAND_COLOR[occupancy.band];
  // En japonais, le nom en kanji passe devant et le rōmaji devient la mention
  // secondaire — l'inverse des deux autres langues.
  const primary = lang === 'ja' ? st.kanji : st.romaji;
  const secondary = lang === 'ja' ? st.romaji : st.kanji;

  return (
    <>
      <div className="hud-top">
        <div className="hud-clock">{clock}</div>
        <div className="hud-weather" title={t.hud.weatherTitle}>
          <span className="hud-weather-glyph" aria-hidden="true">
            {WEATHER_GLYPH[sky.kind]}
          </span>
          <span className="hud-weather-kind">{t.hud.weather[sky.kind]}</span>
          <span className="hud-weather-temp">{Math.round(sky.tempC)}&nbsp;°C</span>
        </div>
        <div className="hud-station">
          <span className="hud-station-label">{label}</span>
          <span className="hud-station-name">
            <span className="hud-jy">{st.jy}</span> {primary} <span className="hud-kanji">{secondary}</span>
          </span>
        </div>
        <div
          className="hud-occupancy"
          style={{ borderColor: color, color }}
          title={t.hud.occupancyTitle}
        >
          <span className="hud-occupancy-pct">~{occupancy.percent}&nbsp;%</span>
          <span className="hud-occupancy-label">{t.hud.band[occupancy.band]}</span>
        </div>
        <div className={`hud-phase hud-phase-${emergency ? 'emergency' : phase}`}>
          {emergency ? t.hud.phaseEmergency : t.hud.phase[phase]}
        </div>
      </div>

      <div className="hud-reticle" aria-hidden="true" />


      <div className="hud-bottom">
        <LanguageSwitcher className="lang-switch-hud" />
        <QualitySelect className="quality-select-hud" />
        <button className="hud-button" onClick={toggleMute} title={t.hud.soundTitle}>
          {muted ? t.hud.soundOff : t.hud.soundOn}
        </button>
        <input
          className="hud-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          title={t.hud.volume}
          aria-label={t.hud.volume}
        />
        <button
          className="hud-button"
          onClick={() => {
            input.sitRequest = true;
          }}
        >
          {seated ? t.hud.stand : t.hud.sit}
        </button>
        <button
          className="hud-button"
          onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
          title={t.hud.fullscreenTitle}
        >
          {t.hud.fullscreen}
        </button>
      </div>
    </>
  );
}
