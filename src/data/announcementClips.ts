// Annonces enregistrées (Kokoro TTS : jf_alpha en japonais à bord, af_heart en
// anglais à bord, et les trois voix du quai - voir data/stationAnnouncements),
// pré-générées par scripts/announcements-gen.py dans
// public/audio/announcements/<clé>.mp3. La clé est le hachage du couple
// (langue, texte), plus le RÔLE VOCAL quand il y en a un : un texte inchangé
// retrouve son clip, un texte modifié n'en a plus et reste muet (voir
// systems/speech).
//
// Le rôle est ce qui sépare deux annonces de quai identiques au mot près mais
// dites par deux automates différents (内回り féminin, 外回り masculin). Les
// annonces de bord, qui n'ont qu'une voix par langue, ne le passent pas.

import { PA_CLIPS } from './pa-manifest';
import { clipKey } from './clipKey';

/** Chemin logique (/audio/…) du clip d'une annonce, ou null s'il n'existe pas. */
export function announcementClipPath(
  lang: string,
  text: string,
  voiceRole?: string,
): string | null {
  const key = clipKey(lang, text, voiceRole);
  return key in PA_CLIPS ? `/audio/announcements/${key}.mp3` : null;
}

/** Durée du clip en secondes, ou null. */
export function announcementClipDuration(
  lang: string,
  text: string,
  voiceRole?: string,
): number | null {
  const key = clipKey(lang, text, voiceRole);
  return key in PA_CLIPS ? PA_CLIPS[key] : null;
}
