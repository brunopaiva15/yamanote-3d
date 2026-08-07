// Le découpage du temps de la page de statistiques, et rien d'autre.
//
// Module PUR : ni React, ni réseau, ni store. C'est ce qui le rend testable sous
// `node --test`, et il en a besoin plus que le reste de la page - un histogramme
// faux ne se voit pas. Une barre décalée d'un cran, un créneau manquant à la
// fin du mois, une heure d'été qui compte deux fois : rien de tout cela ne
// provoque d'erreur, on lit simplement des chiffres qui ne sont pas ceux qu'on
// croit.
//
// --- La règle qui tient tout ------------------------------------------------
//
// Le regroupement est fait par PostgreSQL, dans le fuseau du navigateur (voir
// `supabase/analytics.sql`). Il ne renvoie que les créneaux non vides : c'est à
// la page de fabriquer l'axe complet, zéros compris, sans quoi une nuit sans
// personne rapprocherait 23 h et 7 h comme si de rien n'était.
//
// Les deux moitiés - les créneaux fabriqués ici, les créneaux comptés là-bas -
// doivent tomber d'accord sur ce qu'est « le même créneau ». Elles se
// rejoignent sur `slotKey`, qui lit l'heure LOCALE d'un instant et rend une
// étiquette de calendrier. C'est le seul point de contact, et c'est voulu :
// comparer des instants échouerait deux fois par an, quand une même heure de
// calendrier existe deux fois ou pas du tout.

/** Les quatre granularités, dans l'ordre du plus fin au plus large. */
export type Bucket = 'hour' | 'day' | 'week' | 'month';

export const BUCKETS: readonly Bucket[] = ['hour', 'day', 'week', 'month'];

export const BUCKET_LABEL: Record<Bucket, string> = {
  hour: 'Par heure',
  day: 'Par jour',
  week: 'Par semaine',
  month: 'Par mois',
};

/** Le titre de l'histogramme, une fois la mesure choisie. */
export const BUCKET_TITLE: Record<Bucket, string> = {
  hour: 'heure',
  day: 'jour',
  week: 'semaine',
  month: 'mois',
};

/** Les fenêtres proposées. `days` à `null` : depuis le tout premier battement. */
export interface Range {
  id: string;
  label: string;
  days: number | null;
}

export const RANGES: readonly Range[] = [
  { id: '24h', label: '24 heures', days: 1 },
  { id: '7j', label: '7 jours', days: 7 },
  { id: '30j', label: '30 jours', days: 30 },
  { id: '12m', label: '12 mois', days: 365 },
  { id: 'tout', label: 'Tout', days: null },
];

/**
 * Plafond de barres.
 *
 * Au-delà, une barre fait moins d'un pixel : l'histogramme devient un aplat, et
 * le navigateur peine à animer trois mille nœuds pour rien. C'est aussi le
 * garde-fou qui empêche une date de départ absurde de faire tourner la boucle
 * de fabrication des créneaux jusqu'à la fin des temps.
 */
export const MAX_SLOTS = 800;

/** Lundi, comme `date_trunc('week', …)` de PostgreSQL - et pas dimanche. */
function startOfWeek(d: Date): Date {
  const depuisLundi = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - depuisLundi);
}

/** Le début du créneau qui contient cet instant, en heure locale. */
export function truncLocal(bucket: Bucket, d: Date): Date {
  switch (bucket) {
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case 'week':
      return startOfWeek(d);
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1);
  }
}

/**
 * Le créneau suivant.
 *
 * Les jours, semaines et mois avancent par le CALENDRIER (`getDate() + 1`) et
 * non par 86 400 000 millisecondes : les deux dimanches de changement d'heure
 * durent vingt-trois et vingt-cinq heures, et une arithmétique en millisecondes
 * y ferait glisser tout le reste de l'année d'une heure - donc, une nuit sur
 * deux, d'un jour.
 */
