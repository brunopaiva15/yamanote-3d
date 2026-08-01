// Traductions de l'interface (FR / EN / JA) et détection automatique de la
// langue. Ce module ne dépend d'aucun store : il est importé aussi bien par
// store.ts (état initial) que par les composants d'interface.
//
// À noter : la signalétique EMBARQUÉE (annonces sonores, écrans LCD, affiches,
// panneaux de quai) reste en japonais/anglais comme dans une vraie rame -
// c'est du décor, pas de l'interface. Seul le HUD du joueur est traduit.

export type Lang = 'fr' | 'en' | 'ja';

export const LANGS: readonly Lang[] = ['fr', 'en', 'ja'];

/** Libellé long, dans la langue elle-même (menu, aria-label). */
export const LANG_LABEL: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  ja: '日本語',
};

/** Libellé court du sélecteur - tient dans la barre du HUD. */
export const LANG_SHORT: Record<Lang, string> = {
  fr: 'FR',
  en: 'EN',
  ja: '日本語',
};

/** Une ligne du pense-bête des commandes : des touches, puis l'action. */
export interface ControlHint {
  keys: readonly string[];
  action: string;
}

/** Une ligne du même pense-bête, version tactile : un geste ou un bouton. */
export interface TouchHint {
  gestures: readonly string[];
  action: string;
}

export interface Strings {
  /** Valeur de l'attribut lang du document. */
  htmlLang: string;
  /**
   * Titre de l'onglet - et titre du résultat dans un moteur de recherche. Le
   * nom d'abord (c'est lui qu'on cherche), 山手線 pour être trouvé en japonais,
   * puis ce que la page fait. Une soixantaine de caractères : au-delà, Google
   * tronque.
   */
  documentTitle: string;
  /**
   * Description de la page, reprise telle quelle en extrait de résultat et
   * dans les aperçus de partage. Une phrase pleine de 150 à 160 caractères :
   * ce qu'on fait, où, et à quoi ça ressemble.
   */
  documentDescription: string;
  /** Étiquette de locale Open Graph (`og:locale`), au format langue_PAYS. */
  ogLocale: string;

  start: {
    tagline: string;
    intro: string;
    board: string;
    loading: string;
    controls: readonly ControlHint[];
    /** Affiché à la place de `controls` sur un écran tactile. */
    touchControls: readonly TouchHint[];
    tokyoTime: string;
    /** Libellé du champ heure (écran d'accueil). */
    timeLabel: string;
    /** Remet la date et l'heure sur l'instant réel à Tokyo. */
    timeNow: string;
    /** Libellé du champ date (écran d'accueil) : c'est lui qui donne la saison. */
    dateLabel: string;
    /** Libellé du sélecteur de gare. */
    stationLabel: string;
    /** Option « laisser le hasard choisir la gare ». */
    stationRandom: string;
    /** Libellé du sélecteur de sens de circulation. */
    directionLabel: string;
    /** Option « laisser le hasard choisir le sens ». */
    directionRandom: string;
  };

  hud: {
    phase: { cruise: string; brake: string; dwell: string; depart: string };
    /** Bandeau de phase pendant un arrêt d'urgence en pleine voie. */
    phaseEmergency: string;
    /** Bandeau de phase pendant une coupure de caténaire (rame non alimentée). */
    phaseOutage: string;
    currentStation: string;
    nextStation: string;
    /** Bulle et libellé accessible de l'indicateur de vitesse. */
    speedTitle: string;
    occupancyTitle: string;
    band: {
      empty: string;
      light: string;
      moderate: string;
      busy: string;
      crowded: string;
      packed: string;
      crushed: string;
    };
    /** Étiquette du badge « voyageurs en ligne » (après le nombre). */
    online: string;
    /** Bulle du badge « voyageurs en ligne ». */
    onlineTitle: string;
    /** Bulle du bandeau météo. */
    weatherTitle: string;
    /** Le temps qu'il fait, dans l'ordre de systems/weather. */
    weather: {
      clear: string;
      fair: string;
      overcast: string;
      drizzle: string;
      rain: string;
      downpour: string;
      thunder: string;
      sleet: string;
      snow: string;
    };
    soundOn: string;
    soundOff: string;
    soundTitle: string;
    volume: string;
    sit: string;
    stand: string;
    /**
     * Refus affiché devant une porte d'une autre voiture. `{car}` est remplacé
     * par le numéro de la voiture du joueur.
     */
    wrongDoor: string;
    /** Invite affichée quand on a un voyageur en face de soi. */
    talk: string;
    /** Bouton tactile de la même action. */
    talkShort: string;
    fullscreen: string;
    fullscreenTitle: string;
    /** Avertissement affiché dans les espaces souterrains encore inachevés. */
    stationDevelopment: {
      title: string;
      detail: string;
    };
  };

