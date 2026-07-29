// Énumère tous les textes d'annonces réellement joués (mêmes appels que
// systems/stationCycle.ts et systems/departureSequence.ts) et les écrit en
// JSON pour le générateur Kokoro (scripts/announcements-gen.py).
//
// Usage :
//   npx esbuild scripts/announcements-export.ts --bundle --format=esm \
//     --platform=node --outfile=<tmp>/announcements-export.mjs
//   node <tmp>/announcements-export.mjs <sortie.json>
//
// Chaque entrée : { key, lang, text, tts, voice, speed }
// - key   : clipKey(lang, text), nom de fichier du MP3 et clé du manifeste ;
// - text  : texte affiché / haché, identique au runtime ;
// - tts   : texte adapté à la synthèse (macrons ASCII et « JY-xx » épelé en
//           anglais ; en japonais, les quelques mots que l'analyseur du
//           générateur lit de travers, réécrits en kana — voir JA_READINGS) ;
// - voice : voix Kokoro. QUATRE sources parlent dans ce jeu et on doit les
//           distinguer à l'oreille sans regarder : la sono de la RAME
//           (jf_alpha), l'annonce automatique du QUAI (jm_kumo — un homme, là
//           où la rame est une femme : deux sonos qui se répondent à une
//           seconde d'écart ne se confondent plus), l'AGENT de quai au micro
//           (jf_nezumi, moins lisse — c'est une personne, pas un automate, et
//           ce n'est pas la machine qui vient de parler), et les deux voix
//           anglaises (af_heart à bord, am_michael au quai).
// - speed : vitesse Kokoro. Le japonais est au-dessus du rythme natif pour
//           COMPENSER la découpe en segments du générateur : synthétisé seul,
//           un segment reçoit une intonation de fin de phrase et s'allonge
//           d'environ 25 % — à vitesse 1.0 la voix articulait donc plus
//           lentement qu'avant l'ajout des pauses. Les silences aux 、/。
//           eux-mêmes sont posés par le générateur, pas par le débit.
//           L'anglais du quai est un cran sous celui de la rame : dehors, sous
//           une verrière, une annonce trop rapide ne s'attrape pas.

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  EMERGENCY_REASONS,
  approachSequence,
  departureSequence,
  doorReleaseAnnouncement,
  doorsClosingAnnouncement,
  emergencyBrakeAnnouncement,
  emergencyResumeAnnouncement,
  emergencyStopAnnouncement,
  emergencyWaitAnnouncement,
  outageRestoredAnnouncement,
  outageStopAnnouncement,
  outageWaitAnnouncement,
  welcomeAnnouncement,
  type Utterance,
} from '../src/data/announcements.ts';
import {
  PLATFORM_AGENT_MESSAGES,
  PLATFORM_DELAY_CAUSES,
  PLATFORM_DOOR_RELEASE,
  platformAgentMessage,
  platformApproachAnnouncement,
  platformArrivalAnnouncement,
  platformDelayAnnouncement,
  platformDoorCheckAnnouncement,
  platformDoorReleaseAnnouncement,
  platformDoorsClosingAnnouncement,
  platformGreeting,
  platformPassAnnouncement,
  platformPassWarning,
  platformPreAnnouncement,
  platformTrainEnteringAnnouncement,
  type StationUtterance,
  type StationVoice,
} from '../src/data/stationAnnouncements.ts';
import { facingTrackNumber, passThroughStations } from '../src/data/passingTrains.ts';
import { platformFor, type LoopDirection } from '../src/data/platforms.ts';
import { DOOR_SIDE, STATIONS } from '../src/data/stations.ts';
import { clipKey } from '../src/data/clipKey.ts';

/** Réglage de synthèse d'un canal : voix Kokoro et débit. */
interface VoiceSetting {
  voice: string;
  speed: number;
}

/** Voix de la sonorisation de la RAME (annonces de bord). */
const CABIN_VOICE: Record<Utterance['lang'], VoiceSetting> = {
  'ja-JP': { voice: 'jf_alpha', speed: 1.15 },
  'en-US': { voice: 'af_heart', speed: 0.93 },
};

/**
 * Voix de la sonorisation du QUAI, par rôle (voir data/stationAnnouncements).
 * L'AUTOMATE est un homme : c'est lui qu'on entend par-dessus la sono de bord,
 * et deux machines qui se répondent doivent se distinguer d'un mot. L'agent
 * reste une femme — d'autant mieux qu'on l'entend juste après l'automate, et
 * qu'on doit savoir tout de suite lequel des deux vient de prendre le micro.
 */
const STATION_VOICE: Record<StationVoice, VoiceSetting> = {
  atos: { voice: 'jm_kumo', speed: 1.15 },
  // L'agent parle un peu plus vite : elle improvise, elle n'articule pas un script.
  agent: { voice: 'jf_nezumi', speed: 1.22 },
  'atos-en': { voice: 'am_michael', speed: 0.88 },
};

