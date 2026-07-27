// Clé stable d'un clip d'annonce : hachage FNV-1a 32 bits de « lang|texte ».
// Partagée entre le générateur hors-ligne (scripts/announcements-export.ts)
// et le runtime (systems/paClips.ts) : le même texte retrouve le même fichier.

export function clipKey(lang: string, text: string): string {
  const s = `${lang}|${text}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
