// Le battement de fréquentation : « combien de personnes ouvrent ce site ».
//
// Le compteur du menu (systems/presence) répond déjà à « combien MAINTENANT ».
// Il n'a jamais rien gardé, et c'est bien : le canal Realtime dit qui est là, et
// cette réponse s'évapore avec la question. Celui-ci répond à « combien mardi
// dernier à 21 h », ce qui suppose d'avoir écrit quelque chose ce mardi-là. Une
// ligne dans une table Supabase, toutes les cinq minutes, par onglet ouvert -
// voir `supabase/analytics.sql`, qui décrit la table et ses droits.
//
// --- Ce que ce module envoie -------------------------------------------------
//
// Deux identifiants tirés au hasard (l'onglet, le visiteur), l'appareil
// (« desktop » / « mobile »), la langue de l'interface, et la version en cours
// (« menu », « full », « audio »). L'INSTANT n'est pas envoyé : il est posé par
// le serveur, et la politique d'insertion refuse de toute façon tout ce qui
// s'écarte de son heure. Pas d'adresse, pas d'en-tête, pas de référent, pas de
// cookie.
//
// --- Ce qui l'arrête -------------------------------------------------------
//
//   · pas de clés Supabase : le module est inerte, comme le compteur ;
//   · onglet caché : le battement s'interrompt, et reprend au retour. On mesure
//     du temps REGARDÉ, pas des onglets oubliés une nuit entière ;
//   · serveur de développement : rien n'est envoyé, sans quoi chaque `npm run
//     dev` gonflerait les chiffres du site en ligne. `?analytics=force` lève la
//     garde, le temps de vérifier que la table répond ;
//   · trois échecs d'affilée, ou une table absente : on arrête définitivement.
//     Un site de contemplation n'a pas à marteler un service en panne.

import { isDev, netClient, netEnabled } from './net/config';
import { coarsePointer } from './browser';
import { useStore } from '../store';

/** La mesure existe-t-elle ? Mêmes deux variables que tout le reste du réseau. */
export const analyticsEnabled = netEnabled;

/** La table, nommée une seule fois. */
const TABLE = 'visit_pings';

/**
 * Un battement toutes les cinq minutes.
 *
 * C'est le pas de mesure ET la précision des durées de session : une visite est
 * mesurée du premier battement au dernier, donc à cinq minutes près, toujours
 * par défaut. Plus court gonflerait la table pour rien - personne ne lit un
 * histogramme de fréquentation à la minute ; plus long raterait les visites
 * courtes, qui sont justement les plus nombreuses.
 */
const PING_MS = 5 * 60 * 1000;

/** Au-delà, on considère que le service ne répondra pas davantage à la suivante. */
const MAX_ECHECS = 3;

/** Clé du localStorage, dans la famille des autres (`yamanote.mode`, `yamanote.lang`). */
const VISITOR_KEY = 'yamanote.visitor';

type Mode = 'menu' | 'full' | 'audio';

