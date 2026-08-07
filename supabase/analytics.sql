-- Fréquentation : la seule chose de ce dépôt qui se garde en base.
--
-- À COLLER UNE FOIS dans le SQL Editor du projet Supabase, puis à oublier. Le
-- script est idempotent : le relancer ne détruit aucune donnée.
--
-- --- Pourquoi une table, alors que tout le reste s'en passe -------------------
--
-- Le compteur « voyageurs en ligne » (src/systems/presence) n'a jamais eu besoin
-- de table : le canal Realtime Presence dit qui est là MAINTENANT, et cette
-- réponse s'évapore avec la question. L'historique, lui, ne peut pas s'évaporer -
-- « combien de monde mardi dernier à 21 h » est une question sur un passé que
-- personne n'a gardé. Il faut donc écrire quelque part, et c'est tout ce que ce
-- fichier ajoute au projet : une table, en écriture seule pour le public.
--
-- --- Ce qui est enregistré, et ce qui ne l'est pas ---------------------------
--
-- Une ligne toutes les cinq minutes par onglet ouvert, avec :
--
--   at        l'instant, posé par le SERVEUR (le navigateur ne le choisit pas)
--   session   un identifiant tiré au hasard, mort à la fermeture de l'onglet
--   visitor   un identifiant tiré au hasard, gardé dans le localStorage
--   device    'desktop' ou 'mobile'
--   lang      'fr', 'en' ou 'ja'
--   mode      'menu', 'full' ou 'audio'
--
-- Et rien d'autre. Pas d'adresse IP - PostgREST n'en transmet aucune à la table -,
-- pas d'en-tête de navigateur, pas de page d'origine, pas de cookie. Les deux
-- identifiants sont des UUID aléatoires qui ne désignent personne : ils servent
-- à ne pas compter dix fois le même onglet, et c'est leur seul emploi.
--
-- --- Qui peut faire quoi ----------------------------------------------------
--
-- La clé « anon » est publique par nature (elle est livrée au navigateur), donc
-- tout le monde l'a. Les droits sont taillés en conséquence :
--
--   · INSERT autorisé, avec un `at` obligatoirement proche de l'heure du
--     serveur : on ne peut pas antidater ni postdater une visite.
--   · SELECT, UPDATE, DELETE refusés. Personne - pas même la page de stats -
--     ne lit les lignes brutes ni n'en efface une.
--   · les trois fonctions d'agrégat ci-dessous sont `security definer` : elles
--     seules traversent la RLS, et elles ne rendent que des COMPTES. La page de
--     stats n'a donc accès qu'à des totaux, jamais aux identifiants.
--
-- Ce que ça n'empêche pas, et autant l'écrire : quelqu'un qui récupère la clé
-- publique peut gonfler le compteur en insérant des lignes à la main, ou lire
-- les agrégats. Le premier abus se voit (une bosse absurde dans l'histogramme),
-- le second ne coûte rien - ce sont des nombres de visiteurs, pas un secret.
-- Une vraie barrière demanderait une Edge Function et une clé de service ; pour
-- savoir si le site est visité par dix personnes ou par mille, c'est
-- disproportionné.

-- ---------------------------------------------------------------------------
-- La table
-- ---------------------------------------------------------------------------

create table if not exists public.visit_pings (
  id bigint generated always as identity primary key,
  -- Posé par défaut à l'heure du serveur. La politique d'insertion plus bas
  -- refuse toute valeur qui s'en écarte de plus de cinq minutes : le navigateur
  -- peut donc l'envoyer, mais pas mentir avec.
  at timestamptz not null default now(),
  session uuid not null,
  visitor uuid not null,
  device text,
  lang text,
  mode text,
  constraint visit_pings_device_ok check (device in ('desktop', 'mobile')),
  constraint visit_pings_lang_ok check (lang in ('fr', 'en', 'ja')),
  constraint visit_pings_mode_ok check (mode in ('menu', 'full', 'audio'))
);

-- Toutes les requêtes de la page filtrent sur une fenêtre de temps puis
-- regroupent : c'est le seul index utile, et il l'est pour les trois fonctions.
create index if not exists visit_pings_at_idx on public.visit_pings (at desc);

alter table public.visit_pings enable row level security;

-- Table neuve ou table héritée d'un `grant all` par défaut : on repart de zéro
-- et on ne rend que l'insertion.
revoke all on table public.visit_pings from anon, authenticated;
grant insert on table public.visit_pings to anon, authenticated;

drop policy if exists visit_pings_insert on public.visit_pings;
create policy visit_pings_insert
  on public.visit_pings
  for insert
  to anon, authenticated
  with check (
    at > now() - interval '5 minutes'
    and at < now() + interval '5 minutes'
  );

-- ---------------------------------------------------------------------------
-- Les agrégats, seule chose que le public peut lire
-- ---------------------------------------------------------------------------

-- Le découpage temporel, dans le fuseau de celui qui regarde.
--
-- `tz` n'est pas une coquetterie : « combien de monde le 6 août » n'a de sens
-- que dans un fuseau, et un histogramme par heure calé sur UTC décale toute la
-- courbe des journées de sept heures pour un lecteur japonais. La page envoie
-- le fuseau du navigateur ; le regroupement se fait donc sur des minuits et des
-- heures locales, changements d'heure compris - c'est Postgres qui les connaît,
-- pas nous.
create or replace function public.visit_buckets(
  bucket text,
  since timestamptz,
  tz text default 'UTC'
)
returns table (slot timestamptz, visitors bigint, sessions bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- `bucket` finit dans `date_trunc` : la liste blanche n'est pas un confort de
  -- lecture mais la garde qui empêche d'y glisser autre chose.
  if bucket not in ('hour', 'day', 'week', 'month') then
    raise exception 'granularité inconnue : %', bucket;
  end if;
  if since is null then
    since := now() - interval '30 days';
  end if;

  return query
    select
      (date_trunc(bucket, p.at at time zone tz) at time zone tz) as slot,
      count(distinct p.visitor) as visitors,
      count(distinct p.session) as sessions
    from public.visit_pings p
    where p.at >= since
    group by 1
    order by 1;
end;
$$;

-- Les totaux de la fenêtre. Ils ne se déduisent PAS de la somme des créneaux :
-- quelqu'un qui revient trois jours de suite compte pour trois créneaux et pour
-- un seul visiteur. C'est précisément la question posée - « combien de
-- personnes » -, elle mérite donc sa requête.
create or replace function public.visit_totals(
  since timestamptz
)
returns table (
  visitors bigint,
  sessions bigint,
  pings bigint,
  avg_minutes numeric,
  first_at timestamptz,
  last_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if since is null then
    since := now() - interval '30 days';
  end if;

  return query
    with fenetre as (
      select * from public.visit_pings p where p.at >= since
    ),
    -- Durée d'une session : de son premier battement à son dernier. Un onglet
    -- ouvert puis fermé en moins de cinq minutes n'a qu'un battement et compte
    -- pour zéro minute - c'est faux d'au plus cinq minutes, et toujours dans le
    -- sens de la prudence.
    durees as (
      select session, extract(epoch from (max(at) - min(at))) / 60 as minutes
      from fenetre
      group by session
    )
    select
      (select count(distinct f.visitor) from fenetre f),
      (select count(distinct f.session) from fenetre f),
      (select count(*) from fenetre f),
      (select round(coalesce(avg(d.minutes), 0)::numeric, 1) from durees d),
      -- Le premier battement JAMAIS reçu, hors fenêtre : c'est lui qui dit
      -- depuis quand on mesure, et la page s'en sert pour la vue « tout ».
      (select min(p.at) from public.visit_pings p),
      (select max(f.at) from fenetre f);
end;
$$;

-- La répartition par appareil, langue et version, en une seule aller-retour.
create or replace function public.visit_breakdown(
  since timestamptz
)
returns table (dimension text, value text, visitors bigint, sessions bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if since is null then
    since := now() - interval '30 days';
  end if;

  return query
    with fenetre as (
      select * from public.visit_pings p where p.at >= since
    )
    select 'device'::text, coalesce(f.device, '?'), count(distinct f.visitor), count(distinct f.session)
      from fenetre f group by 2
    union all
    select 'lang'::text, coalesce(f.lang, '?'), count(distinct f.visitor), count(distinct f.session)
      from fenetre f group by 2
    union all
    select 'mode'::text, coalesce(f.mode, '?'), count(distinct f.visitor), count(distinct f.session)
      from fenetre f group by 2;
end;
$$;

-- `security definer` traverse la RLS : les droits d'exécution sont donc la
-- seule serrure qui reste, et on la pose explicitement au lieu d'hériter du
-- `grant execute to public` que Postgres donne d'office à toute fonction neuve.
revoke all on function public.visit_buckets(text, timestamptz, text) from public;
revoke all on function public.visit_totals(timestamptz) from public;
revoke all on function public.visit_breakdown(timestamptz) from public;
grant execute on function public.visit_buckets(text, timestamptz, text) to anon, authenticated;
grant execute on function public.visit_totals(timestamptz) to anon, authenticated;
grant execute on function public.visit_breakdown(timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le ménage
-- ---------------------------------------------------------------------------
--
-- Ordre de grandeur : un onglet ouvert une heure laisse douze lignes d'une
-- centaine d'octets. Mille visites d'une heure par jour, c'est quatre cent
-- mégaoctets en un an - soit, à peu de chose près, le demi-gigaoctet du plan
-- gratuit. Tant que le site reçoit cent visites par jour, la question ne se
-- pose pas ; le jour où elle se posera, il vaut mieux que la réponse soit déjà
-- écrite ici que découverte un dimanche, base pleine.
--
--   select public.visit_prune(400);   -- garde les 400 derniers jours
--
-- Automatisable si l'extension pg_cron est activée sur le projet :
--
--   select cron.schedule('purge-visites', '0 4 * * 0',
--                        $$select public.visit_prune(400)$$);
create or replace function public.visit_prune(keep_days integer default 400)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  supprimees bigint;
begin
  delete from public.visit_pings where at < now() - make_interval(days => keep_days);
  get diagnostics supprimees = row_count;
  return supprimees;
end;
$$;

-- Le ménage ne s'expose PAS au public : `anon` n'a aucune raison de pouvoir
-- effacer l'historique, et une fonction `security definer` ouverte à tous serait
-- exactement le trou que la RLS ci-dessus cherche à boucher. Elle s'appelle
-- depuis le SQL Editor, ou depuis pg_cron, qui tournent tous deux en postgres.
revoke all on function public.visit_prune(integer) from public, anon, authenticated;
