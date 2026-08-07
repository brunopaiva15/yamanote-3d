// La lecture des chiffres : trois appels de fonction, aucune table.
//
// Une seule mesure en sort, la SESSION - un onglet ouvert. Il n'y a pas de
// « visiteurs uniques » à lire parce qu'il n'y en a pas d'écrits : reconnaître
// quelqu'un d'une visite à l'autre demanderait de laisser une trace sur son
// appareil, et `systems/analytics` n'en laisse aucune. Quelqu'un qui revient
// trois jours de suite compte donc pour trois.
//
// La page de statistiques ne fait PAS de `select` : la table `visit_pings`
// refuse la lecture à la clé publique (voir `supabase/analytics.sql`). Elle
// appelle trois fonctions `security definer` qui, elles, ne rendent que des
// comptes. La conséquence pratique : ni cette page ni personne d'autre muni de
// la clé publique ne peut lire un identifiant de visiteur, et l'agrégation - la
// seule partie coûteuse - se fait en base plutôt qu'en téléchargeant des
// dizaines de milliers de lignes dans un onglet.
//
// Ce module est volontairement séparé de `systems/analytics` : celui-là ÉCRIT
// et connaît le store, la langue, l'appareil ; celui-ci LIT et ne connaît que
// le client réseau. Les réunir ferait entrer tout le jeu dans le morceau de la
// page de statistiques - et le compteur du menu dans celui de la page.

import { netClient, netEnabled } from '../systems/net/config';

/** Sans clés, la page n'a rien à interroger et le dit. */
export const statsEnabled = netEnabled;

export interface BucketRow {
  /** Instant de début du créneau, en ISO 8601 avec fuseau. */
  slot: string;
  sessions: number;
}

export interface Totals {
  sessions: number;
  pings: number;
  /** Durée moyenne d'une session, en minutes, à cinq minutes près. */
  avg_minutes: number;
  /** Premier battement jamais reçu, tous temps confondus. */
  first_at: string | null;
  last_at: string | null;
}

export interface BreakdownRow {
  dimension: 'device' | 'lang' | 'mode';
  value: string;
  sessions: number;
}

/**
 * La table n'est pas là.
 *
 * Distinguée d'une panne parce que la réponse n'est pas la même : une panne se
 * réessaie, une table absente s'installe - et la page peut alors dire quoi
 * faire, plutôt qu'afficher « erreur ».
 */
export class SchemaManquant extends Error {}

/** Le fuseau du navigateur, celui dans lequel les journées seront découpées. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function client() {
  const c = await netClient();
  if (!c) throw new Error('Client Supabase indisponible.');
  return c;
}

/** Codes PostgREST / PostgreSQL qui signifient « rien de tout ça n'existe ». */
function estSchemaManquant(code: string | undefined): boolean {
  return code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01';
}

async function rpc<T>(nom: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await (await client()).rpc(nom, args);
  if (error) {
    if (estSchemaManquant(error.code)) throw new SchemaManquant(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}

export function fetchBuckets(
  bucket: string,
  since: Date,
  tz = browserTimeZone(),
): Promise<BucketRow[]> {
  return rpc<BucketRow>('visit_buckets', { bucket, since: since.toISOString(), tz });
}

export async function fetchTotals(since: Date): Promise<Totals | null> {
  const lignes = await rpc<Totals>('visit_totals', { since: since.toISOString() });
  const t = lignes[0];
  if (!t) return null;
  // `count(*)` est un bigint et la durée moyenne un numeric : PostgREST rend
  // l'un et l'autre en JSON, mais rien ne garantit que ce soit toujours un
  // nombre plutôt qu'une chaîne. On normalise ici, une fois, plutôt que dans
  // chaque tuile - un « 12 » textuel se formate très bien et s'additionne très
  // mal.
  return {
    sessions: Number(t.sessions),
    pings: Number(t.pings),
    avg_minutes: Number(t.avg_minutes),
    first_at: t.first_at,
    last_at: t.last_at,
  };
}

export function fetchBreakdown(since: Date): Promise<BreakdownRow[]> {
  return rpc<BreakdownRow>('visit_breakdown', { since: since.toISOString() });
}
