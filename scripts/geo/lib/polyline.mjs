// Recoudre une ligne de chemin de fer à partir de morceaux, et la mesurer.
//
// OSM ne décrit pas une ligne comme une courbe : il décrit quatre cents
// tronçons de voie, découpés là où change un attribut - un pont, un changement
// de couche, un aiguillage. Une relation d'itinéraire les rassemble mais ne les
// ORDONNE pas de façon exploitable : la relation 5376382 porte les deux voies
// de la boucle mêlées, sans rôle qui les distingue.
//
// Ce qui les distingue est la TOPOLOGIE. Deux tronçons se suivent s'ils
// partagent un nœud d'extrémité ; la boucle intérieure et la boucle extérieure
// ne partagent aucun nœud sauf aux rares points de jonction. On construit donc
// le graphe des extrémités et on suit les chaînes : il en sort deux longues, une
// par voie, plus quelques boucles courtes de voies de garage qu'on écarte à la
// longueur.
//
// LES JONCTIONS DEMANDENT MIEUX QUE LA TOPOLOGIE. À Ikebukuro, la Yamanote
// touche le 山手貨物線 : le nœud partagé y porte trois tronçons, et prendre le
// premier venu envoie la chaîne sur l'embranchement, laissant un trou de
// quatre cent soixante-dix mètres en travers de la gare. Une voie ferrée, elle,
// ne tourne pas à angle droit : à chaque nœud on retient donc la continuation
// qui CHANGE LE MOINS DE CAP, ce qui est exactement la façon dont un aiguillage
// est posé - la voie directe est droite, la déviée s'en écarte.

/** Au-delà, une continuation n'est plus la voie directe mais un embranchement. */
const MAX_TURN = (60 * Math.PI) / 180;

/**
 * Recoud des ways OSM (`out geom`) en chaînes maximales.
 * Renvoie `[{ ways, nodes, points, length, closed }]`, trié du plus long au
 * plus court. `points` est une suite de `[lon, lat]`.
 */
export function stitch(ways) {
  const byId = new Map(ways.map((w) => [w.id, w]));
  const ends = new Map();
  const push = (node, id) => {
    const list = ends.get(node);
    if (list) list.push(id);
    else ends.set(node, [id]);
  };
  for (const w of ways) {
    push(w.nodes[0], w.id);
    push(w.nodes[w.nodes.length - 1], w.id);
  }

  const used = new Set();
  const chains = [];
  for (const start of ways) {
    if (used.has(start.id)) continue;
    used.add(start.id);
    let nodes = [...start.nodes];
    let points = start.geometry.map((g) => [g.lon, g.lat]);
    const chain = [start.id];

    // On étend par les deux bouts tant qu'un tronçon inutilisé s'y raccorde.
    for (const dir of ['tail', 'head']) {
      for (;;) {
        const anchor = dir === 'tail' ? nodes[nodes.length - 1] : nodes[0];
        // Le cap d'arrivée, pris sur les derniers mètres de la chaîne.
        const incoming =
          dir === 'tail'
            ? heading(points[points.length - 2], points[points.length - 1])
            : heading(points[1], points[0]);

        let best = null;
        for (const id of ends.get(anchor) ?? []) {
          if (used.has(id)) continue;
          const w = byId.get(id);
          const wn = w.nodes;
          const wp = w.geometry.map((g) => [g.lon, g.lat]);
          // Orienter le candidat pour qu'il PARTE du nœud d'accroche.
          const flip = wn[wn.length - 1] === anchor;
          if (!flip && wn[0] !== anchor) continue;
          const n = flip ? [...wn].reverse() : wn;
          const p = flip ? [...wp].reverse() : wp;
          if (p.length < 2) continue;
          const turn = Math.abs(angleDiff(heading(p[0], p[1]), incoming));
          if (turn > MAX_TURN) continue;
          if (!best || turn < best.turn) best = { id, n, p, turn };
        }
        if (!best) break;

        if (dir === 'tail') {
          nodes = nodes.concat(best.n.slice(1));
          points = points.concat(best.p.slice(1));
        } else {
          nodes = [...best.n].reverse().slice(0, -1).concat(nodes);
          points = [...best.p].reverse().slice(0, -1).concat(points);
        }
        used.add(best.id);
        chain.push(best.id);
      }
    }
    chains.push({
      ways: chain,
      nodes,
      points,
      length: pathLength(points),
      closed: nodes[0] === nodes[nodes.length - 1],
    });
  }
  chains.sort((a, b) => b.length - a.length);
  return chains;
}

