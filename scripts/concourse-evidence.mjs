// Génère docs/STATION_CONCOURSE_EVIDENCE.md.
//
//   npm run docs:concourse
//
// Le carnet de relevé n'est jamais écrit à la main : il se déduit du registre
// des sources (`src/data/stationConcourseSources`) et de la table de relevés
// ci-dessous. C'est ce qui garantit qu'une gare dont la source change voit sa
// fiche changer avec elle, et qu'aucune fiche ne survit à la donnée qui la
// justifiait.
//
// La table `FINDINGS` porte ce qu'on a RÉELLEMENT LU sur un plan. Une gare
// absente de la table n'affirme rien : sa fiche dit « à relever », ce qui est
// une information exacte et non un trou.

import { writeFileSync } from 'node:fs';
import { STATIONS } from '../src/data/stations.ts';
import { layoutFor } from '../src/data/stationLayouts.ts';
import {
  CONCOURSE_SOURCES,
  jrEastPlanUrl,
  jrEastPlanUrlEn,
  readSourceCount,
  REFERENCE_DATE,
} from '../src/data/stationConcourseSources.ts';

const ELEV = { ground: 'au sol', elevated: 'sur viaduc', trench: 'en tranchée' };
const CONF = {
  sharedIsland: 'îlot partagé',
  island: 'îlot Yamanote',
  side: 'quais latéraux',
  terminusIsland: 'deux îlots Yamanote',
};

/**
 * Ce qui a été lu sur un plan officiel, gare par gare.
 *
 * Chaque champ est une LECTURE, pas une déduction. Ce qui est déduit se dit
 * (« donc », « ce qui confirme ») ; ce qui n'est pas sur le plan va dans
 * `uncertain`.
 */
