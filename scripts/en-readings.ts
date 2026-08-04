// Prononciation JAPONAISE des noms propres dans les annonces ANGLAISES.
//
// Le problème que ce fichier règle : le G2P anglais du générateur (misaki, repli
// espeak) lit « Ikebukuro » et « Ueno » comme des mots anglais. Il place l'accent
// où l'anglais l'attend, réduit en schwa toutes les voyelles inaccentuées, et
// donne au « u » initial la valeur /juː/ - « you-ENN-oh », « ick-uh-BYOO-kuh-roh ».
// Ce ne sont plus des noms de gares, ce sont des mots anglais qui leur
// ressemblent, et c'est la première chose qu'entend quelqu'un qui connaît la
// ligne.
//
// La voix anglaise de JR East ne fait pas cela : elle parle anglais, mais elle
// dit les noms japonais avec les voyelles japonaises - « oo-EH-no »,
// « ee-keh-BOO-koo-roh ». Une seule syllabe porte l'accent (c'est de l'anglais,
// une phrase anglaise a un rythme accentuel), toutes les autres gardent leur
// timbre plein. C'est exactement ce qu'on reproduit ici.
//
// COMMENT : on ne demande plus au G2P de deviner. Chaque nom propre est décrit
// par sa lecture en mores (`READINGS`), convertie en phonèmes du jeu américain
// de Kokoro (`moraPhonemes`), et injectée dans le texte de synthèse sous la
// forme `[Ikebukuro](/ˌikɛbˈukuɾO/)`. Le générateur (scripts/announcements-gen.py)
// découpe là-dessus : le reste de la phrase passe par le G2P anglais comme
// avant, le nom propre non. Le texte AFFICHÉ, lui, ne bouge pas - seule la
// piste de synthèse est annotée, donc les clés de clips restent celles qu'elles
// étaient (voir data/clipKey).
//
// Les phonèmes ne sont pas ceux du japonais : Kokoro parle ici avec une voix
// anglaise, entraînée sur l'inventaire anglais. On approche donc chaque more
// avec ce que cet inventaire a de plus proche - le ɯ japonais devient u, le r
// battu devient ɾ (le « t » de « city » en américain, qui est exactement ce
// battement), le o devient la diphtongue O de « go », que dit de toute façon un
// anglophone. Ce qui compte est ce qui se perdait : les voyelles restent
// pleines, et l'accent tombe où il faut.

/**
 * Lecture d'un nom propre, more par more, séparées par des traits d'union.
 *
 * La more en MAJUSCULES porte l'accent tonique - un seul par mot, comme en
 * anglais. Le japonais n'a pas d'accent d'intensité mais une phrase anglaise en
 * réclame un : sans lui la synthèse aplatit le nom au point qu'il ne s'entend
 * plus dans le débit. On place donc celui de l'annonce anglaise réelle
 * (« ee-keh-BOO-koo-roh »), à défaut l'avant-dernière more, ce que fait
 * spontanément un anglophone.
 *
 * Les allongements sont écrits comme ils se prononcent, pas comme ils
 * s'orthographient : les macrons ont été retirés du texte de synthèse en amont
 * (Ōsaki → Osaki) et l'anglais ne tient pas la longueur vocalique de toute
 * façon. 「っ」 s'écrit en fermant la more sur la consonne suivante (nip-PO-ri).
 */