interface Ping {
  session: string;
  visitor: string;
  device: 'desktop' | 'mobile';
  lang: string;
  mode: Mode;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Repli pour les contextes non sécurisés (http:// en réseau local), où
  // `crypto.randomUUID` n'existe pas. La colonne est de type uuid : la forme
  // compte, l'entropie beaucoup moins - on ne protège rien avec.
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

/**
 * Le signal « ne me suivez pas » du navigateur.
 *
 * `globalPrivacyControl` est celui qui a une valeur juridique dans plusieurs
 * États, et Brave le pose par défaut ; `doNotTrack` est l'ancien, encore émis
 * par Firefox. On lit les deux.
 */
function refuseLeSuivi(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  if (nav.globalPrivacyControl === true) return true;
  return nav.doNotTrack === '1' || nav.msDoNotTrack === '1';
}

/**
 * L'identité du visiteur, et la nuance qui compte.
 *
 * Par défaut : un UUID gardé dans le localStorage, qui permet de distinguer
 * « trente personnes » de « une personne trente fois ». Il ne désigne personne -
 * il n'est relié à aucune donnée, ici ni ailleurs -, mais il SURVIT à la visite,
 * et c'est très exactement ce qu'un signal « ne me suivez pas » demande de ne
 * pas faire.
 *
 * Quand ce signal est là, on ne renonce donc pas à la mesure : on renonce au
 * SOUVENIR. L'identifiant devient celui de l'onglet, jeté avec lui, et la visite
 * est comptée sans être reliée à la précédente. Conséquence à connaître en
 * lisant la page de statistiques : ces visiteurs-là comptent pour un nouveau à
 * chaque passage, donc le nombre de « visiteurs uniques » est légèrement
 * surestimé - jamais l'inverse.
 *
 * Un localStorage indisponible (navigation privée verrouillée, iframe cloisonnée)
 * retombe sur le même comportement, pour la même raison : rien à écrire, rien à
 * relire.
 */
function visitorId(session: string): string {
  if (refuseLeSuivi()) return session;
  try {
    const garde = localStorage.getItem(VISITOR_KEY);
    if (garde) return garde;
    const neuf = uuid();
    localStorage.setItem(VISITOR_KEY, neuf);
    return neuf;
  } catch {
    return session;
  }
}

/** La version en cours, dans les termes de la table. */
function currentMode(): Mode {
  const { started, mode } = useStore.getState();
  return started ? mode : 'menu';
}

/**
 * La garde du serveur de développement, et sa porte de sortie.
 *
 * Sans elle, chaque `npm run dev` écrirait dans la même table que le site en
 * ligne : les chiffres du dimanche après-midi seraient ceux de l'auteur en train
 * de déplacer un bouton. `?analytics=force` la lève, pour vérifier une fois que
 * la table répond bien.
 */
function autorisePing(): boolean {
  if (!isDev()) return true;
  try {
    return new URL(location.href).searchParams.get('analytics') === 'force';
  } catch {
    return false;
  }
}

let demarre = false;
let arrete = false;
let echecs = 0;
let timer: number | null = null;
let dernier = 0;
let identite: { session: string; visitor: string } | null = null;

/** Une insertion, et ce qu'on décide de faire de son échec. */
async function ping(): Promise<void> {
  if (arrete || !identite) return;
  dernier = Date.now();
  const ligne: Ping = {
    session: identite.session,
    visitor: identite.visitor,
    device: coarsePointer() ? 'mobile' : 'desktop',
    lang: useStore.getState().lang,
    mode: currentMode(),
  };
  try {
    const client = await netClient();
    if (!client) {
      arrete = true;
      return;
    }
    // Pas de `.select()` : la table refuse la lecture à `anon`, et supabase-js
    // demande alors `return=minimal`. Réclamer la ligne insérée ferait échouer
    // une insertion pourtant réussie.
    const { error } = await client.from(TABLE).insert(ligne);
    if (!error) {
      echecs = 0;
      return;
    }
    // Table absente : le SQL de `supabase/analytics.sql` n'a pas été passé. Ce
    // n'est pas une panne passagère, inutile de réessayer toute la soirée.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      arrete = true;
      return;
    }
    if (++echecs >= MAX_ECHECS) arrete = true;
  } catch {
    if (++echecs >= MAX_ECHECS) arrete = true;
  }
}

function planifie(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => {
    if (arrete) {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      return;
    }
    if (document.visibilityState === 'visible') void ping();
  }, PING_MS);
}

/**
 * Démarre la mesure. Appelée une fois, depuis `src/main.tsx`.
 *
 * Volontairement appelée à l'ouverture de la PAGE et non au démarrage du jeu :
 * la question est « combien de personnes viennent », et quelqu'un qui lit le
 * menu puis s'en va est venu. Le champ `mode` distingue ensuite ceux qui sont
 * montés à bord de ceux qui ont regardé la porte.
 */
export function startVisitAnalytics(): void {
  if (demarre || !analyticsEnabled) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!autorisePing()) return;
  demarre = true;

  const session = uuid();
  identite = { session, visitor: visitorId(session) };

  void ping();
  planifie();

  // Un onglet caché ne bat plus : `setInterval` est de toute façon ralenti à une
  // fois par minute au mieux par les navigateurs, et une rame laissée tourner
  // toute la nuit dans un onglet oublié n'est pas de la fréquentation. Au
  // retour, on rattrape le battement manqué s'il est dû, et on recale la
  // minuterie pour ne pas en déclencher un second dans la foulée.
  document.addEventListener('visibilitychange', () => {
    if (arrete || document.visibilityState !== 'visible') return;
    if (Date.now() - dernier >= PING_MS) {
      void ping();
      planifie();
    }
  });
}
