// Clé stable d'un clip d'annonce : hachage FNV-1a 32 bits de « lang|texte » -
// ou de « lang|rôle|texte » quand le texte est dit par un RÔLE VOCAL précis.
// Partagée entre le générateur hors-ligne (scripts/announcements-export.ts)
// et le runtime (data/announcementClips.ts) : le même texte retrouve le même
// fichier.
//
// Pourquoi le rôle entre dans la clé : sur le quai, deux automates disent
// exactement les mêmes mots - 「渋谷、渋谷。ご乗車、ありがとうございます。」 est
// annoncé par la voix féminine du 内回り et par la voix masculine du 外回り. Sans
// le rôle, les deux textes hachent pareil, un seul MP3 survit à la gravure, et
// un quai sur deux parle avec la voix de l'autre sens.
//
// Les annonces de la RAME n'ont pas de rôle : elles gardent donc exactement la
// clé qu'elles avaient (une voix par langue, décidée par le générateur), et
// aucun de leurs clips n'a besoin d'être regravé.

export function clipKey(lang: string, text: string, voiceRole?: string): string {
  const s = voiceRole ? `${lang}|${voiceRole}|${text}` : `${lang}|${text}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