const FINDINGS = {
  // ─── JY17 Shinjuku ────────────────────────────────────────────────────
  // Relevé sur le jeu « Guide Maps for Major Stations », trois niveaux, daté
  // « As of August, 2026 » - la date de référence du chantier, au mois près.
  16: {
    confidence: '`mostlyVerified`',
    levels: [
      '**B1F** — le couloir central est-ouest (中央通路). Zone payante d’un seul '
        + 'tenant, avec une volée vers chaque quai : voies 1&2, 3&4, 5&6 (au bout '
        + 'd’un long couloir vers l’est), 7&8, 9&10, 11&12, 13&14, 15&16.',
      '**1F** — les seize voies, sur huit quais.',
      '**2F** — l’épine sud, nord-sud, qui redescend elle aussi vers les huit quais.',
      '**3F / 4F** — hors emprise JR : arrêts de taxi (3F), terminal de bus '
        + 'autoroutiers et bus aéroport (4F).',
    ],
    gates: [
      '**B1F** : East Gate · West Gate · Central East Gate · '
        + '**Central West Gate (6:00 – dernier train)**, le seul dont le plan '
        + 'donne les horaires, donc le seul qui ferme.',
      '**2F** : Southeast Gate · South Gate · Kōshū-kaidō Gate · New South Gate · '
        + 'MIRAINA TOWER Gate.',
      '**B1F, branche sud** : JR Central West Gate (Keiō Exit), puis Keiō Line '
        + 'Gate — deux lignes de contrôle qui se suivent dans le même couloir.',
      'Chaque groupe a ses *Tickets* et son *Fare Adjustment* accolés ; les '
        + 'ascenseurs sont balisés de **A à O**.',
    ],
    order: 'Du **nord au sud** le long des quais, le plan porte cinq brackets : '
      + 'East & West Gate (B1F) → Central East & Central West (B1F) → '
      + 'Southeast & South (2F) → Central East & Central West (B1F, seconde volée) → '
      + 'Kōshū-kaidō, New South & MIRAINA TOWER (2F). '
      + '**C’est l’ossature de la gare** : deux niveaux de contrôle qui alternent '
      + 'le long d’un même quai, et non un hall unique.',
    tracks: 'Voie **14** = Yamanote *for Harajuku, Shibuya & Shinagawa* (外回り) ; '
      + 'voie **15** = Yamanote *for Ikebukuro, Tabata & Ueno* (内回り). Les deux '
      + 'quais sont partagés : **13 + 14** (13 = Chūō-Sōbu local pour Chiba) et '
      + '**15 + 16** (16 = Chūō-Sōbu local pour Mitaka). Ce qui **confirme** le '
      + 'relevé du dépôt : `config: sharedIsland`, `sharedWith: Chūō–Sōbu`.',
    transfers: [
      '**Keiō** — par *JR Central West Gate (Keiō Exit)*, au bout d’une branche '
        + 'qui part du Central West Gate vers le sud, en B1F. Marqué aussi '
        + '« for Keiō Line » à deux endroits du couloir central.',
      '**Odakyū** — « for Odakyū Line », B1F, juste à l’est du Central West Gate.',
      '**Toei Shinjuku & Ōedo** — au-delà du Keiō Line Gate, même branche sud.',
      '**Saikyō / Shōnan-Shinjuku** — voies 1 à 4 ; **Narita Express / Tōbu '
        + '(direct)** — voies 5 et 6. Correspondances internes JR, donc en zone '
        + 'payante.',
    ],
    commerce: [
      '**EATo LUMINE** — *dans la zone payante* du B1F, entre les volées des '
        + 'voies 9&10 et 13&14. C’est le fait le plus remarquable du plan : une '
        + 'galerie de restauration côté 改札内, pas une devanture de couloir.',
      '**LUMINE EST Shinjuku** — zone libre du B1F, au nord-est du Central East '
        + 'Gate, avec ses propres « for Exit ».',
      '**NEWoMan** — 2F, de part et d’autre de l’épine sud, en zone libre comme '
        + 'en bordure de zone payante. **LUMINE 0** au nord-ouest du même niveau.',
      '**NewDays** — zone payante B1F, près des volées 15&16. **KIOSK** sur les '
        + 'quais 1&2 et 3&4. Un **SHOP** au B1F.',
      '**Suica Penguin Park** et la **Statue of Suica Penguin** — zone libre 2F '
        + 'est, contre le terminal de bus.',
    ],
    works: 'Le plan porte une zone **« Under Construction »** sur le flanc sud du '
      + 'couloir B1F, entre les volées des voies 7&8 et 11&12, et l’avertissement '
      + '« *There may be some changes due to construction work. As of August, 2026* ». '
      + 'C’est la seule gare de la boucle dont le plan officiel se déclare '
      + 'lui-même provisoire.',
    uncertain: [
      'Le cadrage fourni ne montre pas l’implantation exacte des **East Gate** et '
        + '**West Gate** (B1F) : leurs noms et leur niveau sont établis par les '
        + 'brackets du plan de quais, leur géométrie non.',
      'Le plan est celui de **JR seul** : ni Tokyo Metro Marunouchi, ni Seibu '
        + 'Shinjuku, ni les numéros de sortie Metro n’y figurent.',
      'Les **noms japonais** des groupes de portillons ne sont pas sur ce jeu de '
        + 'plans (édition anglaise) : 中央東改札 / 中央西改札 / 甲州街道改札 / '
        + '新南改札 restent à confirmer sur l’édition japonaise.',
      'L’emprise précise de la zone « Under Construction » est indiquée par une '
        + 'accolade, pas par un contour coté.',
    ],
    tradeoff: 'Tranche jouable autour du **Central East Gate (B1F)**, qui est le '
      + 'groupe le plus proche du milieu des quais 13-16 et donc celui qu’on trouve '
      + 'en descendant du train. Représentés sans être visitables : la branche est '
      + 'vers les voies 5&6 (long couloir, virage), la branche sud vers Keiō / Toei '
      + '(deux lignes de contrôle en enfilade), l’épine 2F et ses trois groupes '
      + '(par les volées montantes et leur signalétique), le Central West Gate '
      + '(perspective en bout de couloir). **EATo LUMINE** donne son échelle à la '
      + 'zone payante ; la palissade de chantier ferme le flanc sud.',
  },
};

