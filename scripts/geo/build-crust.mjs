// La nappe urbaine : ce qu'il y a entre les amas de tours, jusqu'à vingt km.
//
//   node scripts/geo/build-crust.mjs
//
// Émet :
//   · src/data/crust.ts   les secteurs résolus SANS amas, avec leur faîte mesuré
//
// CE SCRIPT NE VA RIEN CHERCHER DEHORS. C'est une dérivation de
// data/geo/sectors.json, déjà versionné par `fetch-sectors.mjs`. Il se rejoue
// hors ligne, et doit se rejouer dès que le relevé bouge.
//
// LE TROU QU'IL COMBLE. La règle 7 de la bible demande, entre dix et vingt
// kilomètres, « une nappe de volumes simplifiés » - la masse urbaine, pas les
// tours. Le décor n'en avait aucune : `three/city/DistrictMassif` ne dessinait
// que les 51 AMAS, c'est-à-dire les groupes de bâtiments de plus de cinquante-
// cinq mètres. Sur la bande 10-20 km, cela faisait quatre découpes pour six
// cent neuf secteurs.
//
// Or le relevé porte bien plus que ces amas. Sur les 1 226 secteurs nommés
// d'OpenStreetMap à moins de vingt kilomètres, 375 sont RÉSOLUS : assez de
// bâtiments y déclarent leur hauteur pour qu'on en tire un faîte - le
// percentile 0,75 des hauteurs relevées dans l'emprise. Seuls 26 d'entre eux
// portent un amas de tours ; les 349 autres étaient calculés, versionnés, et
// jetés. Ce sont eux, la nappe.
//
// CE QUI EST MESURÉ, ET CE QUI NE L'EST PAS. Il faut le lire avant de croire
// que l'horizon est devenu Tokyo :
//
//   MESURÉ    le faîte (percentile 0,75 des hauteurs étiquetées dans
//             l'emprise), l'altitude du sol (MNT du 国土地理院), la position
//             (le nœud nommé d'OpenStreetMap).
//   DÉDUIT    le RAYON. Il vient de la distance au voisin de même rang, et
//             `measuredRadius` vaut faux dans la source : aucun secteur
//             d'OpenStreetMap ne porte son emprise. C'est la seule grandeur
//             de cette nappe qui ne soit pas relevée, et le champ le dit.
//   ABSENT    les 851 secteurs non résolus. Ils restent vides. Un secteur dont
//             aucun bâtiment ne déclare sa hauteur ne reçoit pas une hauteur
//             plausible - c'est la règle 11, et elle coûte ce qu'elle coûte.

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * En deçà, on ne dessine pas : le ruban urbain s'en charge.
 *
 * L'arrière-pays du ruban va à quatre cent quarante mètres et les vrais
 * bâtiments d'OpenStreetMap y sont posés un par un (src/data/corridor). Une
 * nappe par-dessus ferait doublon avec ce qu'on a de mieux.
 */
const MIN_DISTANCE = 500;

