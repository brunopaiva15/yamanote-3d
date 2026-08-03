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
import { netClient, netEnabled } from './net/config';

/**
 * Le compteur n'existe que si les deux valeurs publiques sont fournies.
 *
 * Le drapeau vit désormais dans `systems/net/config`, avec le client lui-même,
 * parce que le salon multijoueur s'active sur exactement les mêmes deux
 * variables : deux constantes qui lisent le même `import.meta.env` auraient fini
 * par diverger sur un détail - une chaîne vide acceptée d'un côté et pas de
 * l'autre - et le compteur se serait affiché dans un jeu sans réseau, ou
 * l'inverse. L'alias reste pour les appelants historiques.
 */
export const presenceEnabled = netEnabled;

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

// Ouvre le canal une seule fois, à la demande. Le client vient de
// `systems/net/config`, qui le partage avec le salon multijoueur : une seule
// WebSocket vers le projet, quel que soit le nombre de canaux ouverts dessus.
// L'import de la bibliothèque y reste dynamique - sans configuration,
// supabase-js n'est jamais chargé, ni même téléchargé.
async function start(): Promise<void> {
  if (starting || channel || !presenceEnabled) return;
  starting = true;
  try {
    const client = await netClient();
    if (!client) throw new Error('Client indisponible');
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