const read = readSourceCount();

const head = `# Relevé des halls de gare — sources et incertitudes

Date de référence architecturale et commerciale : **${REFERENCE_DATE}** (août 2026).

Ce document est le carnet de relevé du chantier décrit dans
\`docs/STATION_CONCOURSE_PLAN.md\`. Une fiche par gare, toujours dans le même
ordre : sources, niveaux, groupes de portillons, sorties, correspondances,
commerces structurants, travaux, ce qui reste incertain, et le compromis retenu
pour le jeu.

**Il est généré** (\`npm run docs:concourse\`) depuis le registre des sources et
la table de relevés de \`scripts/concourse-evidence.mjs\`. Ne pas l'éditer à la
main : une fiche qui survivrait à la donnée qui la justifie est exactement le
genre de document qui ment.

---

## ⚠ État de la vérification — à lire avant toute fiche

**Plans officiels ouverts et lus : ${read} / 30.**

L'environnement de développement de ce dépôt n'atteint pas les sites des
opérateurs : la passerelle réseau refuse la connexion (403 sur \`CONNECT\`) vers
\`jreast.co.jp\`, \`tokyometro.jp\`, \`kotsu.metro.tokyo.jp\` et le reste. Le seul
canal automatique disponible est la recherche indexée, qui rend des titres et
des adresses — jamais le contenu d'une page.

Ce qui a donc été fait :

- les **trente adresses de plan JR East** ont été identifiées et confirmées une
  par une, par concordance entre l'adresse indexée et le titre de la page, qui
  porte le nom de la gare (「JR東日本：駅構内図・バリアフリー情報（神田駅）」).
  Le numéro interne JR East n'a aucun rapport avec le code JY — Akihabara est
  41, Tokyo 1039, Takanawa Gateway 1750 — et se devine encore moins ;
- les **points d'entrée** de Tokyo Metro, Toei, ecute et atré ont été confirmés
  de la même façon ;
- quelques **indications de niveaux** ont été récoltées dans les résumés
  d'indexation (« B1-1F », « 1F / 2F-M3 / 3F »). Ce sont des indications, pas
  des relevés : elles orientent la vérification, elles ne la remplacent pas ;
- **les plans fournis à la main ont été lus.** C'est la voie qui marche : le
  document déposé dans la conversation se lit comme n'importe quel fichier, et
  la gare quitte l'approximation. Shinjuku est passée par là.

Ce qui tient tout cela en place, et c'est du code :

1. chaque référence porte \`retrieval\` — \`read\`, \`indexed\` ou \`catalogued\`
   (\`data/stationConcourseSources\`) ;
2. \`validateProfile\` **refuse** qu'un profil se déclare \`verified\` sans qu'une
   source de rang 1-3 ait été lue ;
3. un test lie ce carnet au registre : le compte de plans lus affiché ci-dessus
   est calculé, pas recopié.

**Les documents ne sont pas versionnés.** Ils portent
« ©JR East Consultants Company ». On en cite l'adresse, la date et ce qu'on y a
lu ; on ne redistribue pas le fichier. C'est la raison d'être des fiches
ci-dessous : elles se relisent sans le plan, et se contestent ligne à ligne.

---

## Comment lire une fiche

| Rubrique | Ce qu'elle contient |
|---|---|
| **Sources** | l'adresse de chaque document, et ce qu'on en a fait |
| **Niveaux** | les étages que la gare publie, et où se tient chaque hall |
| **Groupes de portillons** | les 改札口 nommés, et ce qui les sépare |
| **Sorties** | les noms réels, japonais et anglais, plus le numéro Metro s'il existe |
| **Correspondances** | les lignes, et surtout leur DIRECTION depuis le hall |
| **Commerces structurants** | ce qui donne son échelle au hall, pas la liste des boutiques |
| **Travaux** | l'état d'août 2026 |
| **Incertain** | ce qui n'est pas établi, nommément |
| **Compromis de jeu** | ce qui est construit, ce qui est seulement représenté |

Le rang d'une source suit l'ordre de priorité du chantier : **1** JR East ·
**2** Tokyo Metro · **3** Toei · **4** autres opérateurs · **5** galeries
intégrées (atré, ecute, NEWoMan, Gransta) · **6** pages de travaux ·
**7** photographies et vidéos récentes · **8** Google Maps / Street View, et
seulement pour vérifier une orientation en surface.

---
`;