const READINGS: Record<string, string> = {
  // --- Les trente gares de la boucle ---
  Tokyo: 'TO-kyo',
  Kanda: 'KAN-da',
  Akihabara: 'a-ki-ha-BA-ra',
  Okachimachi: 'o-ka-chi-MA-chi',
  Ueno: 'u-E-no',
  Uguisudani: 'u-gu-i-su-DA-ni',
  Nippori: 'nip-PO-ri',
  Tabata: 'ta-BA-ta',
  Komagome: 'ko-ma-GO-me',
  Sugamo: 'su-GA-mo',
  Otsuka: 'o-TSU-ka',
  Ikebukuro: 'i-ke-BU-ku-ro',
  Mejiro: 'me-JI-ro',
  Takadanobaba: 'ta-ka-da-no-BA-ba',
  Okubo: 'O-ku-bo',
  Shinjuku: 'shin-JU-ku',
  Yoyogi: 'yo-YO-gi',
  Harajuku: 'ha-ra-JU-ku',
  Shibuya: 'shi-BU-ya',
  Ebisu: 'e-BI-su',
  Meguro: 'me-GU-ro',
  Gotanda: 'go-TAN-da',
  Osaki: 'o-SA-ki',
  Shinagawa: 'shi-na-GA-wa',
  Takanawa: 'ta-ka-NA-wa',
  Tamachi: 'ta-MA-chi',
  Hamamatsucho: 'ha-ma-ma-TSU-cho',
  Shimbashi: 'shim-BA-shi',
  Yurakucho: 'yu-ra-KU-cho',

  // Préfixes et déterminants de noms composés (新大久保, 西日暮里) : ils ne
  // portent pas l'accent du composé, il est sur le nom qui suit.
  Shin: 'shin',
  Nishi: 'ni-shi',

  // --- Lignes, compagnies et destinations citées en correspondance ---
  Yamanote: 'ya-ma-NO-te',
  Keihin: 'KEI-hin',
  Tohoku: 'to-HO-ku',
  Chuo: 'CHU-o',
  Sobu: 'SO-bu',
  Tokaido: 'to-KAI-do',
  Yokosuka: 'yo-ko-SU-ka',
  Keiyo: 'KEI-yo',
  Saikyo: 'SAI-kyo',
  Shonan: 'SHO-nan',
  Joban: 'JO-ban',
  Joetsu: 'JO-e-tsu',
  Utsunomiya: 'u-tsu-no-MI-ya',
  Takasaki: 'ta-ka-SA-ki',
  Rinkai: 'rin-KAI',
  Shinkansen: 'shin-KAN-sen',
  Ginza: 'GIN-za',
  Marunouchi: 'ma-ru-no-U-chi',
  Hibiya: 'hi-BI-ya',
  Chiyoda: 'chi-YO-da',
  Namboku: 'nam-BO-ku',
  Tozai: 'to-ZAI',
  Fukutoshin: 'fu-ku-TO-shin',
  Hanzomon: 'han-ZO-mon',
  Toei: 'TO-ei',
  Asakusa: 'a-SA-ku-sa',
  Mita: 'MI-ta',
  Oedo: 'o-E-do',
  Toden: 'TO-den',
  Arakawa: 'a-ra-KA-wa',
  Keisei: 'kei-SEI',
  Keikyu: 'kei-KYU',
  Keio: 'KEI-o',
  Inokashira: 'i-no-ka-SHI-ra',
  Odakyu: 'o-DA-kyu',
  Tobu: 'TO-bu',
  Tojo: 'TO-jo',
  Seibu: 'SEI-bu',
  Tokyu: 'TO-kyu',
  Toyoko: 'to-YO-ko',
  Ikegami: 'i-ke-GA-mi',
  Tsukuba: 'tsu-KU-ba',
  Toneri: 'to-NE-ri',
  Yurikamome: 'yu-ri-ka-MO-me',
  // 田園都市線 : le trait d'union appartient au nom, il ne sépare pas deux mots
  // qu'on saurait lire séparément - la lecture est donnée d'un bloc.
  'Den-en-toshi': 'den-en-TO-shi',

  // Sorties nommées des panneaux (data/lines.ts). Elles ne sont pas encore
  // annoncées, mais un nom propre japonais qui arriverait dans une annonce sans
  // lecture repartirait en anglais sans que rien ne le signale.
  Yaesu: 'ya-E-su',
  Shinobazu: 'shi-no-BA-zu',
  Hachiko: 'ha-chi-KO',
  Konan: 'KO-nan',
};

/**
 * Attaques : ce que Kokoro a de plus proche de chaque consonne japonaise.
 * Les plus longues d'abord - « ky » avant « k », sans quoi きょ se lirait
 * « k » + « yo ».
 */
const ONSETS: Record<string, string> = {
  ky: 'kj',
  gy: 'ɡj',
  ny: 'nj',
  hy: 'hj',
  by: 'bj',
  py: 'pj',
  my: 'mj',
  ry: 'ɾj',
  sh: 'ʃ',
  ch: 'ʧ',
  ts: 'ts',
  j: 'ʤ',
  k: 'k',
  g: 'ɡ',
  s: 's',
  z: 'z',
  t: 't',
  d: 'd',
  n: 'n',
  h: 'h',
  f: 'f',
  b: 'b',
  p: 'p',
  m: 'm',
  y: 'j',
  // ら行 : le battement alvéolaire de l'américain (le « t » de « water »), qui
  // est le son japonais, et non le ɹ anglais.
  r: 'ɾ',
  w: 'w',
};

