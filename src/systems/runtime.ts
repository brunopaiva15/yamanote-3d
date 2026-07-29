// Valeurs continues mutées chaque frame (jamais dans React) : la boucle 60 fps
// lit et écrit ici, les composants three lisent dans leur useFrame.

import { CONFIG } from '../data/config';
import type { TokyoDate } from '../data/occupancy';

/**
 * Repère de marche du joueur : dans le wagon, ou sur le quai. Défini ici (et
 * non dans systems/playerFrame) pour que runtime reste sans dépendance.
 */
export type PlayerFrame = 'car' | 'platform';

/**
 * Nature d'un arrêt subi en pleine voie : coup de frein (急停車) ou coupure de
 * la caténaire (停電). Déclaré ici pour que runtime reste sans dépendance.
 */
export type EmergencyKind = 'brake' | 'outage';

export interface TokyoNow {
  minutes: number;
  year: number;
  month: number;
  day: number;
  weekday: number;
}

// Instant civil + horloge à Tokyo (UTC+9).
export function tokyoNow(): TokyoNow {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    const second = Number(get('second'));
    return {
      minutes: hour * 60 + minute + second / 60,
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      weekday: weekdayMap[get('weekday')] ?? new Date().getUTCDay(),
    };
  } catch {
    const fallback = new Date();
    return {
      minutes: CONFIG.clockStart,
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
      weekday: fallback.getDay(),
    };
  }
}

// Heure réelle à Tokyo (UTC+9), en minutes depuis minuit.
export function tokyoMinutesNow(): number {
  return tokyoNow().minutes;
}

function defaultTokyoDate(): TokyoDate {
  const n = tokyoNow();
  return { year: n.year, month: n.month, day: n.day, weekday: n.weekday };
}

