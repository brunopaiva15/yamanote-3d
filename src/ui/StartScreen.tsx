// Menu principal, composé comme un ekimeiban (panneau de nom de gare) JR East :
// panneau blanc sur fond sombre, logo en pièce maîtresse, bande à la couleur
// de la ligne avec les deux sens de circulation, puis les commandes et le
// bouton qui débloque l'audio (contrainte navigateur) avant de lancer
// l'expérience. La bande et les mentions 内回り／外回り restent en japonais :
// c'est de la signalétique, pas de l'interface (cf. src/i18n).
//
// Avant de monter, on peut (sans y être obligé) choisir la date, l'heure et
// l'arrêt : par défaut, instant réel à Tokyo et gare tirée au hasard, comme
// avant. La date n'est pas un détail d'état civil - c'est elle qui donne la
// SAISON (systems/season) : la couleur des frondaisons, la hauteur du soleil,
// l'heure à laquelle la nuit tombe, et le temps qu'il fait dehors.

import { useEffect, useState } from 'react';
import type { LoopDirection } from '../data/platforms';
import { STATIONS } from '../data/stations';
import type { TokyoDate } from '../data/occupancy';
import { useStore } from '../store';
import { useT } from '../i18n';
import { runtime, tokyoNow } from '../systems/runtime';
import { presenceEnabled, subscribeOnlineCount } from '../systems/presence';
import { loadGame } from '../gameLoader';
import { LanguageSwitcher } from './LanguageSwitcher';
import { QualitySelect } from './QualitySelect';
import { QualityNotice } from './QualityNotice';
import { Logo } from './Logo';
import { Footer } from './Footer';

/** Minutes depuis minuit → chaîne HH:MM pour un <input type="time">. */
function minutesToTimeValue(minutes: number): string {
  const total = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Chaîne HH:MM (éventuellement HH:MM:SS) → minutes depuis minuit. */
function timeValueToMinutes(value: string): number {
  const [hRaw, mRaw] = value.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return tokyoNow().minutes;
  return ((Math.floor(h) % 24) * 60 + Math.floor(m) + 24 * 60) % (24 * 60);
}

// Pointeur grossier = doigt : le pense-bête des touches n'aurait aucun sens,
// on affiche les gestes. Interrogé en media query plutôt qu'au premier
// touchstart (store.touch) : ici il faut la réponse avant tout contact.
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return coarse;
}

/** Date Tokyo → chaîne AAAA-MM-JJ pour un <input type="date">. */
function dateToValue(d: { year: number; month: number; day: number }): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/**
 * Chaîne AAAA-MM-JJ → date civile Tokyo, jour de semaine compris.
 *
 * Le quantième est reconstruit en UTC : `new Date('2025-01-05')` est déjà de
 * l'UTC minuit, mais `getDay()` le relit dans le fuseau du navigateur - à
 * Paris on obtient encore le 4 au soir, donc le mauvais jour de la semaine, et
 * avec lui la mauvaise densité de voyageurs.
 */
function valueToDate(value: string): TokyoDate | null {
  const [y, m, d] = value.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(utc.getTime())) return null;
  return { year: y, month: m, day: d, weekday: utc.getUTCDay() };
}

/** Valeur sentinelle du sélecteur : laisser randomizeEntry tirer la gare. */
const STATION_RANDOM = 'random';

/** Même sentinelle pour le sens : la boucle en fait tourner autant des deux. */
const DIRECTION_RANDOM = 'random';

/** Compteur optionnel, abonné uniquement tant que le menu principal est ouvert. */
function useOnlineCount(): number | null {
  const [online, setOnline] = useState<number | null>(presenceEnabled ? 0 : null);
  useEffect(() => {
    if (!presenceEnabled) return;
    return subscribeOnlineCount(setOnline);
  }, []);
  return online;
}

