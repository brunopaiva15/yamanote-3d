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
        + '**Central West Gate (6:00 – dernier train)**.',
      '**2F** : **Southeast Gate (7:00 – 24:00)** · South Gate · Kōshū-kaidō Gate · '
        + 'New South Gate · MIRAINA TOWER Gate.',
      '**Deux groupes sur neuf FERMENT LA NUIT** — Central West (B1F) et '
        + 'Southeast (2F). Le plan donne leurs horaires et ceux-là seulement : '
        + 'les sept autres sont ouverts au service. Une gare dont certains '
        + 'contrôles s’éteignent n’est pas une gare dont tous les contrôles se '
        + 'valent, et c’est le genre de fait qu’aucune génération ne produit.',
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
        + 'voies 9&10 et 13&14, dessiné dans l’aplat « **Large store (inside the '
        + 'ticket gates)** ». Ce n’est donc pas une lecture de couleur au juger : '
        + 'le plan le classe lui-même derrière les portillons. C’est le fait le '
        + 'plus remarquable du document — une galerie de restauration côté 改札内, '
        + 'pas une devanture de couloir.',
      '**LUMINE EST Shinjuku** — zone libre du B1F, au nord-est du Central East '
        + 'Gate, avec ses propres « for Exit ».',
      '**NEWoMan** — 2F, de part et d’autre de l’épine sud. Le nom revient sur '
        + 'DEUX aplats différents, et la distinction compte : les blocs beiges qui '
        + 'flanquent l’épine sont des « large stores **inside the ticket gates** », '
        + 'les blocs gris ne sont qu’une emprise bâtie, hors concourse cartographié. '
        + '**LUMINE 0** (nord-ouest) et **LUMINE 2** (contre le Southeast Gate) sont '
        + 'de ce second type.',
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

  // ─── JY20 Shibuya ─────────────────────────────────────────────────────
  // ⚠ Le plan porte « As of June, 2026 » : DEUX MOIS avant la date de
  // référence, sur la gare la plus mouvante de la boucle. Chaque fait tiré
  // d'ici traîne ce décalage avec lui, et il est répété là où il compte.
  19: {
    confidence: '`mostlyVerified` — mais sur un plan de **juin** 2026, pas d’août',
    levels: [
      '**2F** — les quais. Deux îlots : **voies 1 et 2** (Yamanote) et '
        + '**voies 3 et 4** (Saikyō / Shōnan-Shinjuku / Narita Express).',
      '**1F** — le niveau des contrôles South et Hachikō, et des sorties de rue.',
      'Le plan fourni ne couvre que ces deux niveaux : ni les quais Ginza en '
        + 'hauteur, ni les niveaux Tōkyū / Metro en profondeur n’y figurent — ils '
        + 'ne sont pas JR.',
    ],
    gates: [
      '**Central Gate** · **South Gate** · **Hachikō Gate** · **New South Gate** — '
        + 'quatre groupes, et c’est tout ce que JR exploite ici.',
      'Le Hachikō Gate a son propre bloc au 1F, avec *Tickets*, *Fare Adjustment* '
        + 'et un passage marqué **« Exit Only »** — une bretelle à sens unique, '
        + 'pas un second contrôle.',
      'Ascenseurs balisés **A à F**.',
    ],
    order: 'Du **sud au nord** le long des quais, les brackets se suivent ainsi : '
      + 'New South Gate → Central Gate → South Gate → Central Gate + South Gate → '
      + 'Central Gate → **Hachikō Gate** (le plus long bracket, tout au nord). '
      + 'Le New South Gate est **loin** au sud, séparé du reste — ce n’est pas une '
      + 'variante du South Gate, c’est un autre bout de gare.',
    tracks: 'Voie **1** = Yamanote *for Shinjuku, Ikebukuro & Ueno* (内回り) ; '
      + 'voie **2** = Yamanote *for Shinagawa, Hamamatsuchō & Tōkyō* (外回り). '
      + 'Les deux sens **se font face sur le même îlot**, ce qui **confirme** le '
      + 'relevé du dépôt (`config: island`) — contrairement à Shinjuku, où ils '
      + 'sont sur deux quais partagés. Voies 3 et 4 : Saikyō (vers Ōmiya d’un '
      + 'côté, vers Ebisu・Ōsaki・Rinkai・Sōtetsu de l’autre), Shōnan-Shinjuku, '
      + 'Narita Express.',
    transfers: [
      '**Keiō Inokashira** — fléché depuis le 1F, au nord-ouest, près du '
        + 'Hachikō Gate.',
      '**Tokyo Metro Ginza · Hanzōmon · Fukutoshin** et **Tōkyū Tōyoko · '
        + 'Den-en-Toshi** — fléchés depuis les deux blocs du 1F, South comme '
        + 'Hachikō. Le plan donne la **direction**, jamais le cheminement : ces '
        + 'lignes ne sont pas JR et s’arrêtent au bord de la feuille.',
      'Le Ginza est cité dans la liste des correspondances mais **son quai '
        + 'n’est pas dessiné** : il est au 3F, hors emprise du document.',
    ],
    commerce: [
      '**KIOSK** sur les quais. Aucun aplat « large store » nulle part : à la '
        + 'différence de Shinjuku, **le plan de Shibuya ne place aucune galerie '
        + 'commerciale de gare**, ni derrière ni devant les portillons. Le hall '
        + 'est nu, et c’est un fait de relevé, pas un oubli.',
      'Ni Hikarie, ni Scramble Square, ni Stream, ni Sakura Stage n’apparaissent : '
        + 'ce sont des bâtiments voisins, pas des commerces de gare JR. Les '
        + 'représenter relèvera de la perspective extérieure, pas du relevé.',
    ],
    works: '**La gare est un chantier, et le plan le dit partout.** Des zones '
      + '« Under Construction » couvrent les deux quais (au moins quatre emprises '
      + 'distinctes) et trois blocs du 1F, dont l’essentiel du côté Hachikō. '
      + 'Mention finale : « *There may be some changes due to construction work. '
      + 'As of June, 2026* ». C’est plus de chantier que de gare finie, et c’est '
      + 'l’état à représenter.',
    uncertain: [
      '**La date.** Le plan est de **juin 2026**, la référence du chantier est '
        + 'août 2026. Sur une gare qui bouge tous les trimestres, deux mois '
        + 'peuvent déplacer une palissade ou rouvrir un passage. Aucun fait '
        + 'ci-dessus ne doit être présenté comme « l’état d’août ».',
      'Les **noms japonais** des groupes ne sont pas sur cette édition anglaise : '
        + 'ハチ公改札 / 中央改札 / 南改札 / 新南改札 restent à confirmer.',
      'Les sorties nommées relevées sont **East Exit**, **West Exit**, '
        + '**Hachikō Exit** et **Miyamasuzaka Exit** ; le plan n’en donne pas la '
        + 'liste exhaustive et ne porte aucun numéro de sortie Metro.',
      'Les niveaux Ginza (au-dessus) et Tōkyū / Metro (en dessous) sont **absents '
        + 'du document** : leur position relative reste à établir ailleurs.',
    ],
    tradeoff: 'Tranche jouable autour du **Hachikō Gate**, conformément au '
      + 'cahier des charges : c’est le groupe le plus reconnaissable et celui qui '
      + 'porte les sorties Hachikō et Miyamasuzaka. Représentés sans être '
      + 'visitables : le South Gate et son East Exit (branche sud, au même '
      + 'niveau), le Central Gate (perspective le long du quai), le New South Gate '
      + '(très loin au sud — un panneau et une direction, rien de plus), le Keiō '
      + 'Inokashira et les lignes Metro / Tōkyū (portails de correspondance '
      + 'fléchés), le Ginza en hauteur (percée verticale). **Les palissades de '
      + 'chantier sont un élément de décor de premier plan, pas un détail** : '
      + 'elles ferment naturellement le périmètre là où le plan lui-même s’arrête.',
  },
};

