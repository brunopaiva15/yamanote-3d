// UNE GARE NE DOIT DIRE QU'UNE SEULE CHOSE.
//
// Une potence de quai annonce 東口 ; on descend, on traverse le hall, et la
// bouche du fond porte 中央口. C'est le défaut le plus coûteux d'une gare : pas
// une laideur, un MENSONGE — le panneau qu'on a suivi ne menait pas là.
//
// Il ne venait d'aucune négligence de dessin, mais d'une négligence de SOURCE.
// Cinq endroits nommaient la même gare, chacun en allant chercher sa donnée
// tout seul :
//
//   · la potence du quai lisait `stationExits(index)` — les deux premières
//     sorties du relevé, sans savoir si le hall en perce deux ;
//   · le panneau du fond de trémie relisait la même fonction, encore ;
//   · le bandeau de contrôle lisait `SPECS` (`data/stationInterior`) ;
//   · la bouche du hall repassait par un `slot` qui la faisait rechercher
//     dans le relevé une troisième fois ;
//   · le fléchage suspendu ne lisait rien du tout : quatre panneaux à des
//     cotes écrites en dur.
//
// Tant qu'une gare était un couloir droit avec deux bouches, les cinq
// tombaient d'accord par accident. Le réseau (phase 7) supprime l'accident :
// une gare peut avoir cinq bouches, trois lignes de portillons, deux volumes.
//
// CE FICHIER EST LA SOURCE UNIQUE. Il lit le réseau — donc la gare telle
// qu'elle est CONSTRUITE, et non telle qu'un tableau la décrit — et rend les
// chaînes que les textures affichent. Le rendu ne va plus chercher un nom :
// on le lui donne.
//
// Deux règles tiennent tout :
//
//   1. ON NE NOMME QUE CE QU'ON PEUT ATTEINDRE. Une sortie du relevé que le
//      hall ne perce pas n'apparaît sur aucun panneau. C'est la seule façon
//      qu'une flèche ne mente pas.
//   2. LE NOM VIENT DE LA BOUCHE. Le réseau porte le nom quand le relevé le
//      donne ; sinon on retombe sur le rang de la sortie dans `data/lines`,
//      qui est ce que faisait le hall générique. Les trente gares
//      d'aujourd'hui passent par le repli, et leurs panneaux ne bougent pas
//      d'un pixel — c'est le test qui le dit, pas moi.

import { stationExitPlan, type StationExit } from './lines';
import { STATIONS, TRANSFERS } from './stations';
import type {
  ConcourseNetwork,
  ConcourseRoom,
  ConcourseShell,
} from './stationConcourseBuild';
import type { GuideKind } from '../textures/concourse';

/** Un nom de sortie, tel qu'il s'affiche. */
export interface SignedExit {
  jp: string;
  en: string;
  /** Nom d'usage, absent du plan lu (`data/lines`) : la différence reste visible. */
  unsourced?: true;
}

/**
 * Un contrôle, tel que son bandeau l'annonce.
 *
 * `notes` porte ce qui CHANGE LE COMPORTEMENT du voyageur, et rien d'autre :
 * un contrôle réservé aux cartes sans contact refuse un billet papier, un
 * contrôle de sortie seule ne se franchit pas dans l'autre sens, un contrôle à
 * horaires est fermé la nuit. Ces trois-là sont écrits sur les vraies façades
 * de JR East, en gros, et pour cette raison exactement.
 */
export interface SignedGate {
  id: string;
  jp: string;
  en: string;
  notes: readonly string[];
}

/** Un panneau suspendu : ce qu'il annonce, où, et dans quel sens il se lit. */
export interface GuidePost {
  /** L'axe le long duquel on CIRCULE dans ce volume. */
  along: 'x' | 'z';
  /** Position sur cet axe. */
  at: number;
  kind: GuideKind;
  /**
   * Le panneau se lit-il en avançant dans le sens de l'axe ?
   *
   * Un panneau ne s'imprime que d'un côté : celui d'où l'on VIENT. Celui qui
   * dit « のりば » s'adresse à qui arrive de la rue, donc à contre-sens.
   */
  forward: boolean;
}

