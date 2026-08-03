// Ce qu'on laisse passer dans le tchat, et à quel rythme.
//
// Un salon se rejoint par un code de six caractères qu'on donne à qui l'on
// veut : il n'y a pas d'inconnus dedans, et il n'y a donc pas de modération à
// faire. Pas de liste de mots interdits - trilingue, elle produirait plus de
// faux positifs que de bien, et le premier joueur japonais à écrire quelque
// chose de parfaitement anodin se ferait taire par une expression régulière
// écrite en français.
//
// Ce qu'il faut en revanche, c'est que le tchat ne puisse pas CASSER quelque
// chose : un message d'un mégaoctet qui fait ramer la scène, un retour à la
// ligne qui défonce la bulle, un onglet parti en boucle qui noie le canal. D'où
// deux garde-fous, et pas un de plus.
//
// Les deux s'appliquent À L'ENVOI ET À LA RÉCEPTION. Ce n'est pas de la
// paranoïa : le nettoyage à l'envoi protège nos camarades de nos propres
// bogues, celui à la réception nous protège d'un onglet resté ouvert sur une
// version d'avant. Personne n'a besoin d'être malveillant pour qu'un message
// arrive de travers.
//
// Module pur : aucun import de valeur hormis une constante, il se teste sous
// `node --test`.

import { CHAT_MAX_LENGTH } from './protocol';

/**
 * Ce point de code doit-il disparaître purement et simplement ?
 *
 * Écrit en comparaisons numériques plutôt qu'en classe d'expression régulière,
 * et c'est délibéré : une classe comme `/[‪-‮]/` demande d'écrire des
 * caractères invisibles - ou leurs échappements - dans le fichier source, où
 * ils sont illisibles à la relecture et se perdent au premier outil un peu
 * zélé. Ici, chaque plage est nommée.
 */
function isRemovable(cp: number): boolean {
  // Commandes C0, sauf tabulation, saut de ligne et retour chariot : ceux-là
  // sont des blancs, et l'effondrement des blancs s'en occupe juste après.
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return true;
  // Suppression (DEL) et commandes C1.
  if (cp >= 0x7f && cp <= 0x9f) return true;
  // Espaces de largeur nulle et liants (ZWSP, ZWNJ, ZWJ).
  if (cp >= 0x200b && cp <= 0x200d) return true;
  // Marques de sens d'écriture : LRM/RLM, puis les emboîtements et surcharges
  // (LRE, RLE, PDF, LRO, RLO) et les isolants (LRI, RLI, FSI, PDI).
  //
  // Ce n'est pas de la coquetterie typographique : RLO (U+202E) retourne
  // l'ordre d'affichage de tout ce qui le suit. C'est le seul vrai tour
  // pendable qu'on puisse jouer avec du texte brut, et il défigure une bulle
  // sans qu'aucune longueur ni aucun caractère ne paraisse anormal.
  if (cp === 0x200e || cp === 0x200f) return true;
  if (cp >= 0x202a && cp <= 0x202e) return true;
  if (cp >= 0x2066 && cp <= 0x2069) return true;
  // Indicateur d'ordre des octets égaré au milieu d'une chaîne.
  if (cp === 0xfeff) return true;
  return false;
}

/**
 * Nettoie un message. Rend la chaîne vide si, une fois nettoyé, il ne reste
 * rien à dire - c'est à l'appelant de refuser d'envoyer du vide.
 *
 * Trois opérations, dans cet ordre :
 *
 *  1. Les points de code indésirables sautent (voir `isRemovable`).
 *  2. Tout blanc devient une espace simple, retours à la ligne compris. **Un
 *     message est une ligne.** La bulle au-dessus des têtes est dimensionnée
 *     pour deux lignes de rendu, pas pour un poème.
 *  3. Coupe à `CHAT_MAX_LENGTH`, puis on retaille les bords : couper à cent
 *     quarante peut très bien tomber au milieu d'une espace.
 *
 * L'ordre compte. Couper AVANT d'effondrer les blancs donnerait une longueur
 * finale variable selon le nombre d'espaces consécutifs qu'on vient de retirer,
 * et deux clients qui nettoient dans un ordre différent n'afficheraient pas le
 * même message.
 *
 * On itère sur les points de code (`for...of`) et non sur les unités UTF-16 :
 * un émoji est deux unités, et le couper en deux produit un caractère de
 * remplacement au lieu du sourire qu'on voulait.
 */
export function sanitize(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let kept = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || isRemovable(cp)) continue;
    kept += ch;
  }
  const oneLine = kept.replace(/\s+/gu, ' ').trim();
  // La coupe se fait aussi par points de code, pour la même raison.
  let out = '';
  let n = 0;
  for (const ch of oneLine) {
    if (n >= CHAT_MAX_LENGTH) break;
    out += ch;
    n++;
  }
  return out.trim();
}

// --- Le débit ---------------------------------------------------------------
//
// Un seau à jetons plutôt qu'un délai minimal entre deux messages : on veut
// qu'une conversation vive - trois répliques coup sur coup, c'est normal - et
// qu'un flux continu soit impossible. Le seau donne exactement ça : il autorise
// une rafale de la taille du seau, puis impose la cadence de remplissage.

/** Messages qu'on peut envoyer coup sur coup. */
export const CHAT_BURST = 3;
/** Délai de remplissage d'un jeton (ms). */
export const CHAT_REFILL_MS = 1_500;

export interface Bucket {
  /** Jetons disponibles, valeur flottante : le seau se remplit continûment. */
  tokens: number;
  /** Instant du dernier calcul. */
  at: number;
}

export function makeBucket(now: number): Bucket {
  return { tokens: CHAT_BURST, at: now };
}

/**
 * Consomme un jeton si le seau en a un. Rend `true` si le message passe.
 *
 * Le seau est mis à jour PAR EFFET DE BORD, ce qui surprend dans un module
 * qu'on dit pur - mais « pur » veut dire ici « sans dépendance et sans état
 * global », pas « sans mutation ». L'appelant tient ses seaux ; ce module ne
 * connaît personne et ne retient rien.
 */
export function takeToken(bucket: Bucket, now: number): boolean {
  const elapsed = Math.max(0, now - bucket.at);
  bucket.tokens = Math.min(CHAT_BURST, bucket.tokens + elapsed / CHAT_REFILL_MS);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/**
 * Le seau d'un pair, créé au besoin.
 *
 * Un seau PAR PAIR, et c'est tout l'intérêt : un seau commun laisserait un
 * onglet emballé consommer la parole de tout le monde. Chacun a son propre
 * droit de parole, et n'entame que le sien.
 */
export function bucketFor(buckets: Map<string, Bucket>, id: string, now: number): Bucket {
  let b = buckets.get(id);
  if (b === undefined) {
    b = makeBucket(now);
    buckets.set(id, b);
  }
  return b;
}
