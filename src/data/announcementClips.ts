// Annonces enregistrées (Kokoro TTS : jf_alpha en japonais, af_heart en
// anglais), pré-générées par scripts/announcements-gen.py dans
// public/audio/announcements/<clé>.mp3. La clé est le hachage du couple
// (langue, texte) : un texte inchangé retrouve son clip, un texte modifié
// retombe sur speechSynthesis jusqu'à la prochaine génération.

import { PA_CLIPS } from './pa-manifest';
import { clipKey } from './clipKey';

/** Chemin logique (/audio/…) du clip d'une annonce, ou null s'il n'existe pas. */
export function announcementClipPath(lang: string, text: string): string | null {
  const key = clipKey(lang, text);
  return key in PA_CLIPS ? `/audio/announcements/${key}.mp3` : null;
}

/** Durée du clip en secondes, ou null. */
export function announcementClipDuration(lang: string, text: string): number | null {
  const key = clipKey(lang, text);
  return key in PA_CLIPS ? PA_CLIPS[key] : null;
}