/** Tout ce qu'une gare affiche, à un seul endroit. */
export interface StationSignage {
  /** Les sorties RÉELLEMENT percées, dans l'ordre du réseau, sans doublon. */
  exits: readonly SignedExit[];
  /** Ce qui tient sur une potence de quai : deux caissons, pas trois. */
  gantry: readonly SignedExit[];
  /** Le nom de chaque bouche, par identifiant. */
  mouths: ReadonlyMap<string, SignedExit>;
  /** Les contrôles, dans l'ordre du réseau. */
  gates: readonly SignedGate[];
  /** Les lignes en correspondance, pour le tableau blanc du quai. */
  lines: readonly string[];
}

/** Faute de tout : une sortie existe toujours, même sans nom relevé. */
const FALLBACK: SignedExit = { jp: '出口', en: 'Exit' };

/**
 * Le nom d'une bouche.
 *
 * Le réseau le porte dès qu'un relevé est branché. Sinon — c'est le cas des
 * trente gares aujourd'hui — on le prend au rang que la bouche occupe dans le
 * relevé des sorties, ce que faisait déjà le hall générique.
 */
function nameOf(
  index: number,
  m: { nameJp: string; nameEn: string; slot: number },
): SignedExit {
  if (m.nameJp) return { jp: m.nameJp, en: m.nameEn };
  const plan = stationExitPlan(index);
  if (plan.length === 0) return FALLBACK;
  const e: StationExit = plan[((m.slot % plan.length) + plan.length) % plan.length];
  return e.unsourced ? { jp: e.jp, en: e.en, unsourced: true } : { jp: e.jp, en: e.en };
}

/** Ce qu'un contrôle ajoute à son nom, quand il change ce qu'on peut y faire. */
function notesOf(g: { icOnly?: true; exitOnly?: true; hours?: string }): string[] {
  const out: string[] = [];
  if (g.icOnly) out.push('ICカード専用');
  if (g.exitOnly) out.push('出口専用');
  if (g.hours) out.push(g.hours);
  return out;
}

/**
 * La signalétique d'une gare, tirée de son réseau.
 *
 * Pure : mêmes entrées, même sortie. Le rendu l'appelle une fois par gare et
 * distribue les chaînes ; rien d'autre n'a le droit d'aller chercher un nom.
 */
export function signageFor(net: ConcourseNetwork, index: number): StationSignage {
  const mouths = new Map<string, SignedExit>();
  const exits: SignedExit[] = [];
  const seen = new Set<string>();
  for (const m of net.mouths) {
    const e = nameOf(index, m);
    mouths.set(m.id, e);
    // Deux bouches peuvent porter le même nom — un 中央口 nord et un 中央口 sud
    // n'en font qu'un sur une potence. On ne l'annonce qu'une fois.
    if (!seen.has(e.jp)) {
      seen.add(e.jp);
      exits.push(e);
    }
  }
  if (exits.length === 0) exits.push(FALLBACK);

  const gates: SignedGate[] = net.gates.map((g) => ({
    id: g.id,
    jp: g.nameJp,
    en: g.nameEn,
    notes: notesOf(g),
  }));

  // Les lignes en correspondance. Le réseau les porte dès qu'un relevé est
  // branché ; sinon on retombe sur le tableau des annonces, qui est ce que la
  // potence lisait toute seule.
  let lines = [...new Set(net.transfers.flatMap((t) => t.lines))];
  if (lines.length === 0) {
    const tr = TRANSFERS[STATIONS[((index % 30) + 30) % 30].jy];
    lines = tr
      ? tr.jp.split('、').map((s) => s.trim()).filter(Boolean)
      : [];
  }
  // Pas de repli ici : une gare SANS correspondance notable — 鶯谷, 目白 — doit
  // pouvoir le dire. Le panneau blanc du quai y met le rappel de la Yamanote,
  // le totem y met la direction ; c'est au panneau d'en décider, pas à la
  // source.

  return {
    exits,
    gantry: exits.slice(0, 2),
    mouths,
    gates,
    lines: lines.slice(0, 4),
  };
}