/** Cap approché entre deux `[lon, lat]` voisins (rad). */
function heading(a, b) {
  const k = Math.cos(((a[1] + b[1]) / 2) * D2R);
  return Math.atan2((b[0] - a[0]) * k, b[1] - a[1]);
}

/** Écart de cap ramené dans ]−π, π]. */
function angleDiff(a, b) {
  return ((((a - b + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

const R = 6371008.8;
const D2R = Math.PI / 180;

/** Distance orthodromique (m) entre deux `[lon, lat]`. */
export function haversine(a, b) {
  const p1 = a[1] * D2R;
  const p2 = b[1] * D2R;
  const dp = p2 - p1;
  const dl = (b[0] - a[0]) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Longueur d'une suite de `[lon, lat]` (m). */
export function pathLength(points) {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) total += haversine(points[i], points[i + 1]);
  return total;
}

/**
 * Simplification de Douglas-Peucker sur des points PROJETÉS `{x, z}` (mètres).
 *
 * La voie porte un sommet tous les quarante mètres en moyenne, et beaucoup sont
 * alignés : ce sont les alignements droits, où OSM coupe pour un pont ou un
 * changement de couche. Les retirer ne change pas la géométrie d'un centimètre
 * et divise la table par deux. `keep` protège les sommets qu'on ne veut jamais
 * perdre - les trente gares.
 */
export function simplify(points, tolerance, keep = new Set()) {
  if (points.length < 3) return points.map((_, i) => i);
  const marked = new Uint8Array(points.length);
  marked[0] = 1;
  marked[points.length - 1] = 1;
  for (const i of keep) if (i > 0 && i < points.length - 1) marked[i] = 1;

  // Récursion explicite entre deux sommets déjà retenus.
  const anchors = [];
  for (let i = 0; i < points.length; i++) if (marked[i]) anchors.push(i);
  for (let k = 0; k + 1 < anchors.length; k++) {
    const stack = [[anchors[k], anchors[k + 1]]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      let worst = 0;
      let at = -1;
      for (let i = a + 1; i < b; i++) {
        const d = segmentDistance(points[i], points[a], points[b]);
        if (d > worst) {
          worst = d;
          at = i;
        }
      }
      if (worst > tolerance && at > 0) {
        marked[at] = 1;
        stack.push([a, at], [at, b]);
      }
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (marked[i]) out.push(i);
  return out;
}

function segmentDistance(p, a, b) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.z - a.z);
  let t = ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
}

/**
 * Projette un point sur une polyligne fermée `{x, z}[]`.
 * Renvoie `{ index, t, x, z, distance }` : le segment, la fraction dessus, le
 * point projeté et l'écart latéral (m).
 */
export function snapToPolyline(px, pz, points) {
  let best = { index: 0, t: 0, x: points[0].x, z: points[0].z, distance: Infinity };
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz;
    let t = len2 === 0 ? 0 : ((px - a.x) * vx + (pz - a.z) * vz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a.x + t * vx;
    const qz = a.z + t * vz;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best.distance) best = { index: i, t, x: qx, z: qz, distance: d };
  }
  return best;
}

/** Aire algébrique d'un anneau `{x, z}[]` : son signe donne le sens de parcours. */
export function signedArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}
