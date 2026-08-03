// Le code qu'on se donne pour monter dans la même rame.
//
// Six caractères, tirés dans un alphabet de trente-deux glyphes d'où l'on a
// retiré tout ce qui se confond : ni `0` face à `O`, ni `1` face à `I` ou `L`,
// ni `U` face à `V`. Ce n'est pas de la coquetterie - un code de salon se lit à
// voix haute au téléphone, se recopie depuis une capture d'écran, se dicte dans
// un message vocal. Un `O` pris pour un zéro, et c'est une rame qu'on ne trouve
// pas, sans le moindre message d'erreur qui dise pourquoi.
//
// Trente puissance six fait sept cent vingt-neuf millions de combinaisons.
// C'est très largement assez : les salons sont privés et éphémères, personne ne
// les énumère, et deux salons simultanés qui tireraient le même code se
// retrouveraient simplement dans la même rame - ce qui est cocasse, pas grave.

/**
 * Alphabet du code : trente glyphes, sans `0 O 1 I L U`.
 *
 * Trente et non trente-deux, donc pas une puissance de deux, donc un modulo
 * légèrement biaisé sur l'octet tiré (les six premiers glyphes sortent 9/8ᵉ
 * plus souvent que les autres). C'est assumé : on préfère un alphabet dont
 * chaque caractère se dicte au téléphone à un alphabet qui se masque
 * proprement. Le biais ne coûte que quelques bits d'entropie sur un milliard de
 * combinaisons, et il n'y a rien à protéger ici.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

const ALPHABET = ROOM_CODE_ALPHABET;

/** Longueur d'un code de salon. */
export const ROOM_CODE_LENGTH = 6;

/**
 * Tire un code de salon.
 *
 * `crypto.getRandomValues` plutôt que `Math.random` : non pas qu'un code de
 * salon soit un secret - il se partage, c'est tout son objet - mais parce que
 * `Math.random` est semé par le navigateur et que deux onglets ouverts dans la
 * même seconde peuvent, sur certains moteurs, tirer la même chose. Deux amis
 * qui créent chacun leur rame au même instant et se retrouvent dans la même,
 * c'est exactement le bogue qu'on ne reproduira jamais.
 */
export function makeRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    // Environnement sans WebCrypto (très vieux navigateur, harnais de test) :
    // le code reste utilisable, il est simplement moins bien tiré.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Nettoie ce que le joueur a tapé, ou rend `null`.
 *
 * On met en majuscules, on retire les espaces et les tirets - un code recopié
 * arrive souvent sous la forme « abc-234 » ou avec une espace collée par le
 * presse-papiers -, et on refuse tout le reste.
 *
 * On ne DEVINE pas : un `O` n'est pas rendu en `0`, un `I` n'est pas rendu en
 * `1`. C'est délibéré, et c'est le même parti que `modeFromUrl()`
 * (systems/gameMode), qui ignore une valeur inconnue plutôt que de la corriger.
 * Deviner, ici, ferait entrer quelqu'un dans une rame qui n'est pas la bonne,
 * et rien à l'écran ne le lui dirait : il attendrait ses amis dans un salon
 * vide. Refuser franchement lui fait relire son code, ce qui prend trois
 * secondes.
 */
export function normalizeRoomCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().replace(/[\s\-_]/g, '');
  if (cleaned.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/** Nom du canal Supabase d'un salon. Un seul endroit qui le compose. */
export function roomChannel(code: string): string {
  return `train:${code}`;
}
