// Tokyo, vue depuis le train.
//
// Le wagon n'est qu'un point d'observation : ce dont les gens parlent vraiment,
// c'est de ce qui les attend en bas des escaliers. Le loyer, les cigales, le
// konbini du coin, le typhon de jeudi, le distributeur qui rend la monnaie en
// pièces de cinq cents.

import type { DialogueEntry } from './types';

export const DIALOGUE_CITY: readonly DialogueEntry[] = [
  // --- Vivre ici ---
  {
    id: 'ct.rent',
    lines: [
      {
        t: {
          fr: 'Mon appartement fait dix-huit mètres carrés. À l’intérieur de la boucle, c’est déjà beaucoup.',
          en: 'My flat is eighteen square metres. Inside the loop, that is generous.',
          ja: 'うちは十八平米です。山手線の内側にしては広い方ですよ。',
        },
      },
    ],
  },
  {
    id: 'ct.commute',
    when: { hours: [6, 10] },
    lines: [
      {
        t: {
          fr: 'Une heure vingt de trajet, deux fois par jour. Ça fait un mois par an, debout.',
          en: 'An hour twenty each way, twice a day. That is a month a year, standing up.',
          ja: '片道一時間二十分、往復で。年に一か月は立って過ごしてる計算です。',
        },
      },
    ],
  },
  {
    id: 'ct.konbini',
    lines: [
      {
        t: {
          fr: 'Il y a trois konbini entre la gare et chez moi. Trois, sur quatre cents mètres.',
          en: 'There are three convenience stores between the station and my door. Three, in four hundred metres.',
          ja: '駅から家まで四百メートルにコンビニが三軒あります。三軒です。',
        },
      },
    ],
  },
  {
    id: 'ct.vending',
    lines: [
      {
        t: {
          fr: 'Le distributeur du coin vend du café chaud en hiver et glacé en été. Même machine.',
          en: 'The machine on my corner sells hot coffee in winter and iced in summer. Same machine.',
          ja: '角の自販機は冬は温かい缶、夏は冷たい缶です。同じ機械で。',
        },
      },
    ],
  },
  {
    id: 'ct.crows',
    when: { hours: [5, 9] },
    lines: [
      {
        t: {
          fr: 'Les corbeaux passent avant les éboueurs. Ils connaissent le jour du ramassage.',
          en: 'The crows get there before the bin lorry. They know the collection day.',
          ja: 'カラスは収集車より先に来ます。曜日を覚えてるんですよ。',
        },
      },
    ],
  },
  {
    id: 'ct.cicadas',
    when: { months: [7, 8] },
    lines: [
      {
        t: {
          fr: 'Les cigales couvrent le bruit du train quand on ouvre les portes. En août seulement.',
          en: 'The cicadas drown out the train when the doors open. August only.',
          ja: '八月はドアが開くと蝉の声で電車の音が消えます。',
        },
      },
    ],
  },
  {
    id: 'ct.quake',
    lines: [
      {
        t: {
          fr: 'On a tremblé mardi soir. La rame s’arrête toute seule, et on attend.',
          en: 'There was a tremor on Tuesday night. The train stops itself, and you wait.',
          ja: '火曜の夜に揺れましたね。電車は自動で止まって、あとは待つだけです。',
        },
      },
    ],
  },
  {
    id: 'ct.umbrella.plastic',
    when: { months: [6, 7, 9, 10] },
    lines: [
      {
        t: {
          fr: 'Tout le monde a le même parapluie transparent. On les échange sans le savoir.',
          en: 'Everyone has the same clear umbrella. We swap them without noticing.',
          ja: 'みんな同じビニール傘です。知らないうちに交換されてますよ。',
        },
      },
    ],
  },
  {
    id: 'ct.trash',
    lines: [
      {
        t: {
          fr: 'Il n’y a pas de poubelles dans les rues. On rentre chez soi avec ses déchets.',
          en: 'There are no bins in the streets. You take your rubbish home.',
          ja: '街にゴミ箱はありません。ゴミは持ち帰るんです。',
        },
      },
    ],
  },
  {
    id: 'ct.bicycle',
    lines: [
      {
        t: {
          fr: 'J’ai laissé mon vélo devant la gare. Il sera à la fourrière ce soir.',
          en: 'I left my bike outside the station. It will be impounded by tonight.',
          ja: '駅前に自転車を置いてきました。夜には撤去されてるでしょうね。',
        },
      },
    ],
  },

  // --- Manger ---
  {
    id: 'ct.ramen',
    when: { hours: [11, 15] },
    lines: [
      {
        t: {
          fr: 'Il y a un comptoir de dix places près de la sortie ouest. On mange debout, en huit minutes.',
          en: 'There is a ten-seat counter by the west exit. You eat standing, in eight minutes.',
          ja: '西口にカウンター十席の店があります。立ち食いで八分です。',
        },
      },
    ],
  },
  {
    id: 'ct.ramen.queue',
    lines: [
      {
        t: {
          fr: 'Vingt minutes de queue pour un bol. Ça vaut le coup, c’est le problème.',
          en: 'Twenty minutes queueing for one bowl. It is worth it, that is the trouble.',
          ja: '一杯のために二十分並びます。おいしいのが困りものです。',
        },
      },
    ],
  },
  {
    id: 'ct.onigiri',
    when: { hours: [6, 10] },
    lines: [
      {
        t: {
          fr: 'L’emballage des onigiri se déplie en trois gestes. J’ai mis huit ans à comprendre.',
          en: 'A rice ball wrapper opens in three moves. It took me eight years to work it out.',
          ja: 'おにぎりの包みは三手で開きます。理解するのに八年かかりました。',
        },
      },
    ],
  },
  {
    id: 'ct.depachika',
    lines: [
      {
        t: {
          fr: 'Au sous-sol des grands magasins, tout est beau et rien n’est donné.',
          en: 'In the department store basements everything is beautiful and nothing is cheap.',
          ja: 'デパ地下はどれも美しくて、どれも高いです。',
        },
      },
    ],
  },
  {
    id: 'ct.izakaya',
    when: { hours: [18, 24] },
    lines: [
      {
        t: {
          fr: 'On y va à cinq, on commande pour douze. C’est la règle.',
          en: 'Five of us go, we order for twelve. That is the rule.',
          ja: '五人で行って十二人分頼みます。それが決まりです。',
        },
      },
    ],
  },
  {
    id: 'ct.coffee',
    lines: [
      {
        t: {
          fr: 'Il reste des cafés à l’ancienne, avec les fauteuils rouges. De moins en moins.',
          en: 'There are still old-style coffee houses, with the red armchairs. Fewer each year.',
          ja: '赤いソファの昔ながらの喫茶店、まだあります。年々減ってますけど。',
        },
      },
    ],
  },
  {
    id: 'ct.standing.bar',
    when: { hours: [17, 23], station: [28, 29] },
    lines: [
      {
        t: {
          fr: 'Le bar debout sous le viaduc n’a pas de chaises. On y reste plus longtemps qu’assis.',
          en: 'The standing bar under the viaduct has no chairs. You stay longer than if you sat.',
          ja: 'ガード下の立ち飲み屋には椅子がありません。座るより長居しますけどね。',
        },
      },
    ],
  },
  {
    id: 'ct.melon.bread',
    when: { archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'La boulangerie du quai sort ses pains à seize heures. Il faut être là.',
          en: 'The platform bakery brings the bread out at four. You have to be there.',
          ja: 'ホームのパン屋は十六時に焼き上がります。その時間にいないと。',
        },
      },
    ],
  },

  // --- Les quartiers ---
  {
    id: 'ct.west.east',
    lines: [
      {
        t: {
          fr: 'L’ouest de la boucle est riche, l’est est vieux. C’est plus compliqué que ça, évidemment.',
          en: 'The west of the loop is rich, the east is old. It is more complicated than that, obviously.',
          ja: '西側は裕福で東側は古い、と言われます。もちろんそんな単純じゃありませんけど。',
        },
      },
    ],
  },
  {
    id: 'ct.shitamachi',
    when: { station: [3, 4, 5, 6, 7] },
    lines: [
      {
        t: {
          fr: 'Par ici, on est dans la ville basse. Les rues sont plus étroites et les gens plus bavards.',
          en: 'Round here you are in the low town. Narrower streets, chattier people.',
          ja: 'この辺りは下町です。道が狭くて、人がよく喋ります。',
        },
      },
    ],
  },
  {
    id: 'ct.towers',
    when: { station: [16, 19, 23, 24] },
    lines: [
      {
        t: {
          fr: 'Ces tours n’étaient pas là il y a dix ans. Aucune d’elles.',
          en: 'None of those towers were here ten years ago. Not one.',
          ja: 'あのビル群、十年前は一本もありませんでした。',
        },
      },
    ],
  },
  {
    id: 'ct.river.walk',
    when: { weekend: true },
    lines: [
      {
        t: {
          fr: 'Je longe la rivière à pied le dimanche. Ça fait deux gares, tranquillement.',
          en: 'I walk along the river on Sundays. It is two stations, taken slowly.',
          ja: '日曜は川沿いを歩きます。のんびり二駅分です。',
        },
      },
    ],
  },
  {
    id: 'ct.shrine',
    lines: [
      {
        t: {
          fr: 'Il y a un petit sanctuaire coincé entre deux immeubles. On passe devant sans le voir.',
          en: 'There is a tiny shrine wedged between two buildings. You walk past without seeing it.',
          ja: 'ビルの間に小さな神社があるんです。気づかずに通り過ぎますよ。',
        },
      },
    ],
  },
  {
    id: 'ct.park',
    when: { weekend: true, hours: [9, 17] },
    lines: [
      {
        t: {
          fr: 'Le parc est plein de gens qui répètent des instruments. Chacun dans son coin.',
          en: 'The park is full of people practising instruments. Each in their own corner.',
          ja: '公園は楽器を練習する人だらけです。それぞれの隅っこで。',
        },
      },
    ],
  },
  {
    id: 'ct.sento',
    when: { hours: [17, 24] },
    lines: [
      {
        t: {
          fr: 'Il reste un bain public près de chez moi. La cheminée dépasse des toits.',
          en: 'There is still a public bath near my place. The chimney sticks out above the roofs.',
          ja: '近所にまだ銭湯があります。煙突が屋根の上に出てるんです。',
        },
      },
    ],
  },
  {
    id: 'ct.bookshop',
    lines: [
      {
        t: {
          fr: 'Il y a un quartier entier de librairies d’occasion. On peut y perdre une journée.',
          en: 'There is a whole district of second-hand bookshops. You can lose a day in it.',
          ja: '古本屋街があるんです。一日中いられますよ。',
        },
      },
    ],
  },
  {
    id: 'ct.arcade',
    when: { archetype: ['student', 'casual'] },
    lines: [
      {
        t: {
          fr: 'Les salles de jeux ont six étages. Le sixième, c’est toujours le plus calme.',
          en: 'The arcades have six floors. The sixth is always the quietest.',
          ja: 'ゲームセンターは六階建てです。六階がいつも空いてます。',
        },
      },
    ],
  },
  {
    id: 'ct.karaoke.room',
    when: { hours: [19, 26] },
    lines: [
      {
        t: {
          fr: 'On loue une pièce pour trois heures. Personne ne chante la première demi-heure.',
          en: 'You book a room for three hours. Nobody sings for the first half hour.',
          ja: '三時間で部屋を取ります。最初の三十分は誰も歌いません。',
        },
      },
    ],
  },
  {
    id: 'ct.capsule',
    when: { hours: [23, 27] },
    lines: [
      {
        t: {
          fr: 'Si je rate le dernier, je dors en capsule. C’est moins triste qu’on croit.',
          en: 'If I miss the last train I sleep in a capsule. Less bleak than it sounds.',
          ja: '終電を逃したらカプセルです。思ったほど侘しくありませんよ。',
        },
      },
    ],
  },

  // --- Le ciel et les saisons ---
  {
    id: 'ct.skytree',
    when: { moving: true },
    lines: [
      {
        t: {
          fr: 'On aperçoit la grande tour deux fois par tour de boucle. Il faut savoir où regarder.',
          en: 'You catch the tall tower twice per loop. You have to know where to look.',
          ja: '一周に二回、あの塔が見えます。見る場所を知っていればですけど。',
        },
      },
    ],
  },
  {
    id: 'ct.fuji',
    when: { months: [11, 12, 1, 2], hours: [6, 9] },
    lines: [
      {
        t: {
          fr: 'Par temps clair, en hiver, on voit le mont Fuji du quai. Deux minutes, pas plus.',
          en: 'On a clear winter morning you can see Fuji from the platform. Two minutes, no more.',
          ja: '冬の晴れた朝はホームから富士山が見えます。二分だけですけど。',
        },
      },
    ],
  },
  {
    id: 'ct.sunset',
    when: { hours: [16, 18] },
    lines: [
      {
        t: {
          fr: 'Le soleil se couche pile dans l’axe d’une rue. Une semaine par an.',
          en: 'The sun sets exactly down the axis of one street. One week a year.',
          ja: '通りの正面に日が沈む日があります。年に一週間だけ。',
        },
      },
    ],
  },
  {
    id: 'ct.fireworks',
    when: { months: [7, 8], hours: [17, 22] },
    lines: [
      {
        t: {
          fr: 'Ce soir il y a un feu d’artifice. Tout le monde sera en yukata dans le train.',
          en: 'There are fireworks tonight. The train will be full of yukata.',
          ja: '今夜は花火です。電車が浴衣だらけになりますよ。',
        },
      },
    ],
  },
  {
    id: 'ct.matsuri',
    when: { months: [7, 8, 9], weekend: true },
    lines: [
      {
        t: {
          fr: 'On entend les tambours du festival depuis le quai. Ça porte loin.',
          en: 'You can hear the festival drums from the platform. They carry.',
          ja: 'ホームまで祭りの太鼓が聞こえます。よく響くんですよ。',
        },
      },
    ],
  },
  {
    id: 'ct.illumination',
    when: { months: [11, 12], hours: [17, 23] },
    lines: [
      {
        t: {
          fr: 'Les illuminations sont allumées jusqu’en février. Après, la ville redevient normale.',
          en: 'The winter lights stay up until February. Then the city goes back to normal.',
          ja: 'イルミネーションは二月までです。その後は街も普通に戻ります。',
        },
      },
    ],
  },
  {
    id: 'ct.humid',
    when: { months: [6, 7, 8] },
    lines: [
      {
        t: {
          fr: 'Ce n’est pas la chaleur, c’est l’humidité. Tout le monde dit ça et tout le monde a raison.',
          en: 'It is not the heat, it is the humidity. Everyone says it and everyone is right.',
          ja: '暑さより湿気です。みんなそう言うし、みんな正しいんです。',
        },
      },
    ],
  },
  {
    id: 'ct.first.cold',
    when: { months: [10, 11] },
    lines: [
      {
        t: {
          fr: 'Premier matin où l’on voit son souffle. Ça arrive toujours d’un coup.',
          en: 'First morning you can see your breath. It always arrives all at once.',
          ja: '今朝、初めて息が白くなりました。毎年、急に来ますね。',
        },
      },
    ],
  },

  // --- Travail et argent ---
  {
    id: 'ct.job.change',
    when: { archetype: ['salaryman', 'officeLady', 'casual'] },
    lines: [
      {
        t: {
          fr: 'Je change de travail le mois prochain. Même ligne, autre gare.',
          en: 'I change jobs next month. Same line, different station.',
          ja: '来月転職します。同じ線の、別の駅です。',
        },
      },
    ],
  },
  {
    id: 'ct.interview',
    when: { hours: [8, 16], archetype: ['student', 'casual'] },
    lines: [
      {
        t: {
          fr: 'Entretien dans une heure. Costume neuf, chaussures qui font mal.',
          en: 'Interview in an hour. New suit, painful shoes.',
          ja: '一時間後に面接です。新しいスーツと、痛い靴で。',
        },
      },
    ],
  },
  {
    id: 'ct.bonus',
    when: { months: [6, 7, 12] },
    lines: [
      {
        t: {
          fr: 'La prime tombe cette semaine. Elle sera partie avant la fin du mois.',
          en: 'The bonus lands this week. It will be gone before the month is out.',
          ja: '今週ボーナスです。月末には消えてますけどね。',
        },
      },
    ],
  },
  {
    id: 'ct.startup',
    when: { archetype: ['casual', 'salaryman'], station: [19, 20, 23] },
    lines: [
      {
        t: {
          fr: 'Tout le monde par ici travaille pour une entreprise dont vous n’avez jamais entendu parler.',
          en: 'Everyone round here works for a company you have never heard of.',
          ja: 'この辺の人はみんな、聞いたこともない会社で働いてます。',
        },
      },
    ],
  },
  {
    id: 'ct.taxi',
    when: { hours: [23, 27] },
    lines: [
      {
        t: {
          fr: 'Un taxi jusqu’à chez moi coûte plus cher que ma journée. Alors j’attends.',
          en: 'A taxi home costs more than my day earned. So I wait.',
          ja: 'タクシーは一日分の稼ぎより高いんです。だから待ちます。',
        },
      },
    ],
  },
  {
    id: 'ct.pension',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'J’ai un passe pour les personnes âgées. Je m’en sers pour ne rien faire, surtout.',
          en: 'I have a senior pass. Mostly I use it to do nothing.',
          ja: 'シルバーパスがあります。主に何もしないために使ってます。',
        },
      },
    ],
  },

  // --- Aller et venir ---
  {
    id: 'ct.hometown',
    lines: [
      {
        t: {
          fr: 'Je ne suis pas d’ici. Personne dans ce wagon n’est vraiment d’ici.',
          en: 'I am not from here. Nobody in this carriage really is.',
          ja: '私はここの出身じゃありません。この車両の誰も、たぶんそうです。',
        },
      },
    ],
  },
  {
    id: 'ct.return',
    when: { months: [1, 8] },
    lines: [
      {
        t: {
          fr: 'Je rentre au pays demain. Six heures de train, puis un bus.',
          en: 'I go back to my home town tomorrow. Six hours by train, then a bus.',
          ja: '明日帰省します。電車で六時間、それからバスです。',
        },
      },
    ],
  },
  {
    id: 'ct.airport',
    when: { needs: ['bag'] },
    lines: [
      {
        t: {
          fr: 'Je pars ce soir. J’ai une valise et deux heures d’avance.',
          en: 'I fly tonight. One suitcase and two hours to spare.',
          ja: '今晩発ちます。スーツケースひとつと、二時間の余裕で。',
        },
      },
    ],
  },
  {
    id: 'ct.walk.home',
    when: { hours: [21, 26] },
    lines: [
      {
        t: {
          fr: 'Certains soirs je descends trois gares trop tôt et je finis à pied.',
          en: 'Some evenings I get off three stops early and walk the rest.',
          ja: '夜によっては三駅手前で降りて、あとは歩きます。',
        },
      },
    ],
  },
  {
    id: 'ct.city.never.done',
    lines: [
      {
        t: {
          fr: 'Il y a toujours une grue quelque part. Cette ville n’est jamais finie.',
          en: 'There is always a crane somewhere. This city is never finished.',
          ja: 'どこかに必ずクレーンがあります。この街は完成しません。',
        },
      },
    ],
  },
];