/**
 * Sens de circulation pour lesquels on grave les annonces. LES DEUX : la rame
 * roule maintenant dans un sens comme dans l'autre, et le sens change ce qui
 * est DIT — le nom de la boucle (山手線内回り／外回り), les gares repères de la
 * direction, et le numéro de voie desservie. Sans clip, une annonce reste
 * muette (voir systems/speech) : un sens jouable sans clips serait un sens
 * silencieux.
 *
 * Le surcoût est modeste. La plupart des textes ne dépendent pas du sens —
 * 「次は。渋谷。お出口は右側です。」 est le même dans les deux, puisque le côté
 * d'ouverture appartient à la gare — et la déduplication par clé les partage.
 */
const DIRECTIONS: LoopDirection[] = ['inner', 'outer'];

/** Numéros de voie possibles à cette gare dans ce sens (principal + alternatif). */
function platformsFor(jy: string, direction: LoopDirection): number[] {
  const info = platformFor(jy, direction);
  if (!info) return [1];
  const out = [info.platform];
  if (info.alternativePlatform != null) out.push(info.alternativePlatform);
  return out;
}

// « Ōsaki » → « Osaki » : les macrons perturbent le G2P anglais.
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '');
}

// « JY-05 » → « J Y 5 » : épelé lettre à lettre, sans zéro de tête.
function spellStationCode(s: string): string {
  return s.replace(/\bJY-0*(\d+)/g, 'J Y $1');
}

/**
 * Mots que l'analyseur japonais du générateur (misaki, version cutlet) lit de
 * travers, réécrits pour la SYNTHÈSE seule : le texte du jeu, lui, garde son
 * orthographe.
 *
 * Le plus gênant était le nom même de la ligne. 「山手線内回り」 sortait en
 * « yamate sennai mawari » : 山手 lu やまて au lieu de やまのて, et 線内回り
 * recollé en un mot. La gare annonçait donc une ligne qui n'existe pas, dans
 * chaque pré-annonce et chaque annonce d'approche.
 *
 * Un nom propre se réécrit en KATAKANA : en hiragana, l'analyseur le redécoupe
 * en syllabes détachées (おかちまち → « o kachi machi ») alors que le katakana
 * le garde d'un bloc (オカチマチ → « okachimachi »). Pour les mots ordinaires,
 * dont la coupure ne s'entend pas, l'hiragana suffit.
 *
 * Aucune de ces réécritures n'introduit de 、 ou de 。 : la découpe en segments
 * et les silences du générateur restent ceux du texte d'origine. Les noms de
 * GARES, eux, ne sont pas ici : le générateur les vérifie tout seul contre leur
 * transcription kana (voir station_replacements dans announcements-gen.py).
 *
 * Attention : corriger une lecture ici ne change PAS la clé du clip — elle
 * hache le texte du jeu, pas le texte synthétisé. Il faut donc supprimer les
 * MP3 concernés (ou regraver sans --reuse) pour que la correction s'entende.
 */
const JA_READINGS: [RegExp, string][] = [
  [/山手線/g, 'ヤマノテ線'], // « yamate-sen » → yamanote-sen
  [/内回り/g, 'ウチマワリ'], // 線内回り recollé en « sennai mawari »
  [/外回り/g, 'ソトマワリ'], // idem pour l'autre sens : 線外回り → « sengai mawari »
  [/方面行き/g, '方面ゆき'], // « hōmen-iki » → hōmen-yuki, comme la rame
  [/人立入り/g, 'ひと立入り'], // « jinritsu-iri » → hito-tachiiri
  [/ホーム中ほど/g, 'ホームなかほど'], // « hōmu chū-hodo » → hōmu nakahodo
  [/大江戸線/g, 'おおえど線'], // « dai-edo-sen » → ōedo-sen
];

function ttsText(u: Utterance): string {
  if (u.lang === 'en-US') return spellStationCode(stripDiacritics(u.text));
  let out = u.text;
  for (const [pattern, reading] of JA_READINGS) out = out.replace(pattern, reading);
  return out;
}

// --- Sonorisation de la RAME --------------------------------------------

