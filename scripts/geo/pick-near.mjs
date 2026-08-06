// Quels repères réels le jeu cite, parmi ceux qui ont été relevés.
//
//   node scripts/geo/pick-near.mjs [--par-famille 2]
//
// Réécrit :
//   · data/geo/near-landmarks.geojson  drapeaux `picked` et `rank`
//   · src/data/nearLandmarks.ts        la table du jeu
//
// CE SCRIPT NE VA RIEN CHERCHER DEHORS. Le relevé - mille deux cent quarante-
// cinq objets à moins de deux kilomètres de la voie - est déjà versionné par
// `fetch-near.mjs`. Ce qui vit ici est la SÉLECTION, et elle se rejoue hors
// ligne autant de fois qu'on veut. Séparer les deux n'est pas de la coquetterie :
// la sélection est le seul endroit où l'on décide, et une décision doit pouvoir
// se refaire sans redemander la donnée à un service public.
//
// LE PLAFOND, ET POURQUOI IL A CHANGÉ. Il valait UN par gare et par famille, et
// c'était trop peu de deux façons.
//
// D'abord parce que le critère - une fiche Wikidata, puis la proximité de la
// gare - n'arbitre pas ce qu'on croit. À Tokyo, l'objet le plus proche d'une
// gare qui porte une fiche Wikidata est presque toujours un petit sanctuaire de
// quartier. Le relevé de Sugamo retenait ainsi le 真性寺 et écartait le 高岩寺 ;
// celui d'Ueno gardait le 上野の森美術館 et laissait dehors le 国立西洋美術館.
// Ce ne sont pas de mauvais choix : ce sont des choix qu'une distance ne peut
// pas faire.
//
// On pourrait vouloir départager par notoriété. On ne le fait pas, et c'est
// délibéré : rien dans le relevé ne la porte - la fiche Wikidata est un
// oui-non, pas un rang - et la fabriquer reviendrait à substituer notre
// jugement à la source, ce que la règle 11 de la bible interdit. On garde donc
// PLUSIEURS candidats par gare et par famille, rangés par le même score, et
// c'est le jeu qui cite dans cet ordre. Le 高岩寺 revient sans que personne
// n'ait eu à décréter qu'il valait mieux que son voisin.
//
// Ensuite parce que la famille `historic` n'avait aucune silhouette : trente
// objets relevés - le Rikugien, le site de la pagode de Yanaka, le lieu de
// l'entrevue de Saigō et Katsu - ne pouvaient pas arriver jusqu'à l'écran.
// three/Landmarks porte maintenant la sienne.

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from './lib/args.mjs';

/** Portée du relevé (m). Doit valoir celle de fetch-near.mjs. */
const REACH = 2000;

/** Combien de candidats retenir par gare et par famille. */
const DEFAULT_PER_FAMILY = 2;

/** Les quatre familles, et l'ordre dans lequel elles s'écrivent. */
const FAMILIES = ['museum', 'worship', 'park', 'historic'];

/**
 * Ce qui fait un bon repère de quartier : une fiche Wikidata d'abord - c'est le
 * seul jugement de notoriété qu'on accepte, parce qu'il n'est pas le nôtre -,
 * puis la proximité de sa gare.
 *
 * Il ne sert plus à ÉLIRE mais à RANGER : le premier est cité en premier, et
 * les suivants le sont si la gare a de la place.
 */
function score(f) {
  return (f.wikidata ? 100000 : 0) - f.fromStation;
}