/**
 * Voyelles. Les cinq japonaises gardent leur timbre plein - c'est là que tout
 * se joue : c'est leur réduction en ə qui déformait les noms.
 *
 * « ai » et « ei » sont les deux suites que l'anglais entend comme une seule
 * voyelle et qu'un anglophone dit ainsi de toute façon (Tōkaidō « toh-KIGH-doh »,
 * Keihin « KAY-hin »). Les allongements (oo, ou, uu…) retombent sur la voyelle
 * simple : l'anglais ne tient pas la longueur, et l'imiter par une répétition
 * ferait deux syllabes.
 */
const VOWELS: Record<string, string> = {
  aa: 'ɑ',
  ii: 'i',
  uu: 'u',
  ee: 'ɛ',
  oo: 'O',
  ou: 'O',
  ai: 'I',
  ei: 'A',
  a: 'ɑ',
  i: 'i',
  u: 'u',
  e: 'ɛ',
  o: 'O',
};

/** Codas : le ん moraïque, et la consonne redoublée du っ (nip-PO-ri). */
const CODAS: Record<string, string> = {
  ng: 'ŋ',
  n: 'n',
  m: 'm',
  k: 'k',
  p: 'p',
  t: 't',
  s: 's',
};

const SYLLABLE =
  /^(ky|gy|ny|hy|by|py|my|ry|sh|ch|ts|j|k|g|s|z|t|d|n|h|f|b|p|m|y|r|w)?(aa|ii|uu|ee|oo|ou|ai|ei|a|i|u|e|o)(ng|n|m|k|p|t|s)?$/;

/**
 * Lecture en mores → phonèmes Kokoro (« i-ke-BU-ku-ro » → « ˌikɛbˈukuɾO »).
 *
 * L'accent se pose juste avant la voyelle, après l'attaque : c'est la
 * convention de misaki, celle que Kokoro attend (kˈOkəɹO).
 */
export function moraPhonemes(reading: string): string {
  return reading
    .split('-')
    .map((syllable, i, all) => {
      const stressed = syllable !== syllable.toLowerCase();
      const m = SYLLABLE.exec(syllable.toLowerCase());
      if (!m) throw new Error(`More illisible dans « ${reading} » : « ${syllable} »`);
      const [, onset, vowel, coda] = m;
      // Une more initiale SANS consonne et sans accent se fait avaler : le
      // 「う」 de 上野 disparaissait derrière le え accentué qui le suit, et on
      // entendait « Eno ». L'accent secondaire lui rend son attaque sans lui
      // donner l'accent du mot - « oo-EH-no ». Une more initiale à consonne n'a
      // pas ce problème : la consonne suffit à la poser.
      const lead = !onset && !stressed && i === 0 && all.length > 1 ? 'ˌ' : '';
      return (
        (onset ? ONSETS[onset] : '') +
        lead +
        (stressed ? 'ˈ' : '') +
        VOWELS[vowel] +
        (coda ? CODAS[coda] : '')
      );
    })
    .join('');
}

/** Le mot a-t-il une lecture japonaise ? (mot composé : chacune de ses parties) */
export function hasReading(word: string): boolean {
  if (word in READINGS) return true;
  const parts = word.split('-');
  return parts.length > 1 && parts.every((p) => p in READINGS);
}

/** Phonèmes d'un mot, les parties d'un composé restant deux mots distincts. */
function wordPhonemes(word: string): string {
  if (word in READINGS) return moraPhonemes(READINGS[word]);
  return word
    .split('-')
    .map((p) => moraPhonemes(READINGS[p]))
    .join(' ');
}

/**
 * Annote un texte anglais : chaque nom propre japonais reçoit sa prononciation,
 * `[Ikebukuro](/ˌikɛbˈukuɾO/)`. Un mot sans lecture est laissé tel quel - il
 * repartira vers le G2P anglais, et c'est ce que le test de couverture
 * (tests/enReadings.test.ts) interdit de laisser arriver en silence.
 */
export function markJapanesePronunciation(text: string): string {
  return text.replace(/[A-Za-z]+(?:-[A-Za-z]+)*/g, (word) =>
    hasReading(word) ? `[${word}](/${wordPhonemes(word)}/)` : word,
  );
}

/** Les mots dont on connaît la lecture, pour les tests de couverture. */
export const READING_WORDS: string[] = Object.keys(READINGS);
