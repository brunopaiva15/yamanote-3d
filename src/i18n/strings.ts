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
    /**
     * Sous-titre du voile d'attente : ce qui se construit pendant que l'écran
     * est vide. « Chargement… » seul ne dit pas si c'est long ou si c'est cassé.
     */
    loadingNote: string;
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
    /** Libellé du sélecteur de version (expérience complète / version sonore). */
    modeLabel: string;
    /** Les deux versions, telles qu'on les choisit. */
    modeFull: string;
    modeAudio: string;
    /**
     * Ce que la version sonore change, en une phrase. Affiché sous le
     * sélecteur, et seulement quand elle est choisie : personne n'a besoin
     * qu'on lui explique le mode par défaut.
     */
    modeAudioNote: string;
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

  /**
   * Les appareils de la gare : distributeurs, billetterie, portillons.
   *
   * C'est la seule partie du jeu où la signalétique du monde et l'interface se
   * touchent : la VITRINE reste japonaise - c'est du décor - mais l'invite sous
   * le réticule et la ligne d'état d'un écran doivent se comprendre, sans quoi
   * on ne sait pas pourquoi rien ne tombe. `{n}` est remplacé par un montant en
   * yens, `{s}` par un nombre de gorgées.
   */
  devices: {
    /** L'invite sous le réticule, selon ce qu'on a devant soi. */
    prompt: {
      buy: string;
      soldOut: string;
      insertCoin: string;
      insertBill: string;
      tapIc: string;
      tapIcOff: string;
      lever: string;
      take: string;
      ticketFare: string;
      ticketCharge: string;
      ticketCard: string;
      ticketPage: string;
      settle: string;
      tapIn: string;
      tapOut: string;
      throwAway: string;
      openDrink: string;
      drink: string;
      emptyHands: string;
    };
    /**
     * La ligne d'état écrite SUR la machine - l'afficheur du 券売機, la dalle
     * verte d'une borne de portillon. Ce n'est pas du HUD : c'est peint sur
     * l'appareil, à l'endroit où la vraie machine l'écrit.
     */
    notice: {
      insertMore: string;
      soldOut: string;
      noCash: string;
      icLow: string;
      noIc: string;
      icReady: string;
      takeIt: string;
      ticketOut: string;
      charged: string;
      cardBought: string;
      nothingDue: string;
      settled: string;
      hasTicket: string;
      change: string;
      /** Au repos : ce qu'un écran de 券売機 affiche quand personne ne touche. */
      idle: string;
    };
    /** Ce qu'affiche la dalle d'une borne de portillon après un passage. */
    gate: {
      entered: string;
      exited: string;
      noMedia: string;
      lowBalance: string;
      shortFare: string;
      balance: string;
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
      extraordinary: string;
    };
    /**
     * Le mode Extraordinaire n'est pas offert partout, et il faut le dire en
     * termes de ce que le joueur VOIT et de ce que ça lui coûte : personne
     * n'achète un réglage parce qu'on lui parle d'espace écran.
     * `beta` s'affiche quand il est choisi, `mobile` et `unsupported` quand
     * l'option est grisée, `failed` quand le moteur a refusé de démarrer.
     */
    extraordinaryBeta: string;
    extraordinaryMobile: string;
    extraordinaryUnsupported: string;
    extraordinaryFailed: string;
    /**
     * Le voile d'attente pendant que le moteur démarre : le paquet se
     * télécharge, le périphérique se négocie et les nuanceurs se compilent.
     * Plusieurs secondes, pendant lesquelles il n'y a rien à l'écran.
     */
    extraordinaryLoading: string;
    extraordinaryLoadingNote: string;
  };

  /**
   * La qualité du SON, qui n'a rien à voir avec celle de l'image.
   *
   * Elle ne change ni ce qu'on entend ni quand : elle change ce qu'il en coûte
   * de le calculer. `auto` mesure la machine et descend d'elle-même au premier
   * craquement - c'est le bon réglage pour tout le monde, et le libellé doit le
   * dire. Les trois autres sont là pour qui veut trancher : forcer la
   * spatialisation complète sur une bonne machine, ou forcer le mode le plus
   * sûr sans attendre qu'un craquement l'ait prouvé.
   *
   * `note` est la seule chose vraiment utile à savoir : ce choix-là ne prend
   * effet qu'au prochain embarquement, parce que la taille du tampon de sortie
   * se fige à l'ouverture du contexte audio.
   */
  audioQuality: {
    label: string;
    levels: {
      auto: string;
      full: string;
      reduced: string;
      minimal: string;
    };
    note: string;
    lowered: string;
  };

  /**
   * Quand la toile 3D n'a pas démarré du tout : le navigateur a refusé le
   * contexte WebGL, on a remonté une toile neuve autant de fois qu'on se
   * l'autorise, et il n'y a plus rien à tenter sans le joueur. Le message doit
   * dire ce qui s'est passé SANS parler de contexte ni de WebGL - ce qui compte
   * pour lui, c'est que ça se répare, et comment.
   */
  render: {
    failedTitle: string;
    failedBody: string;
    retry: string;
    reload: string;
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

  /**
   * Sous-titres : ce qui se dit, et ce qui sonne.
   *
   * Les TEXTES des annonces ne sont pas ici - ils sont dits en japonais et en
   * anglais, comme dans une vraie rame, et c'est cela qu'on affiche (voir
   * ui/Subtitles). Ce dictionnaire ne porte que ce qui est de l'INTERFACE :
   * d'où vient la voix, et le nom des sons qu'on met entre crochets.
   */
  subtitles: {
    /** Bouton du HUD. */
    label: string;
    /** Provenance affichée devant chaque ligne. */
    cabin: string;
    platform: string;
    /**
     * Le nom des sons, comme au sous-titrage pour sourds et malentendants :
     * un groupe nominal court, jamais une phrase.
     */
    cues: {
      doorChime: string;
      psdOpen: string;
      psdClose: string;
      atosChime: string;
      melody: string;
      thunder: string;
      passingTrain: string;
      emergencyBrake: string;
      powerOutage: string;
    };
  };

  /**
   * La version sonore : le tableau de bord qui remplace la scène.
   *
   * Il ne cherche pas à IMITER la 3D - il n'y a rien à imiter - mais à donner
   * ce que l'oreille seule ne situe pas : où l'on est sur la boucle, ce qui va
   * arriver, et ce qui vient d'être dit.
   */
  audio: {
    /** En-tête du journal des annonces. */
    logTitle: string;
    /** Journal encore vide, au tout début du trajet. */
    logEmpty: string;
    /** État des portes de la rame. */
    doorsLabel: string;
    doors: { open: string; closed: string; opening: string; closing: string };
    /**
     * Mettre l'afficheur seul en grand. Un bouton discret sur la dalle : ce
     * n'est pas le plein écran du HUD, qui montre la même page en plus large.
     */
    lcdFullscreen: string;
    lcdFullscreenExit: string;
  };

  /**
   * Voyager à plusieurs : le salon, et rien d'autre.
   *
   * Le vocabulaire reste celui du jeu - une « rame », des « voyageurs » - et non
   * celui des jeux en réseau : ni « lobby », ni « partie », ni « joueurs ». On
   * monte dans le même train, c'est tout ce que ça veut dire.
   */
  room: {
    /** Le lien qui déplie le bloc, au pied du menu. Volontairement sobre. */
    together: string;
    /** Refermer le bloc. */
    close: string;
    /** Bouton : ouvrir une rame et obtenir un code. */
    create: string;
    /** Bouton : entrer dans la rame de quelqu'un d'autre. */
    join: string;
    /** Étiquette du champ de code. */
    codeLabel: string;
    /** Texte d'invite du champ de code. */
    codePlaceholder: string;
    /** Étiquette du champ de prénom. */
    nameLabel: string;
    /** Texte d'invite du champ de prénom. */
    namePlaceholder: string;
    /** Bouton : copier le lien pour l'envoyer à quelqu'un. */
    copy: string;
    /** Confirmation brève après copie. */
    copied: string;
    /** Quitter le salon et repartir seul. */
    leave: string;
    /** En cours de connexion. */
    joining: string;
    /** Suffixe du décompte du roster : « 3 à bord ». */
    travellers: string;
    /** Marque de celui qui mène la rame, dans le roster. */
    host: string;
    /** Marque de celui qui est descendu et a laissé la rame partir. */
    ashore: string;
    /** Le code saisi n'est pas un code. */
    errorCode: string;
    /** La rame est complète. */
    errorFull: string;
    /** Le service ne répond pas : on embarque seul. */
    errorNetwork: string;
    /** Explication d'une ligne, sous le bloc déplié. */
    hint: string;
    /** Texte d'invite du champ de tchat. */
    chatPlaceholder: string;
    /** Bouton d'envoi du tchat. */
    send: string;
    /** La rame attend un membre resté à quai ; %s = secondes restantes. */
    holding: string;
    /** On a laissé la rame partir : notre monde n'est plus celui du salon. */
    detached: string;
    /** Bouton : se reposer là où le salon en est. */
    rejoin: string;
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
    loadingNote: 'La rame se prépare : la gare, la ville, les voyageurs.',
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
    modeLabel: 'Version',
    modeFull: 'Complète (3D)',
    modeAudio: 'Sonore (sans 3D)',
    modeAudioNote:
      "Le même trajet, les mêmes annonces, la même sonorisation - mais rien à l'écran qu'un tableau de bord et les sous-titres. Aucune carte graphique requise.",
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
  devices: {
    prompt: {
      buy: 'E — {name} · {n} ¥',
      soldOut: 'Épuisé',
      insertCoin: 'E — Glisser une pièce',
      insertBill: 'E — Glisser un billet de 1 000 ¥',
      tapIc: 'E — Poser sa carte',
      tapIcOff: 'E — Retirer sa carte',
      lever: 'E — Reprendre ses {n} ¥',
      take: 'E — Prendre',
      ticketFare: 'E — Billet à {n} ¥',
      ticketCharge: 'E — Recharger de {n} ¥',
      ticketCard: 'E — Acheter une carte ({n} ¥)',
      ticketPage: 'E — Changer d’écran',
      settle: 'E — Régler {n} ¥',
      tapIn: 'E — Valider pour entrer',
      tapOut: 'E — Valider pour sortir',
      throwAway: 'E — Jeter',
      openDrink: 'E — Ouvrir',
      drink: 'E — Boire une gorgée',
      emptyHands: 'Vide — à jeter dans un bac de tri',
    },
    notice: {
      insertMore: 'Il manque {n} ¥',
      soldOut: 'Épuisé',
      noCash: 'Plus d’espèces',
      icLow: 'Solde insuffisant : {n} ¥',
      noIc: 'Pas de carte IC',
      icReady: 'Carte lue — solde {n} ¥',
      takeIt: 'Servi — à prendre',
      ticketOut: 'Billet imprimé',
      charged: 'Rechargée de {n} ¥',
      cardBought: 'Carte délivrée — {n} ¥',
      nothingDue: 'Rien à régler',
      settled: 'Complément {n} ¥ réglé',
      hasTicket: 'Vous avez déjà un billet',
      change: 'Monnaie rendue',
      idle: 'Insérer / Toucher',
    },
    gate: {
      entered: 'ENTRÉE',
      exited: '{n} ¥',
      noMedia: 'PAS DE TITRE',
      lowBalance: 'SOLDE {n} ¥',
      shortFare: 'COMPLÉMENT {n} ¥',
      balance: 'Solde {n} ¥',
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
      extraordinary: 'Extraordinaire ⚠︎',
    },
    extraordinaryBeta:
      'Bêta : une lumière plus riche, de vrais reflets et un arrière-plan qui se floute. Très gourmand - pour les machines puissantes.',
    extraordinaryMobile: 'Sur ordinateur seulement : trop lourd pour un téléphone.',
    extraordinaryUnsupported: 'Ce navigateur ne sait pas encore l’afficher.',
    extraordinaryFailed: 'Ce mode n’a pas pu démarrer ici : retour à Ultra.',
    extraordinaryLoading: 'Préparation du mode Extraordinaire…',
    extraordinaryLoadingNote:
      'Le moteur se met en route et prépare ses effets. Quelques secondes la première fois.',
  },
  audioQuality: {
    label: 'Qualité sonore',
    levels: {
      auto: 'Automatique',
      full: 'Spatialisation complète',
      reduced: 'Allégée',
      minimal: 'Sans réverbération',
    },
    note: 'Automatique écoute la machine et allège d’elle-même au moindre craquement. Un choix manuel s’applique au prochain embarquement.',
    lowered: 'Le son a été allégé : cette machine n’arrivait pas à le calculer sans craquer.',
  },
  render: {
    failedTitle: 'L’affichage n’a pas démarré',
    failedBody:
      'Votre navigateur n’a pas pu ouvrir la vue 3D, souvent faute de mémoire disponible. Fermer quelques onglets aide. Réessayez, ou rechargez la page.',
    retry: 'Réessayer',
    reload: 'Recharger la page',
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

  subtitles: {
    label: 'Sous-titres',
    cabin: 'Rame',
    platform: 'Quai',
    cues: {
      doorChime: 'carillon de porte',
      psdOpen: 'ouverture des portes palières',
      psdClose: 'fermeture des portes palières',
      atosChime: "carillon d'approche",
      melody: 'mélodie de départ',
      thunder: 'tonnerre',
      passingTrain: 'train sur la voie opposée',
      emergencyBrake: "freinage d'urgence",
      powerOutage: 'coupure de courant',
    },
  },

  audio: {
    logTitle: 'Ce qui a été dit',
    logEmpty: 'Rien encore. La première annonce ne va pas tarder.',
    doorsLabel: 'Portes',
    doors: {
      open: 'ouvertes',
      closed: 'fermées',
      opening: "en cours d'ouverture",
      closing: 'en cours de fermeture',
    },
    lcdFullscreen: 'Afficheur en plein écran',
    lcdFullscreenExit: 'Quitter le plein écran',
  },

  room: {
    together: 'Voyager ensemble',
    close: 'Fermer',
    create: 'Ouvrir une rame',
    join: 'Rejoindre',
    codeLabel: 'Code de la rame',
    codePlaceholder: 'ABC234',
    nameLabel: 'Votre prénom',
    namePlaceholder: 'Aya',
    copy: 'Copier le lien',
    copied: 'Copié',
    leave: 'Quitter la rame',
    joining: 'Connexion…',
    travellers: 'à bord',
    host: 'mène la rame',
    ashore: 'à quai',
    errorCode: 'Ce code ne ressemble à rien de valide.',
    errorFull: 'Cette rame est complète.',
    errorNetwork: 'Service indisponible : vous embarquez seul.',
    hint: 'Partagez le lien avec qui vous voulez : vous monterez dans la même rame, à la même gare, à la même seconde.',
    chatPlaceholder: 'Entrée pour écrire, Échap pour fermer',
    send: 'Envoyer',
    holding: 'La rame vous attend',
    detached: 'La rame est partie sans vous',
    rejoin: 'Rattraper la rame',
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
    loadingNote: 'Getting the train ready: the station, the city, the passengers.',
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
    modeLabel: 'Version',
    modeFull: 'Full (3D)',
    modeAudio: 'Audio only (no 3D)',
    modeAudioNote:
      'The same ride, the same announcements, the same public address - but nothing on screen except a dashboard and the subtitles. No graphics card needed.',
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
  devices: {
    prompt: {
      buy: 'E — {name} · ¥{n}',
      soldOut: 'Sold out',
      insertCoin: 'E — Drop a coin in',
      insertBill: 'E — Feed a ¥1,000 note',
      tapIc: 'E — Tap your card',
      tapIcOff: 'E — Take your card back',
      lever: 'E — Take your ¥{n} back',
      take: 'E — Take it',
      ticketFare: 'E — ¥{n} ticket',
      ticketCharge: 'E — Charge ¥{n}',
      ticketCard: 'E — Buy a card (¥{n})',
      ticketPage: 'E — Switch screen',
      settle: 'E — Pay ¥{n}',
      tapIn: 'E — Tap in',
      tapOut: 'E — Tap out',
      throwAway: 'E — Throw away',
      openDrink: 'E — Open',
      drink: 'E — Take a sip',
      emptyHands: 'Empty — drop it in a recycling bin',
    },
    notice: {
      insertMore: '¥{n} short',
      soldOut: 'Sold out',
      noCash: 'Out of cash',
      icLow: 'Balance short by ¥{n}',
      noIc: 'No IC card',
      icReady: 'Card read — ¥{n}',
      takeIt: 'Dispensed — take it',
      ticketOut: 'Ticket printed',
      charged: 'Charged ¥{n}',
      cardBought: 'Card issued — ¥{n}',
      nothingDue: 'Nothing to pay',
      settled: '¥{n} settled',
      hasTicket: 'You already hold a ticket',
      change: 'Change returned',
      idle: 'Insert / Touch',
    },
    gate: {
      entered: 'ENTRY',
      exited: '¥{n}',
      noMedia: 'NO TICKET',
      lowBalance: 'SHORT ¥{n}',
      shortFare: 'FARE ¥{n}',
      balance: 'Balance ¥{n}',
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
      extraordinary: 'Extraordinary ⚠︎',
    },
    extraordinaryBeta:
      'Beta: richer light, real reflections and a background that softens. Very demanding - for powerful machines.',
    extraordinaryMobile: 'Desktop only: too heavy for a phone.',
    extraordinaryUnsupported: 'This browser cannot show it yet.',
    extraordinaryFailed: 'This mode could not start here: back to Ultra.',
    extraordinaryLoading: 'Preparing Extraordinary mode…',
    extraordinaryLoadingNote:
      'The renderer is starting up and building its effects. A few seconds the first time.',
  },
  audioQuality: {
    label: 'Sound quality',
    levels: {
      auto: 'Automatic',
      full: 'Full spatial audio',
      reduced: 'Lighter',
      minimal: 'No reverb',
    },
    note: 'Automatic listens to your machine and lightens the sound at the first crackle. A manual choice takes effect next time you board.',
    lowered: 'Sound was lightened: this machine could not compute it without crackling.',
  },
  render: {
    failedTitle: 'The view could not start',
    failedBody:
      'Your browser could not open the 3D view, usually for lack of free memory. Closing a few tabs helps. Try again, or reload the page.',
    retry: 'Try again',
    reload: 'Reload the page',
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

  subtitles: {
    label: 'Subtitles',
    cabin: 'Train',
    platform: 'Platform',
    cues: {
      doorChime: 'door chime',
      psdOpen: 'platform doors opening',
      psdClose: 'platform doors closing',
      atosChime: 'approach chime',
      melody: 'departure melody',
      thunder: 'thunder',
      passingTrain: 'train on the opposite track',
      emergencyBrake: 'emergency braking',
      powerOutage: 'power cut',
    },
  },

  audio: {
    logTitle: 'What was said',
    logEmpty: 'Nothing yet. The first announcement is on its way.',
    doorsLabel: 'Doors',
    doors: { open: 'open', closed: 'closed', opening: 'opening', closing: 'closing' },
    lcdFullscreen: 'Full-screen display',
    lcdFullscreenExit: 'Exit full screen',
  },

  room: {
    together: 'Travel together',
    close: 'Close',
    create: 'Open a train',
    join: 'Join',
    codeLabel: 'Train code',
    codePlaceholder: 'ABC234',
    nameLabel: 'Your name',
    namePlaceholder: 'Aya',
    copy: 'Copy link',
    copied: 'Copied',
    leave: 'Leave the train',
    joining: 'Connecting…',
    travellers: 'aboard',
    host: 'leading',
    ashore: 'on the platform',
    errorCode: 'That code does not look valid.',
    errorFull: 'This train is full.',
    errorNetwork: 'Service unavailable: you are boarding alone.',
    hint: 'Share the link with whoever you like: you will board the same train, at the same station, at the same second.',
    chatPlaceholder: 'Enter to write, Esc to close',
    send: 'Send',
    holding: 'The train is holding for you',
    detached: 'The train left without you',
    rejoin: 'Catch up with the train',
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
    loadingNote: '車両を準備しています：駅、街、乗客。',
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
    modeLabel: 'バージョン',
    modeFull: '通常版（3D）',
    modeAudio: '音声版（3Dなし）',
    modeAudioNote:
      '同じ走行、同じ放送、同じ車内・駅の音響。画面にあるのは走行情報と字幕だけです。グラフィックス性能は不要です。',
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
  devices: {
    prompt: {
      buy: 'E — {name} · {n}円',
      soldOut: '売切',
      insertCoin: 'E — 硬貨を入れる',
      insertBill: 'E — 千円札を入れる',
      tapIc: 'E — カードをタッチ',
      tapIcOff: 'E — カードをしまう',
      lever: 'E — {n}円を返却',
      take: 'E — 取り出す',
      ticketFare: 'E — {n}円のきっぷ',
      ticketCharge: 'E — {n}円チャージ',
      ticketCard: 'E — カードを買う（{n}円）',
      ticketPage: 'E — 画面を切り替える',
      settle: 'E — {n}円を精算',
      tapIn: 'E — タッチして入場',
      tapOut: 'E — タッチして出場',
      throwAway: 'E — 捨てる',
      openDrink: 'E — 開ける',
      drink: 'E — 一口飲む',
      emptyHands: '空 — リサイクルボックスへ',
    },
    notice: {
      insertMore: '{n}円不足',
      soldOut: '売切',
      noCash: '現金がありません',
      icLow: '残額不足 {n}円',
      noIc: 'ICカードなし',
      icReady: 'カード読取 残額{n}円',
      takeIt: '商品をお取りください',
      ticketOut: 'きっぷが出ました',
      charged: '{n}円チャージ',
      cardBought: 'カード発行 残額{n}円',
      nothingDue: '精算不要',
      settled: '{n}円精算しました',
      hasTicket: 'きっぷをお持ちです',
      change: 'おつりをどうぞ',
      idle: 'お金を入れる / タッチ',
    },
    gate: {
      entered: '入場',
      exited: '{n}円',
      noMedia: 'きっぷなし',
      lowBalance: '残額不足 {n}円',
      shortFare: '乗り越し {n}円',
      balance: '残額{n}円',
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
      extraordinary: 'エクストラオーディナリー ⚠︎',
    },
    extraordinaryBeta:
      'ベータ版：光の回り込み、映り込み、背景のぼけ。負荷がとても高く、高性能なパソコン向けです。',
    extraordinaryMobile: 'パソコン専用：スマートフォンには重すぎます。',
    extraordinaryUnsupported: 'このブラウザーではまだ表示できません。',
    extraordinaryFailed: 'この環境では起動できませんでした。ウルトラに戻します。',
    extraordinaryLoading: 'エクストラオーディナリーを準備中…',
    extraordinaryLoadingNote: '描画エンジンを起動し、効果を準備しています。初回は数秒かかります。',
  },
  audioQuality: {
    label: '音質',
    levels: {
      auto: '自動',
      full: '立体音響（フル）',
      reduced: '軽量',
      minimal: '残響なし',
    },
    note: '「自動」は動作を見ながら、音が途切れそうになると自動で軽くします。手動で選んだ設定は次回の乗車から有効です。',
    lowered: 'この端末では処理が追いつかないため、音を軽くしました。',
  },
  render: {
    failedTitle: '映像を開始できませんでした',
    failedBody:
      'ブラウザーが3D表示を開けませんでした。多くの場合、空きメモリー不足が原因です。ほかのタブを閉じると改善します。もう一度お試しになるか、ページを再読み込みしてください。',
    retry: 'もう一度',
    reload: 'ページを再読み込み',
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

  subtitles: {
    label: '字幕',
    cabin: '車内',
    platform: 'ホーム',
    cues: {
      doorChime: 'ドアチャイム',
      psdOpen: 'ホームドア開扉予告',
      psdClose: 'ホームドア閉扉予告',
      atosChime: '接近チャイム',
      melody: '発車メロディ',
      thunder: '雷鳴',
      passingTrain: '対向列車通過',
      emergencyBrake: '非常ブレーキ',
      powerOutage: '停電',
    },
  },

  audio: {
    logTitle: 'これまでの放送',
    logEmpty: 'まだ何もありません。最初の放送をお待ちください。',
    doorsLabel: 'ドア',
    doors: { open: '開', closed: '閉', opening: '開扉中', closing: '閉扉中' },
    lcdFullscreen: '案内表示器を全画面',
    lcdFullscreenExit: '全画面を終了',
  },

  room: {
    together: '一緒に乗る',
    close: '閉じる',
    create: '編成を作る',
    join: '参加',
    codeLabel: '編成コード',
    codePlaceholder: 'ABC234',
    nameLabel: 'お名前',
    namePlaceholder: 'あや',
    copy: 'リンクをコピー',
    copied: 'コピーしました',
    leave: '編成から降りる',
    joining: '接続中…',
    travellers: '名乗車中',
    host: '進行担当',
    ashore: 'ホーム',
    errorCode: 'このコードは正しくありません。',
    errorFull: 'この編成は満員です。',
    errorNetwork: 'サービスに接続できません。おひとりで乗車します。',
    hint: 'コード（またはリンク）を渡せば、同じ編成・同じ駅・同じ瞬間に乗り合わせます。',
    chatPlaceholder: 'Enter で入力、Esc で閉じる',
    send: '送信',
    holding: '発車を見合わせています',
    detached: '編成は先に発車しました',
    rejoin: '編成に追いつく',
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