export const runtime = {
  speed: 0, // m/s
  accel: 0, // m/s²
  distance: 0, // m parcourus depuis le début
  phaseT: 0, // temps écoulé dans la phase courante (s)
  doorOpen: 0, // 0 fermé → 1 ouvert (porte de référence de la rame)
  doorTarget: 0,
  doorT: 999, // temps écoulé depuis le changement de cible (s)
  psdOpen: 0, // portes palières du quai, décalées sur la rame
  psdTarget: 0,
  psdT: 999,
  // Cette gare-ci en a-t-elle seulement ? Shinjuku et Shibuya n'en ont
  // toujours pas : le seuil de porte, le son du quai et la mécanique des
  // vantaux doivent alors ignorer psdOpen, qui continue pourtant de battre.
  psdPresent: true,
  clockMin: CONFIG.clockStart, // horloge du monde, en minutes (flottant)
  tokyoDate: defaultTokyoDate() as TokyoDate,
  swayTime: 0,
  sway: 0, // balancement latéral normalisé (-1..1)
  platformFade: 0, // présence du quai 0..1 (visibilité / approche, plus d'opacité)
  platformSlide: 0, // décalage Z du quai (m) : négatif à l'approche, positif au départ
  /**
   * Écart d'arrêt de la rame par rapport au repère de la gare (m, positif =
   * arrêtée un peu au-delà). Aucune rame ne se pose au millimètre sur son
   * 定位置 : la tolérance JR East est de ±35 cm, et le TASC en garde une
   * dizaine de centimètres. C'est ce petit décalage qu'on lit entre les portes
   * palières et celles de la rame — sans lui, les deux baies coïncidaient
   * parfaitement à chaque arrêt de chaque gare, ce que rien de réel ne fait.
   *
   * Vaut `platformSlide` à quai (repère wagon) et `−trainZ` (repère gare).
   */
  berthOffset: 0,
  departStartDist: 0, // runtime.distance à l'entrée de la phase depart (glissement réel du quai)
  playerX: 0, // position du joueur en repère MONDE
  playerY: 1.55,
  playerZ: 4.2,
  /**
   * Repère dans lequel vit le joueur. À bord, le monde ≡ le repère du wagon
   * (le train est fixe à l'origine). Sur le quai, c'est la gare qui est fixe
   * et la rame qui glisse : les deux repères divergent, d'où la publication
   * séparée ci-dessous.
   */
  playerFrame: 'car' as PlayerFrame,
  /**
   * Position d'APPUI du joueur en repère monde : où il a les pieds, sans le
   * balancement de caméra.
   *
   * `playerX/Z` est l'ŒIL, et l'œil oscille avec la caisse (± 2 cm à pleine
   * vitesse, `three/Player`). C'est ce qu'il faut pour les regards, le son et
   * le viseur ; c'est exactement ce qu'il ne faut pas pour décider qui a un
   * pied dans l'encadrement d'une porte — deux centimètres d'oscillation
   * suffisaient à le faire croire de quelqu'un simplement adossé au fond de
   * l'alcôve, et à lui ouvrir le seuil en pleine course.
   */
  stanceX: 0,
  stanceZ: 4.2,
  playerCarX: 0, // position du joueur dans le repère du wagon (regards des PNJ à bord)
  playerCarY: 1.55,
  playerCarZ: 4.2,
  playerPlatX: 0, // position du joueur dans le repère local du quai (côté +x, avant rotation)
  playerPlatY: 1.55,
  playerPlatZ: 0,
  // Direction du regard (vecteur unitaire monde). Les PNJ savaient déjà où
  // est le joueur ; pour SAVOIR QUI IL REGARDE (systems/paxTargeting), il faut
  // aussi savoir où il regarde.
  lookX: 0,
  lookY: 0,
  lookZ: -1,
  /**
   * Glissement longitudinal de la rame (m), appliqué par TrainRig. Vaut 0 tant
   * que le joueur est à bord : le train reste fixe à l'origine et c'est le
   * monde qui défile, exactement comme avant. Le décor défilant vers +z, un
   * train qui part s'en va vers les z négatifs.
   */
  trainZ: 0,
  /** false entre deux rames : tous les seuils de porte sont infranchissables. */
  trainPresent: true,
  /**
   * Occlusion du décor de voie côté quai (0..1). Le quai masquait jusqu'ici
   * les poteaux, murs et clôtures qui traversent son emprise ; dès qu'on
   * marche dessus il faut les retirer explicitement.
   */
  platformOcclusion: 0,
  // Blocages de départ : la mélodie s'arrête, le train reste à quai portes ouvertes.
  departureBlockers: {
    doorBlocked: false,
    heldAtStation: false,
    signalStop: false,
    emergency: false,
  },
  /**
   * Train hors service : la 発車メロディ ne sonne pas.
   *
   * RÉSERVÉ, et sans producteur : rien ne le pose aujourd'hui, parce que la
   * boucle du jeu n'a pas de rame de service. Il reste parce que les prédicats
   * de `data/melodies` sont écrits sur le contrat réel du quai, où cet état
   * existe — et une garde qui manque coûte plus cher qu'une garde qui dort.
   */
  outOfService: false,
  /** Arrêt terminus : autre mélodie, ou silence. Réservé comme `outOfService`. */
  terminusStop: false,
  /**
   * La rame se range sur la voie SECONDAIRE de la gare (Ōsaki 内 2 / 外 4,
   * Ikebukuro 内 5 / 外 8). Posé à chaque arrêt par
   * `stationCycle.randomizeStopTimings`, avant la mesure de la fenêtre sonore :
   * c'est le quai qui décide de la mélodie, donc de la durée de l'arrêt.
   *
   * Indépendant de `terminusStop` : un départ voyageurs ordinaire peut partir
   * de la voie secondaire, et c'est même le cas courant à Ōsaki.
   */
  useAlternativePlatform: false,
  /**
   * Arrêt subi en pleine voie, rare. Deux natures, et elles ne se ressemblent
   * pas (voir `kind`) : le coup de frein (急停車) et la coupure de caténaire
   * (停電). Piloté par stationCycle, uniquement pendant la phase cruise — le
   * chrono de phase est gelé à l'arrêt, avancé au prorata de la vitesse
   * pendant la décélération et la reprise.
   */
  emergencyStop: {
    /**
     * `brake` : freinage d'urgence, immobilisation de 45 s à 2 min 30 avec
     * annonces, puis reprise. La rame n'a jamais cessé d'être alimentée.
     *
     * `outage` : coupure totale de la caténaire. La traction disparaît d'un
     * coup, la rame roule sur son élan quelques secondes, le conducteur la
     * pose au frein pneumatique — et elle NE REPART PAS toute seule : la
     * E235-0 de la Yamanote n'a pas de batterie de traction (celle des
     * E235-1000 Yokosuka / Sōbu est venue après). Il faut attendre le retour
     * de la tension.
     */
    kind: 'brake' as EmergencyKind,
    stage: 'none' as 'none' | 'coasting' | 'braking' | 'stopped' | 'resuming',
    /** Temps écoulé dans l'étape courante (s). */
    t: 0,
    /** Durée d'immobilisation tirée au sort (s). */
    holdFor: 0,
    /** Motif (index dans EMERGENCY_REASONS). */
    reason: 0,
  },
  /**
   * Alimentation de bord (0 = coupée, 1 = normale).
   *
   * Ce n'est pas un interrupteur mais un fondu court : les convertisseurs ne
   * s'éteignent pas instantanément, l'éclairage s'affaisse avant de lâcher, et
   * au retour de la tension tout ne revient pas au même instant. Lue par le
   * rendu (néons du wagon, bandeau LED, dalles LCD, écrans publicitaires) et
   * par le moteur audio (souffle de climatisation, onduleur).
   *
   * Ce qui reste allumé en dessous est ce qui tient sur les batteries de bord :
   * lampes de secours, sono du conducteur, interphone, signalisation de porte.
   */
  carPower: 1,
  /**
   * Éclairage de secours (0 = éteint, 1 = plein), sur les batteries de bord.
   *
   * Séparé de `carPower`, et surtout PAS son complément : le relais de secours
   * ne bascule pas au premier décrochage du convertisseur, il attend que
   * l'alimentation normale soit vraiment perdue. Des lampes de secours qui
   * battraient en opposition de phase avec les néons ne ressembleraient à rien.
   */
  emergencyLight: 0,
  /** Identifiant stable de la rame (pour departureId anti double-lecture). */
  trainId: 'yamanote-e235-1',
  /** Compteur d'arrêts depuis le début de la session (incrémenté à chaque dwell). */
  stopSequence: 0,
  /** Dernier departureId pour lequel une 発車メロディ a été lancée. */
  lastMelodyDepartureId: null as string | null,
};