/** Le nom d'une bouche, ou le repli — jamais `undefined` dans le rendu. */
export function mouthExit(sign: StationSignage, id: string): SignedExit {
  return sign.mouths.get(id) ?? sign.exits[0] ?? FALLBACK;
}

// --- Le fléchage suspendu ------------------------------------------------
//
// Quatre panneaux, et leur POSITION est le message : celui qui accueille en bas
// des marches dit la sortie, celui du milieu dit les installations, celui qui
// suit le contrôle dit les quais — à l'envers, pour qui arrive de la rue — et
// le dernier redit la sortie au moment où l'on voit les bouches. Un panneau de
// plus serait du bruit ; c'est déjà ce qu'on reproche aux gares réelles.
//
// C'était écrit en dur dans le rendu, sur `paid.rect.z` et `free.rect.z`. Un
// hall dont la circulation va selon x — un pont-concourse, un hall transversal —
// recevait donc quatre panneaux en travers de sa marche.

/** Retrait du panneau d'accueil, depuis l'entrée de la pièce (m). */
const LEAD = { paid: 2.6, free: 2.2 };
/** Retrait du second panneau, depuis la sortie de la pièce (m). */
const TAIL = { paid: 4.2, free: 4.5 };
/** En deçà, les deux panneaux se toucheraient : on n'en garde qu'un. */
const TWO_MIN = LEAD.paid + TAIL.paid + 1;

/** Ce que chaque zone annonce, dans l'ordre où on la traverse. */
const KINDS: Record<'paid' | 'free', [GuideKind, GuideKind]> = {
  // On sort : la sortie d'abord, les installations avant le contrôle.
  paid: ['exit', 'facility'],
  // On est passé : les quais pour qui entre, la sortie pour qui s'en va.
  free: ['platform', 'exit'],
};

/** L'axe le long duquel on circule dans ce volume : celui qu'on franchit. */
function travelAxis(shell: ConcourseShell): 'x' | 'z' {
  const g = shell.gates[0];
  if (g) return g.cross;
  const r = shell.rect;
  return r.z1 - r.z0 >= r.x1 - r.x0 ? 'z' : 'x';
}

function span(room: ConcourseRoom, along: 'x' | 'z'): [number, number] {
  return along === 'z' ? [room.rect.z0, room.rect.z1] : [room.rect.x0, room.rect.x1];
}

/**
 * Les panneaux suspendus d'un volume.
 *
 * Une pièce en porte deux quand elle est assez longue, un seul sinon, aucun
 * quand elle est trop courte pour qu'on s'y perde. Le hall générique donne
 * exactement les quatre panneaux d'avant, aux mêmes cotes — un test le tient
 * sur les trente gares.
 */
export function guidePosts(shell: ConcourseShell): readonly GuidePost[] {
  const along = travelAxis(shell);
  const out: GuidePost[] = [];
  for (const room of shell.rooms) {
    if (room.fare !== 'paid' && room.fare !== 'free') continue;
    const [a0, a1] = span(room, along);
    const len = a1 - a0;
    // Une pièce de moins de quatre mètres se traverse d'un regard.
    if (len < 4) continue;
    const [first, second] = KINDS[room.fare];
    // Le panneau qui dit les quais s'adresse à qui ARRIVE : il se lit à
    // contre-sens, et c'est la seule exception.
    const back = first === 'platform';
    if (len < TWO_MIN) {
      out.push({ along, at: (a0 + a1) / 2, kind: first, forward: !back });
      continue;
    }
    out.push({ along, at: a0 + LEAD[room.fare], kind: first, forward: !back });
    out.push({ along, at: a1 - TAIL[room.fare], kind: second, forward: true });
  }
  return out;
}
