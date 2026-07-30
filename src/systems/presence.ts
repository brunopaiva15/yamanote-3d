// Compteur « voyageurs en ligne » : le nombre de navigateurs actuellement
// ouverts sur le site, partagé en temps réel entre eux.
//
// Pourquoi un service externe ? Le site est purement statique (GitHub Pages ne
// sert que des fichiers en lecture seule). Un fichier ne peut pas savoir qui est
// connecté : il faut un point central où chaque onglet s'annonce en arrivant et
// que tout le monde lit en même temps. On passe donc par le canal Realtime de
// Supabase, contacté directement depuis le navigateur avec la clé publique
// (anon) - aucun backend à écrire de notre côté.
//
// Sans configuration (clés absentes), le module reste totalement inerte : aucun
// import réseau, et le menu n'affiche simplement pas le compteur. Le jeu tourne
// exactement comme avant.

import type { RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Le compteur n'existe que si les deux valeurs publiques sont fournies. */
export const presenceEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Identité de cet onglet dans le canal. Un identifiant par onglet : deux onglets
// du même visiteur comptent pour deux, comme deux voyageurs distincts.
function tabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

let count = 0;
const listeners = new Set<(n: number) => void>();
let channel: RealtimeChannel | null = null;
let starting = false;

function emit(): void {
  for (const listener of listeners) listener(count);
}

// Ouvre le canal une seule fois, à la demande. L'import de la bibliothèque est
// dynamique : quand la présence est désactivée, supabase-js n'est jamais chargé
// (ni téléchargé), et il part dans son propre morceau de bundle sinon.
async function start(): Promise<void> {
  if (starting || channel || !presenceEnabled) return;
  starting = true;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false },
      // Un rafraîchissement par seconde suffit largement pour un compteur.
      realtime: { params: { eventsPerSecond: 1 } },
    });
    const ch = client.channel('online-travelers', { config: { presence: { key: tabId() } } });
    channel = ch;
    ch.on('presence', { event: 'sync' }, () => {
      // Une entrée par identité présente : le nombre de clés = voyageurs en ligne.
      count = Object.keys(ch.presenceState()).length;
      emit();
    }).subscribe((status) => {
      // Une fois abonné, on s'annonce dans le canal. La déconnexion (onglet
      // fermé, réseau coupé) retire l'entrée d'elle-même côté Supabase.
      if (status === 'SUBSCRIBED') {
        void ch.track({ online_at: new Date().toISOString() });
      }
    });
  } catch {
    // Service indisponible ou réseau coupé : on reste silencieux, le badge
    // disparaît simplement au lieu de casser l'interface.
    channel = null;
  } finally {
    starting = false;
  }
}

/**
 * S'abonne au décompte des voyageurs en ligne. Le callback est appelé
 * immédiatement avec la dernière valeur connue, puis à chaque changement.
 * Renvoie une fonction de désabonnement. Sans configuration, no-op à 0.
 */
export function subscribeOnlineCount(callback: (n: number) => void): () => void {
  listeners.add(callback);
  callback(count);
  if (presenceEnabled) void start();
  return () => {
    listeners.delete(callback);
  };
}
