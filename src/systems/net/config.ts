// Le lien vers Supabase : une seule socket, ouverte à la demande, jamais deux.
//
// Ce module est né d'un refactor. `systems/presence` créait son propre client
// pour son compteur de visiteurs ; le salon en aurait créé un second. Or
// `createClient` ouvre une WebSocket, et deux sockets vers le même projet pour
// deux canaux, c'est du gâchis doublé d'une source d'ennuis - deux
// reconnexions à surveiller, deux limiteurs de débit indépendants, deux
// occasions de se croire connecté quand on ne l'est qu'à moitié.
//
// --- Le contrat d'activation, inchangé --------------------------------------
//
// Les mêmes deux variables qu'avant, et pas une de plus : le déploiement
// (.github/workflows/deploy.yml) n'a rien à changer. Sans elles, `netEnabled`
// est faux, `@supabase/supabase-js` n'est JAMAIS importé - donc jamais
// téléchargé - et le jeu est exactement celui d'hier : pas de compteur, pas de
// salon, aucune trace à l'écran de fonctionnalités qui n'existent pas.
//
// C'est le contrat que `systems/presence` tenait déjà, mot pour mot. On ne l'a
// pas assoupli pour l'occasion : le multijoueur est une option, pas une
// dépendance.

import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Le réseau est-il configuré ?
 *
 * Faux par défaut, et c'est le cas de tout le monde tant que le dépôt n'a pas
 * reçu ses deux variables. Tout ce qui touche au multijoueur consulte ce
 * drapeau AVANT d'exister à l'écran.
 */
export const netEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Événements par seconde autorisés en SORTIE par supabase-js.
 *
 * Le compteur de visiteurs se contentait de 1 : il ne publiait qu'une présence
 * et lisait des synchronisations. Un salon émet des poses (huit par seconde au
 * plus, avec bande morte), un battement d'hôte (deux) et des messages de tchat.
 * Seize laisse la marge nécessaire sans ouvrir la porte à un onglet emballé.
 *
 * À ne pas confondre avec le vrai garde-fou, qui est le quota MENSUEL de
 * Supabase : deux millions de messages. C'est lui qui a dicté la bande morte
 * sur les poses (systems/net/poseBuffer), pas ce réglage-ci.
 */
const EVENTS_PER_SECOND = 16;

let client: SupabaseClient | null = null;
let opening: Promise<SupabaseClient | null> | null = null;

/**
 * Le client, ouvert à la première demande et partagé ensuite.
 *
 * L'import est dynamique : c'est lui qui garantit qu'un visiteur sans
 * configuration ne télécharge jamais la bibliothèque. Rend `null` si le réseau
 * n'est pas configuré ou si l'import échoue - jamais une exception. Un service
 * tiers indisponible ne doit pas empêcher de monter dans un train.
 */
export async function netClient(): Promise<SupabaseClient | null> {
  if (!netEnabled) return null;
  if (client) return client;
  // Deux appels concurrents (le menu ouvre le compteur pendant qu'on rejoint un
  // salon) doivent partager la MÊME ouverture, sans quoi on créerait les deux
  // sockets qu'on cherche précisément à éviter.
  if (opening) return opening;
  opening = (async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: EVENTS_PER_SECOND } },
      });
      return client;
    } catch {
      // Réseau coupé, service indisponible, morceau de bundle introuvable :
      // on reste silencieux. Le compteur disparaît, le salon refuse poliment,
      // et le jeu tourne.
      return null;
    } finally {
      opening = null;
    }
  })();
  return opening;
}
