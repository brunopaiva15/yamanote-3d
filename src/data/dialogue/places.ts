// Les gares, et le quai.
//
// Une réplique attachée à un lieu vaut dix répliques génériques : entendre
// parler du marché d'Ameyoko en arrivant à Okachimachi, ou de la statue du
// chien juste avant Shibuya, c'est ce qui donne à la boucle trente visages
// plutôt qu'un seul.
//
// La condition `station` vaut pour la gare vers laquelle on roule COMME pour
// celle dont le quai est là (voir data/dialogue/types) : la même réplique
// sert donc à l'approche et à l'arrêt. Les index suivent STATIONS —
// 0 = JY01 Tokyo, 29 = JY30 Yūrakuchō.

import type { DialogueEntry } from './types';

export const DIALOGUE_PLACES: readonly DialogueEntry[] = [
  // ——— Les trente gares ———
  {
    id: 'pl.tokyo',
    when: { station: [0] },
    lines: [
      {
        t: {
          fr: 'À {next}, levez les yeux en sortant. La façade en brique a cent ans.',
          en: 'At {next}, look up on your way out. That brick front is a hundred years old.',
          ja: '{next}では出るときに見上げてください。あの赤レンガ、百年ものです。',
        },
      },
    ],
  },
  {
    id: 'pl.tokyo.shinkansen',
    when: { station: [0] },
    lines: [
      {
        t: {
          fr: 'Les shinkansen partent d’en dessous. On les sent passer sous les pieds.',
          en: 'The bullet trains leave from below. You feel them go under your feet.',
          ja: '新幹線は下から出ます。足元を通るのが分かりますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.kanda',
    when: { station: [1] },
    lines: [
      {
        t: {
          fr: 'Sous le viaduc de {next}, il y a des izakaya vieux de soixante ans.',
          en: 'Under the viaduct at {next} there are izakaya sixty years old.',
          ja: '{next}のガード下には、六十年やってる居酒屋がありますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.akihabara',
    when: { station: [2] },
    lines: [
      {
        t: {
          fr: 'À {next}, il y a un immeuble entier de composants électroniques. Huit étages.',
          en: 'At {next} there is a whole building of electronic parts. Eight floors.',
          ja: '{next}には電子部品だけのビルがあります。八階建てです。',
        },
      },
    ],
  },
  {
    id: 'pl.akihabara.change',
    when: { station: [2], senior: true },
    lines: [
      {
        t: {
          fr: 'Je venais y acheter des radios. Maintenant je n’y comprends plus rien.',
          en: 'I used to buy radios there. Now I understand none of it.',
          ja: '昔はラジオを買いに行ったものです。今はもう何も分かりません。',
        },
      },
    ],
  },
  {
    id: 'pl.okachimachi',
    when: { station: [3] },
    lines: [
      {
        t: {
          fr: 'Le marché d’Ameyoko commence à la sortie. On y crie encore les prix.',
          en: 'The Ameyoko market starts right at the exit. They still shout the prices.',
          ja: 'アメ横は改札を出てすぐです。今でも値段を叫んでますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.ueno',
    when: { station: [4] },
    lines: [
      {
        t: {
          fr: 'Le parc de {next} a les musées, le zoo, et les cerisiers en avril.',
          en: '{next} park has the museums, the zoo, and the cherry trees in April.',
          ja: '{next}公園には美術館も動物園も、四月には桜もあります。',
        },
      },
    ],
  },
  {
    id: 'pl.ueno.north',
    when: { station: [4] },
    lines: [
      {
        t: {
          fr: 'C’est d’ici que partent les trains du nord. Toute une vie de départs.',
          en: 'The northbound trains leave from here. A whole lifetime of departures.',
          ja: 'ここから北へ向かう列車が出ます。旅立ちの駅ですね。',
        },
      },
    ],
  },
  {
    id: 'pl.uguisudani',
    when: { station: [5] },
    lines: [
      {
        t: {
          fr: 'C’est la gare la moins fréquentée de la boucle. On y est presque tranquille.',
          en: 'That is the quietest station on the loop. Almost peaceful.',
          ja: '山手線でいちばん利用者が少ない駅です。妙に落ち着きますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.nippori',
    when: { station: [6] },
    lines: [
      {
        t: {
          fr: 'À {next}, il y a une rue entière de marchands de tissu. Un kilomètre.',
          en: 'At {next} there is a whole street of fabric shops. A full kilometre.',
          ja: '{next}には生地屋だけの通りがあります。一キロ続きます。',
        },
      },
    ],
  },
  {
    id: 'pl.nippori.narita',
    when: { station: [6] },
    lines: [
      {
        t: {
          fr: 'C’est là qu’on prend le train pour l’aéroport. Trente-six minutes.',
          en: 'That is where you catch the airport train. Thirty-six minutes.',
          ja: '空港行きはここから出ます。三十六分ですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.nishinippori',
    when: { station: [7] },
    lines: [
      {
        t: {
          fr: 'Cette gare n’existe que pour les correspondances. Elle a été ajoutée après.',
          en: 'That station exists only for the transfers. It was added later.',
          ja: 'あの駅は乗り換えのためだけにできたんです。後から追加された駅で。',
        },
      },
    ],
  },
  {
    id: 'pl.tabata',
    when: { station: [8] },
    lines: [
      {
        t: {
          fr: 'Des écrivains vivaient sur cette colline. Il en reste des plaques.',
          en: 'Writers used to live up that hill. There are still plaques for them.',
          ja: 'あの丘には文士が住んでたんです。今も記念の碑がありますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.komagome',
    when: { station: [9] },
    lines: [
      {
        t: {
          fr: 'Il y a un jardin près de {next}. Le plus beau de Tokyo, à mon avis.',
          en: 'There is a garden near {next}. The finest in Tokyo, to my mind.',
          ja: '{next}の近くに庭園があります。東京でいちばん美しいと思いますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.sugamo',
    when: { station: [10] },
    lines: [
      {
        t: {
          fr: 'On appelle {next} le Harajuku des grands-mères. Elles y font la loi.',
          en: 'They call {next} the Harajuku of grandmothers. They run the place.',
          ja: '{next}は「おばあちゃんの原宿」です。あそこは彼女たちの町ですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.sugamo.red',
    when: { station: [10], senior: true },
    lines: [
      {
        t: {
          fr: 'On y vend des sous-vêtements rouges. Ça porte chance, paraît-il.',
          en: 'They sell red underwear there. It brings luck, they say.',
          ja: '赤い下着を売ってましてね。縁起がいいそうですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.otsuka',
    when: { station: [11] },
    lines: [
      {
        t: {
          fr: 'Il reste un tramway à {next}. Le dernier de Tokyo, ou presque.',
          en: 'There is still a tram at {next}. The last one in Tokyo, near enough.',
          ja: '{next}には都電が残ってます。東京で最後の路面電車です。',
        },
      },
    ],
  },
  {
    id: 'pl.ikebukuro',
    when: { station: [12] },
    lines: [
      {
        t: {
          fr: 'À {next}, rendez-vous devant la chouette. Tout le monde se retrouve là.',
          en: 'At {next}, meet by the owl. Everybody meets by the owl.',
          ja: '{next}なら、いけふくろうの前です。待ち合わせはみんなあそこ。',
        },
      },
    ],
  },
  {
    id: 'pl.ikebukuro.exits',
    when: { station: [12] },
    lines: [
      {
        t: {
          fr: 'Sortie est, sortie ouest. Prenez la mauvaise et vous marcherez vingt minutes.',
          en: 'East exit, west exit. Take the wrong one and it is a twenty-minute walk.',
          ja: '東口と西口、間違えると二十分歩くことになります。',
        },
      },
    ],
  },
  {
    id: 'pl.mejiro',
    when: { station: [13] },
    lines: [
      {
        t: {
          fr: '{next} n’a qu’une sortie. Une seule, sur toute la ligne.',
          en: '{next} has one exit. Just the one, on the whole line.',
          ja: '{next}は出口がひとつだけです。この線で唯一ですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.takadanobaba',
    when: { station: [14] },
    lines: [
      {
        t: {
          fr: 'La mélodie de {next} vient d’un dessin animé. Tout le monde la reconnaît.',
          en: 'The jingle at {next} comes from a cartoon. Everybody knows it.',
          ja: '{next}の発車メロディはアニメの曲です。みんな分かりますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.takadanobaba.students',
    when: { station: [14], archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Toute la fac descend ici. Regardez le quai dans dix secondes.',
          en: 'The whole university gets off here. Watch the platform in ten seconds.',
          ja: '大学生はみんなここで降ります。十秒後のホーム、見ててください。',
        },
      },
    ],
  },
  {
    id: 'pl.shinokubo',
    when: { station: [15] },
    lines: [
      {
        t: {
          fr: 'À {next}, la rue sent le poulet frit et le sucre. Toute la journée.',
          en: 'At {next} the street smells of fried chicken and sugar. All day.',
          ja: '{next}の通りは一日中、チキンと砂糖の匂いがします。',
        },
      },
    ],
  },
  {
    id: 'pl.shinjuku',
    when: { station: [16] },
    lines: [
      {
        t: {
          fr: '{next} est la gare la plus fréquentée du monde. Deux cents sorties.',
          en: '{next} is the busiest station in the world. Two hundred exits.',
          ja: '{next}は世界一利用者が多い駅です。出口は二百以上あります。',
        },
      },
    ],
  },
  {
    id: 'pl.shinjuku.lost',
    when: { station: [16] },
    lines: [
      {
        t: {
          fr: 'Ne cherchez pas à comprendre {next}. Suivez juste les panneaux.',
          en: 'Do not try to understand {next}. Just follow the signs.',
          ja: '{next}は理解しようとしないでください。案内板に従うだけです。',
        },
      },
      {
        t: {
          fr: 'Moi j’y travaille depuis huit ans et je me trompe encore de sortie.',
          en: 'I have worked there eight years and I still take the wrong exit.',
          ja: '八年通ってますけど、いまだに出口を間違えます。',
        },
        gap: 0.5,
      },
    ],
  },
  {
    id: 'pl.yoyogi',
    when: { station: [17] },
    lines: [
      {
        t: {
          fr: '{next} est minuscule pour un endroit pareil. Le parc est juste derrière.',
          en: '{next} is tiny for such a place. The park is right behind it.',
          ja: '{next}はあの立地にしては小さい駅です。公園はすぐ裏ですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.harajuku',
    when: { station: [18] },
    lines: [
      {
        t: {
          fr: 'À {next}, deux mondes se touchent : la rue Takeshita et un sanctuaire dans les arbres.',
          en: 'At {next} two worlds meet: Takeshita street, and a shrine in the trees.',
          ja: '{next}では二つの世界が隣り合ってます。竹下通りと、森の中の神宮と。',
        },
      },
    ],
  },
  {
    id: 'pl.harajuku.old',
    when: { station: [18], senior: true },
    lines: [
      {
        t: {
          fr: 'L’ancienne gare était en bois. Ils l’ont remplacée. C’était la plus jolie.',
          en: 'The old station was wooden. They replaced it. It was the prettiest one.',
          ja: '昔の駅舎は木造でした。建て替えられましたけど、いちばん綺麗でしたよ。',
        },
      },
    ],
  },
  {
    id: 'pl.shibuya',
    when: { station: [19] },
    lines: [
      {
        t: {
          fr: 'À {next}, trois mille personnes traversent d’un coup. Et personne ne se touche.',
          en: 'At {next} three thousand people cross at once. Nobody touches anybody.',
          ja: '{next}のスクランブルは一度に三千人渡ります。誰もぶつかりませんけどね。',
        },
      },
    ],
  },
  {
    id: 'pl.shibuya.dog',
    when: { station: [19] },
    lines: [
      {
        t: {
          fr: 'Le chien de bronze attend toujours devant la sortie. Depuis quatre-vingt-dix ans.',
          en: 'The bronze dog is still waiting by the exit. Ninety years now.',
          ja: '銅像の犬は今も改札の前で待ってます。九十年ですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.ebisu',
    when: { station: [20] },
    lines: [
      {
        t: {
          fr: '{next} doit son nom à une bière. La brasserie était juste là.',
          en: '{next} is named after a beer. The brewery stood right there.',
          ja: '{next}はビールの名前が駅名になったんです。工場がそこにあったので。',
        },
      },
    ],
  },
  {
    id: 'pl.meguro',
    when: { station: [21] },
    lines: [
      {
        t: {
          fr: 'La gare de {next} n’est pas dans l’arrondissement de {next}. Personne ne sait pourquoi.',
          en: '{next} station is not in {next} ward. Nobody knows why.',
          ja: '{next}駅は{next}区にないんです。理由は誰も知りません。',
        },
      },
    ],
  },
  {
    id: 'pl.meguro.river',
    when: { station: [21], months: [3, 4] },
    lines: [
      {
        t: {
          fr: 'La rivière est bordée de cerisiers. En avril, on n’y avance plus.',
          en: 'The river is lined with cherry trees. In April you cannot move there.',
          ja: '目黒川沿いは桜並木です。四月は歩けたものじゃありません。',
        },
      },
    ],
  },
  {
    id: 'pl.gotanda',
    when: { station: [22] },
    lines: [
      {
        t: {
          fr: '{next}, c’est des bureaux et une rivière. Rien d’autre, et c’est très bien.',
          en: '{next} is offices and a river. Nothing else, and that suits it.',
          ja: '{next}はオフィスと川だけです。それ以上何もないのがいいんですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.osaki',
    when: { station: [23] },
    lines: [
      {
        t: {
          fr: 'Certaines rames s’arrêtent là et ne repartent pas. {next} est un terminus caché.',
          en: 'Some trains stop there and go no further. {next} is a hidden terminus.',
          ja: '{next}止まりの電車もあるんです。隠れた終着駅ですね。',
        },
      },
    ],
  },
  {
    id: 'pl.osaki.towers',
    when: { station: [23], senior: true },
    lines: [
      {
        t: {
          fr: 'Il y avait des usines ici. Maintenant ce sont des tours de bureaux.',
          en: 'There were factories here. Now it is all office towers.',
          ja: 'ここは工場地帯でした。今はオフィスビルばかりです。',
        },
      },
    ],
  },
  {
    id: 'pl.shinagawa',
    when: { station: [24] },
    lines: [
      {
        t: {
          fr: 'La gare de {next} n’est pas non plus dans l’arrondissement de {next}. C’est une tradition.',
          en: '{next} station is not in {next} ward either. It is something of a tradition.',
          ja: '{next}駅も{next}区にありません。そういう伝統みたいなものです。',
        },
      },
    ],
  },
  {
    id: 'pl.shinagawa.corridor',
    when: { station: [24], hours: [7, 10] },
    lines: [
      {
        t: {
          fr: 'Le matin, le couloir de correspondance de {next} est un fleuve. On ne s’arrête pas.',
          en: 'In the morning the {next} concourse is a river. You do not stop walking.',
          ja: '朝の{next}の通路は川ですよ。立ち止まれません。',
        },
      },
    ],
  },
  {
    id: 'pl.takanawa',
    when: { station: [25] },
    lines: [
      {
        t: {
          fr: '{next} est la plus jeune gare de la ligne. Le toit est en bois clair.',
          en: '{next} is the newest station on the line. The roof is pale timber.',
          ja: '{next}はこの線でいちばん新しい駅です。屋根が白木なんですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.takanawa.empty',
    when: { station: [25] },
    lines: [
      {
        t: {
          fr: 'Elle est encore à moitié vide. On entend ses propres pas.',
          en: 'It is still half empty. You can hear your own footsteps.',
          ja: 'まだ半分空っぽです。自分の足音が聞こえますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.tamachi',
    when: { station: [26] },
    lines: [
      {
        t: {
          fr: 'Toute une université descend à {next}. Puis la gare redevient calme.',
          en: 'A whole university gets off at {next}. Then it goes quiet again.',
          ja: '{next}では大学生が一斉に降ります。その後は急に静かになります。',
        },
      },
    ],
  },
  {
    id: 'pl.hamamatsucho',
    when: { station: [27] },
    lines: [
      {
        t: {
          fr: 'Le monorail de l’aéroport part de {next}. Il passe au-dessus de l’eau.',
          en: 'The airport monorail leaves from {next}. It runs out over the water.',
          ja: '{next}からモノレールが出ます。海の上を走るんですよ。',
        },
      },
    ],
  },
  {
    id: 'pl.hamamatsucho.statue',
    when: { station: [27] },
    lines: [
      {
        t: {
          fr: 'Il y a une petite statue sur le quai. On l’habille selon la saison.',
          en: 'There is a little statue on the platform. They dress it for the season.',
          ja: 'ホームに小さな像があるんです。季節ごとに服を着せてもらってます。',
        },
      },
    ],
  },
  {
    id: 'pl.shimbashi',
    when: { station: [28] },
    lines: [
      {
        t: {
          fr: 'Le tout premier train du pays partait de {next}. Il y a une locomotive sur la place.',
          en: 'The country’s first train left from {next}. There is a locomotive on the square.',
          ja: '日本最初の鉄道は{next}から出ました。広場に蒸気機関車がありますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.shimbashi.salaryman',
    when: { station: [28], hours: [17, 23] },
    lines: [
      {
        t: {
          fr: 'À {next}, on interviewe les salarymen à la sortie. Depuis toujours.',
          en: 'At {next} they interview salarymen outside the exit. They always have.',
          ja: '{next}では駅前でサラリーマンにインタビューしてますね。昔からです。',
        },
      },
    ],
  },
  {
    id: 'pl.yurakucho',
    when: { station: [29] },
    lines: [
      {
        t: {
          fr: 'Sous les voies de {next}, les bars sont serrés les uns contre les autres.',
          en: 'Under the tracks at {next} the bars are wedged side by side.',
          ja: '{next}のガード下は、飲み屋がぎっしり並んでます。',
        },
      },
    ],
  },
  {
    id: 'pl.yurakucho.ginza',
    when: { station: [29] },
    lines: [
      {
        t: {
          fr: 'Ginza est à cinq minutes à pied. Le quartier change à mi-chemin.',
          en: 'Ginza is five minutes on foot. The neighbourhood changes halfway.',
          ja: '銀座までは歩いて五分です。途中で街の顔が変わりますよ。',
        },
      },
    ],
  },

  // ——— Le quai ———
  {
    id: 'pl.plat.line',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Restez derrière la ligne jaune. Le souffle de la rame surprend.',
          en: 'Stay behind the yellow line. The rush of air catches you out.',
          ja: '黄色い線の内側にお願いします。風がけっこう来ますよ。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.wait',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Deux minutes trente d’attente. C’est le maximum sur cette ligne.',
          en: 'Two and a half minutes to wait. That is as long as it gets on this line.',
          ja: '待っても二分半です。この線はそれが最長ですから。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.queue',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Les marques au sol indiquent où se mettre. Personne ne les discute.',
          en: 'The marks on the ground tell you where to stand. Nobody argues with them.',
          ja: '足元の印のところに並ぶんです。誰も文句を言いません。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.express',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Celui qui arrive ne s’arrête pas. Reculez d’un pas.',
          en: 'The one coming in does not stop here. Take a step back.',
          ja: '今来るのは通過です。一歩下がってください。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.wind',
    when: { place: 'platform', months: [12, 1, 2] },
    lines: [
      {
        t: {
          fr: 'Il n’y a rien de plus froid qu’un quai en janvier. Rien.',
          en: 'Nothing is colder than a platform in January. Nothing.',
          ja: '一月のホームより寒いものはありません。本当に。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.stairs',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Montez par cet escalier-là. L’autre débouche du mauvais côté.',
          en: 'Take that staircase. The other one comes out on the wrong side.',
          ja: 'その階段を使ってください。もう片方は反対側に出ちゃいます。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.bench',
    when: { place: 'platform', senior: true },
    lines: [
      {
        t: {
          fr: 'J’attends deux rames de plus pour avoir une place assise. J’ai le temps.',
          en: 'I let two trains go so I can sit down. I have the time.',
          ja: '座りたいので二本見送ります。時間はありますから。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.kiosk',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Le distributeur du bout a du thé chaud. C’est le seul du quai.',
          en: 'The machine at the far end has hot tea. Only one on the platform.',
          ja: '端の自販機は温かいお茶があります。ホームでそこだけです。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.announce',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Quand la voix change de ton, c’est que la rame entre. On l’entend avant de la voir.',
          en: 'When the voice changes tone, the train is coming in. You hear it before you see it.',
          ja: 'アナウンスの調子が変わったら入線です。見えるより先に分かります。',
        },
      },
    ],
  },
  {
    id: 'pl.plat.otherside',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'De l’autre côté, c’est le sens inverse. Même ligne, même boucle.',
          en: 'The other side goes the other way round. Same line, same loop.',
          ja: '向かいは逆回りです。同じ線の、同じ環です。',
        },
      },
    ],
  },
];
