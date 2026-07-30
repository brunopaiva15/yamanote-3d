// Le chemin de fer lui-même.
//
// Une ligne qu'on prend deux fois par jour finit par se raconter : la couleur
// des rames, l'heure du dernier train, la façon dont le conducteur freine, le
// numéro qu'on n'a jamais regardé au-dessus de la porte. Ce fichier est celui
// des gens qui remarquent tout ça - et de ceux qui, à force, ne le remarquent
// plus.

import type { DialogueEntry } from './types';

export const DIALOGUE_TRAINS: readonly DialogueEntry[] = [
  // --- La ligne ---
  {
    id: 'tr.length',
    lines: [
      {
        t: {
          fr: 'Trente-quatre kilomètres et demi de boucle. Une heure tout rond.',
          en: 'Thirty-four and a half kilometres round. An hour, near enough.',
          ja: '一周三十四キロ半。ちょうど一時間ですね。',
        },
      },
    ],
  },
  {
    id: 'tr.frequency',
    lines: [
      {
        t: {
          fr: 'Deux à quatre minutes entre deux rames. On n’a jamais besoin d’horaire.',
          en: 'Two to four minutes between trains. You never need a timetable.',
          ja: '二分から四分おきです。時刻表なんて要りません。',
        },
      },
    ],
  },
  {
    id: 'tr.green',
    lines: [
      {
        t: {
          fr: 'Ce vert-là s’appelle uguisu. La couleur d’un oiseau, pas d’une peinture.',
          en: 'That green is called uguisu. It is a bird’s colour, not a paint’s.',
          ja: 'この緑、うぐいす色っていうんです。塗料じゃなくて鳥の名前ですよ。',
        },
      },
    ],
  },
  {
    id: 'tr.direction',
    lines: [
      {
        t: {
          fr: 'Intérieur, extérieur. C’est la seule chose à comprendre sur cette ligne.',
          en: 'Inner loop, outer loop. That is the only thing to understand here.',
          ja: '内回りと外回り。この線で覚えることはそれだけです。',
        },
      },
    ],
  },
  {
    id: 'tr.numbering',
    lines: [
      {
        t: {
          fr: 'Chaque gare a un numéro, de JY01 à JY30. Personne ne s’en sert.',
          en: 'Every station has a number, JY01 to JY30. Nobody uses them.',
          ja: '駅にはJY01からJY30まで番号があります。誰も使いませんけど。',
        },
      },
    ],
  },
  {
    id: 'tr.oldest',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'Cette ligne a plus de cent trente ans. Elle ne faisait pas la boucle, au début.',
          en: 'This line is over a hundred and thirty years old. It was not a loop at first.',
          ja: 'この線は百三十年以上です。最初は環状じゃなかったんですよ。',
        },
      },
    ],
  },
  {
    id: 'tr.doors.count',
    lines: [
      {
        t: {
          fr: 'Quatre portes par face et par voiture. C’est ce qui fait tenir la pointe du matin.',
          en: 'Four doors a side, every carriage. That is what makes the morning peak possible.',
          ja: '一両に片側四つ。あれがあるから朝のラッシュが回るんです。',
        },
      },
    ],
  },
  {
    id: 'tr.cars',
    lines: [
      {
        t: {
          fr: 'Onze voitures. La sixième est toujours la plus calme, allez savoir pourquoi.',
          en: 'Eleven cars. The sixth is always the quietest. No idea why.',
          ja: '十一両編成です。なぜか六号車がいちばん静かなんですよ。',
        },
      },
    ],
  },
  {
    id: 'tr.window.big',
    lines: [
      {
        t: {
          fr: 'Ces baies sont plus grandes que sur les anciennes rames. On voit vraiment dehors.',
          en: 'These windows are bigger than on the old stock. You can actually see out.',
          ja: '窓が前の車両より大きいんです。ちゃんと外が見えます。',
        },
      },
    ],
  },
  {
    id: 'tr.screens',
    lines: [
      {
        t: {
          fr: 'L’écran passe le japonais, l’anglais, le chinois, le coréen. Puis il recommence.',
          en: 'The screen cycles Japanese, English, Chinese, Korean. Then round again.',
          ja: 'あの画面、日本語、英語、中国語、韓国語の順です。そしてまた最初から。',
        },
      },
    ],
  },
  {
    id: 'tr.seat.fabric',
    when: { posture: ['seated'] },
    lines: [
      {
        t: {
          fr: 'Le tissu vert, c’est les places ordinaires. Le rouge, les places prioritaires.',
          en: 'Green fabric is the ordinary seats. Red is the priority ones.',
          ja: '緑の生地が普通席、赤が優先席です。',
        },
      },
    ],
  },
  {
    id: 'tr.strap.height',
    when: { posture: ['standing'] },
    lines: [
      {
        t: {
          fr: 'Les poignées sont trop hautes pour moi. Elles le sont pour la moitié du wagon.',
          en: 'The straps are too high for me. They are for half this carriage.',
          ja: '吊り革、私には高いんです。車両の半分の人には高いはずですよ。',
        },
      },
    ],
  },
  {
    id: 'tr.aircon.setting',
    lines: [
      {
        t: {
          fr: 'Une voiture sur onze est réglée plus douce. Les habitués savent laquelle.',
          en: 'One car in eleven is set milder. The regulars know which.',
          ja: '一両だけ冷房が弱めなんです。常連は知ってますよ。',
        },
      },
    ],
  },

  // --- Les autres lignes ---
  {
    id: 'tr.chuo',
    lines: [
      {
        t: {
          fr: 'La ligne orange traverse tout droit. Elle va plus vite, mais elle s’arrête plus souvent.',
          en: 'The orange line cuts straight across. Faster, but it stops more often.',
          ja: 'オレンジの線は真ん中を突っ切ります。速いけど、よく止まりますね。',
        },
      },
    ],
  },
  {
    id: 'tr.keihin',
    lines: [
      {
        t: {
          fr: 'La ligne bleue longe la nôtre sur la moitié du parcours. On la double, elle nous double.',
          en: 'The blue line runs beside ours for half the way. We overtake, it overtakes.',
          ja: '青い線は半分くらい並走します。抜いたり抜かれたりですよ。',
        },
      },
    ],
  },
  {
    id: 'tr.metro',
    lines: [
      {
        t: {
          fr: 'En dessous, il y a treize lignes de métro. On roule sur un gâteau.',
          en: 'There are thirteen metro lines underneath. We ride on a layer cake.',
          ja: '下には地下鉄が十三路線あります。ケーキの上を走ってるようなものです。',
        },
      },
    ],
  },
  {
    id: 'tr.shinkansen',
    lines: [
      {
        t: {
          fr: 'Quand un shinkansen nous croise, il est déjà loin le temps qu’on tourne la tête.',
          en: 'When a bullet train passes, it is gone before you can turn your head.',
          ja: '新幹線とすれ違うと、振り向く前にもういません。',
        },
      },
    ],
  },
  {
    id: 'tr.freight',
    when: { hours: [22, 27] },
    lines: [
      {
        t: {
          fr: 'La nuit, il passe des trains de fret sur la voie d’à côté. Personne ne les voit.',
          en: 'At night there are freight trains on the next track. Nobody sees them.',
          ja: '夜は隣の線を貨物が走ります。誰も見ませんけどね。',
        },
      },
    ],
  },

  // --- Le personnel ---
  {
    id: 'tr.driver',
    lines: [
      {
        t: {
          fr: 'Le conducteur montre chaque signal du doigt. Ça évite les oublis, paraît-il.',
          en: 'The driver points at every signal. It stops mistakes, they say.',
          ja: '運転士は信号を指差します。指差喚呼というやつですね。',
        },
      },
    ],
  },
  {
    id: 'tr.driver.stop',
    lines: [
      {
        t: {
          fr: 'Il arrête la rame à trente centimètres près. Chaque fois, au même endroit.',
          en: 'He stops the train within thirty centimetres. Same spot, every time.',
          ja: '停止位置は誤差三十センチです。毎回、同じところに止めます。',
        },
      },
    ],
  },
  {
    id: 'tr.staff.platform',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Le chef de quai voit tout le quai d’un coup d’œil. Il sait déjà qui va courir.',
          en: 'The platform attendant takes in the whole platform at a glance. He knows who is about to run.',
          ja: '駅員さんはホーム全体を一目で見ます。誰が走り出すか先に分かるんですよ。',
        },
      },
    ],
  },
  {
    id: 'tr.staff.bow',
    lines: [
      {
        t: {
          fr: 'Le contrôleur salue en sortant de la voiture. Même quand elle est vide.',
          en: 'The conductor bows on leaving the carriage. Even an empty one.',
          ja: '車掌さんは車両を出るとき礼をします。誰もいなくても。',
        },
      },
    ],
  },
  {
    id: 'tr.cleaning',
    when: { hours: [4, 8] },
    lines: [
      {
        t: {
          fr: 'Les équipes de nettoyage font une voiture en sept minutes. J’ai chronométré.',
          en: 'The cleaning crews do a carriage in seven minutes. I timed them.',
          ja: '清掃の方は一両を七分で仕上げます。計ったことがあるんです。',
        },
      },
    ],
  },

  // --- Incidents et retards ---
  {
    id: 'tr.delay.wind',
    lines: [
      {
        t: {
          fr: 'Un peu de vent et tout ralentit. C’est le viaduc qui commande.',
          en: 'A bit of wind and everything slows. The viaduct decides.',
          ja: '風が強いと徐行になります。高架が決めることですから。',
        },
      },
    ],
  },
  {
    id: 'tr.delay.snow',
    when: { months: [1, 2] },
    lines: [
      {
        t: {
          fr: 'Trois centimètres de neige et la ville s’arrête. Trois.',
          en: 'Three centimetres of snow and the city stops. Three.',
          ja: '雪が三センチ積もれば街は止まります。三センチで。',
        },
      },
    ],
  },
  {
    id: 'tr.delay.chain',
    lines: [
      {
        t: {
          fr: 'Un retard sur une ligne, et six autres le prennent. Tout est branché sur tout.',
          en: 'One line runs late and six others catch it. Everything is wired to everything.',
          ja: '一路線遅れると六路線に伝染します。全部つながってますから。',
        },
      },
    ],
  },
  {
    id: 'tr.delay.paper',
    lines: [
      {
        t: {
          fr: 'On peut demander une attestation de retard au guichet. Le patron l’accepte, en général.',
          en: 'You can get a delay certificate at the gate. The boss usually accepts it.',
          ja: '遅延証明書、改札でもらえます。上司もだいたい納得しますよ。',
        },
      },
    ],
  },
  {
    id: 'tr.emergency.button',
    lines: [
      {
        t: {
          fr: 'Il y a un bouton d’alerte près de chaque porte. Je ne l’ai jamais vu servir.',
          en: 'There is an alarm button by every door. I have never seen one used.',
          ja: 'ドアごとに非常ボタンがあります。使われたところは見たことがありません。',
        },
      },
    ],
  },

  // --- Étiquette ---
  {
    id: 'tr.etiquette.queue',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'On fait deux files et on laisse le milieu libre. Personne ne l’a jamais expliqué à personne.',
          en: 'Two queues, middle left clear. Nobody ever explained it to anybody.',
          ja: '二列に並んで真ん中を空けます。誰も教えないのに、みんなやってますね。',
        },
      },
    ],
  },
  {
    id: 'tr.etiquette.backpack',
    when: { crowdMin: 0.55 },
    lines: [
      {
        t: {
          fr: 'Le sac à dos se porte devant, ou en bas. Jamais dans le dos du voisin.',
          en: 'Backpack in front, or down by your feet. Never in the next person’s back.',
          ja: 'リュックは前に抱えるか、足元に。人の背中に当てないように。',
        },
      },
    ],
  },
  {
    id: 'tr.etiquette.phone',
    lines: [
      {
        t: {
          fr: 'Mode silencieux, toujours. C’est écrit partout et tout le monde le fait.',
          en: 'Silent mode, always. It is written everywhere and everyone does it.',
          ja: 'マナーモードです。どこにでも書いてあるし、みんな守ります。',
        },
      },
    ],
  },
  {
    id: 'tr.etiquette.seat.spread',
    when: { posture: ['seated'] },
    lines: [
      {
        t: {
          fr: 'Sept places sur la banquette. Six si quelqu’un s’installe mal.',
          en: 'Seven to a bench. Six if somebody sits badly.',
          ja: 'ロングシートは七人掛けです。座り方次第で六人になりますけど。',
        },
      },
    ],
  },
  {
    id: 'tr.etiquette.umbrella',
    when: { months: [6, 7, 9] },
    lines: [
      {
        t: {
          fr: 'Le parapluie se tient vertical. Sinon il mouille les genoux de trois personnes.',
          en: 'Hold the umbrella upright. Otherwise it soaks three people’s knees.',
          ja: '傘はまっすぐ持ちましょう。斜めだと三人分の膝が濡れます。',
        },
      },
    ],
  },
  {
    id: 'tr.etiquette.ladies',
    when: { hours: [7, 10], feminine: true },
    lines: [
      {
        t: {
          fr: 'Aux heures de pointe, une voiture est réservée aux femmes. C’est la première.',
          en: 'At peak times one car is women-only. It is the first one.',
          ja: 'ラッシュ時は女性専用車があります。先頭車両です。',
        },
      },
    ],
  },
  {
    id: 'tr.etiquette.eat',
    lines: [
      {
        t: {
          fr: 'On ne mange pas dans les rames de banlieue. Dans les trains longs, si.',
          en: 'You do not eat on commuter trains. On long-distance ones, you do.',
          ja: '通勤電車では食べません。長距離列車なら別ですけど。',
        },
      },
    ],
  },

  // --- Billetterie et portiques ---
  {
    id: 'tr.suica',
    lines: [
      {
        t: {
          fr: 'Un geste sur le portique et c’est réglé. Je n’ai pas touché un billet depuis dix ans.',
          en: 'One tap at the gate and that is that. I have not held a paper ticket in ten years.',
          ja: '改札にかざすだけです。切符なんて十年触ってません。',
        },
      },
    ],
  },
  {
    id: 'tr.suica.penguin',
    lines: [
      {
        t: {
          fr: 'Il y a un pingouin sur la carte. Personne ne sait pourquoi, et personne ne demande.',
          en: 'There is a penguin on the card. Nobody knows why and nobody asks.',
          ja: 'カードにペンギンがいます。理由は誰も知らないし、聞きもしません。',
        },
      },
    ],
  },
  {
    id: 'tr.gate.beep',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Quand le portique sonne, tout le monde vous regarde. C’est la pire seconde de la journée.',
          en: 'When the gate beeps at you, everyone looks. Worst second of the day.',
          ja: '改札で引っかかると全員が見ます。一日でいちばん嫌な一秒ですね。',
        },
      },
    ],
  },
  {
    id: 'tr.fare.cheap',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Le tour complet coûte moins qu’un café. On peut y passer l’après-midi.',
          en: 'A full loop costs less than a coffee. You could spend the afternoon here.',
          ja: '一周してもコーヒー一杯より安いです。午後中いられますよ。',
        },
      },
    ],
  },

  // --- Amateurs ---
  {
    id: 'tr.fan.photo',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Les photographes se mettent au bout du quai. Toujours le même bout.',
          en: 'The photographers stand at the end of the platform. Always the same end.',
          ja: '撮り鉄はホームの端に立ちます。いつも同じ端です。',
        },
      },
    ],
  },
  {
    id: 'tr.fan.melody',
    lines: [
      {
        t: {
          fr: 'Je peux nommer la gare rien qu’au premier accord. Ça n’impressionne personne.',
          en: 'I can name the station from the first chord. It impresses nobody.',
          ja: '最初の一音で駅が分かります。誰にも自慢できませんけど。',
        },
      },
    ],
  },
  {
    id: 'tr.fan.livery',
    when: { archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Il passe parfois une rame habillée en publicité. Il faut de la chance.',
          en: 'Sometimes a train comes past in an advertising wrap. You need luck.',
          ja: 'たまにラッピング編成が来ます。運次第ですね。',
        },
      },
    ],
  },
  {
    id: 'tr.depot',
    when: { hours: [23, 27] },
    lines: [
      {
        t: {
          fr: 'Après le dernier train, les rames rentrent au dépôt. Une file entière, feux éteints.',
          en: 'After the last train they all go back to the depot. A whole line of them, lights out.',
          ja: '終電の後は車庫に戻ります。灯りを落とした編成がずらりと。',
        },
      },
    ],
  },
  {
    id: 'tr.night.work',
    when: { hours: [1, 5] },
    lines: [
      {
        t: {
          fr: 'La nuit, ils remplacent des rails. C’est pour ça que le premier train est si doux.',
          en: 'They replace rails at night. That is why the first train rides so smooth.',
          ja: '夜中にレールを交換してるんです。だから始発は乗り心地がいい。',
        },
      },
    ],
  },
  {
    id: 'tr.psd',
    when: { place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Les portes palières ont mis des années à être posées. Deux gares n’en ont toujours pas.',
          en: 'The platform doors took years to install. Two stations still have none.',
          ja: 'ホームドアの設置には何年もかかりました。まだ二駅ついてません。',
        },
      },
    ],
  },
  {
    id: 'tr.rail.joint',
    when: { moving: true },
    lines: [
      {
        t: {
          fr: 'Écoutez les joints de rail. On peut compter la vitesse dessus.',
          en: 'Listen to the rail joints. You can count the speed off them.',
          ja: 'レールの継ぎ目を聞いてください。あれで速度が数えられます。',
        },
      },
    ],
  },
  {
    id: 'tr.curve',
    when: { moving: true },
    lines: [
      {
        t: {
          fr: 'Cette courbe grince toujours. Elle grinçait déjà il y a vingt ans.',
          en: 'That curve always squeals. It squealed twenty years ago too.',
          ja: 'あのカーブはいつも軋みます。二十年前から同じです。',
        },
      },
    ],
  },
  {
    id: 'tr.announce.voice',
    lines: [
      {
        t: {
          fr: 'La voix des annonces est la même depuis des années. On finit par la trouver rassurante.',
          en: 'The announcement voice has not changed in years. You end up finding it reassuring.',
          ja: 'アナウンスの声は何年も同じです。だんだん安心するようになります。',
        },
      },
    ],
  },
  {
    id: 'tr.lost.property',
    lines: [
      {
        t: {
          fr: 'Les objets trouvés remontent jusqu’au bureau central. Même les parapluies.',
          en: 'Lost property all ends up at the central office. Umbrellas included.',
          ja: '落とし物は全部中央のセンターに集まります。傘も含めて。',
        },
      },
    ],
  },
  {
    id: 'tr.sleeping.pass',
    when: { hours: [22, 27] },
    lines: [
      {
        t: {
          fr: 'Le personnel réveille les dormeurs au terminus. Doucement, en tapotant l’épaule.',
          en: 'The staff wake the sleepers at the end of the line. Gently, a tap on the shoulder.',
          ja: '終点では駅員さんが寝てる人を起こします。そっと肩を叩いて。',
        },
      },
    ],
  },
];