export function StartScreen() {
  const start = useStore((s) => s.start);
  const t = useT();
  const coarsePointer = useCoarsePointer();
  const online = useOnlineCount();
  const [loading, setLoading] = useState(false);
  // Heure de départ : figée à l'ouverture du menu (Tokyo), modifiable ensuite.
  const [timeValue, setTimeValue] = useState(() => minutesToTimeValue(tokyoNow().minutes));
  // true tant que le joueur n'a pas touché le champ : on suit l'heure réelle.
  const [timePinned, setTimePinned] = useState(false);
  const [dateValue, setDateValue] = useState(() => dateToValue(tokyoNow()));
  const [stationChoice, setStationChoice] = useState<string>(STATION_RANDOM);
  const [directionChoice, setDirectionChoice] = useState<string>(DIRECTION_RANDOM);

  // Tant que l'heure n'est pas figée par le joueur, la rafraîchir doucement
  // pour que le pied de carte et le champ restent calés sur Tokyo.
  useEffect(() => {
    if (timePinned) return;
    const tick = () => {
      const now = tokyoNow();
      setTimeValue(minutesToTimeValue(now.minutes));
      setDateValue(dateToValue(now));
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [timePinned]);

  const syncTimeToNow = () => {
    const now = tokyoNow();
    setTimeValue(minutesToTimeValue(now.minutes));
    setDateValue(dateToValue(now));
    setTimePinned(false);
  };

  const board = async () => {
    setLoading(true);
    // Laisser React peindre l'état de chargement avant d'entamer les imports et
    // la préparation synchrones, qui peuvent sinon monopoliser le thread
    // principal jusqu'au premier écran (gris) de la scène 3D.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // C'est seulement cette action utilisateur qui ouvre le chunk du jeu.
    // Le téléchargement se fait en parallèle de la préparation de la partie.
    const gamePromise = loadGame();
    const {
      prepareGame,
    } = await import('../systems/startGame');
    // Horloge Tokyo (réelle ou choisie) avant peuplement et tirage : densité
    // selon heure/jour. La date civile reste celle du jour à Tokyo.
    const now = tokyoNow();
    runtime.clockMin = timeValueToMinutes(timeValue);
    // La date choisie (ou celle du jour à Tokyo) : elle commande la densité de
    // voyageurs, la saison et, à travers elle, la météo du jour.
    runtime.tokyoDate = valueToDate(dateValue) ?? {
      year: now.year,
      month: now.month,
      day: now.day,
      weekday: now.weekday,
    };
    // Gare choisie, ou point aléatoire sur la boucle (en route, freinage,
    // à quai, départ…) : plus de message d'accueil fixe ni de départ
    // systématique à l'arrêt.
    const stationIndex =
      stationChoice === STATION_RANDOM ? undefined : Number(stationChoice);
    // Le sens : 内回り, 外回り, ou pile ou face si on n'a rien demandé.
    const direction =
      directionChoice === DIRECTION_RANDOM ? undefined : (directionChoice as LoopDirection);
    // `?plateau=1` : embarquer directement sur le tronçon du prototype PLATEAU,
    // plutôt que d'attendre le tour de boucle qu'un tirage aléatoire
    // imposerait. Sans le paramètre, plateauEntryStation() renvoie undefined et
    // le boarding normal - gare tirée au sort, ou choisie dans le menu -
    // reprend la main sans détour.
    await Promise.all([
      gamePromise,
      prepareGame(Number.isFinite(stationIndex) ? stationIndex : undefined, direction),
    ]);
    start();
  };

  return (
    <div className="start-screen">
      <div className="start-board">
        <LanguageSwitcher className="lang-switch-board" />
        {/* Le titre de la page, en texte : une fois React monté, c'est le seul
            endroit où le document nomme ce qu'il est. Il est masqué à l'œil
            parce que le logo juste dessous le dit déjà, en plus grand - mais un
            dessin n'est pas un titre, ni pour un lecteur d'écran ni pour un
            moteur de recherche, et le logo est donc décoratif (voir Logo). */}
        <h1 className="visually-hidden">Yamanote 3D - 山手線</h1>
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
          {coarsePointer
            ? t.start.touchControls.map((hint) => (
                <li key={hint.action}>
                  <span className="start-keys">
                    {hint.gestures.map((gesture) => (
                      <span className="start-gesture" key={gesture}>
                        {gesture}
                      </span>
                    ))}
                  </span>
                  <span className="start-action">{hint.action}</span>
                </li>
              ))
            : t.start.controls.map((hint) => (
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
        <div className="start-options">
          <div className="start-option">
            <label className="start-option-label" htmlFor="start-date">
              {t.start.dateLabel}
            </label>
            <input
              id="start-date"
              className="start-time-input start-date-input"
              type="date"
              value={dateValue}
              onChange={(e) => {
                setDateValue(e.target.value);
                setTimePinned(true);
              }}
              aria-label={t.start.dateLabel}
            />
          </div>
          <div className="start-option">
            <label className="start-option-label" htmlFor="start-time">
              {t.start.timeLabel}
            </label>
            <div className="start-time-row">
              <input
                id="start-time"
                className="start-time-input"
                type="time"
                value={timeValue}
                onChange={(e) => {
                  setTimeValue(e.target.value);
                  setTimePinned(true);
                }}
                aria-label={t.start.timeLabel}
              />
              <button
                type="button"
                className="start-time-now"
                onClick={syncTimeToNow}
                title={t.start.tokyoTime}
              >
                {t.start.timeNow}
              </button>
            </div>
          </div>
          <div className="start-option">
            <label className="start-option-label" htmlFor="start-station">
              {t.start.stationLabel}
            </label>
            <select
              id="start-station"
              className="quality-select start-station-select"
              value={stationChoice}
              onChange={(e) => setStationChoice(e.target.value)}
              aria-label={t.start.stationLabel}
            >
              <option value={STATION_RANDOM}>{t.start.stationRandom}</option>
              {STATIONS.map((st, i) => (
                <option key={st.jy} value={String(i)}>
                  {st.jy} {st.kanji} / {st.romaji}
                </option>
              ))}
            </select>
          </div>
          <div className="start-option">
            <label className="start-option-label" htmlFor="start-direction">
              {t.start.directionLabel}
            </label>
            <select
              id="start-direction"
              className="quality-select start-station-select"
              value={directionChoice}
              onChange={(e) => setDirectionChoice(e.target.value)}
              aria-label={t.start.directionLabel}
            >
              <option value={DIRECTION_RANDOM}>{t.start.directionRandom}</option>
              {/* Les deux sens gardent leur nom japonais, comme la bande
                  ci-dessus : c'est ainsi qu'ils sont écrits sur les quais. */}
              <option value="inner">内回り - Uchi-mawari</option>
              <option value="outer">外回り - Soto-mawari</option>
            </select>
          </div>
          <div className="start-option">
            <span className="start-option-label">{t.quality.label}</span>
            <QualitySelect />
          </div>
          <QualityNotice />
        </div>
        <p className="start-foot">
          {t.start.tokyoTime}
          <strong>{timeValue}</strong>
        </p>
        {/* Information secondaire : visible avant d'embarquer seulement, près
            du pied de menu plutôt que dans le HUD de l'expérience. */}
        {online != null && online > 0 && (
          <p className="start-online" title={t.hud.onlineTitle}>
            <span className="start-online-dot" aria-hidden="true" />
            <span>
              {online} {t.hud.online}
            </span>
          </p>
        )}
        <Footer />
      </div>
    </div>
  );
}
