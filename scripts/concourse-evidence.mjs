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
  // ─── JY01 Tokyo ───────────────────────────────────────────────────────
  // Six onglets, cinq lus. Mai 2026. La gare est si grande que le document
  // lui-même est panoramé : ce qui est hors cadre est dit comme tel.
  0: {
    confidence: '`mostlyVerified` — sur un plan de **mai** 2026, et cadré côté Yaesu',
    levels: [
      'Six onglets : **1F · M2F · 2F · B1F · Keiyō Line · Sobu Line**. Aucune '
        + 'autre gare de la boucle n’en a autant, et deux d’entre eux sont des '
        + 'LIGNES et non des étages — c’est ce qui dit le mieux ce qu’est Tokyo.',
      '**2F — les quais des lignes classiques et du Shinkansen**, tous ensemble : '
        + 'voies 1 à 10 puis 14 à 23.',
      '**1F — le niveau des contrôles et des passages**, celui qu’on parcourt.',
      '**B1F — Gransta**, et une seconde nappe de circulation : plusieurs volées '
        + 'de quai sont fléchées « for Tracks No.X (2F) **& Concourse Area (B1F)** », '
        + 'donc desservent les deux niveaux à la fois.',
      '**Keiyō Line** et **Sobu Line** ont leurs propres feuilles : ce sont des '
        + 'gares dans la gare, à plusieurs centaines de mètres et cinq niveaux de '
        + 'là. La feuille Sobu n’a pas été fournie.',
    ],
    gates: [
      '**Côté Yaesu, relevé** : *Yaesu North Exit*, *Yaesu Central Exit*, '
        + '*Yaesu South Exit*, et **Nihonbashi Exit** (deux contrôles distincts, '
        + 'l’un vers le Tōhoku Shinkansen, l’autre vers le Tōkaidō・Sanyō).',
      '**Contrôles de Shinkansen, qui sont des lignes à part entière** : '
        + '*Tōkaidō and Sanyō Shinkansen (Yaesu Central North Exit)*, '
        + '*(Yaesu Central South Exit)*, *(Yaesu North Exit)*. À Tokyo, on ne '
        + '« passe pas au Shinkansen » : on franchit un second 改札.',
      '**Transferts internes nommés** : *Tōhoku…Shinkansen North / Central / '
        + 'South Transfer*, *Tōkaidō・Sanyō Shinkansen Central / South Transfer*. '
        + 'Ce sont des lignes de contrôle **entre deux zones payantes**.',
      '⚠️ **Le côté Marunouchi n’est pas dans le cadrage fourni.** Le '
        + 'Marunouchi Central Gate — celui que le cahier des charges désigne comme '
        + 'tranche principale — n’a donc pas été lu.',
      'Ascenseurs **A à P** sur la seule feuille 1F.',
    ],
    order: 'Trois passages transversaux nommés relient Marunouchi à Yaesu : '
      + '**Northern Passage**, **Central Passage**, **Southern Passage**, plus un '
      + '**Northern Free Passage** hors contrôle. C’est l’ossature de Tokyo : la '
      + 'gare se traverse d’ouest en est par trois couloirs, et les volées de quai '
      + 'y tombent perpendiculairement.',
    tracks: 'Voie **4** = Yamanote *for Ueno & Ikebukuro* (内回り) ; voie **5** = '
      + 'Yamanote *for Shinagawa & Shibuya* (外回り). Voie **3** = Keihin-Tōhoku '
      + 'vers Ueno, voie **6** = Keihin-Tōhoku vers Kamata. Chaque voie Yamanote '
      + 'partage donc son îlot avec une voie Keihin-Tōhoku — îlot (3,4) et îlot '
      + '(5,6) — ce qui **confirme** au mot près le relevé du dépôt : '
      + '`sharedIsland`, `sharedWith: Keihin-Tōhoku`, « voies 4 et 5 sur deux quais '
      + 'partagés ». Au-delà : Chūō (1,2), Jōban・Utsunomiya・Takasaki・Ueno-Tōkyō '
      + '(7,8), Tōkaidō (9,10), Tōkaidō Shinkansen (14-19), '
      + 'Tōhoku・Yamagata・Akita・Hokkaidō・Jōetsu・Hokuriku Shinkansen (20-23).',
    transfers: [
      '**Shinkansen** — par contrôle dédié, côté Yaesu comme côté Nihonbashi. '
        + 'Six lignes de contrôle en tout entre classique et Shinkansen.',
      '**Keiyō Line** et **Sōbu Line** — chacune son onglet, donc sa propre gare '
        + 'souterraine. Le long cheminement vers la Keiyō, que le cahier des '
        + 'charges cite, est ainsi confirmé par la structure même du document.',
      'Le plan est **JR seul** : le Marunouchi de Tokyo Metro n’y figure pas.',
    ],
    commerce: [
      '**GRANSTA TOKYO** et **GRANSTA YAESU** — les deux galeries, nommément.',
      '**TOKYO GIFT PALETTE**, **First Avenue Tōkyō Station**, **KITAMACHI '
        + 'SAKABA** (trois blocs) et **八重北食堂** côté Yaesu nord.',
      '**Gran Tōkyō North Tower (1F) DAIMARU**, **Sapia Tower (1F)**, '
        + '**Marunouchi central Building** — emprises bâties qui bordent la gare.',
      '**JAPAN RAIL CAFE**, **VIEW GOLD LOUNGE**, **JR-East Lost & Found**, '
        + '**Baggage Storage**, **Wheelchair Passenger Lounge**, deux '
        + '**Waiting Room**, un **Police Box**, **JR Highway Bus**, '
        + '**JR TOKAI TOURS Tōkyō Branch** et des **JR-Central Tickets** distincts '
        + 'des guichets JR East.',
      '**Aji no Sanpomichi** (味の散歩道), au nord-est.',
    ],
    works: 'Le plan porte « *There may be some changes due to construction work. '
      + 'As of May, 2026* », sans délimiter de zone. Tokyo est donc déclarée '
      + 'mouvante sans que le document dise où.',
    uncertain: [
      '⚠️ **Le côté Marunouchi manque.** Les feuilles fournies sont cadrées sur '
        + 'Yaesu : ni *Marunouchi Central Exit*, ni *Marunouchi North / South*, ni '
        + 'la halle de brique ne sont dans le champ. C’est précisément la tranche '
        + 'que le cahier des charges veut construire — elle reste à relever.',
      'La feuille **Sobu Line** n’a pas été fournie (cinq onglets sur six).',
      'Le plan date de **mai 2026**, trois mois avant la référence, et se déclare '
        + 'lui-même sujet à changement sans localiser le chantier.',
      'Les **noms japonais** ne sont pas sur cette édition anglaise : 丸の内中央口, '
        + '八重洲中央口, 日本橋口 restent à confirmer.',
      'Ni Tokyo Metro Marunouchi, ni les correspondances hors JR ne sont '
        + 'cartographiés.',
    ],
    tradeoff: 'La tranche visée reste le **Marunouchi Central**, mais elle n’est '
      + 'pas encore relevée : en l’état, le seul contrôle documenté et proche des '
      + 'voies 4-5 est côté **Yaesu**. Ce qui EST acquis et structurant : les '
      + 'trois passages transversaux nommés (Northern, Central, Southern), qui '
      + 'donnent la coupe de la gare ; les volées qui desservent **2F et B1F à la '
      + 'fois**, donc la double nappe ; et les **six lignes de contrôle vers le '
      + 'Shinkansen**, qui sont la vraie singularité de Tokyo — une gare où l’on '
      + 'franchit un 改札 pour passer d’un train à un autre. Représentés sans être '
      + 'visitables : Gransta en contrebas, les portails Shinkansen, les '
      + 'directions Keiyō et Sōbu (couloirs longs, en descente, qui se perdent), '
      + 'et le côté Marunouchi en perspective au bout du Central Passage.',
  },

  // ─── JY03 Akihabara ───────────────────────────────────────────────────
  // Trois feuilles, janvier 2026. Le seul plan du relevé qui écrive
  // « Inner Loop » / « Outer Loop » - c'est-à-dire la terminologie du jeu.
  2: {
    confidence: '`mostlyVerified` — sur un plan de **janvier** 2026',
    levels: [
      '**1F** — les trois groupes de portillons, alignés du nord au sud le long '
        + 'd’une bande étroite. C’est le niveau de la rue, sous le viaduc.',
      '**2F-M3** — les quais Yamanote et Keihin-Tōhoku, plus une mezzanine.',
      '**3F** — les quais de la **Chūō-Sōbu**, perpendiculaires.',
      '**La superposition est le sujet**, et le découpage même du document la '
        + 'donne : trois niveaux, trois orientations — la rue, le viaduc JR, et la '
        + 'Chūō-Sōbu en travers au-dessus.',
    ],
    gates: [
      '**Electric Town Gate** (電気街口) — au nord, avec *Tickets*, '
        + '*Fare Adjustment*, un SHOP et un comptoir de service.',
      '**Central Gate** (中央改札) — au milieu, avec ses *Tickets*, son '
        + '*Fare Adjustment*, un **Event Space** attenant, et le renvoi '
        + '« for Tsukuba Express ».',
      '**Shōwa-dōri Gate** (昭和通り改札) — au sud, dans un **bloc entièrement '
        + 'séparé** : sa propre zone payante, ses propres guichets, trois SHOP, et '
        + 'le renvoi « for Hibiya Line ».',
      'Ascenseurs **A à F** : A et B pour les quais JR, C à F pour la Chūō-Sōbu.',
    ],
    order: 'Les trois groupes se suivent du **nord au sud** sur une bande très '
      + 'étroite : Electric Town → Central → Shōwa-dōri. Le troisième est détaché '
      + 'des deux autres. Ce n’est pas un hall unique à trois portes : c’est une '
      + 'enfilade, et le Shōwa-dōri en est presque une gare à part.',
    tracks: 'Voie **2** = *Yamanote Line (**Inner Loop**) (for Ueno & Ikebukuro)* ; '
      + 'voie **3** = *Yamanote Line (**Outer Loop**) (for Tōkyō & Shinagawa)*. '
      + '**C’est le seul plan du relevé à écrire « Inner Loop » et « Outer Loop » '
      + 'en toutes lettres** — la terminologie exacte que le jeu emploie pour '
      + '内回り / 外回り. Voies **1** et **4** = Keihin-Tōhoku : chaque voie '
      + 'Yamanote partage son îlot avec une Keihin-Tōhoku, ce qui **confirme** '
      + '`sharedIsland` / `sharedWith: Keihin-Tōhoku`. Voies **5** et **6** = '
      + 'Chūō-Sōbu Local, au 3F, en travers.',
    transfers: [
      '**Tsukuba Express** — fléché depuis le *Central Gate*.',
      '**Tokyo Metro Hibiya** — fléché depuis le *Shōwa-dōri Gate*, à l’autre '
        + 'bout de la gare. Les deux correspondances sortent donc par des '
        + 'portillons **différents**, ce qui est exactement ce qui rend Akihabara '
        + 'illisible pour qui ne connaît pas.',
      '**Chūō-Sōbu** — correspondance interne JR, par les ascenseurs C à F et '
        + 'leurs volées, depuis les deux extrémités.',
    ],
    commerce: [
      '**ecute Akihabara** — *dans la zone payante* du 1F, entre les volées vers '
        + 'les voies 1&2 et 3&4, en aplat « large store inside the ticket gates ».',
      '**atre Akihabara 1** au nord et **atre Akihabara 2** au sud, contre le '
        + 'Shōwa-dōri Gate — deux bâtiments distincts, en emprise bâtie.',
      '**Event Space** — un espace nommé contre le Central Gate.',
      'Le dépôt déclarait `atre` pour Akihabara : confirmé, et il y en a **deux**.',
    ],
    works: 'Aucune zone de chantier signalée.',
    uncertain: [
      'Le plan date de **janvier 2026**, sept mois avant la référence.',
      'Les **noms japonais** ne sont pas sur cette édition anglaise : 電気街口, '
        + '中央改札, 昭和通り改札 restent à confirmer — ils sont toutefois déjà '
        + 'dans le dépôt pour le premier.',
      'Les feuilles **2F-M3** et **3F** n’ont pas été dépouillées en détail : le '
        + '1F suffit à établir la topologie des contrôles.',
    ],
    tradeoff: 'Tranche jouable autour de l’**Electric Town Gate**, comme le '
      + 'cahier des charges le demande, avec **ecute Akihabara** derrière les '
      + 'portillons pour donner l’échelle. Représentés sans être visitables : le '
      + '*Central Gate* et son Event Space en enfilade au sud, le *Shōwa-dōri '
      + 'Gate* plus loin encore (bloc séparé, panneau et perspective), les renvois '
      + '**Tsukuba Express** et **Hibiya** par deux portillons différents, et '
      + 'surtout la **Chūō-Sōbu au 3F** — visible en levant les yeux, atteinte par '
      + 'des volées qui montent et se perdent. **La verticalité prime sur la '
      + 'surface** : c’est une gare qu’on lit en coupe.',
  },

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

  // ─── JY07 Nippori ─────────────────────────────────────────────────────
  // Une feuille, avril 2025 : le plan le plus ancien du relevé. Il répond
  // malgré tout à presque tout ce que le cahier des charges demandait.
  6: {
    confidence: '`mostlyVerified` — sur un plan d’**avril 2025**, le plus ancien du relevé',
    levels: [
      '**1F** — les quais, et la *East Exit Square*.',
      '**2F** — le niveau des contrôles : celui de JR **et** celui du Keisei, '
        + 'côte à côte, avec ecute Nippori entre les deux. C’est un pont au-dessus '
        + 'du faisceau.',
      '**3F** — le **Nippori-Toneri Liner**, fléché mais non cartographié.',
      'Un **Free Passage (Over Tracks)** relie les deux côtés hors contrôle.',
    ],
    gates: [
      '**South Gate** et **North Gate** — les deux groupes JR.',
      '**Transfer to Keisei Line** — une ligne de contrôle *entre deux zones '
        + 'payantes*, avec son propre *Fare Adjustment (JR Line Transfer)* et ses '
        + '*Tickets (Keisei Line Transfer)*. Ce n’est pas une sortie : c’est un '
        + 'passage d’un exploitant à l’autre.',
      '**Keisei Line North Gate** — le contrôle propre du Keisei, plus loin, avec '
        + 'ses *Tickets (Keisei Line)* et sa *Concourse Area (Keisei Line)*.',
      'Ascenseurs **A à F**.',
    ],
    order: 'Deux brackets le long des quais : **South Gate** au sud, '
      + '**North Gate & Transfer to Keisei Line** au nord — le second couvrant à '
      + 'lui seul plus de la moitié de la longueur. La gare est donc franchement '
      + 'polarisée au nord, là où JR, Keisei et le Toneri Liner se superposent.',
    tracks: 'Voie **10** = Yamanote *for Ueno, Tōkyō, Shinagawa & Meguro* (外回り) ; '
      + 'voie **11** = Yamanote *for Ikebukuro, Shinjuku & Shibuya* (内回り). Voie '
      + '**9** = Keihin-Tōhoku vers Ueno, voie **12** = vers Tabata. Chaque voie '
      + 'Yamanote partage donc son îlot avec une Keihin-Tōhoku — îlots (9,10) et '
      + '(11,12) — ce qui **confirme** `sharedIsland` / `sharedWith: Keihin-Tōhoku`. '
      + 'Plus au sud, un troisième îlot : voies **3** et **4**, Jōban Rapid, Narita '
      + 'et Ueno-Tōkyō.',
    transfers: [
      '**Keisei** — deux lignes de contrôle en enfilade (Transfer, puis Keisei '
        + 'North Gate) et une *Concourse Area (Keisei Line)* cartographiée en gris.',
      '**Nippori-Toneri Liner** — au **3F**, fléché depuis le 2F et depuis la '
        + '*East Exit Square (1F)*. Trois niveaux d’exploitants empilés.',
    ],
    commerce: [
      '**ecute Nippori** — au 2F, entre le contrôle JR et le passage vers le '
        + 'Keisei. Le dépôt déclarait `ecute` pour Nippori sans pouvoir le situer ; '
        + 'c’est fait.',
      'Le plan ne nomme aucun autre commerce.',
    ],
    works: 'Aucune zone de chantier signalée.',
    uncertain: [
      '⚠️ **Le plan date d’avril 2025**, seize mois avant la date de référence. '
        + 'C’est le plus grand écart de tout le relevé.',
      'Le **West Exit** que le cahier des charges attend n’apparaît pas sous ce '
        + 'nom ; le document nomme *East Exit*, *East Exit Square* et le '
        + '*Free Passage*. À confirmer.',
      'Les **noms japonais** ne sont pas sur cette édition anglaise.',
      'Le niveau **3F** (Toneri Liner) est fléché mais pas cartographié.',
    ],
    tradeoff: '**Le dépôt avait raison de traiter Nippori à part** : ses '
      + 'ponts-concours SONT son niveau de correspondance, et le plan le confirme '
      + '— le 2F porte à la fois le contrôle JR, le passage Keisei et ecute, '
      + 'au-dessus du faisceau. Tranche jouable autour du **North Gate**, qui est '
      + 'le groupe long et celui qui donne sur tout le reste. Représentés sans '
      + 'être visitables : le *Transfer to Keisei* puis le *Keisei North Gate* en '
      + 'enfilade (deux exploitants qui se suivent), le **Toneri Liner au 3F** '
      + '(volée qui monte et se perd), le *Free Passage* hors contrôle, le '
      + '*South Gate* en perspective, et la *East Exit Square* aperçue en '
      + 'contrebas. **Aucun second pont-concours générique** ne doit être ajouté : '
      + 'la charpente signature existante EST ce niveau.',
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

  // ─── JY22 Meguro ──────────────────────────────────────────────────────
  21: {
    confidence: '`mostlyVerified` — sur un plan de **septembre 2025**',
    levels: [
      '**B1** — le quai Yamanote, **dans la tranchée** : un îlot unique.',
      '**1F** — le hall, **au-dessus** du quai : le *Central Gate*, sa zone libre '
        + 'et l’*East Exit*, encadrés par les deux blocs d’**atre 1**.',
      '**B3-B2** — Tōkyū Meguro, Namboku et Mita, sur une feuille distincte non '
        + 'dépouillée (hors périmètre JR). Leur existence à ce niveau **confirme** '
        + 'la coupe que le cahier des charges décrit : on monte du quai au hall, '
        + 'puis on **redescend** vers les trois autres lignes.',
    ],
    gates: [
      '**Central Gate** — au **1F**, avec *Tickets*, *Fare Adjustment* et '
        + 'l’ascenseur B qui plonge vers le quai.',
      'Le cadrage ne montre qu’un seul groupe ; un éventuel contrôle ouest n’est '
        + 'pas dans le champ.',
    ],
    order: 'Le quai est en tranchée, le hall est dessus, et **une seule volée** '
      + 'les relie dans le cadrage fourni. La gare est donc un **puits** : peu de '
      + 'surface, beaucoup de hauteur — ce que le cahier des charges annonçait.',
    tracks: 'Un **îlot unique** : *Yamanote Line (for Shibuya, Shinjuku & '
      + 'Ikebukuro)* d’un côté, *Yamanote Line (for Shinagawa, Tōkyō & Ueno)* de '
      + 'l’autre. Les deux sens se font face, ce qui **confirme** `config: island`. '
      + 'Aucune autre ligne ne partage ce quai.',
    transfers: [
      '**Tōkyū Meguro, Tokyo Metro Namboku, Toei Mita** — au **B3-B2**, donc '
        + '*sous* le quai JR. La correspondance descend.',
    ],
    commerce: [
      '**atre 1** — deux blocs encadrant la zone libre du 1F. Le dépôt déclarait '
        + '`atre` pour Meguro : confirmé.',
      '**NewDays** et un **SHOP** sur le quai lui-même.',
    ],
    works: 'Aucune zone de chantier signalée.',
    uncertain: [
      'Le plan date de **septembre 2025**.',
      'Le cadrage ne montre **qu’un seul groupe de portillons** (Central Gate) et '
        + 'une seule sortie nommée (*East Exit*) ; un côté ouest éventuel n’est '
        + 'pas dans le champ.',
      'La feuille **B3-B2** n’a pas été dépouillée.',
      'Les **noms japonais** ne sont pas sur cette édition anglaise.',
    ],
    tradeoff: 'Tranche jouable **verticale** : du quai en tranchée (B1) on monte '
      + 'au *Central Gate* (1F), on ressort côté *East Exit*, et l’on voit '
      + 'repartir vers le bas les volées des trois autres lignes. **Le puits et '
      + 'l’enchaînement montée-puis-descente sont le sujet** ; la surface au sol '
      + 'ne l’est pas. Représentés sans être visitables : la descente vers '
      + 'Tōkyū / Namboku / Mita (volées qui plongent, signalétique à trois '
      + 'couleurs), les deux blocs d’**atre 1** en façades, et la tranchée '
      + 'elle-même vue depuis le hall.',
  },

  // ─── JY25 Shinagawa ───────────────────────────────────────────────────
  // Juillet 2026 - la deuxième date la plus proche - mais un cadrage panoramé
  // vers le sud qui laisse les voies Yamanote hors champ.
  24: {
    confidence: '`approximate` — plan de **juillet 2026**, mais **cadré hors des voies Yamanote**',
    levels: [
      '**1F** — les quais : voies 4 à 15 pour les lignes classiques, 21 à 24 pour '
        + 'le Shinkansen. Les voies **1 à 3 sont hors du cadrage**.',
      '**2F** — le **hall-passerelle**, et c’est bien une passerelle : une bande '
        + 'libre (le passage public) court du nord au sud, et les zones payantes '
        + 'la bordent **des deux côtés**. On traverse la gare sans jamais entrer.',
    ],
    gates: [
      '**North Gate** — relevé, au 2F, sur le flanc est du passage.',
      '**Kōnan Exit (East Exit)** — le débouché est, au bout du passage libre.',
      '**Contrôles Shinkansen** : *for Tōkaidō Shinkansen (South)*, '
        + '*for Tōkaidō Shinkansen (North)* et *Tōkaidō Shinkansen Transfer '
        + '(North)*. Comme à Tokyo, passer au Shinkansen demande de franchir un '
        + 'second 改札.',
      '⚠️ Le **Central Gate** — la tranche que le cahier des charges vise — '
        + '**n’est pas dans le cadrage fourni**.',
    ],
    order: 'Le passage libre du 2F est l’ossature : orienté nord-sud, il porte le '
      + '*Kōnan Exit* à un bout et se prolonge vers Takanawa à l’autre, avec les '
      + 'zones payantes en bordure. La « immense longueur du hall » que le cahier '
      + 'des charges décrit est bien là, et elle est **libre**, pas payante.',
    tracks: 'Les voies **1 et 2** (Yamanote) sont **hors cadrage**. Le document '
      + 'commence à la voie 4 : Keihin-Tōhoku vers Tōkyō (4) et vers Yokohama (5), '
      + 'Ueno-Tōkyō (6, 7, 9, 10, 11), **8 = « Extra Platform »**, Tōkaidō (12), '
      + 'Sōbu Rapid (13, 14), Yokosuka (15), Tōkaidō・Sanyō Shinkansen (21-24). '
      + 'Ce document **n’établit donc pas** l’affectation des voies Yamanote.',
    transfers: [
      '**Shinkansen** — trois lignes de contrôle relevées.',
      '**Keikyū** — *absent du cadrage fourni*. Le cahier des charges l’attend ; '
        + 'ce document ne l’établit pas.',
    ],
    commerce: [
      '**ecute Shinagawa**, avec deux renvois « for ecute (2F) » — la galerie est '
        + 'dessinée dans l’aplat des grands commerces, sur le flanc ouest du '
        + 'passage.',
      '**Mizunone Plaza** (水の音広場) — une place nommée, dans la zone payante ouest.',
      '**atre** — trois blocs, en emprise bâtie, au sud et à l’est.',
      '**Safety monument** (安全の碑), au niveau des quais : un repère nommé.',
      'KIOSK et SHOP répartis le long des deux zones payantes.',
    ],
    works: 'Beaucoup de chantier : au moins **sept zones « Under Construction »** '
      + 'sur la feuille des quais et une sur celle du hall. Plan daté '
      + '« *As of July, 2026* ».',
    uncertain: [
      '⚠️ **Le cadrage manque l’essentiel pour ce jeu.** Voies 1-2 (Yamanote), '
        + '**Central Gate**, côté **Takanawa** : tout cela est hors champ sur les '
        + 'deux feuilles. La confiance reste donc `approximate` malgré une date '
        + 'excellente.',
      'Le **Keikyū** n’apparaît pas.',
      'Les **noms japonais** ne sont pas sur cette édition anglaise.',
    ],
    tradeoff: 'Ce qui est **acquis** et utilisable dès maintenant : la forme du '
      + 'hall — un passage **libre** nord-sud bordé de zones payantes des deux '
      + 'côtés, ce qui est l’inverse d’un couloir payant et change tout le '
      + 'dessin ; l’opposition *Kōnan* (est) / *Takanawa* (ouest) portée par ce '
      + 'passage ; **ecute Shinagawa** et **Mizunone Plaza** côté ouest ; les '
      + 'trois contrôles Shinkansen ; le chantier omniprésent. Ce qui **attend un '
      + 'nouveau cadrage** : le Central Gate, donc la tranche principale, et '
      + 'l’affectation des voies Yamanote.',
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
