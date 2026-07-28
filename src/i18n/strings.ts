// Traductions de l'interface (FR / EN / JA) et détection automatique de la
// langue. Ce module ne dépend d'aucun store : il est importé aussi bien par
// store.ts (état initial) que par les composants d'interface.
//
// À noter : la signalétique EMBARQUÉE (annonces sonores, écrans LCD, affiches,
// panneaux de quai) reste en japonais/anglais comme dans une vraie rame —
// c'est du décor, pas de l'interface. Seul le HUD du joueur est traduit.

export type Lang = 'fr' | 'en' | 'ja';

export const LANGS: readonly Lang[] = ['fr', 'en', 'ja'];

/** Libellé long, dans la langue elle-même (menu, aria-label). */
export const LANG_LABEL: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  ja: '日本語',
};

/** Libellé court du sélecteur — tient dans la barre du HUD. */
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
  documentTitle: string;
  documentDescription: string;

  start: {
    tagline: string;
    intro: string;
    board: string;
    loading: string;
    controls: readonly ControlHint[];
    /** Affiché à la place de `controls` sur un écran tactile. */
    touchControls: readonly TouchHint[];
    tokyoTime: string;
  };

  hud: {
    phase: { cruise: string; brake: string; dwell: string; depart: string };
    /** Bandeau de phase pendant un arrêt d'urgence en pleine voie. */
    phaseEmergency: string;
    currentStation: string;
    nextStation: string;
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
    soundOn: string;
    soundOff: string;
    soundTitle: string;
    volume: string;
    sit: string;
    stand: string;
    alight: string;
    boardTrain: string;
    fullscreen: string;
    fullscreenTitle: string;
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

  language: string;

  footer: {
    disclaimer: string;
    support: string;
  };
}