  quality: {
    label: string;
    levels: {
      veryLow: string;
      low: string;
      medium: string;
      high: string;
      veryHigh: string;
      ultra: string;
    };
  };

  /**
   * Le menu qui provoque un arrêt en pleine voie. Les deux événements
   * arrivent d'eux-mêmes, mais rarement - celui du courant peut demander
   * plusieurs heures de trajet. Ce menu ne les invente pas : il avance
   * simplement le tirage.
   */
  incidents: {
    /** Bouton du HUD (icône seule) : bulle et libellé pour les lecteurs d'écran. */
    label: string;
    /** Titre du panneau déroulé. */
    title: string;
    /** Pourquoi rien n'est déclenchable : on n'est pas en pleine voie. */
    onlyOnTheRun: string;
    /** Pourquoi rien n'est déclenchable : il y en a déjà un en cours. */
    alreadyRunning: string;
    brake: { name: string; note: string };
    outage: { name: string; note: string };
    assistance: { name: string; note: string; unavailable: string };
  };

  language: string;

  footer: {
    about: string;
    disclaimer: string;
    support: string;
  };
}

const FR: Strings = {
  htmlLang: 'fr',
  documentTitle: 'Yamanote 3D - 山手線 · la ligne Yamanote de Tokyo en 3D',
  documentDescription:
    'La ligne Yamanote de Tokyo en 3D dans le navigateur : montez dans une rame E235, marchez dans le wagon, descendez sur le quai. Trente gares, aucun objectif.',
  ogLocale: 'fr_FR',
  start: {
    tagline: 'Une boucle. Trente stations. Aucun objectif.',
    intro:
      "Une boucle de trente stations autour de Tokyo, en temps quasi réel. Rien à gagner : on s'assoit, on regarde la ville, on écoute les annonces.",
    board: 'Monter à bord',
    loading: 'Chargement…',
    controls: [
      { keys: ['Clic'], action: 'Regarder autour' },
      { keys: ['WASD', 'ZQSD', '↑←↓→'], action: 'Marcher' },
      { keys: ['Clic'], action: "S'asseoir" },
      { keys: ['Espace'], action: 'Se lever' },
      { keys: ['Échap'], action: 'Libérer la souris' },
      { keys: ['Porte'], action: 'Descendre / monter' },
      { keys: ['E'], action: 'Adresser la parole' },
      { keys: ['Maj'], action: 'Presser le pas' },
      { keys: ['M'], action: 'Son' },
      { keys: ['F'], action: 'Plein écran' },
    ],
    touchControls: [
      { gestures: ['Glisser'], action: 'Regarder autour' },
      { gestures: ['Joystick'], action: 'Marcher' },
      { gestures: ['S’asseoir'], action: 'S’asseoir / se lever' },
      { gestures: ['Porte'], action: 'Descendre / monter' },
      { gestures: ['Parler'], action: 'Adresser la parole' },
      { gestures: ['Son'], action: 'Couper le son' },
    ],
    tokyoTime: 'Heure à Tokyo',
    timeLabel: 'Heure',
    timeNow: 'Maintenant',
    dateLabel: 'Date',
    stationLabel: 'Arrêt',
    stationRandom: 'Aléatoire',
    directionLabel: 'Sens',
    directionRandom: 'Aléatoire',
  },
  hud: {
    phase: { cruise: 'En route', brake: 'Arrivée', dwell: 'À quai', depart: 'Départ' },
    phaseEmergency: 'Arrêt d’urgence',
    phaseOutage: 'Coupure de courant',
    currentStation: 'Station actuelle',
    nextStation: 'Prochaine station',
    speedTitle: 'Vitesse du train',
    occupancyTitle: 'Estimation calibrée (±8–12 pts un jour normal)',
    band: {
      empty: 'très fluide',
      light: 'fluide',
      moderate: 'confortable',
      busy: 'chargé',
      crowded: 'serré',
      packed: 'très serré',
      crushed: 'saturé',
    },
    online: 'en ligne',
    onlineTitle: 'Voyageurs connectés au site en ce moment',
    weatherTitle: 'Temps à Tokyo',
    weather: {
      clear: 'Dégagé',
      fair: 'Beau',
      overcast: 'Couvert',
      drizzle: 'Bruine',
      rain: 'Pluie',
      downpour: 'Averse',
      thunder: 'Orage',
      sleet: 'Neige fondue',
      snow: 'Neige',
    },
    soundOn: 'Son actif',
    soundOff: 'Son coupé',
    soundTitle: 'Couper ou rétablir le son (M)',
    volume: 'Volume',
    sit: "S'asseoir",
    stand: 'Se lever',
    wrongDoor: 'On ne monte que par la voiture {car}',
    talk: 'Appuyez sur E pour parler',
    talkShort: 'Parler',
    fullscreen: 'Plein écran',
    fullscreenTitle: 'Plein écran (F)',
    stationDevelopment: {
      title: 'Gare en cours de développement',
      detail: 'Cet espace de la gare est encore en construction.',
    },
  },
  quality: {
    label: 'Qualité vidéo',
    levels: {
      veryLow: 'Très basse',
      low: 'Basse',
      medium: 'Moyenne',
      high: 'Haute',
      veryHigh: 'Très haute',
      ultra: 'Ultra',
    },
  },
  incidents: {
    label: 'Provoquer un incident',
    title: 'Incidents',
    onlyOnTheRun: 'Seulement entre deux gares, la rame lancée.',
    alreadyRunning: 'Un arrêt est déjà en cours.',
    brake: {
      name: 'Arrêt d’urgence',
      note: 'Coup de frein sec, puis 45 s à 2 min 30 d’attente.',
    },
    outage: {
      name: 'Coupure de courant',
      note: 'Caténaire coupée : plus de traction, éclairage de secours, écrans noirs. Plusieurs minutes.',
    },
    assistance: {
      name: 'Voyageur malade',
      note: 'Intervention du personnel à la prochaine station.',
      unavailable: 'Disponible en marche ou à quai portes ouvertes, sans autre incident.',
    },
  },

  language: 'Langue',
  footer: {
    about: 'À propos du projet',
    disclaimer:
      'Projet indépendant, sans lien avec JR East, Tokyo Metro, Toei Subway ni aucune autre compagnie ferroviaire ou titulaire de marque. Les noms, logos et éléments visuels cités appartiennent à leurs propriétaires respectifs.',
    support: 'Soutenir le projet',
  },
};