const RETRIEVAL = {
  read: '**`read`** — ouvert et lu',
  indexed: '`indexed` — non lu',
  catalogued: '`catalogued` — à consulter',
};

const bullets = (items) => items.map((t) => `- ${t}`).join('\n');
const todo = '*à relever — le plan officiel n’a pas pu être ouvert depuis cet environnement*';

const parts = [head];

for (let i = 0; i < 30; i++) {
  const s = STATIONS[i];
  const l = layoutFor(i);
  const src = CONCOURSE_SOURCES[i];
  const f = FINDINGS[i];
  const transfers = l.parallel.length ? l.parallel.join(' · ') : '—';
  const floors = src.floorsHint
    ? `\`${src.floorsHint}\` *(annoncé par l'index, plan non lu)*`
    : '*non annoncé par l’index*';

  const rows = src.sources.map((r) => {
    const where = r.url === jrEastPlanUrl(i)
      ? `[ja](${jrEastPlanUrl(i)}) · [en](${jrEastPlanUrlEn(i)})`
      : r.url ? `[lien](${r.url})` : '—';
    return `| ${r.tier} | ${r.title} | ${where} | ${RETRIEVAL[r.retrieval]} |`;
  }).join('\n');

  parts.push(`
## ${s.jy} ${s.romaji} — ${s.kanji}

*Date de référence : ${REFERENCE_DATE}. Confiance du relevé : ${f ? f.confidence : '**à établir**'}.*

**Sources**

| Rang | Document | Adresse | État |
|---|---|---|---|
${rows}

**Ce que le dépôt sait déjà** (relevés antérieurs, à ne pas re-relever)

- voie ${ELEV[l.elevation]}, ${CONF[l.config]}${l.sharedWith ? ` avec la ${l.sharedWith}` : ''} ;
- lignes visibles ou en correspondance : ${transfers} ;
- affluence relative : ${l.crowdScale}${l.works ? ' ; **gare en travaux**' : ''} ;
- niveaux publiés : ${floors}.

**Niveaux**

${f ? bullets(f.levels) : todo}

**Groupes de portillons**

${f ? bullets(f.gates) : todo}
${f && f.order ? `\n**Ordre le long du quai** — ${f.order}\n` : ''}${f && f.tracks ? `\n**Voies Yamanote** — ${f.tracks}\n` : ''}
**Correspondances et leur direction**

${f ? bullets(f.transfers) : todo}

**Commerces structurants**

${f ? bullets(f.commerce) : todo}

**Travaux (août 2026)**

${f ? f.works : todo}

**Incertain**

${f ? bullets(f.uncertain) : '- tout ce qui précède : le plan officiel n’a pas pu être ouvert depuis cet environnement.'}

**Compromis de jeu**

${f ? f.tradeoff : '*décidé en phase 5*'}

---
`);
}

writeFileSync(new URL('../docs/STATION_CONCOURSE_EVIDENCE.md', import.meta.url), parts.join(''));
console.log(`docs/STATION_CONCOURSE_EVIDENCE.md — 30 fiches, ${read} plan(s) lu(s)`);
