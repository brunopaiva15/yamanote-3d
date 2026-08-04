// L'oracle des tirages : le seul endroit du cycle station où le hasard entre.
//
// --- Pourquoi pas une graine commune ----------------------------------------
//
// Le réflexe, pour que deux joueurs vivent le même arrêt, serait de leur donner
// la même graine pseudo-aléatoire : tout le monde tire dans la même suite et
// personne n'a rien à s'envoyer. C'est plus élégant, et c'est FAUX ici.
//
// Une graine commune n'aligne les tirages que si tous les clients appellent le
// générateur dans le MÊME ORDRE. Or ils divergent déjà : `rollPassThrough`
// (systems/passingTrain) ne tire pas du tout au-delà d'un certain palier de
// qualité vidéo. Un joueur en qualité basse décalerait toute la suite pour lui
// seul, silencieusement, et l'on chercherait longtemps pourquoi sa rame s'arrête
// vingt centimètres plus loin que celle des autres.
//
// Donc : l'hôte tire, et PUBLIE ce qu'il a tiré. Les suiveurs ne tirent jamais,
// ils lisent. Chaque tirage a un nom, et c'est ce nom qui l'identifie sur le
// fil - jamais son rang d'appel, pour qu'une image sautée n'aligne pas les
// valeurs sur les mauvais sites.
//
// --- Pourquoi ça tient ------------------------------------------------------
//
// Tous les tirages d'un arrêt ont lieu à l'entrée en freinage
// (`once('door-timings')`, systems/stationCycle), alors que leur premier
// consommateur est le carillon d'ouverture, une vingtaine de secondes plus tard.
// Cette marge est ce qui permet de se passer d'accusé de réception : un paquet
// perdu a tout le temps d'être redemandé avant que son absence ne s'entende.
//
// --- L'idiome n'est pas neuf ------------------------------------------------
//
// `rollPassengerAssistance(random = Math.random)` (systems/passengerAssistance)
// et `seededDisruptionRandom(seed)` (data/platformDisruptions) injectent déjà un
// générateur. On généralise une pratique de la maison, on n'en importe pas une.

import { rng } from '../../data/rng';

/**
 * Qui tire, et qui lit.
 *
 * `solo` est le mode par défaut et le seul qui existe tant qu'aucun salon n'est
 * rejoint : le jeu tire son hasard comme il l'a toujours fait, et rien de ce
 * fichier ne coûte plus qu'un appel de fonction.
 */
export type NetRole = 'solo' | 'host' | 'follower';

/**
 * Ce qu'un arrêt tire au sort, sous une forme transmissible.
 *
 * Quatre valeurs, et une graine. La graine porte à elle seule les trente-huit
 * retards de vantaux : au-delà de trois tirages liés, on transmet la graine et
 * non les valeurs - sans quoi le paquet enflerait pour rien et l'ordre d'appel
 * redeviendrait significatif, ce qu'on cherche précisément à éviter.
 *
 * Les quatre autres voyagent en clair MALGRÉ la graine, et c'est une ceinture
 * doublée d'une bretelle assumée : leur dérivation traverse quatre modules
 * jusqu'au manifeste des mélodies, et c'est la fenêtre sonore qui décide de la
 * durée de l'arrêt. Un écart silencieux là-dessus décalerait tout le reste de
 * la chronologie, portes comprises.
 */
export interface StopDraws {
  /** Écart d'arrêt, en mètres signés. */
  berthOffset: number;
  /** La rame se range-t-elle sur la voie secondaire ? */
  alternativePlatform: boolean;
  /** Décalage de l'instant de la mélodie, dans [-1, 1]. */
  melodyJitter: number;
  /** Graine des retards de vantaux (rame et portes palières). */
  doorSeed: number;
  /** Un rapide traversera-t-il pendant cet arrêt ? */
  passThrough: boolean;
}

let role: NetRole = 'solo';