const EN: Strings = {
  htmlLang: 'en',
  documentTitle: "Yamanote 3D - 山手線 · Ride Tokyo's Yamanote Line in 3D",
  documentDescription:
    "Ride Tokyo's Yamanote Line in 3D in your browser: board a JR East E235, walk the carriage, step onto the platform. Thirty stations, real announcements, no goal.",
  ogLocale: 'en_US',
  start: {
    tagline: 'One loop. Thirty stations. No objective.',
    intro:
      'A thirty-station loop around Tokyo, in near real time. Nothing to win: sit down, watch the city drift past, listen to the announcements.',
    board: 'Board the train',
    loading: 'Loading…',
    controls: [
      { keys: ['Click'], action: 'Look around' },
      { keys: ['WASD', 'ZQSD', '↑←↓→'], action: 'Walk' },
      { keys: ['Click'], action: 'Sit down' },
      { keys: ['Space'], action: 'Stand up' },
      { keys: ['Esc'], action: 'Release mouse' },
      { keys: ['Doorway'], action: 'Get off / board' },
      { keys: ['E'], action: 'Say something' },
      { keys: ['Shift'], action: 'Walk faster' },
      { keys: ['M'], action: 'Sound' },
      { keys: ['F'], action: 'Fullscreen' },
    ],
    touchControls: [
      { gestures: ['Drag'], action: 'Look around' },
      { gestures: ['Joystick'], action: 'Walk' },
      { gestures: ['Sit down'], action: 'Sit down / stand up' },
      { gestures: ['Doorway'], action: 'Get off / board' },
      { gestures: ['Talk'], action: 'Say something' },
      { gestures: ['Sound'], action: 'Mute or unmute' },
    ],
    tokyoTime: 'Tokyo time',
    timeLabel: 'Time',
    timeNow: 'Now',
    dateLabel: 'Date',
    stationLabel: 'Station',
    stationRandom: 'Random',
    directionLabel: 'Direction',
    directionRandom: 'Random',
  },
  hud: {
    phase: { cruise: 'En route', brake: 'Arriving', dwell: 'At the platform', depart: 'Departing' },
    phaseEmergency: 'Emergency stop',
    phaseOutage: 'Power failure',
    currentStation: 'Current station',
    nextStation: 'Next station',
    speedTitle: 'Train speed',
    occupancyTitle: 'Calibrated estimate (±8–12 pts on a normal day)',
    band: {
      empty: 'very light',
      light: 'light',
      moderate: 'comfortable',
      busy: 'busy',
      crowded: 'crowded',
      packed: 'very crowded',
      crushed: 'packed solid',
    },
    online: 'online',
    onlineTitle: 'Travellers connected to the site right now',
    weatherTitle: 'Tokyo weather',
    weather: {
      clear: 'Clear',
      fair: 'Fair',
      overcast: 'Overcast',
      drizzle: 'Drizzle',
      rain: 'Rain',
      downpour: 'Downpour',
      thunder: 'Thunderstorm',
      sleet: 'Sleet',
      snow: 'Snow',
    },
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    soundTitle: 'Mute or unmute (M)',
    volume: 'Volume',
    sit: 'Sit down',
    stand: 'Stand up',
    wrongDoor: 'You can only board car {car}',
    talk: 'Press E to talk',
    talkShort: 'Talk',
    fullscreen: 'Fullscreen',
    fullscreenTitle: 'Fullscreen (F)',
    stationDevelopment: {
      title: 'Station under development',
      detail: 'This part of the station is still being built.',
    },
  },
  quality: {
    label: 'Video quality',
    levels: {
      veryLow: 'Very Low',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      veryHigh: 'Very High',
      ultra: 'Ultra',
    },
  },
  incidents: {
    label: 'Trigger an incident',
    title: 'Incidents',
    onlyOnTheRun: 'Only between stations, with the train running.',
    alreadyRunning: 'One is already under way.',
    brake: {
      name: 'Emergency stop',
      note: 'Hard braking, then a 45 s to 2 min 30 wait.',
    },
    outage: {
      name: 'Power failure',
      note: 'Overhead line down: no traction, emergency lighting, dead screens. Several minutes.',
    },
    assistance: {
      name: 'Passenger assistance',
      note: 'Staff intervention at the next station.',
      unavailable:
        'Available while running or at a station with doors open, when no other incident is active.',
    },
  },

  language: 'Language',
  footer: {
    about: 'About the project',
    disclaimer:
      'Independent project, not affiliated with JR East, Tokyo Metro, Toei Subway, or any other railway operator or trademark holder. Names, logos, and visual elements mentioned belong to their respective owners.',
    support: 'Support the project',
  },
};