function main() {
  const url = (p) => new URL(p, import.meta.url);
  const pack = JSON.parse(readFileSync(url('../../data/geo/sectors.json'), 'utf8'));

  const kept = pack.sectors
    .filter((s) => s.unresolved === null && !s.mass && s.distance >= MIN_DISTANCE)
    .filter((s) => Number.isFinite(s.roof) && Number.isFinite(s.elevation))
    // Du plus lointain au plus proche : c'est déjà l'ordre de peinture.
    .sort((a, b) => b.distance - a.distance);

  const perBand = {};
  for (const s of kept) perBand[s.band] = (perBand[s.band] ?? 0) + 1;

  const src = `// La nappe urbaine : la masse entre les amas, jusqu'à vingt kilomètres.
//
// GÉNÉRÉ par \`node scripts/geo/build-crust.mjs\` - ne pas éditer à la main.
//
// ${pack.attribution} · ${pack.source}
// Licence ${pack.license} · jeu daté du ${pack.datasetDate} · ${pack.layer}
// Altitudes : 出典：国土地理院 (${pack.demDate})
//
// ${kept.length} secteurs nommés d'OpenStreetMap, résolus mais SANS amas de tours :
// ${perBand[0] ?? 0} sous le kilomètre, ${perBand[1] ?? 0} entre 1 et 5 km, ${perBand[2] ?? 0} entre 5 et 10,
// ${perBand[3] ?? 0} entre 10 et 20. C'est la « nappe de volumes simplifiés » que la règle 7
// de la bible demande, et qui manquait : \`DistrictMassif\` ne dessinait que les
// amas, soit quatre découpes pour les six cent neuf secteurs de la bande
// 10-20 km.
//
// Un secteur de cette nappe est BAS - huit mètres de faîte médian au-delà de
// dix kilomètres - et c'est justement ce qui le rend utile : ce n'est pas lui
// qu'on voit, c'est le SOL qu'il porte. Le plateau de Musashino monte à
// soixante-dix mètres quand la plaine alluviale est à zéro, et c'est cette
// différence-là qui donne un profil à l'horizon au lieu d'un trait.
//
// CE QUI EST MESURÉ :
//   faîte      percentile 0,75 des hauteurs étiquetées dans l'emprise
//   altitude   MNT du 国土地理院
//   position   le nœud nommé d'OpenStreetMap
//
// CE QUI EST DÉDUIT : le RAYON, tiré de la distance au voisin de même rang.
// Aucun secteur d'OpenStreetMap ne porte son emprise. \`measuredRadius\` vaut
// faux pour tout le monde ici, et le champ existe pour qu'on ne l'oublie pas.
//
// CE QUI RESTE VIDE : les secteurs non résolus - ceux dont aucun bâtiment ne
// déclare sa hauteur. Ils ne reçoivent pas une hauteur plausible. C'est la
// règle 11.

/** Un secteur de la nappe, vu de la boucle. */
export interface CrustSector {
  /** Identifiant du nœud nommé d'OpenStreetMap : on peut ouvrir la carte. */
  id: string;
  /** Nom japonais du secteur, et sa transcription quand elle existe. */
  name: string | null;
  nameEn: string | null;
  /** \`city\`, \`borough\`, \`town\`, \`suburb\` ou \`quarter\`. */
  rank: string | null;
  /** Est, en mètres depuis le point d'arrêt de Tokyo. */
  x: number;
  /** Nord NÉGATIF, en mètres depuis le point d'arrêt de Tokyo. */
  z: number;
  /** Distance à la voie la plus proche (m). */
  distance: number;
  /** Bande de la bible : 0 = moins d'un km, 1 = 1-5, 2 = 5-10, 3 = 10-20. */
  band: 0 | 1 | 2 | 3;
  /** Demi-largeur (m). DÉDUITE du voisinage, jamais relevée. */
  radius: number;
  /** false pour tout le monde : la source ne porte pas l'emprise d'un secteur. */
  measuredRadius: false;
  /** Faîte (m au-dessus du sol) : percentile 0,75 des hauteurs relevées. */
  height: number;
  /** Combien de bâtiments étiquetés ont servi à le mesurer. */
  samples: number;
  /** Altitude du sol au MNT (m). */
  elevation: number;
}

/** En deçà, la nappe ne dessine pas : le ruban urbain s'en charge (m). */
export const CRUST_MIN_DISTANCE = ${MIN_DISTANCE};

/** Les secteurs de la nappe, du plus lointain au plus proche. */
export const CRUST: readonly CrustSector[] = [
${kept
  .map(
    (s) =>
      `  { id: '${s.id}', name: ${js(s.name)}, nameEn: ${js(s.nameEn)}, rank: ${js(s.rank)}, ` +
      `x: ${s.x}, z: ${s.z}, distance: ${s.distance}, band: ${s.band}, radius: ${s.radius}, ` +
      `measuredRadius: false, height: ${s.roof}, samples: ${s.samples}, elevation: ${s.elevation} },`,
  )
  .join('\n')}
];
`;
  writeFileSync(url('../../src/data/crust.ts'), src, 'utf8');
  process.stdout.write(
    `${kept.length} secteurs de nappe (sur ${pack.sectors.length} relevés, ` +
      `${pack.counts.resolved} résolus, ${pack.counts.drawn} amas) · ` +
      `bandes ${JSON.stringify(perBand)}\n`,
  );
}

const js = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "\\'")}'`);

main();