/**
 * Les tirages de l'arrêt en cours.
 *
 * Chez l'hôte et en solo, ils se remplissent à mesure qu'on tire. Chez un
 * suiveur, ils arrivent d'un coup par `applyStopDraws`.
 */
let current: Partial<StopDraws> = {};

/**
 * L'ARRÊT auquel `current` se rapporte : le numéro du dwell à venir.
 *
 * C'est la pièce qui manquait, et son absence rendait le multijoueur
 * inutilisable. `beginStopDraws()` remettait la table à zéro sans se demander
 * pour quel arrêt : un suiveur qui avait reçu le paquet de l'hôte À L'AVANCE -
 * ce que tout le protocole s'emploie justement à obtenir - l'effaçait de ses
 * propres mains en entrant dans la phase où il allait s'en servir. Il tombait
 * alors sur les replis neutres, levait le drapeau de dérive, et se faisait
 * resynchroniser DUREMENT à chaque gare : parole coupée, foule resemée, rapide
 * annulé. « Je vois le train arriver en gare, pas mon pote. »
 *
 * Avec un numéro, la question a une réponse : on n'oublie que les tirages d'un
 * AUTRE arrêt.
 */
let currentSeq = -1;

/**
 * Un suiveur a-t-il dû se passer d'une valeur qu'il aurait dû recevoir ?
 *
 * Ce n'est pas une erreur à afficher : c'est un signal pour `worldSync`, qui
 * demandera une resynchronisation dure au prochain battement. Un paquet perdu
 * ne doit pas laisser un suiveur inventer sa propre chronologie en silence.
 */
let desync = false;

export function netRole(): NetRole {
  return role;
}

export function setNetRole(next: NetRole): void {
  // RIEN si le rôle ne change pas, et c'est tout sauf une optimisation.
  //
  // Le canal réélit l'hôte toutes les secondes (systems/net/room, ELECTION_TICK_MS)
  // et repose le rôle à chaque passage, même quand il n'a pas bougé. Vider la
  // table à cette occasion, c'était la vider une fois par seconde : l'hôte
  // n'avait plus rien à publier une seconde sur deux, et le suiveur perdait le
  // paquet qu'il venait de recevoir. Une remise à plat doit être un ÉVÉNEMENT,
  // pas un battement.
  if (next === role) return;
  role = next;
  // Changer de rôle, en revanche, remet bien les compteurs à plat : un ancien
  // hôte qui devient suiveur n'a plus rien à publier, et ses propres tirages ne
  // valent plus rien.
  current = {};
  currentSeq = -1;
  desync = false;
}

/** Les tirages de l'arrêt courant, pour que l'hôte les publie. */
export function currentStopDraws(): Partial<StopDraws> {
  return current;
}

/** L'arrêt auquel les tirages courants se rapportent. `-1` s'il n'y en a pas. */
export function currentStopSeq(): number {
  return currentSeq;
}

/**
 * Les tirages reçus de l'hôte, chez un suiveur.
 *
 * `seq` est le numéro d'arrêt porté par le paquet : c'est lui qui empêchera
 * `beginStopDraws` de l'effacer avant qu'on ait eu l'occasion de s'en servir.
 */
export function applyStopDraws(draws: StopDraws, seq: number): void {
  current = { ...draws };
  currentSeq = seq;
  desync = false;
}

/** Un suiveur a-t-il manqué une valeur depuis la dernière remise à zéro ? */
export function decisionsDesynced(): boolean {
  return desync;
}

export function clearDecisionDesync(): void {
  desync = false;
}

/**
 * Un nouvel arrêt commence : on oublie les tirages du précédent.
 *
 * Chez l'hôte, c'est ce qui garantit qu'on republie bien des valeurs fraîches ;
 * chez un suiveur, c'est ce qui fait apparaître le manque si le paquet du
 * nouvel arrêt n'arrive pas.
 *
 * `seq` NOMME l'arrêt qui commence - le numéro du dwell à venir. Appelée deux
 * fois pour le même arrêt, cette fonction ne fait rien la seconde fois : c'est
 * ce qui permet à un suiveur de recevoir le paquet vingt secondes à l'avance et
 * de le garder jusqu'à ce qu'il en ait besoin.
 */