const read = readSourceCount();

/**
 * Les plans réellement lus, avec la date du DOCUMENT.
 *
 * Elle n'est pas décorative : mélanger des plans d'époques différentes sans le
 * dire est la faute la plus facile à commettre et la plus difficile à voir
 * ensuite. Le tableau la met sous les yeux avant la première fiche.
 */
const readPlans = CONCOURSE_SOURCES.flatMap((s) =>
  s.sources
    .filter((r) => r.retrieval === 'read')
    .map((r) => {
      const st = STATIONS[s.stationIndex];
      const same = r.documentDate === REFERENCE_DATE;
      return `| ${st.jy} ${st.romaji} | ${r.documentDate ?? '—'} | `
        + `${same ? '✅ la date de référence' : '⚠️ **décalé** par rapport à la référence'} |`;
    }));

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

### Comment se lit un plan JR East — le code couleur

Il est le même sur les trente gares, et il **se lit dans la légende**, pas dans
l'intuition. Il est transcrit ici une fois pour que les fiches ci-dessous soient
vérifiables sans le document :

| Aplat | Ce que c'est |
|---|---|
| rose clair | **Concourse Area (Local line)** — zone **payante** des lignes classiques |
| crème | **Concourse Area (outside the ticket gates)** — zone **libre** |
| beige / tan | **Large store (inside the ticket gates)** — grand commerce **derrière** les portillons |
| rose soutenu | Concourse Area (Shinkansen) |
| bleu clair | Local line Track — le quai lui-même |
| bleu vif | Shinkansen Track |
| hachures magenta | **Gate** — la ligne de portillons elle-même |
| gris | emprise bâtie hors concourse : ni zone payante, ni zone libre, ni commerce cartographié |

Deux conséquences directes pour le chantier :

1. **le beige distingue un commerce EN ZONE PAYANTE** d'un commerce en zone
   libre. C'est un fait de plan, pas une interprétation — et c'est ce qui fait
   qu'EATo LUMINE compte comme galerie derrière les portillons à Shinjuku ;
2. **Kiosk, Shop et Newdays sont trois entrées distinctes de la légende.** Un
   « KIOSK » sur le plan est un kiosque nommé, un « SHOP » est un commerce dont
   la catégorie seule est établie. La distinction alimente directement
   \`CommerceStatus\` (\`namedVerified\` / \`categoryVerified\`) au lieu d'être
   devinée.

> **Piège d'outillage.** Ces plans sont des impressions PDF du visualiseur JR
> East : les libellés de la carte sont dans une image, mais la légende, les
> onglets de niveau et les en-têtes sont du **texte vectoriel japonais**. Sans
> \`poppler-data\` (tables CID Adobe-Japan1), poppler les rend **silencieusement
> blancs** — la page s'affiche, il manque seulement ce qui l'explique. Installer
> \`poppler-utils\` **et** \`poppler-data\` avant de lire un plan.

### Date de chaque plan lu

Un plan de juin et un plan d'août ne décrivent pas la même gare quand la gare
est un chantier. Les dates sont donc affichées avant les fiches, et jamais
fondues dans le texte.

| Gare | Date du plan | Écart |
|---|---|---|
${readPlans.join('\n') || '| — | — | — |'}

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