/** Avance l'horloge ; si on passe minuit, incrémente la date Tokyo d'un jour. */
export function advanceClock(dtSeconds: number): void {
  runtime.clockMin += dtSeconds / 60;
  while (runtime.clockMin >= 24 * 60) {
    runtime.clockMin -= 24 * 60;
    const d = runtime.tokyoDate;
    const utc = Date.UTC(d.year, d.month - 1, d.day + 1);
    const next = new Date(utc);
    runtime.tokyoDate = {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      weekday: next.getUTCDay(),
    };
  }
}

export function resetRuntime(): void {
  runtime.speed = 0;
  runtime.accel = 0;
  runtime.distance = 0;
  runtime.phaseT = 0;
  runtime.doorOpen = 0;
  runtime.doorTarget = 0;
  runtime.doorT = 999;
  runtime.psdOpen = 0;
  runtime.psdTarget = 0;
  runtime.psdT = 999;
  runtime.clockMin = CONFIG.clockStart;
  runtime.tokyoDate = defaultTokyoDate();
  runtime.swayTime = 0;
  runtime.sway = 0;
  runtime.platformFade = 0;
  runtime.platformSlide = 0;
  runtime.berthOffset = 0;
  runtime.departStartDist = 0;
  runtime.playerFrame = 'car';
  runtime.stanceX = 0;
  runtime.stanceZ = 4.2;
  runtime.playerCarX = 0;
  runtime.playerCarY = 1.55;
  runtime.playerCarZ = 4.2;
  runtime.playerPlatX = 0;
  runtime.playerPlatY = 1.55;
  runtime.playerPlatZ = 0;
  runtime.trainZ = 0;
  runtime.trainPresent = true;
  runtime.platformOcclusion = 0;
  runtime.departureBlockers.doorBlocked = false;
  runtime.departureBlockers.heldAtStation = false;
  runtime.departureBlockers.signalStop = false;
  runtime.departureBlockers.emergency = false;
  runtime.emergencyStop.kind = 'brake';
  runtime.emergencyStop.stage = 'none';
  runtime.emergencyStop.t = 0;
  runtime.emergencyStop.holdFor = 0;
  runtime.emergencyStop.reason = 0;
  runtime.carPower = 1;
  runtime.emergencyLight = 0;
  runtime.outOfService = false;
  runtime.terminusStop = false;
  runtime.useAlternativePlatform = false;
  runtime.trainId = 'yamanote-e235-1';
  runtime.stopSequence = 0;
  runtime.lastMelodyDepartureId = null;
}
