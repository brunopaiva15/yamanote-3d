// L'histogramme, et le tableau qui dit la même chose.
//
// Une seule série - les sessions -, donc une seule couleur : le vert de la
// ligne, celui du logo et du menu. Pas de légende (il n'y a rien à
// distinguer), pas de dégradé qui redirait la hauteur des barres en plus clair
// et en plus foncé, pas de valeur écrite sur chaque barre. Le nombre exact se
// lit dans l'infobulle, au clavier comme à la souris, et dans le tableau
// dépliable en dessous - qui existe pour que rien ne soit accessible par la
// seule couleur, ni par le seul survol.

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  type Bucket,
  gridTicks,
  labelStep,
  longLabel,
  niceMax,
  shortLabel,
} from './buckets';
import { SERIE_LABEL, type Point } from './series';

interface Props {
  points: Point[];
  bucket: Bucket;
  /** Vrai pendant un rechargement : on garde le dessin précédent, en retrait. */
  stale?: boolean;
}

/**
 * Largeur qu'il faut réserver à une étiquette d'axe.
 *
 * « 08/07 » à 0,68 rem tient en une trentaine de pixels ; cinquante-deux
 * laissent le blanc qui empêche deux étiquettes voisines de se toucher. C'est
 * ce nombre, et la largeur réelle du tracé, qui décident combien on en affiche -
 * un pas calculé sur le seul NOMBRE de créneaux donnait dix étiquettes collées
 * les unes aux autres sur un téléphone.
 */
const LARGEUR_ETIQUETTE = 52;

export function Chart({ points, bucket, stale = false }: Props) {
  const [actif, setActif] = useState<number | null>(null);
  const [largeur, setLargeur] = useState(0);
  const barres = useRef<(HTMLButtonElement | null)[]>([]);
  const cadre = useRef<HTMLDivElement | null>(null);

  // Un changement de fenêtre ou de granularité rebat tout l'axe : l'infobulle
  // resterait accrochée à un créneau qui n'existe plus.
  useEffect(() => setActif(null), [bucket, points.length]);

  // La largeur ne se déduit d'aucune donnée : elle dépend de l'écran, de la
  // rotation du téléphone et de la barre de défilement. On la mesure.
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    setLargeur(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observateur = new ResizeObserver(([entree]) => setLargeur(entree.contentRect.width));
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  if (points.length === 0) {
    return <p className="vide">Aucun battement sur cette période.</p>;
  }

  const valeurs = points.map((p) => p.sessions);
  const max = Math.max(...valeurs);
  const haut = niceMax(max);
  const repères = gridTicks(max);
  const pas = labelStep(points.length, Math.max(2, Math.floor(largeur / LARGEUR_ETIQUETTE)));

  function bouge(depuis: number, delta: number) {
    const cible = Math.min(points.length - 1, Math.max(0, depuis + delta));
    setActif(cible);
    barres.current[cible]?.focus();
  }

  function touche(e: KeyboardEvent, i: number) {
    const sauts: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    if (e.key in sauts) {
      e.preventDefault();
      bouge(i, sauts[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      bouge(0, 0);
    } else if (e.key === 'End') {
      e.preventDefault();
      bouge(points.length - 1, 0);
    }
  }

  // L'infobulle est posée en pourcentage de la largeur du tracé, et retenue à
  // huit pour cent des bords : au premier et au dernier créneau, elle sortirait
  // du cadre - et c'est justement là qu'on regarde le plus souvent.
  const pointeur = actif === null ? 0 : ((actif + 0.5) / points.length) * 100;
  const gauche = Math.min(92, Math.max(8, pointeur));
  const focalisé = actif === null ? 0 : actif;

  return (
    <div className={`chart${stale ? ' chart-stale' : ''}`} ref={cadre}>
      <div className="plot">
        <div className="grid" aria-hidden="true">
          {repères.map((v) => (
            <div key={v} className="grid-line" style={{ bottom: `${(v / haut) * 100}%` }}>
              <span>{v}</span>
            </div>
          ))}
        </div>

        <div
          className="bars"
          role="group"
          aria-label={`${SERIE_LABEL} par créneau`}
          onMouseLeave={() => setActif(null)}
        >
          {points.map((p, i) => {
            const v = p.sessions;
            return (
              <button
                key={p.date.getTime()}
                type="button"
                className={`col${i === actif ? ' col-actif' : ''}`}
                // Un seul arrêt de tabulation pour tout l'histogramme : trois
                // cents barres tabulables enfermeraient le clavier dedans. Les
                // flèches parcourent la série une fois qu'on y est entré.
                tabIndex={i === focalisé ? 0 : -1}
                ref={(el) => {
                  barres.current[i] = el;
                }}
                aria-label={`${longLabel(bucket, p.date)} : ${v} ${SERIE_LABEL}`}
                onMouseEnter={() => setActif(i)}
                onFocus={() => setActif(i)}
                onKeyDown={(e) => touche(e, i)}
              >
                {/* La barre est ancrée à la ligne de base et arrondie à son
                    extrémité haute, celle qui porte la valeur. Une hauteur
                    minimale d'un pixel pour qu'un créneau à un visiteur ne
                    disparaisse pas dans l'axe. */}
                <span
                  className="bar"
                  style={{ height: v === 0 ? 0 : `max(1px, ${(v / haut) * 100}%)` }}
                />
              </button>
            );
          })}
        </div>

        {actif !== null && (
          <div className="tip" style={{ left: `${gauche}%` }} role="status">
            <strong>{longLabel(bucket, points[actif].date)}</strong>
            <span>
              {points[actif].sessions} {SERIE_LABEL}
            </span>
          </div>
        )}
      </div>

      <div className="axis" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.date.getTime()} className="axis-label">
            {i % pas === 0 ? shortLabel(bucket, p.date) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Le jumeau lisible du graphique : les mêmes nombres, sans couleur ni survol. */
export function ChartTable({ points, bucket }: { points: Point[]; bucket: Bucket }) {
  const remplis = points.filter((p) => p.sessions > 0);
  return (
    <details className="table-view">
      <summary>Voir les chiffres ({remplis.length} créneaux non vides)</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Créneau</th>
              <th scope="col">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {remplis.map((p) => (
              <tr key={p.date.getTime()}>
                <th scope="row">{longLabel(bucket, p.date)}</th>
                <td>{p.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
