// Ce que vaut une donnée géographique, et d'où elle vient.
//
// La bible géographique le demande à la règle 10 : chaque objet enregistre sa
// source, sa licence, la date du jeu de données, ses coordonnées, son niveau de
// détail, ses distances d'affichage et sa date de dernière vérification. Ce
// module est l'endroit unique où ces champs sont NOMMÉS, pour que les quatre
// scripts d'import n'en inventent pas quatre variantes.
//
// La règle 9 sépare par ailleurs trois familles, et cette séparation est
// structurelle plutôt que décorative : elle dit ce qu'on a le droit de mettre en
// cache, ce qu'il faut redater, et ce qui se recalcule à chaque image.
//
//   · DATA_STATIC     - terrain, voies, rues, bâtiments, ponts, cours d'eau ;
//   · DATA_SEMISTATIC - arbres, enseignes, commerces, publicités, chantiers ;
//   · DATA_DYNAMIC    - trains, voitures, piétons, météo, lumières, grues.
//
// Seule la première famille sort de ces scripts. Les deux autres vivent dans le
// jeu, et c'est src/data/geo/provenance.ts qui porte leur type.

/** Les trois familles de la règle 9. */
export const DATA_LAYERS = ['DATA_STATIC', 'DATA_SEMISTATIC', 'DATA_DYNAMIC'];

/**
 * Les sources qu'on sait citer, avec leur licence et la mention exigée.
 *
 * Une source absente de cette table ne peut pas entrer dans le dépôt : c'est
 * volontaire, et c'est la seule barrière automatique contre une donnée dont on
 * ne saurait plus dire d'où elle vient.
 */
export const SOURCES = {
  osm: {
    name: 'OpenStreetMap',
    license: 'ODbL 1.0',
    attribution: '© les contributeurs OpenStreetMap',
    url: 'https://www.openstreetmap.org/copyright',
  },
  gsi: {
    name: '国土地理院 数値標高モデル (GSI, modèle numérique de terrain)',
    license: '国土地理院コンテンツ利用規約 (réutilisation libre avec mention de la source)',
    attribution: '出典：国土地理院ウェブサイト',
    url: 'https://maps.gsi.go.jp/development/ichiran.html',
  },
  repo: {
    name: 'Produit par ce dépôt',
    license: 'CC0 1.0',
    attribution: null,
    url: null,
  },
};

/**
 * Bloc de provenance normalisé, à coller dans les propriétés d'un GeoJSON ou
 * l'en-tête d'un manifeste.
 *
 * `datasetDate` est la date du JEU DE DONNÉES - la version de l'objet OSM, la
 * livraison du MNT -, jamais celle du build : c'est elle que la règle 10
 * réclame, et elle seule permet de dire si le décor a vieilli.
 */
export function provenance({
  source,
  datasetDate,
  layer = 'DATA_STATIC',
  measured = true,
  note = null,
  extra = null,
}) {
  const s = SOURCES[source];
  if (!s) {
    throw new Error(
      `Source inconnue : ${source}. Ajoutez-la à SOURCES dans scripts/geo/lib/source.mjs ` +
        `avec sa licence et sa mention - une donnée sans provenance n'entre pas dans le dépôt.`,
    );
  }
  if (!DATA_LAYERS.includes(layer)) {
    throw new Error(`Famille inconnue : ${layer}. Attendu ${DATA_LAYERS.join(', ')}.`);
  }
  if (!datasetDate) {
    throw new Error(`Date du jeu de données manquante pour ${source} (règle 10).`);
  }
  return {
    layer,
    source: s.name,
    sourceId: source,
    license: s.license,
    attribution: s.attribution,
    sourceUrl: s.url,
    datasetDate,
    verifiedAt: today(),
    /** false = valeur estimée, jamais présentée comme relevée (règle 11). */
    measured,
    ...(note ? { note } : {}),
    ...(extra ?? {}),
  };
}

/** La date du jour, en ISO court. Sert de `verifiedAt` par défaut. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}