function nextSlot(bucket: Bucket, d: Date): Date {
  switch (bucket) {
    case 'hour':
      // Ici, en revanche, l'heure est bien une heure : `new Date(…, h + 1)` sur
      // une heure qui n'existe pas (nuit de printemps) rendrait la même que la
      // précédente, et la boucle ne finirait jamais.
      return new Date(d.getTime() + 3600_000);
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    case 'week':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    case 'month':
      return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * L'étiquette de calendrier d'un instant : le point de rendez-vous avec le
 * serveur. Deux instants qui portent la même étiquette sont le même créneau.
 */
export function slotKey(bucket: Bucket, d: Date): string {
  const t = truncLocal(bucket, d);
  const jour = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  if (bucket === 'hour') return `${jour}T${pad(t.getHours())}`;
  if (bucket === 'month') return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
  return jour;
}

/**
 * L'axe complet, du premier créneau au dernier, sans trou.
 *
 * Les doublons sont écartés par `slotKey` : la nuit d'automne où deux heures
 * portent le même nom, le serveur n'a qu'un créneau à nous donner, et l'axe ne
 * doit donc en montrer qu'un.
 */
export function slotSequence(bucket: Bucket, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const vus = new Set<string>();
  let cur = truncLocal(bucket, from);
  const fin = to.getTime();
  while (cur.getTime() <= fin && out.length < MAX_SLOTS) {
    const cle = slotKey(bucket, cur);
    if (!vus.has(cle)) {
      vus.add(cle);
      out.push(cur);
    }
    const suivant = nextSlot(bucket, cur);
    // Ceinture : une granularité qui n'avancerait pas ferait tourner la page.
    if (suivant.getTime() <= cur.getTime()) break;
    cur = suivant;
  }
  return out;
}

/**
 * Les granularités qui ont un sens sur une fenêtre de tant de jours.
 *
 * Une borne haute (trop de barres, illisible) et une borne basse (deux barres,
 * ce n'est plus un histogramme). Une granularité écartée est GRISÉE dans la
 * page plutôt que retirée : l'absence d'un bouton se lit comme une panne, un
 * bouton éteint se lit comme une réponse.
 */
export function allowedBuckets(spanDays: number): Bucket[] {
  const out: Bucket[] = [];
  if (spanDays <= 14) out.push('hour');
  if (spanDays >= 2) out.push('day');
  if (spanDays >= 21) out.push('week');
  if (spanDays >= 75) out.push('month');
  // Une fenêtre plus courte qu'une journée n'entre dans aucune règle : l'heure
  // reste, faute de quoi la page n'aurait aucun bouton à proposer.
  return out.length > 0 ? out : ['hour'];
}

/** La granularité par défaut d'une fenêtre : celle qui donne 7 à 60 barres. */
export function defaultBucket(spanDays: number): Bucket {
  const permises = allowedBuckets(spanDays);
  const voulue: Bucket =
    spanDays <= 2 ? 'hour' : spanDays <= 45 ? 'day' : spanDays <= 200 ? 'week' : 'month';
  return permises.includes(voulue) ? voulue : permises[permises.length - 1];
}

/** L'étiquette courte, sous la barre. Volontairement sans Intl : elle doit tenir. */
export function shortLabel(bucket: Bucket, d: Date): string {
  switch (bucket) {
    case 'hour':
      return `${pad(d.getHours())}:00`;
    case 'day':
    case 'week':
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    case 'month':
      return `${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  }
}

/**
 * Un créneau sur deux, sur trois, sur douze : assez d'étiquettes pour se repérer,
 * jamais assez pour se chevaucher.
 */
export function labelStep(count: number, max = 12): number {
  return Math.max(1, Math.ceil(count / max));
}

/** L'étiquette longue, pour l'infobulle et le tableau. */
export function longLabel(bucket: Bucket, d: Date): string {
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
  switch (bucket) {
    case 'hour':
      return `${date}, ${pad(d.getHours())} h – ${pad((d.getHours() + 1) % 24)} h`;
    case 'day':
      return date;
    case 'week':
      return `semaine du ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)}`;
    case 'month':
      return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);
  }
}

/** Divisions de l'axe vertical : quatre lignes de repère, zéro non compris. */
const DIVISIONS = 4;

/**
 * L'écart entre deux lignes de repère : un ENTIER rond.
 *
 * C'est le pas qui est choisi en premier, et le haut de l'axe s'en déduit -
 * l'inverse (arrondir le maximum, puis le diviser en quatre) donne des repères
 * à 9,25 et 12,5 visiteurs. On ne compte pas des quarts de personne, et une
 * échelle qu'il faut interpréter n'est plus une échelle.
 */
function nicePas(brut: number): number {
  if (!Number.isFinite(brut) || brut <= 1) return 1;
  const base = 10 ** Math.floor(Math.log10(brut));
  for (const m of [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10]) {
    const pas = m * base;
    if (pas >= brut && Number.isInteger(pas)) return pas;
  }
  return Math.ceil(brut);
}

/**
 * Le haut de l'axe.
 *
 * Jamais moins de 4 : sans ce plancher, une journée à un seul visiteur donnerait
 * une barre pleine hauteur, aussi haute que le millier d'un autre jour.
 */
export function niceMax(max: number): number {
  const cible = Number.isFinite(max) ? Math.max(max, 4) : 4;
  return nicePas(cible / DIVISIONS) * DIVISIONS;
}

/** Les valeurs des lignes de repère, du bas vers le haut, zéro exclu. */
export function gridTicks(max: number, divisions = DIVISIONS): number[] {
  const pas = niceMax(max) / DIVISIONS;
  const out: number[] = [];
  for (let i = 1; i <= divisions; i++) out.push(pas * i);
  return out;
}
