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
  // ─── JY05 Ueno ────────────────────────────────────────────────────────
  // Quatre feuilles, une par onglet : 1F-M2, 2F, 3F, B4-B1. Datées de juin
  // 2026. C'est la gare la plus verticale de la boucle, et le relevé le
  // confirme : les quais traversants sont EN L'AIR, le hall principal
  // au-dessus d'eux encore, et la rue en dessous.
  4: {
    confidence: '`mostlyVerified` — sur un plan de **juin** 2026, pas d’août',
    levels: [
      '**2F — les quais traversants.** Les douze voies 1 à 12 y sont, toutes. '
        + 'Six îlots, un ascenseur par îlot (**A à F**).',
      '**3F — la grande zone payante.** Un vaste plateau d’où l’on redescend vers '
        + 'chaque quai : voies 1&2, 3&4, 5&6, 7&8, 9&10, puis 11&12 *(2F)* et '
        + '13-17 *(1F)*. Il porte **Park Gate** et **Iriya Gate**, et **ecute '
        + 'Ueno** derrière les portillons. Une mezzanine **M3F** s’y intercale.',
      '**1F-M2 — la rue et les voies en cul-de-sac.** Voies terminales 13, 14&15, '
        + '16&17, la salle d’attente, et les débouchés : **Main Exit**, '
        + '**Asakusa Exit**, **Iriya Exit**, **Higashi-Ueno Exit**, '
        + '**Panda Bridge Exit (3F)**.',
      '**B4-B1 — Shinkansen et Tokyo Metro.** Feuille non dépouillée : hors '
        + 'périmètre Yamanote. Le 1F la fléche par « for Shinkansen Concourse '
        + 'Area (B3F) » et « for Concourse Area (B1F) ».',
      '**Quatre zones de concourse coexistent** — B1F, 2F, 3F et B3F '
        + '(Shinkansen) — et le plan les nomme comme des destinations, pas comme '
        + 'des étages. C’est ce qui fait Ueno : on n’y va pas « en bas », on va '
        + '« à la concourse 3F ».',
    ],
    gates: [
      '**Park Gate** (公園口) et **Iriya Gate** (入谷口) — tous deux au **3F**, '
        + 'sur le grand plateau payant, avec Fare Adjustment et Tickets accolés.',
      '**Transfer to Shinkansen** — une ligne de contrôle interne au 1F, entre '
        + 'la zone payante des lignes classiques et celle du Shinkansen.',
      'Les captures fournies **ne montrent pas** le Central Gate ni le Shinobazu '
        + 'Gate : le cadrage s’arrête avant. Voir « Incertain ».',
    ],
    order: 'Sur le plan de quais du 2F, un seul bracket couvre le nord de toutes '
      + 'les voies 1 à 12 : **Iriya Gate & Park Gate (3F)**. Autrement dit, '
      + 'depuis le quai Yamanote, l’accès documenté monte au 3F — la gare se '
      + 'quitte **par le haut**, ce qui est l’inverse de la plupart des gares de '
      + 'la boucle.',
    tracks: 'Voie **2** = Yamanote *for Tabata, Ikebukuro & Shinjuku* (内回り) ; '
      + 'voie **3** = Yamanote *for Akihabara, Tōkyō, Hamamatsuchō & Shinagawa* '
      + '(外回り). Les voies **1** et **4** sont la Keihin-Tōhoku : le Yamanote '
      + 'partage donc chacun de ses deux îlots avec elle, ce qui **confirme** le '
      + 'relevé du dépôt (`config: sharedIsland`, `sharedWith: Keihin-Tōhoku`). '
      + 'Au-delà, voies 5 à 12 : Utsunomiya, Takasaki, Jōban, Ueno-Tōkyō.',
    transfers: [
      '**Tokyo Metro Ginza & Hibiya** — fléché deux fois depuis le 1F, côté '
        + 'ouest, près de l’atre et du Main Exit, et depuis le Higashi-Ueno Exit.',
      '**Shinkansen** — par une ligne de contrôle propre au 1F, puis descente '
        + 'vers la concourse B3F.',
      '**Ueno-Tōkyō Line, Jōban, Utsunomiya, Takasaki, Narita** — voies 5 à 17, '
        + 'donc correspondances internes JR, en zone payante.',
    ],
    commerce: [
      '**ecute Ueno** — au **3F**, dans l’aplat « Large store (inside the ticket '
        + 'gates) ». Comme EATo LUMINE à Shinjuku, c’est une galerie **derrière** '
        + 'les portillons, et c’est elle qui donne son échelle au plateau.',
      '**atre Ueno** — au **1F**, côté **libre**, en deux blocs de part et '
        + 'd’autre du Main Exit, avec un renvoi « for atre (2F) ». La gare a donc '
        + 'les deux enseignes du groupe JR East, à deux niveaux et de deux côtés '
        + 'des portillons — ce que le dépôt pressentait en déclarant `ecute` sans '
        + 'pouvoir le situer.',
      '**NewDays** (au moins quatre), **KIOSK**, et six **SHOP** génériques '
        + 'répartis entre le 1F et le 3F.',
      '**Statue of Sanso** *(orthographe du plan)* — le repère du hall 1F. '
        + 'Il s’agit de la statue de Saigō Takamori ; le plan l’écrit ainsi et '
        + 'c’est ce qui est relevé.',
    ],
    works: 'Une zone **« Under Construction »** au sud du plateau 3F, près des '
      + 'descentes vers le Shinkansen et les voies 13-17. Mention finale : '
      + '« *As of June, 2026* ». Beaucoup moins de chantier qu’à Shibuya.',
    uncertain: [
      '**Le Central Gate et le Shinobazu Gate ne sont pas dans le cadrage.** Le '
        + 'dépôt les déclare déjà (中央改札 / 不忍口, `data/lines`) et ces plans '
        + 'ne les contredisent pas — ils ne les montrent simplement pas. Leur '
        + 'niveau et leur position restent à établir.',
      '⚠️ **Un désaccord possible avec le dépôt.** `data/stationLayouts` donne '
        + 'Ueno en `elevation: ground`. Or le plan place les voies 1 à 12 au '
        + '**2F**, soit un niveau au-dessus de la rue — les quais traversants '
        + 'd’Ueno sont sur ouvrage, et ce sont les voies terminales 13-17 qui '
        + 'sont au sol. **Rien n’a été modifié** : `elevation` commande le rendu '
        + 'du quai, l’auvent et la profondeur, et cela déborde de ce chantier. '
        + 'À trancher séparément.',
      'Les **noms japonais** des portillons ne sont pas sur cette édition '
        + 'anglaise : 公園口 / 入谷口 restent à confirmer.',
      'La feuille **B4-B1** n’a pas été dépouillée (Shinkansen et Tokyo Metro, '
        + 'hors périmètre Yamanote).',
      'Aucun numéro de sortie Metro sur le document.',
    ],
    tradeoff: 'Tranche jouable **verticale**, et c’est le contraire de Shinjuku : '
      + 'depuis le quai Yamanote (2F), on **monte** au grand plateau payant du 3F, '
      + 'où se tiennent ecute Ueno et les deux groupes de portillons documentés. '
      + 'Représentés sans être visitables : le Park Gate et l’Iriya Gate en '
      + 'perspective de part et d’autre du plateau (un seul est franchissable), '
      + 'les descentes vers les voies 5 à 12 puis 13-17 (volées qui plongent, '
      + 'linteaux qui coupent la vue), la trémie Shinkansen vers le B3F, et le 1F '
      + 'avec son atre et ses sorties — vu **par en dessous**, depuis les '
      + 'ouvertures du plateau. La grande hauteur et les quatre niveaux '
      + 'simultanément lisibles sont le sujet ; la surface au sol ne l’est pas.',
  },

  // ─── JY13 Ikebukuro ───────────────────────────────────────────────────
  // Deux feuilles, 1F-2F et B1. Février 2026. C'est la gare qui donne les
  // NOMS DE PASSAGES que le cahier des charges espérait sans les tenir.
  12: {
    confidence: '`mostlyVerified` — sur un plan de **février** 2026',
    levels: [
      '**1F-2F** — les huit voies, sur quatre îlots.',
      '**B1** — le hall, et c’est là que la gare se joue : deux blocs payants '
        + 'SÉPARÉS, un à l’ouest et un à l’est, chacun avec ses propres volées '
        + 'vers les quatre îlots.',
    ],
    gates: [
      '**JR : South Gate · Central Gate 1 · Central Gate 2 · North Gate**, tous '
        + 'au B1. Central Gate 1 apparaît DEUX fois, aux deux bouts du bloc ouest.',
      '**Autres exploitants, au même niveau et jointifs** : *Tōbu Tōjō Line Gate* '
        + '(trois lignes de contrôle) et *Tokyo Metro Marunouchi Line Gate* (deux). '
        + 'Chacun a ses propres *Tickets*, distincts de ceux de JR.',
      'Ascenseurs **A à D** dans le bloc ouest.',
    ],
    order: 'Sur le plan de quais, trois brackets seulement : '
      + '**South Gate & Central Gate 1** (la moitié sud), **Central Gate 2**, '
      + '**North Gate**. Les quatre groupes JR desservent donc les mêmes quais '
      + 'par des points différents — ce n’est pas une gare à deux bouts, c’est '
      + 'une gare à quatre entrées le long d’un même faisceau.',
    tracks: 'Quatre voies Yamanote sur **deux îlots 方向別** : **7 et 8** ensemble '
      + '*for Nippori, Ueno & Tōkyō* (内回り), **5 et 6** ensemble *for Shinjuku, '
      + 'Shibuya & Shinagawa* (外回り). Chaque îlot porte donc les DEUX voies d’un '
      + 'même sens, ce qui **confirme** `config: terminusIsland`. Au-delà : Saikyō '
      + '(1 et 4) et Shōnan-Shinjuku (2 et 3).',
    transfers: [
      '**Tōbu Tōjō** — trois lignes de contrôle propres au nord-ouest du B1, '
        + 'contre le *Tobu Department Store*.',
      '**Tokyo Metro Marunouchi** — deux lignes de contrôle, au centre et au sud '
        + 'du B1. Le plan ne distingue pas les autres lignes Metro (Yūrakuchō, '
        + 'Fukutoshin) : elles ne sont pas cartographiées ici.',
      '**Seibu Ikebukuro** — *absent du plan*, alors que ses grands magasins y '
        + 'sont. La correspondance existe, sa géométrie n’est pas dans ce document.',
    ],
    commerce: [
      '**LES PASSAGES SONT NOMMÉS, et c’est le fait le plus exploitable du '
        + 'relevé** : *Orange Road*, *Apple Road*, *Azeria Road*, *Cherry Road* '
        + 'pour les axes est-ouest, *Southern Passage*, *Central Passage*, '
        + '*Northern Passage* pour les traversées. Le cahier des charges espérait '
        + 'pouvoir s’appuyer sur ces noms « lorsque cela est vérifié » : ce l’est.',
      '**Statue of Ikefukuro (Owl)** — いけふくろう, le point de rendez-vous, '
        + 'nommément sur le plan, à l’est près de PARCO.',
      '**Tobu Department Store** (nord-ouest), **Seibu Department Store** (trois '
        + 'blocs au sud et à l’est), **PARCO** (deux blocs à l’est, plus un renvoi '
        + '« for B2F PARCO »). Tous en **gris** : emprise bâtie, hors concourse — '
        + 'ils bordent le hall, ils n’en font pas partie.',
      'Aucun aplat « large store inside the ticket gates » : **rien derrière les '
        + 'portillons**. Les commerces d’Ikebukuro sont tous en zone libre ou hors '
        + 'gare, et un **KIOSK** ou un **SHOP** ponctue le hall.',
    ],
    works: 'Aucune zone de chantier signalée sur les deux feuilles.',
    uncertain: [
      'Le plan est de **février 2026**, six mois avant la date de référence.',
      'Ni le **Seibu Ikebukuro**, ni les lignes **Yūrakuchō / Fukutoshin** ne sont '
        + 'cartographiés — le document est JR + Tōbu + Marunouchi.',
      'Les **noms japonais** des groupes et des passages ne sont pas sur cette '
        + 'édition anglaise : 中央改札1・2 / 南改札 / 北改札 et オレンジロード, '
        + 'アップルロード… restent à confirmer.',
      'Le plan ne montre pas les niveaux inférieurs (B2, B3) ni le *Metropolitan* '
        + 'côté ouest.',
    ],
    tradeoff: 'Tranche jouable dans le **bloc payant ouest du B1**, autour du '
      + '*Central Gate 1*, avec ses volées vers les quatre îlots. Représentés sans '
      + 'être visitables : le *Central Gate 2* et le *North Gate* au bout du hall '
      + '(perspective longue), le *South Gate* et la *Southern Passage* en '
      + 'virage, les lignes de contrôle **Tōbu** et **Marunouchi** comme portails '
      + 'de correspondance jointifs — c’est la signature d’Ikebukuro, trois '
      + 'exploitants dont les 改札 se touchent —, et les grands magasins en '
      + 'façades grises qui bordent le hall sans s’ouvrir. **Les noms de passages '
      + 'vont à la signalétique** : c’est par eux qu’on s’oriente ici, pas par les '
      + 'points cardinaux.',
  },

  // ─── JY19 Harajuku ────────────────────────────────────────────────────
  // Le cahier des charges demandait de CORRIGER les données du dépôt à partir
  // des plans officiels. C'est fait, et il y avait de quoi.
  18: {
    confidence: '`mostlyVerified` — sur un plan de **septembre 2025**, le plus ancien du lot',
    levels: [
      '**2F** — le bâtiment de 2020 : le *Omote-sandō Gate*, sa zone libre, et une '
        + 'zone payante en **passerelle étroite** qui file vers l’est au-dessus '
        + 'des voies.',
      '**1F** — les deux quais.',
      '**B1F** — un **souterrain minuscule** en T, côté Takeshita : trois volées '
        + 'depuis les quais, un couloir, une petite ligne de portillons, et la '
        + 'sortie. Rien d’autre.',
    ],
    gates: [
      '**Omote-sandō Gate** (表参道改札) — au **2F**, dans le bâtiment moderne, '
        + 'avec *Tickets*, *Fare Adjustment*, NewDays et consignes en zone libre.',
      '**La ligne de portillons du Takeshita Exit** — au **B1F**, six baies '
        + 'environ, avec ses propres *Tickets* et *Fare Adjustment*. Le plan ne lui '
        + 'donne pas de nom propre : il nomme la SORTIE, pas le contrôle.',
      '**Deux ensembles sans aucun lien hors quai.** On ne passe pas de l’un à '
        + 'l’autre en zone libre : il faut reprendre le quai. C’est exactement le '
        + 'contraste que le cahier des charges demandait de rendre.',
    ],
    order: 'Le long des quais, deux brackets seulement et à deux bouts opposés : '
      + '**Omote-sandō Gate** au **sud**, **Takeshita Exit** au **nord**.',
    tracks: 'Deux **quais latéraux séparés**, un par sens, chacun avec une seule '
      + 'voie : *for Shinjuku, Ikebukuro & Ueno* (内回り) et *for Shibuya, '
      + 'Shinagawa, Hamamatsuchō & Tōkyō* (外回り). Ce qui **confirme** le relevé '
      + 'du dépôt : Harajuku est la seule gare de la boucle en `config: side`. Un '
      + 'seul ascenseur, **A**, côté extérieur.',
    transfers: [
      '**Tokyo Metro** — fléché depuis la zone libre du 2F, au sud-ouest, sous le '
        + 'Omote-sandō Gate. Le plan ne nomme pas la ligne (Chiyoda / Fukutoshin '
        + 'à Meiji-jingūmae) et n’en montre pas le cheminement.',
    ],
    commerce: [
      '**NewDays** en zone libre du 2F. Consignes de part et d’autre.',
      '**Aucun aplat de grand commerce**, ni dedans ni dehors. Harajuku est une '
        + 'gare de passage : les boutiques du quartier ne sont pas dans la gare, '
        + 'et le plan le confirme.',
    ],
    works: 'Aucune zone de chantier signalée.',
    uncertain: [
      '⚠️ **CORRECTION AU DÉPÔT.** `data/stationInterior` donne à Harajuku '
        + '`gateJp: 西口改札 / gate: West`, et `data/lines` lui attribue les sorties '
        + 'génériques 中央口 / 北口. Le plan officiel dit autre chose : le contrôle '
        + 'du bâtiment moderne s’appelle **Omote-sandō Gate**, et les sorties '
        + 'relevées sont **West Exit**, **East Exit** (2F, au-delà de ce contrôle) '
        + 'et **Takeshita Exit** (B1F). « West » est donc le nom d’une SORTIE, pas '
        + 'du portillon. La correction est documentée ici ; elle sera appliquée '
        + 'aux données en phase 3.',
      'Le plan date de **septembre 2025** : onze mois avant la date de référence, '
        + 'le plus grand écart de tout le relevé.',
      'Les **noms japonais** ne sont pas sur cette édition : 表参道改札, 竹下口, '
        + '西口, 東口 restent à confirmer.',
      'La ligne Metro en correspondance n’est pas nommée sur le document.',
    ],
    tradeoff: 'Les **deux ensembles se construisent tous les deux**, et c’est '
      + 'l’exception : ils sont si petits que l’un ne suffirait pas à faire une '
      + 'gare. Tranche principale au **B1F Takeshita** — un souterrain en T, une '
      + 'petite ligne, une sortie — parce que c’est celui qu’on trouve en '
      + 'descendant au milieu du quai ; et le **2F Omote-sandō** en second '
      + 'ensemble, atteint par l’autre bout du quai, avec sa passerelle claire et '
      + 'son volume de bâtiment neuf. Le **contraste de matière** entre le béton '
      + 'bas du souterrain et le bois clair de 2020 est le sujet ; la surface ne '
      + 'l’est pas. Représentés seulement : le West Exit, le East Exit et le '
      + 'renvoi Tokyo Metro, en fond de zone libre du 2F.',
  },

  // ─── JY26 Takanawa Gateway ────────────────────────────────────────────
  25: {
    confidence: '`mostlyVerified` — sur un plan de **septembre 2025**',
    levels: [
      '**2F** — le hall unique, transversal, au-dessus des voies : *South Gate* et '
        + '*North Gate* aux deux bouts d’une même zone libre.',
      '**1F** — les deux îlots.',
      '**3F** — un **deck**, fléché « for 3F Deck » depuis la zone libre. C’est '
        + 'la liaison vers Takanawa Gateway City.',
    ],
    gates: [
      '**South Gate** et **North Gate** — deux groupes, tous deux au **2F**, aux '
        + 'deux extrémités du même hall transversal, chacun avec ses *Tickets* et '
        + 'son *Fare Adjustment*.',
      'Ascenseurs **A à D**, un par volée de quai.',
    ],
    order: 'Le hall est **unique et transversal** : les deux groupes en occupent '
      + 'les deux bouts, et les volées vers les voies 1&2 et 3&4 partent d’entre '
      + 'les deux. C’est la topologie la plus simple des cinq gares lues, et elle '
      + 'contraste avec tout le reste — une seule pièce, deux portes.',
    tracks: 'Voie **1** = Yamanote *for Tōkyō, Ueno & Sugamo* (内回り) ; voie **2** '
      + '= Yamanote *for Shibuya, Shinjuku & Ikebukuro* (外回り), **sur le même '
      + 'îlot**. Voies **3** et **4** = Keihin-Tōhoku, sur un second îlot. Ce qui '
      + '**confirme** `config: island` : chaque ligne a son îlot, les deux sens se '
      + 'faisant face.',
    transfers: [
      '**Toei Asakusa & Keikyū** — fléché « for Toei Asakusa Line & Keikyū Line » '
        + 'depuis la zone libre du 2F, côté nord. C’est la liaison piétonne vers '
        + 'Sengakuji ; le plan en donne la direction, pas le cheminement.',
    ],
    commerce: [
      'Le plan ne place **aucune enseigne nommée** ni aucun aplat de grand '
        + 'commerce. À la date du document, la gare est un volume, pas une galerie.',
    ],
    works: 'Aucune zone de chantier signalée sur le document.',
    uncertain: [
      '⚠️ **La date est le vrai problème ici.** Septembre 2025, alors que '
        + 'Takanawa Gateway City s’ouvre par tranches : les commerces de la gare '
        + 'et les liaisons de dalle d’**août 2026** ne peuvent pas être lus sur ce '
        + 'plan. Le cahier des charges demande « les commerces majeurs réellement '
        + 'présents » — ce document ne permet pas de les établir.',
      'Les **noms japonais** des deux groupes ne sont pas sur cette édition.',
      'Le **3F Deck** est fléché mais pas cartographié.',
    ],
    tradeoff: 'Tranche jouable : **le hall transversal du 2F en entier**, ce qui '
      + 'est possible parce qu’il est petit — c’est la seule des cinq gares lues '
      + 'où le périmètre jouable peut coïncider avec la gare. Les deux groupes '
      + 'sont franchissables. Représentés seulement : le **3F Deck** (volée qui '
      + 'monte et disparaît), la direction **Toei / Keikyū** (couloir court et '
      + 'panneau), et Takanawa Gateway City en fond extérieur. Le sujet reste ce '
      + 'que le dépôt a déjà : **le volume, la lumière naturelle, le bois, le '
      + 'verre et les vues sur les voies**. Les commerces, eux, sont laissés en '
      + 'attente d’un plan plus récent.',
  },

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