const JA: Strings = {
  htmlLang: 'ja',
  documentTitle: 'Yamanote 3D - 山手線 · ブラウザで巡る東京の環状線',
  documentDescription:
    'ブラウザで東京・山手線を3Dで一周。JR東日本E235系の乗客として車内を歩き、ホームに降り、車内放送と発車メロディに耳をすませる。三十駅、目的なし。',
  ogLocale: 'ja_JP',
  start: {
    tagline: 'ひとつの環状線。三十の駅。目的は、なし。',
    intro:
      '東京をぐるりと一周する三十駅のループを、ほぼ実時間で。勝ち負けはありません。座って、流れる街を眺めて、車内放送に耳をすませるだけです。',
    board: '乗車する',
    loading: '読み込み中…',
    controls: [
      { keys: ['クリック'], action: '見まわす' },
      { keys: ['WASD', 'ZQSD', '↑←↓→'], action: '歩く' },
      { keys: ['クリック'], action: '座る' },
      { keys: ['スペース'], action: '立つ' },
      { keys: ['Esc'], action: 'マウスを解放' },
      { keys: ['出入口'], action: '降りる / 乗る' },
      { keys: ['E'], action: '話しかける' },
      { keys: ['Shift'], action: '早歩き' },
      { keys: ['M'], action: '音声' },
      { keys: ['F'], action: '全画面' },
    ],
    touchControls: [
      { gestures: ['スワイプ'], action: '見まわす' },
      { gestures: ['スティック'], action: '歩く' },
      { gestures: ['座る'], action: '座る / 立つ' },
      { gestures: ['出入口'], action: '降りる / 乗る' },
      { gestures: ['話しかける'], action: '話しかける' },
      { gestures: ['音声'], action: '音を消す' },
    ],
    tokyoTime: '東京の現在時刻',
    timeLabel: '時刻',
    timeNow: '現在',
    dateLabel: '日付',
    stationLabel: '駅',
    stationRandom: 'ランダム',
    directionLabel: '方向',
    directionRandom: 'ランダム',
  },
  hud: {
    phase: { cruise: '走行中', brake: 'まもなく到着', dwell: '停車中', depart: '発車' },
    phaseEmergency: '緊急停止',
    phaseOutage: '停電',
    currentStation: '現在の駅',
    nextStation: '次の駅',
    speedTitle: '列車の速度',
    occupancyTitle: '推定混雑率（平常日でおよそ±8〜12ポイント）',
    band: {
      empty: '非常に空いている',
      light: '空いている',
      moderate: 'ゆったり',
      busy: 'やや混雑',
      crowded: '混雑',
      packed: '大変混雑',
      crushed: '超満員',
    },
    online: 'オンライン',
    onlineTitle: 'いま接続している利用者数',
    weatherTitle: '東京の天気',
    weather: {
      clear: '快晴',
      fair: '晴れ',
      overcast: '曇り',
      drizzle: '霧雨',
      rain: '雨',
      downpour: '大雨',
      thunder: '雷雨',
      sleet: 'みぞれ',
      snow: '雪',
    },
    soundOn: '音声オン',
    soundOff: '音声オフ',
    soundTitle: '音声のオン／オフ（M）',
    volume: '音量',
    sit: '座る',
    stand: '立つ',
    wrongDoor: 'ご乗車は{car}号車のみです',
    talk: 'Eキーで話しかける',
    talkShort: '話しかける',
    fullscreen: '全画面',
    fullscreenTitle: '全画面表示（F）',
    stationDevelopment: {
      title: '駅構内は開発中です',
      detail: 'この駅構内エリアは現在制作中です。',
    },
  },
  quality: {
    label: '画質',
    levels: {
      veryLow: '最低',
      low: '低',
      medium: '中',
      high: '高',
      veryHigh: '最高',
      ultra: 'ウルトラ',
    },
  },
  incidents: {
    label: '異常時を発生させる',
    title: '異常時',
    onlyOnTheRun: '駅間を走行中のみ。',
    alreadyRunning: 'すでに停車中です。',
    brake: {
      name: '緊急停止',
      note: '急ブレーキののち、45秒から2分30秒の停車。',
    },
    outage: {
      name: '停電',
      note: '架線の停電。動力なし、非常灯のみ、車内モニターは消灯。数分間。',
    },
    assistance: {
      name: 'お客さま救護',
      note: '次の駅で係員が対応します。',
      unavailable: '走行中またはドアが開いている停車中に限ります。',
    },
  },

  language: '言語',
  footer: {
    about: 'プロジェクトについて',
    disclaimer:
      '独立プロジェクトであり、JR東日本、東京メトロ、都営地下鉄その他いかなる鉄道事業者・商標権者とも提携・後援・スポンサー関係にありません。記載の名称・ロゴ・視覚要素は各権利者に帰属します。',
    support: 'プロジェクトを支援する',
  },
};

