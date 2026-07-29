// Ce que dit un 発車標 (hasshahyō) — le tableau des départs suspendu au-dessus
// du quai — et sous quelle forme.
//
// Le tableau du jeu annonçait UNE rame et son état (approche, embarquement,
// départ, attente). Un vrai 発車標 de la Yamanote en annonce DEUX, l'une sous
// l'autre, et toujours de la même façon :
//
//     山手線　約2分後　東京・上野方面
//     山手線　約5分後　東京・上野方面
//
// Le 約 est le mot important : ce n'est pas un compte à rebours à la seconde
// mais une estimation, et c'est pour cela qu'il n'y a jamais de « 0 分後 » —
// sous la minute le tableau bascule sur 「まもなく」. JR East a équipé les
// trente gares de la ligne de ce décompte entre novembre 2019 et juillet 2020.
//
// Exception : très tôt le matin et très tard le soir, le décompte laisse la
// place à l'HEURE de départ (05:12). Les intervalles y sont trop longs pour
// qu'un « environ » veuille encore dire quelque chose, et ce sont les seuls
// moments où l'on regarde le tableau pour savoir si l'on a raté le dernier.
//
// Ce module ne connaît ni le train ni la gare : on lui donne des secondes
// d'attente et l'heure qu'il est, il rend ce qu'il faut écrire. Le calcul des
// secondes appartient à qui sait où en est la rame (systems/platformWait pour
// le quai, le cycle station pour le bord).

/**
 * Gares dont le 発車標 est un écran LCD et non la matrice à LED historique.
 *
 * Les deux cohabitent sur la ligne : la matrice ambre et verte est l'image
 * classique du quai japonais, et c'est encore ce qu'on lit dans la plupart des
 * gares ; les quais neufs ou refaits ont reçu des dalles LCD, plus fines de
 * trait et sans inter-diode. Le partage ci-dessous n'est pas un relevé : ce
 * sont les trois quais de la ligne dont l'équipement est le plus récent —
 * Takanawa Gateway, ouverte en 2020, Shibuya et Shinagawa, refaites depuis.
 */
export const LCD_BOARDS: ReadonlySet<string> = new Set(['JY20', 'JY25', 'JY26']);

/** Ce qu'affiche la colonne du milieu, pour une rame. */
export type BoardEta =
  /** 「まもなく」 : elle entre en gare, ou elle est là. */
  | { kind: 'soon' }
  /** 「まもなく発車」 : celle qui est à quai s'en va. */
  | { kind: 'departing' }
  /** 「約N分後」 : le régime normal, toute la journée. */
  | { kind: 'minutes'; minutes: number }
  /** 「05:12」 : premières et dernières circulations. */
  | { kind: 'time'; hhmm: string };

/** L'état complet du tableau à un instant donné. */
export interface BoardView {
  /** Les deux prochaines rames, dans l'ordre — le tableau en montre deux. */
  rows: BoardEta[];
  /** Le tableau alterne japonais et anglais, comme un vrai. */
  english: boolean;
  /** Clignotement, réservé à la rame qui s'ébranle. */
  blink: boolean;
}

/** Attente des deux prochaines rames, en secondes. */
export interface NextTrains {
  /** Secondes avant la prochaine rame ; `null` quand elle est déjà à quai. */
  first: number | null;
  /** Secondes avant celle d'après. */
  second: number;
  /** La rame à quai s'ébranle : le tableau la garde encore une ligne. */
  leaving: boolean;
}

/**
 * En deçà, le tableau ne compte plus : il dit 「まもなく」.
 *
 * Un vrai afficheur ne descend jamais à 「約1分後」 quand la rame est en vue au
 * bout du quai — c'est le mot qui remplace le chiffre, et il tombe à peu près
 * au moment où l'annonce d'approche se déclenche.
 */
export const SOON_UNDER = 45;

/** Début de la plage « dernières circulations » (minutes depuis minuit). */
export const SCHEDULE_FROM = 23 * 60 + 45;
/** Fin de la plage « premières circulations ». */
export const SCHEDULE_UNTIL = 5 * 60 + 15;

/** Sommes-nous aux heures où le tableau donne l'horaire plutôt qu'un délai ? */
export function showsSchedule(clockMin: number): boolean {
  const m = ((clockMin % 1440) + 1440) % 1440;
  return m >= SCHEDULE_FROM || m < SCHEDULE_UNTIL;
}

/** Minutes depuis minuit → 「05:12」, en repliant les jours. */
export function hhmm(clockMin: number): string {
  const m = Math.floor(((clockMin % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Ce qu'écrit la colonne du milieu pour une rame attendue dans `seconds`.
 *
 * 「まもなく」 l'emporte sur l'horaire : même à cinq heures du matin, une rame
 * qui entre en gare s'annonce par le mot et non par sa minute de départ.
 */
export function boardEta(seconds: number, clockMin: number): BoardEta {
  if (seconds <= SOON_UNDER) return { kind: 'soon' };
  if (showsSchedule(clockMin)) return { kind: 'time', hhmm: hhmm(clockMin + seconds / 60) };
  // Jamais 0 : un tableau qui annonce « environ zéro minute » n'existe pas.
  return { kind: 'minutes', minutes: Math.max(1, Math.round(seconds / 60)) };
}

/**
 * Les deux lignes du tableau, à partir de ce que le quai sait des rames.
 *
 * La seconde ligne est tenue à une minute au moins derrière la première : deux
 * lignes qui annoncent la même chose se lisent comme une panne d'afficheur.
 */
export function boardRows(next: NextTrains, clockMin: number): BoardEta[] {
  const head: BoardEta =
    next.first === null
      ? next.leaving
        ? { kind: 'departing' }
        : { kind: 'soon' }
      : boardEta(next.first, clockMin);
  const second = Math.max(next.second, (next.first ?? 0) + 60);
  return [head, boardEta(second, clockMin)];
}

/** Deux ETA disent-elles exactement la même chose ? */
function sameEta(a: BoardEta, b: BoardEta): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'minutes' && b.kind === 'minutes') return a.minutes === b.minutes;
  if (a.kind === 'time' && b.kind === 'time') return a.hhmm === b.hhmm;
  return true;
}

/**
 * Deux vues sont-elles identiques ? Le canvas ne se redessine que lorsqu'elles
 * diffèrent — sinon on repeindrait 1024 × 256 pixels soixante fois par seconde
 * pour un tableau qui n'a pas bougé.
 */
export function sameBoardView(a: BoardView, b: BoardView): boolean {
  return (
    a.english === b.english &&
    a.blink === b.blink &&
    a.rows.length === b.rows.length &&
    a.rows.every((row, i) => sameEta(row, b.rows[i]))
  );
}