const utterances: Utterance[] = [];
for (const direction of DIRECTIONS) {
  for (let i = 0; i < STATIONS.length; i++) {
    utterances.push(...departureSequence(i, DOOR_SIDE[i], direction));
    utterances.push(...approachSequence(i, DOOR_SIDE[i]));
  }
}
utterances.push(...doorsClosingAnnouncement());
// Porte bloquée : la demande du conducteur, et sa version insistante.
utterances.push(...doorReleaseAnnouncement());
utterances.push(...doorReleaseAnnouncement(true));
utterances.push(...welcomeAnnouncement());
// Arrêt d'urgence : freinage, annonce d'arrêt (un clip par motif), attente, reprise.
utterances.push(...emergencyBrakeAnnouncement());
for (let r = 0; r < EMERGENCY_REASONS.length; r++) {
  utterances.push(...emergencyStopAnnouncement(r));
}
utterances.push(...emergencyWaitAnnouncement());
utterances.push(...emergencyResumeAnnouncement());
// Coupure de caténaire : le conducteur au combiné une fois la rame posée, le
// rappel d'attente, et le retour de la tension. Pas d'annonce au moment de la
// coupure — la sonorisation automatique s'éteint avec le convertisseur.
utterances.push(...outageStopAnnouncement());
utterances.push(...outageWaitAnnouncement());
utterances.push(...outageRestoredAnnouncement());

// --- Sonorisation du QUAI (ATOS + agent) ---------------------------------

const stationUtterances: StationUtterance[] = [];
for (const direction of DIRECTIONS) {
  for (let i = 0; i < STATIONS.length; i++) {
    for (const platform of platformsFor(STATIONS[i].jy, direction)) {
      stationUtterances.push(...platformPreAnnouncement(i, platform, direction));
      stationUtterances.push(...platformApproachAnnouncement(i, platform, direction));
      stationUtterances.push(...platformDoorsClosingAnnouncement(platform));
    }
    stationUtterances.push(...platformArrivalAnnouncement(i));
  }
}
// Passage sans arrêt : la voie annoncée n'est PAS la nôtre, c'est celle d'en
// face (data/passingTrains). On grave le numéro de voie de chaque gare qui
// peut en voir traverser une, dans le sens réellement circulé.
for (const direction of DIRECTIONS) {
  for (const i of passThroughStations()) {
    const track = facingTrackNumber(i, direction);
    if (track != null) stationUtterances.push(...platformPassAnnouncement(track));
  }
}
stationUtterances.push(...platformPassWarning());
stationUtterances.push(...platformGreeting());
stationUtterances.push(...platformTrainEnteringAnnouncement());
for (let n = 0; n < PLATFORM_AGENT_MESSAGES.length; n++) {
  stationUtterances.push(...platformAgentMessage(n));
}
for (let c = 0; c < PLATFORM_DELAY_CAUSES.length; c++) {
  stationUtterances.push(...platformDelayAnnouncement(c));
}
// Porte bloquée : les consignes de l'agent, et l'annonce d'attente quand
// toutes les portes ont dû être rouvertes.
for (let n = 0; n < PLATFORM_DOOR_RELEASE.length; n++) {
  stationUtterances.push(...platformDoorReleaseAnnouncement(n));
}
stationUtterances.push(...platformDoorCheckAnnouncement());

// --- Déduplication ------------------------------------------------------

interface Item {
  key: string;
  lang: string;
  text: string;
  tts: string;
  voice: string;
  speed: number;
}

const byKey = new Map<string, Item>();

function add(u: Utterance, setting: VoiceSetting): void {
  const key = clipKey(u.lang, u.text);
  const existing = byKey.get(key);
  if (existing && existing.text !== u.text) {
    throw new Error(`Collision de clé ${key} : « ${existing.text} » / « ${u.text} »`);
  }
  // Même texte, deux voix : la clé ne porte pas la voix, l'un des deux clips
  // écraserait l'autre. Il faut alors différencier les textes.
  if (existing && existing.voice !== setting.voice) {
    throw new Error(`Texte « ${u.text} » réclamé par ${existing.voice} et ${setting.voice}`);
  }
  byKey.set(key, {
    key,
    lang: u.lang,
    text: u.text,
    tts: ttsText(u),
    voice: setting.voice,
    speed: setting.speed,
  });
}

for (const u of utterances) add(u, CABIN_VOICE[u.lang]);
for (const u of stationUtterances) add(u, STATION_VOICE[u.voice]);

/**
 * Tous les textes réellement joués, dédupliqués. Exporté pour que
 * tests/announcementClips.test.ts vérifie que chacun a bien son clip : une
 * annonce sans MP3 retombe sur speechSynthesis, hors du graphe audio et dans
 * une voix qui n'est celle d'aucune des quatre sources du jeu.
 */
export const ITEMS: Item[] = [...byKey.values()];

const out = {
  items: ITEMS,
  // Lectures de référence : le générateur vérifie que open_jtalk lit chaque
  // gare comme sa transcription kana et bascule sur le kana en cas d'écart.
  stations: STATIONS.map((s) => ({ kanji: s.kanji, kana: s.kana })),
};

// Écriture seulement quand le script est LANCÉ : importé par le test, il ne
// doit rien déposer sur le disque.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dest = process.argv[2] ?? 'announcements-texts.json';
  writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`${out.items.length} annonces → ${dest}`);
}
