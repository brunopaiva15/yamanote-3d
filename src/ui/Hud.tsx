// HUD sobre : horloge, prochaine station, phase, remplissage, réglages son,
// s'asseoir, plein écran, sélecteur de langue. Réticule central discret.
// Tous les libellés viennent du dictionnaire de la langue courante.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { LOOP_LABEL_JP } from '../data/loop';
import { STATIONS } from '../data/stations';
import { BAND_COLOR, type OccupancyBand } from '../data/occupancy';
import { useT } from '../i18n';
import { runtime, type EmergencyKind } from '../systems/runtime';
import { currentSegmentOccupancy } from '../systems/occupancy';
import { weather, type WeatherKind } from '../systems/weather';
import { setVolume as setAudioVolume, setMuted } from '../systems/audioEngine';
import { applySpeechVolume, cancelSpeech } from '../systems/speech';
import { input } from '../systems/input';
import { fullscreenAvailable, toggleFullscreen } from '../systems/browser';
import { LanguageSwitcher } from './LanguageSwitcher';
import { QualitySelect } from './QualitySelect';
import { IncidentMenu } from './IncidentMenu';

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

/**
 * La vitesse est une valeur continue du runtime. La sonder dix fois par
 * seconde garde l'affichage réactif sans faire re-rendre le HUD à 60 fps.
 * Le runtime travaille en m/s ; le voyageur, lui, la lit en km/h.
 */
function useSpeed(): number {
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    const tick = () => setSpeed(Math.max(0, Math.round(runtime.speed * 3.6)));
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, []);
  return speed;
}

// L'arrêt subi vit dans runtime (pas dans le store) : on le sonde comme
// l'horloge. Le badge ne le signale que pendant la décélération et
// l'immobilisation, tandis que la remontée en vitesse ('resuming') s'affiche
// déjà « En route ». Les deux natures ont leur libellé : un coup de frein et
// une coupure de caténaire ne se vivent pas de la même façon, et le HUD est le
// seul endroit du jeu qui les nomme.
type EmergencyStage = typeof runtime.emergencyStop.stage;

function useEmergency(): { stage: EmergencyStage; kind: EmergencyKind } {
  const [state, setState] = useState<{ stage: EmergencyStage; kind: EmergencyKind }>({
    stage: 'none',
    kind: 'brake',
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const em = runtime.emergencyStop;
      setState((prev) =>
        prev.stage === em.stage && prev.kind === em.kind ? prev : { stage: em.stage, kind: em.kind },
      );
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  return state;
}

/**
 * Le temps qu'il fait, sondé comme l'horloge - il vit dans `systems/weather`,
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
 * c'est dehors qu'il faut regarder - le badge ne fait que nommer ce qu'on voit.
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

/**
 * La barre du bas s'enroule sur une ou deux rangées selon la langue et la
 * largeur de l'écran. On publie sa hauteur réelle en variable CSS pour que le
 * joystick et les boutons tactiles se posent dessus au lieu de la recouvrir -
 * c'est ce qui faisait se chevaucher deux « s'asseoir » sur un téléphone.
 */
function useBarHeight(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const bar = ref.current;
    if (!active || !bar) {
      root.style.removeProperty('--hud-bar-h');
      return;
    }
    const apply = () => {
      root.style.setProperty('--hud-bar-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--hud-bar-h');
    };
  }, [active]);
  return ref;
}

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
  const loopDirection = useStore((s) => s.loopDirection);
  const muted = useStore((s) => s.muted);
  const volume = useStore((s) => s.volume);
  const seated = useStore((s) => s.seated);
  const onPlatform = useStore((s) => s.onPlatform);
  const touch = useStore((s) => s.touch);
  const toggleMute = useStore((s) => s.toggleMute);
  const setVolume = useStore((s) => s.setVolume);
  const lang = useStore((s) => s.lang);
  const t = useT();
  const clock = useClock();
  const speed = useSpeed();
  const occupancy = useOccupancy();
  const sky = useWeather();
  const em = useEmergency();
  const emergency = em.stage === 'coasting' || em.stage === 'braking' || em.stage === 'stopped';
  const outage = emergency && em.kind === 'outage';
  const barRef = useBarHeight(started);
  const [fullscreen] = useState(fullscreenAvailable);

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
  // secondaire - l'inverse des deux autres langues.
  const primary = lang === 'ja' ? st.kanji : st.romaji;
  const secondary = lang === 'ja' ? st.romaji : st.kanji;

  return (
    <>
      <div className="hud-top">
        <div className="hud-clock">{clock}</div>
        {!onPlatform && (
          <div
            className="hud-speed"
            title={t.hud.speedTitle}
            aria-label={`${t.hud.speedTitle}: ${speed} km/h`}
          >
            <span className="hud-speed-value">{speed}</span>
            <span className="hud-speed-unit" aria-hidden="true">
              km/h
            </span>
          </div>
        )}
        <div className="hud-weather" title={t.hud.weatherTitle}>
          <span className="hud-weather-glyph" aria-hidden="true">
            {WEATHER_GLYPH[sky.kind]}
          </span>
          <span className="hud-weather-kind">{t.hud.weather[sky.kind]}</span>
          <span className="hud-weather-temp">{Math.round(sky.tempC)}&nbsp;°C</span>
        </div>
        <div className="hud-station">
          <span className="hud-station-label">
            {label}
            {/* Le sens reste en japonais : c'est de la signalétique, pas de
                l'interface - comme la bande 内回り／外回り du menu. */}
            <span className="hud-direction" lang="ja">
              {LOOP_LABEL_JP[loopDirection]}
            </span>
          </span>
          <span className="hud-station-name">
            <span className="hud-jy">{st.jy}</span> {primary} <span className="hud-kanji">{secondary}</span>
          </span>
        </div>
        <div className="hud-occupancy" style={{ borderColor: color, color }} title={t.hud.occupancyTitle}>
          <span className="hud-occupancy-pct">~{occupancy.percent}&nbsp;%</span>
          <span className="hud-occupancy-label">{t.hud.band[occupancy.band]}</span>
        </div>
        <div className={`hud-phase hud-phase-${outage ? 'outage' : emergency ? 'emergency' : phase}`}>
          {outage ? t.hud.phaseOutage : emergency ? t.hud.phaseEmergency : t.hud.phase[phase]}
        </div>
      </div>

      <div className="hud-reticle" aria-hidden="true" />

      <div className="hud-bottom" ref={barRef}>
        <LanguageSwitcher className="lang-switch-hud" />
        <QualitySelect className="quality-select-hud" />
        {/* Le son et son curseur voyagent ensemble quand la barre passe à la
            ligne : un curseur seul, loin de son bouton, ne se règle pas. */}
        <div className="hud-sound">
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
        </div>
        {/* Au doigt, « s'asseoir » est déjà le gros bouton du coin bas droit
            (ui/Controls) : le doubler ici ne ferait que se recouvrir. */}
        {!touch && (
          <button
            className="hud-button"
            onClick={() => {
              input.sitRequest = true;
            }}
          >
            {seated ? t.hud.stand : t.hud.sit}
          </button>
        )}
        {fullscreen && (
          <button
            className="hud-button"
            onClick={() => void toggleFullscreen()}
            title={t.hud.fullscreenTitle}
          >
            {t.hud.fullscreen}
          </button>
        )}
        {/* En bout de barre, après les réglages : ce n'en est pas un. */}
        <IncidentMenu />
      </div>
    </>
  );
}