export function beginStopDraws(seq: number): void {
  if (currentSeq === seq) return;
  currentSeq = seq;
  current = {};
}

export function resetDecisions(): void {
  role = 'solo';
  current = {};
  currentSeq = -1;
  desync = false;
}

/**
 * La valeur d'un tirage d'arrêt.
 *
 * Chez l'hôte et en solo, on tire et on retient. Chez un suiveur, on lit ce
 * qu'on a reçu - et s'il manque, on rend le repli en signalant la dérive. Le
 * repli n'est jamais « une autre valeur au hasard » : ce serait exactement le
 * moyen de fabriquer deux mondes sans que rien ne le dise. C'est une valeur
 * NEUTRE, choisie pour que l'arrêt reste jouable en attendant la resynchro.
 *
 * UN NOM, UNE VALEUR, UN ARRÊT : relire un tirage déjà fait ne le refait pas.
 * C'est ce qui permet de tirer TOUT l'arrêt d'avance - assez tôt pour que le
 * paquet ait le temps de traverser - et de laisser malgré tout chaque valeur
 * être demandée à son heure habituelle, là où le cycle en a besoin. En solo,
 * c'est aussi une garantie de bon sens : `dwellDuration()` est relue à chaque
 * image, et un tirage qui changerait d'avis en cours d'arrêt ferait s'ouvrir
 * les portes deux fois.
 */
function draw<K extends keyof StopDraws>(key: K, roll: () => StopDraws[K], neutral: StopDraws[K]): StopDraws[K] {
  const known = current[key];
  if (known !== undefined) return known as StopDraws[K];
  if (role === 'follower') {
    desync = true;
    return neutral;
  }
  const value = roll();
  current[key] = value;
  return value;
}

// --- Les tirages de l'arrêt ------------------------------------------------

/**
 * Écart d'arrêt (m signés). Le repli est zéro : une rame pile sur son repère.
 * Ce n'est pas réaliste - aucune ne l'est - mais c'est la seule valeur qui ne
 * puisse décaler ni les portes palières ni la géométrie du quai.
 */
export function drawBerthOffset(min: number, max: number): number {
  return draw(
    'berthOffset',
    () => {
      const mag = min + Math.random() * (max - min);
      return Math.random() < 0.5 ? -mag : mag;
    },
    0,
  );
}

/**
 * Le même écart d'arrêt, mais tiré POUR SOI et sans passer par le fil.
 *
 * Sert à la rame qu'on regarde arriver depuis un quai après avoir laissé partir
 * la sienne (`systems/platformWait`) : elle n'appartient à aucun salon, et rien
 * ne la concernant n'a jamais été publié. Sans cette porte de sortie, un
 * suiveur en attente sur un quai réclamerait à chaque rame une valeur que
 * personne ne lui a envoyée, et déclencherait une resynchronisation dure toutes
 * les deux minutes.
 */
export function localBerthOffset(min: number, max: number): number {
  const mag = min + Math.random() * (max - min);
  return Math.random() < 0.5 ? -mag : mag;
}

/** Voie secondaire. Le repli est « non » : la voie principale existe partout. */
export function drawAlternativePlatform(chance: number): boolean {
  return draw('alternativePlatform', () => Math.random() < chance, false);
}

/** Décalage de la mélodie, dans [-1, 1]. Le repli est zéro : l'instant nominal. */
export function drawMelodyJitter(): number {
  return draw('melodyJitter', () => Math.random() * 2 - 1, 0);
}

/**
 * Graine des retards de vantaux. Le repli est une constante : toutes les portes
 * partiront avec les mêmes retards à chaque arrêt, ce qui se remarque à peine
 * et ne casse rien.
 */