export const STRINGS: Record<Lang, Strings> = { fr: FR, en: EN, ja: JA };

const STORAGE_KEY = 'yamanote.lang';

function isLang(value: string | null | undefined): value is Lang {
  return value === 'fr' || value === 'en' || value === 'ja';
}

/**
 * Langue préférée du navigateur, ramenée à celles que le jeu connaît.
 * navigator.languages est ordonné par préférence : la première entrée dont le
 * code primaire nous est connu gagne (« fr-CH » → fr, « ja-JP » → ja).
 * Sans correspondance, l'anglais sert de langue commune.
 */
export function detectBrowserLang(): Lang {
  const list =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
  for (const tag of list) {
    const primary = String(tag ?? '')
      .toLowerCase()
      .split('-')[0];
    if (isLang(primary)) return primary;
  }
  return 'en';
}

/** Nom du paramètre d'URL qui force la langue : `?lang=ja`. */
export const LANG_PARAM = 'lang';

/**
 * Langue imposée par l'URL, s'il y en a une.
 *
 * C'est le pendant des `<link rel="alternate" hreflang>` de index.html : un
 * moteur qui indexe `?lang=ja` doit recevoir la page en japonais, sans quoi la
 * déclaration ment. Une valeur inconnue est ignorée plutôt que corrigée - on ne
 * devine pas ce qu'un `?lang=de` voulait dire.
 */
export function langFromUrl(): Lang | null {
  if (typeof location === 'undefined') return null;
  try {
    const value = new URL(location.href).searchParams.get(LANG_PARAM);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * L'URL d'abord (elle est explicite et partageable), puis le choix mémorisé,
 * puis la détection automatique.
 */
export function initialLang(): Lang {
  const fromUrl = langFromUrl();
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* localStorage indisponible (mode privé, iframe cloisonnée) */
  }
  return detectBrowserLang();
}

/** Mémorise le choix explicite du joueur ; la détection ne repassera plus. */
export function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* le jeu reste jouable, la préférence ne survivra pas au rechargement */
  }
}