const FR: Strings = {
  htmlLang: 'fr',
  documentTitle: 'Yamanote 3D — 山手線',
  documentDescription:
    "Expérience contemplative : passager d'une rame E235 sur la ligne Yamanote, Tokyo.",
  start: {
    tagline: 'Une boucle. Trente stations. Aucun objectif.',
    intro:
      "Une boucle de trente stations autour de Tokyo, en temps quasi réel. Rien à gagner : on s'assoit, on regarde la ville, on écoute les annonces.",
    board: 'Monter à bord',
    loading: 'Préparation…',
    controls: [
      { keys: ['Clic'], action: 'Regarder autour' },
      { keys: ['WASD', 'ZQSD', '↑←↓→'], action: 'Marcher' },
      { keys: ['Clic'], action: "S'asseoir" },
      { keys: ['Espace'], action: 'Se lever' },
      { keys: ['Échap'], action: 'Libérer la souris' },
      { keys: ['Porte'], action: 'Descendre / monter' },
      { keys: ['Maj'], action: 'Presser le pas' },
      { keys: ['M'], action: 'Son' },
      { keys: ['F'], action: 'Plein écran' },
    ],
    touchControls: [
      { gestures: ['Glisser'], action: 'Regarder autour' },
      { gestures: ['Joystick'], action: 'Marcher' },
      { gestures: ['S’asseoir'], action: 'S’asseoir / se lever' },
      { gestures: ['Porte'], action: 'Descendre / monter' },
      { gestures: ['Son'], action: 'Couper le son' },
    ],
    tokyoTime: 'Heure à Tokyo',
  },
  hud: {
    phase: { cruise: 'En route', brake: 'Arrivée', dwell: 'À quai', depart: 'Départ' },
    phaseEmergency: 'Arrêt d’urgence',
    currentStation: 'Station actuelle',
    nextStation: 'Prochaine station',
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
    soundOn: 'Son actif',
    soundOff: 'Son coupé',
    soundTitle: 'Couper ou rétablir le son (M)',
    volume: 'Volume',
    sit: "S'asseoir",
    stand: 'Se lever',
    alight: 'Descendre sur le quai',
    boardTrain: 'Monter dans la rame',
    fullscreen: 'Plein écran',
    fullscreenTitle: 'Plein écran (F)',
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
  language: 'Langue',
  footer: {
    disclaimer:
      'Projet indépendant, sans lien avec JR East, Tokyo Metro, Toei Subway ni aucune autre compagnie ferroviaire ou titulaire de marque. Les noms, logos et éléments visuels cités appartiennent à leurs propriétaires respectifs.',
    support: 'Soutenir le projet',
  },
};

const EN: Strings = {
  htmlLang: 'en',
  documentTitle: 'Yamanote 3D — 山手線',
  documentDescription:
    'A contemplative ride: riding an E235 train on the Yamanote Line, Tokyo.',
  start: {
    tagline: 'One loop. Thirty stations. No objective.',
    intro:
      'A thirty-station loop around Tokyo, in near real time. Nothing to win: sit down, watch the city drift past, listen to the announcements.',
    board: 'Board the train',
    loading: 'Preparing…',
    controls: [
      { keys: ['Click'], action: 'Look around' },
      { keys: ['WASD', 'ZQSD', '↑←↓→'], action: 'Walk' },
      { keys: ['Click'], action: 'Sit down' },
      { keys: ['Space'], action: 'Stand up' },
      { keys: ['Esc'], action: 'Release mouse' },
      { keys: ['Doorway'], action: 'Get off / board' },
      { keys: ['Shift'], action: 'Walk faster' },
      { keys: ['M'], action: 'Sound' },
      { keys: ['F'], action: 'Fullscreen' },
    ],
    touchControls: [
      { gestures: ['Drag'], action: 'Look around' },
      { gestures: ['Joystick'], action: 'Walk' },
      { gestures: ['Sit down'], action: 'Sit down / stand up' },
      { gestures: ['Doorway'], action: 'Get off / board' },
      { gestures: ['Sound'], action: 'Mute or unmute' },
    ],
    tokyoTime: 'Tokyo time',
  },
  hud: {
    phase: { cruise: 'En route', brake: 'Arriving', dwell: 'At the platform', depart: 'Departing' },
    phaseEmergency: 'Emergency stop',
    currentStation: 'Current station',
    nextStation: 'Next station',
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
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    soundTitle: 'Mute or unmute (M)',
    volume: 'Volume',
    sit: 'Sit down',
    stand: 'Stand up',
    alight: 'Step onto the platform',
    boardTrain: 'Board the train',
    fullscreen: 'Fullscreen',
    fullscreenTitle: 'Fullscreen (F)',
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
  language: 'Language',
  footer: {
    disclaimer:
      'Independent project, not affiliated with JR East, Tokyo Metro, Toei Subway, or any other railway operator or trademark holder. Names, logos, and visual elements mentioned belong to their respective owners.',
    support: 'Support the project',
  },
};

const JA: Strings = {
  htmlLang: 'ja',
  documentTitle: 'Yamanote 3D — 山手線',
  documentDescription: '東京・山手線を走るE235系電車の乗客になる、静かな体験。',
  start: {
    tagline: 'ひとつの環状線。三十の駅。目的は、なし。',
    intro:
      '東京をぐるりと一周する三十駅のループを、ほぼ実時間で。勝ち負けはありません。座って、流れる街を眺めて、車内放送に耳をすませるだけです。',
    board: '乗車する',
    loading: '準備中…',
    controls: [
      { keys: ['クリック'], action: '見まわす' },
      { keys: ['WASD', 'ZQSD', '↑←↓→'], action: '歩く' },
      { keys: ['クリック'], action: '座る' },
      { keys: ['スペース'], action: '立つ' },
      { keys: ['Esc'], action: 'マウスを解放' },
      { keys: ['出入口'], action: '降りる / 乗る' },
      { keys: ['Shift'], action: '早歩き' },
      { keys: ['M'], action: '音声' },
      { keys: ['F'], action: '全画面' },
    ],
    touchControls: [
      { gestures: ['スワイプ'], action: '見まわす' },
      { gestures: ['スティック'], action: '歩く' },
      { gestures: ['座る'], action: '座る / 立つ' },
      { gestures: ['出入口'], action: '降りる / 乗る' },
      { gestures: ['音声'], action: '音を消す' },
    ],
    tokyoTime: '東京の現在時刻',
  },
  hud: {
    phase: { cruise: '走行中', brake: 'まもなく到着', dwell: '停車中', depart: '発車' },
    phaseEmergency: '緊急停止',
    currentStation: '現在の駅',
    nextStation: '次の駅',
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
    soundOn: '音声オン',
    soundOff: '音声オフ',
    soundTitle: '音声のオン／オフ（M）',
    volume: '音量',
    sit: '座る',
    stand: '立つ',
    alight: 'ホームに降りる',
    boardTrain: '電車に乗る',
    fullscreen: '全画面',
    fullscreenTitle: '全画面表示（F）',
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
  language: '言語',
  footer: {
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

/** Choix explicite mémorisé, sinon détection automatique. */
export function initialLang(): Lang {
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

/** Répercute la langue sur le document : attribut lang, titre, description. */
export function applyDocumentLang(lang: Lang): void {
  if (typeof document === 'undefined') return;
  const s = STRINGS[lang];
  document.documentElement.lang = s.htmlLang;
  document.title = s.documentTitle;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', s.documentDescription);
}
