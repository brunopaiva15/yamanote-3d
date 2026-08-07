// La page de fréquentation : combien de monde, quand.
//
// Elle n'est liée depuis NULLE PART - ni le menu, ni le pied de page, ni
// `about.html`, ni le plan du site. On y arrive en tapant `/stats.html`, et
// c'est tout ce qui la cache. Il faut donc le dire franchement : ce n'est pas
// une page protégée, c'est une page discrète. Les chiffres qu'elle montre sont
// de toute façon accessibles à qui possède la clé publique - elle est livrée
// dans le code du jeu - et ce sont des nombres de visites, pas un secret. Ce
// que personne ne peut lire, en revanche, ce sont les lignes brutes : la table
// refuse la lecture, seuls les agrégats sortent (voir `supabase/analytics.sql`).
//
// Une seule mesure est affichée, la SESSION - un onglet ouvert -, parce que
// c'est la seule que la mesure sache produire sans rien déposer sur l'appareil
// de personne. Le mot n'est pas remplacé par « visiteurs » quelque part dans la
// page : ce serait plus flatteur et faux, et c'est le genre de mot qu'on
// remplace un jour où l'on trouve le chiffre modeste.
//
// La page ne se compte pas elle-même : le battement part de `src/main.tsx`,
// l'entrée du jeu, et cette page a la sienne. Consulter ses statistiques ne les
// modifie donc pas - sauf le compteur du bandeau, qui passe par le canal de
// présence partagé et dans lequel cet onglet-ci est bien une personne de plus.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type Bucket,
  BUCKET_LABEL,
  BUCKET_TITLE,
  BUCKETS,
  defaultBucket,
  RANGES,
  allowedBuckets,
  slotKey,
  slotSequence,
} from './buckets';
import { Chart, ChartTable } from './Chart';
import type { Point } from './series';
import {
  type BreakdownRow,
  SchemaManquant,
  type Totals,
  fetchBreakdown,
  fetchBuckets,
  fetchTotals,
  statsEnabled,
} from './query';
import { presenceEnabled, subscribeOnlineCount } from '../systems/presence';

const JOUR_MS = 86_400_000;

/** Le départ de la fenêtre « Tout » : bien avant le premier battement possible. */
const AUBE = new Date('2020-01-01T00:00:00Z');

/** Libellés des valeurs enregistrées, pour la répartition. */
const VALEURS: Record<string, string> = {
  desktop: 'Ordinateur',
  mobile: 'Téléphone / tablette',
  fr: 'Français',
  en: 'English',
  ja: '日本語',
  menu: 'Menu seulement',
  full: 'Version 3D',
  audio: 'Version sonore',
  '?': 'Non renseigné',
};

const DIMENSIONS: { id: BreakdownRow['dimension']; titre: string }[] = [
  { id: 'device', titre: 'Appareil' },
  { id: 'lang', titre: 'Langue' },
  { id: 'mode', titre: 'Version' },
];

interface Donnees {
  buckets: { slot: string; sessions: number }[];
  totals: Totals | null;
  breakdown: BreakdownRow[];
}

const VIDE: Donnees = { buckets: [], totals: null, breakdown: [] };