function main() {
  const args = parseArgs(process.argv.slice(2), { options: ['parFamille'] });
  const perFamily = Math.max(1, Number(args.parFamille ?? DEFAULT_PER_FAMILY));

  const url = (p) => new URL(p, import.meta.url);
  const doc = JSON.parse(readFileSync(url('../../data/geo/near-landmarks.geojson'), 'utf8'));

  const byKey = new Map();
  for (const f of doc.features) {
    const p = f.properties;
    const key = `${p.station}/${p.family}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(f);
  }

  const picked = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => score(b.properties) - score(a.properties));
    list.forEach((f, i) => {
      f.properties.picked = i < perFamily;
      if (i < perFamily) {
        f.properties.rank = i;
        picked.push(f.properties);
      } else {
        delete f.properties.rank;
      }
    });
  }

  picked.sort(
    (a, b) =>
      a.station - b.station ||
      FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) ||
      a.rank - b.rank,
  );

  doc.properties = {
    ...doc.properties,
    pickedBy: 'scripts/geo/pick-near.mjs',
    perStationPerFamily: perFamily,
    picked: picked.length,
  };
  writeFileSync(url('../../data/geo/near-landmarks.geojson'), JSON.stringify(doc, null, 1), 'utf8');
  writeNear(doc, picked, perFamily);

  const withCard = picked.filter((p) => p.wikidata).length;
  const drawable = picked.filter((p) => p.family !== 'historic').length;
  process.stdout.write(
    `${picked.length} repères retenus sur ${doc.features.length} relevés ` +
      `(au plus ${perFamily} par gare et par famille) · ` +
      `${withCard} avec fiche Wikidata · ${picked.length - drawable} sites historiques\n`,
  );
}

const js = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "\\'")}'`);

function writeNear(doc, picked, perFamily) {
  const withCard = picked.filter((p) => p.wikidata).length;
  const prov = doc.properties ?? {};
  const src = `// Les repères RÉELS du bord de voie : ce qu'on peut aller vérifier.
//
// GÉNÉRÉ par \`node scripts/geo/pick-near.mjs\` - ne pas éditer à la main.
// Le relevé dont il sort vient de \`scripts/geo/fetch-near.mjs\`.
//
// ${prov.attribution ?? '© les contributeurs OpenStreetMap'} · OpenStreetMap
// Licence ${prov.license ?? 'ODbL 1.0'} · jeu daté du ${prov.datasetDate ?? '—'} · DATA_STATIC
//
// La règle 12 de la bible géographique dit qu'un repère est ce qu'on peut
// retrouver sur une carte. Ce fichier ne contient donc que des objets qui y
// sont : ${picked.length} au plus ${perFamily} par gare et par famille, tirés des ${doc.features.length} objets
// réels relevés à moins de ${REACH} m de la voie, et ${withCard} d'entre eux portent une
// fiche Wikidata. Chacun garde son identifiant OpenStreetMap : on peut ouvrir
// la carte et regarder.
//
// POURQUOI PLUSIEURS PAR FAMILLE. Le plafond valait un, et le critère qui
// départageait - fiche Wikidata, puis proximité de la gare - ne peut pas
// arbitrer ce qu'on lui demandait : à Tokyo, l'objet le plus proche d'une gare
// qui porte une fiche est presque toujours un petit sanctuaire de quartier. On
// gardait le 真性寺 et on écartait le 高岩寺. Plutôt que d'inventer un rang de
// notoriété que la source ne porte pas - ce serait notre jugement, et la règle
// 11 l'interdit -, on en garde plusieurs et le jeu cite dans l'ordre.
//
// \`rank\` est cette place : 0 est le premier cité. C'est un ORDRE DE BUDGET,
// pas un verdict sur l'importance.
//
// Ce qui reste dans districts.ts est du TISSU, marqué comme tel : des
// silhouettes de bureaux, d'écrans et d'enseignes qui donnent le caractère d'un
// quartier sans prétendre nommer quoi que ce soit.

/** La famille d'un repère réel, qui décide de la silhouette qui le porte. */
export type NearFamily = ${FAMILIES.map((f) => `'${f}'`).join(' | ')};

export interface NearLandmark {
  /** Identifiant stable : le type et le numéro de l'objet OpenStreetMap. */
  id: string;
  /** Nom japonais tel qu'OSM le porte, et sa transcription quand elle existe. */
  name: string;
  nameEn: string | null;
  family: NearFamily;
  /** Fiche Wikidata, quand l'objet en a une. C'est notre critère de notoriété. */
  wikidata: string | null;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Distance à l'axe relevé des voies (m). */
  distance: number;
  /** Gare de rattachement (index 0..29), et distance à son point d'arrêt (m). */
  station: number;
  fromStation: number;
  /** Place dans l'ordre de citation de sa gare et de sa famille. 0 = premier. */
  rank: number;
}

export const NEAR_LANDMARKS: readonly NearLandmark[] = [
${picked
  .map(
    (p) =>
      `  { id: '${p.id}', name: ${js(p.name)}, nameEn: ${js(p.nameEn)}, ` +
      `family: '${p.family}', wikidata: ${js(p.wikidata)}, x: ${p.x}, z: ${p.z}, ` +
      `distance: ${p.distance}, station: ${p.station}, fromStation: ${p.fromStation}, ` +
      `rank: ${p.rank} },`,
  )
  .join('\n')}
];

/** Portée du relevé (m) : au-delà, c'est l'affaire de l'horizon géographique. */
export const NEAR_REACH = ${REACH};

/** Combien de candidats le relevé garde par gare et par famille. */
export const NEAR_PER_FAMILY = ${perFamily};

const BY_ID = new Map(NEAR_LANDMARKS.map((lm) => [lm.id, lm]));

/** Le repère réel d'identifiant \`id\`, ou \`undefined\`. */
export function nearLandmark(id: string): NearLandmark | undefined {
  return BY_ID.get(id);
}
`;
  writeFileSync(new URL('../../src/data/nearLandmarks.ts', import.meta.url), src, 'utf8');
}

main();