export function drawDoorSeed(): number {
  return draw('doorSeed', () => (Math.random() * 0xffffffff) >>> 0, 0x9e3779b9);
}

/** Un rapide traverse-t-il ? Le repli est « non » : un train en moins ne gêne personne. */
export function drawPassThrough(chance: number): boolean {
  return draw('passThrough', () => Math.random() < chance, false);
}

/**
 * Le même tirage, mais POUR SOI et sans passer par le fil.
 *
 * Même porte de sortie que `localBerthOffset`, et pour le même cas : le creux
 * qu'on regarde s'écouler depuis un quai après avoir laissé partir sa rame
 * (`systems/platformWait`) n'appartient à aucun salon. Y réclamer le tirage de
 * l'arrêt en cours reviendrait à le consommer pour un autre train que celui
 * qu'il décrit - et, chez un suiveur, à réclamer une valeur que personne n'a
 * publiée pour cette voie-là.
 */
export function localPassThrough(chance: number): boolean {
  return Math.random() < chance;
}

/**
 * Un générateur semé par la graine de l'arrêt.
 *
 * C'est lui qu'on passe à `randomizeDoorTimings` : une seule graine, trente-huit
 * nombres, et les deux côtés du fil obtiennent la même suite parce qu'ils la
 * déroulent au même endroit, d'un seul tenant.
 */
export function doorRandom(): () => number {
  return rng(drawDoorSeed());
}

// --- Les incidents ---------------------------------------------------------
//
// Ceux-là ne sont PAS des tirages d'arrêt : ils arrivent quand ils arrivent, une
// fois toutes les quelques gares. Un suiveur ne les planifie donc pas du tout -
// il ne les subit que sur ordre de l'hôte, par un événement dédié.
//
// D'où le « jamais » ci-dessous : plutôt qu'ajouter une condition dans
// `updateCycle` à chaque endroit où un incident peut se déclencher, on rend au
// suiveur une échéance qui n'arrive pas. La machine à états reste identique
// dans les deux rôles, ce qui est très exactement ce qu'on veut d'un monde
// qu'on prétend partagé.

/** Un nombre de gares assez grand pour qu'aucune boucle ne l'atteigne. */
const JAMAIS_GARES = 1_000_000;
/** Un instant de phase que la phase n'atteindra jamais. */
const JAMAIS_INSTANT = Number.POSITIVE_INFINITY;

/** Gares à parcourir avant le prochain incident. Un suiveur n'en planifie aucun. */
export function drawIncidentGap(min: number, max: number): number {
  if (role === 'follower') return JAMAIS_GARES;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Instant de déclenchement dans la phase. Un suiveur attend l'ordre de l'hôte. */
export function drawIncidentAt(min: number, span: number): number {
  if (role === 'follower') return JAMAIS_INSTANT;
  return min + Math.random() * span;
}

/**
 * Durée d'immobilisation et motif d'un incident.
 *
 * Chez un suiveur, ces valeurs viennent de l'événement reçu et sont posées
 * directement dans le runtime : ces fonctions ne servent qu'à l'hôte et au solo.
 * On les nomme quand même ici pour que TOUS les tirages du cycle soient au même
 * endroit - un seul `Math.random()` resté dans `stationCycle` suffirait à faire
 * douter du reste.
 */
export function drawHold(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function drawReason(count: number): number {
  return Math.floor(Math.random() * count);
}

// --- Ce qui reste franchement local ----------------------------------------
//
// Le bruit de roulement, le crissement de boudin en courbe, le tic de la
// batterie de secours : ils ne sont ni vus ni partagés, et les transmettre
// coûterait un aller-retour réseau pour un grésillement. Ils gardent
// `Math.random()` dans `stationCycle`, et ce paragraphe est là pour qu'on sache
// que c'est un choix et non un oubli - c'est la première chose qu'on se
// demandera en relisant la liste des tirages restants.