export function StatsPage() {
  const [rangeId, setRangeId] = useState('30j');
  const [bucketChoisi, setBucketChoisi] = useState<Bucket>('day');
  const [donnees, setDonnees] = useState<Donnees>(VIDE);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aInstaller, setAInstaller] = useState(false);
  const [enLigne, setEnLigne] = useState<number | null>(null);

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[2];
  const premier = donnees.totals?.first_at ?? null;

  // L'étendue réelle de la fenêtre, en jours. C'est elle qui décide des
  // granularités possibles ; pour « Tout », elle n'est connue qu'une fois le
  // premier battement revenu du serveur, d'où la valeur d'attente.
  const etendue = useMemo(() => {
    if (range.days !== null) return range.days;
    if (!premier) return 30;
    return Math.max(1, (Date.now() - new Date(premier).getTime()) / JOUR_MS);
  }, [range, premier]);

  const permises = useMemo(() => allowedBuckets(etendue), [etendue]);
  const bucket = permises.includes(bucketChoisi) ? bucketChoisi : defaultBucket(etendue);

  // La borne basse est gardée en MILLISECONDES et figée par `useMemo` : une
  // fenêtre glissante se calcule à partir de `Date.now()`, donc un `new Date()`
  // recalculé à chaque rendu serait un objet neuf à chaque rendu - la requête
  // repartirait en boucle, indéfiniment. Un nombre se compare, un objet non.
  //
  // Pour « Tout », la requête part de l'aube et non du premier battement connu :
  // le serveur doit voir toute l'histoire, y compris ce qui précède le
  // `first_at` qu'on croyait connaître.
  const depuisMs = useMemo(() => {
    if (range.days === null) return AUBE.getTime();
    return Date.now() - range.days * JOUR_MS;
  }, [range]);

  const charger = useCallback(async () => {
    const depuis = new Date(depuisMs);
    setChargement(true);
    setErreur(null);
    try {
      const [buckets, totals, breakdown] = await Promise.all([
        fetchBuckets(bucket, depuis),
        fetchTotals(depuis),
        fetchBreakdown(depuis),
      ]);
      setDonnees({ buckets, totals, breakdown });
      setAInstaller(false);
    } catch (e) {
      if (e instanceof SchemaManquant) setAInstaller(true);
      else setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, [bucket, depuisMs]);

  useEffect(() => {
    if (!statsEnabled) {
      setChargement(false);
      return;
    }
    void charger();
  }, [charger]);

  // Le compteur temps réel du menu, tel quel. Il ne vient pas de la table : il
  // vient du canal de présence, et ne sait rien du passé.
  useEffect(() => {
    if (!presenceEnabled) return;
    return subscribeOnlineCount(setEnLigne);
  }, []);

  // L'axe complet, zéros compris. Le serveur ne renvoie que les créneaux
  // peuplés : sans ce remplissage, une nuit déserte collerait 23 h à 7 h.
  const points: Point[] = useMemo(() => {
    const fin = new Date();
    // L'axe, lui, commence au premier battement RÉELLEMENT reçu : partir de
    // l'aube donnerait cinq ans de barres vides avant la première visite.
    const debut = range.days === null && premier ? new Date(premier) : new Date(depuisMs);
    const comptes = new Map<string, number>();
    for (const r of donnees.buckets) {
      comptes.set(slotKey(bucket, new Date(r.slot)), Number(r.sessions));
    }
    return slotSequence(bucket, debut, fin).map((date) => ({
      date,
      sessions: comptes.get(slotKey(bucket, date)) ?? 0,
    }));
  }, [donnees.buckets, bucket, depuisMs, range, premier]);

  function choisirFenetre(id: string) {
    const r = RANGES.find((x) => x.id === id);
    if (!r) return;
    setRangeId(id);
    const jours = r.days ?? (premier ? Math.max(1, (Date.now() - new Date(premier).getTime()) / JOUR_MS) : 30);
    setBucketChoisi(defaultBucket(jours));
  }

  const totals = donnees.totals;

  return (
    <div className="page">
      <main className="board">
        <h1>Fréquentation</h1>
        {premier && (
          <p className="tagline">
            Mesuré depuis le{' '}
            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(premier))}.
          </p>
        )}

        {/* Le bandeau de l'ekimeiban, comme sur le menu. Il porte ce que porte
            un panneau de gare : où l'on est, et ce qui se passe maintenant. */}
        <div className="band">
          <span>山手線 3D</span>
          {presenceEnabled && (
            <span className="band-online" title="Cet onglet compris">
              <span className="band-dot" aria-hidden="true" />
              {enLigne ?? 0} en ligne
            </span>
          )}
        </div>

        {!statsEnabled && (
          <p className="alerte">
            Aucune clé Supabase dans ce build (<code>VITE_SUPABASE_URL</code> et{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>). Il n’y a rien à mesurer ni à lire : voir{' '}
            <code>.env.example</code>.
          </p>
        )}

        {aInstaller && (
          <p className="alerte">
            Les clés sont là, mais la base n’a pas encore de table de fréquentation. Coller{' '}
            <code>supabase/analytics.sql</code> dans le SQL Editor du projet Supabase, une fois,
            puis recharger cette page.
          </p>
        )}

        {erreur && <p className="alerte">Lecture impossible : {erreur}</p>}

        {/* Les commandes, au-dessus de tout ce qu'elles règlent : les tuiles,
            l'histogramme, le tableau et la répartition changent ensemble. Deux
            rangées d'étiquette et de pastilles, comme les réglages du menu. */}
        <div className="filtres">
          <fieldset className="filtre">
            <legend>Période</legend>
            <div className="pastilles">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`pastille${r.id === rangeId ? ' on' : ''}`}
                  aria-pressed={r.id === rangeId}
                  onClick={() => choisirFenetre(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="filtre">
            <legend>Granularité</legend>
            <div className="pastilles">
              {BUCKETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`pastille${b === bucket ? ' on' : ''}`}
                  aria-pressed={b === bucket}
                  disabled={!permises.includes(b)}
                  title={permises.includes(b) ? undefined : 'Sans objet sur cette période'}
                  onClick={() => setBucketChoisi(b)}
                >
                  {BUCKET_LABEL[b]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="tuiles">
          <Tuile
            titre="Sessions"
            valeur={totals?.sessions}
            note={`sur ${range.label.toLowerCase()}, un onglet ouvert = une session`}
          />
          <Tuile
            titre="Durée moyenne"
            valeur={totals?.avg_minutes}
            unite="min"
            note="à cinq minutes près"
          />
          <Tuile
            titre="Battements"
            valeur={totals?.pings}
            note="une ligne toutes les cinq minutes"
          />
        </div>

        <section className="bloc">
          <h2>Sessions par {BUCKET_TITLE[bucket]}</h2>
          <Chart points={points} bucket={bucket} stale={chargement} />
          <ChartTable points={points} bucket={bucket} />
        </section>

        <section className="bloc">
          <h2>Répartition</h2>
          <div className="repartitions">
            {DIMENSIONS.map((d) => (
              <Repartition
                key={d.id}
                titre={d.titre}
                lignes={donnees.breakdown.filter((b) => b.dimension === d.id)}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Tuile({
  titre,
  valeur,
  unite,
  note,
}: {
  titre: string;
  valeur: number | undefined;
  unite?: string;
  note: string;
}) {
  return (
    <div className="tuile">
      <h3>{titre}</h3>
      <p className="valeur">
        {valeur === undefined || valeur === null ? '-' : formatNombre(valeur)}
        {unite && valeur !== undefined && valeur !== null ? <span className="unite"> {unite}</span> : null}
      </p>
      <p className="note">{note}</p>
    </div>
  );
}

function Repartition({ titre, lignes }: { titre: string; lignes: BreakdownRow[] }) {
  const triees = [...lignes].sort((a, b) => Number(b.sessions) - Number(a.sessions));
  const total = triees.reduce((n, l) => n + Number(l.sessions), 0);
  return (
    <div className="repartition-carte">
      <h3>{titre}</h3>
      {triees.length === 0 ? (
        <p className="vide">-</p>
      ) : (
        <div className="table-scroll">
        <table className="repartition">
          <thead>
            <tr>
              {/* Le titre de la carte est juste au-dessus : le répéter en
                  intitulé de colonne le dirait deux fois à l'œil. Il reste en
                  texte pour les lecteurs d'écran, qui n'ont pas ce « au-dessus ». */}
              <th scope="col">
                <span className="sr">{titre}</span>
              </th>
              <th scope="col">Sessions</th>
              <th scope="col">Part</th>
            </tr>
          </thead>
          <tbody>
            {triees.map((l) => (
              <tr key={l.value}>
                <th scope="row">{VALEURS[l.value] ?? l.value}</th>
                <td>{formatNombre(Number(l.sessions))}</td>
                <td>{total > 0 ? `${Math.round((Number(l.sessions) / total) * 100)} %` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

/** Espace fine insécable entre les milliers, comme partout ailleurs en français. */
function formatNombre(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}
