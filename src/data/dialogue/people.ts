// Ce que dit quelqu'un DE PARTICULIER.
//
// Un catalogue générique produit une foule qui parle d'une seule voix. Ici,
// chaque échange est attaché à qui le dit : le costume froissé du salaryman,
// le manuel de révision de l'étudiant, la carte dépliée du touriste, le
// masque qu'on n'enlève plus, le sac trop lourd.
//
// Le genre change parfois le texte et parfois seulement la façon de le dire :
// en japonais, 僕 et 私 ne se valent pas, ni ～だよ et ～わよ. Les paires
// { f, m } portent cette différence-là.

import type { DialogueEntry } from './types';

export const DIALOGUE_PEOPLE: readonly DialogueEntry[] = [
  // --- Salaryman ---
  {
    id: 'pp.sal.meeting',
    when: { archetype: ['salaryman'], hours: [7, 11] },
    lines: [
      {
        t: {
          fr: 'Réunion à neuf heures. Je n’ai pas ouvert le dossier.',
          en: 'Meeting at nine. I have not opened the file.',
          ja: { f: '九時から会議。資料まだ開いてないの。', m: '九時から会議だ。資料、まだ開いてない。' },
        },
      },
    ],
  },
  {
    id: 'pp.sal.boss',
    when: { archetype: ['salaryman'], hours: [18, 24] },
    lines: [
      {
        t: {
          fr: 'Mon chef est parti à dix-sept heures. Moi, je suis resté.',
          en: 'My boss left at five. I stayed.',
          ja: { f: '課長は五時に帰ったのに、私は残業。', m: '課長は五時に帰った。俺は残った。' },
        },
      },
    ],
  },
  {
    id: 'pp.sal.nomikai',
    when: { archetype: ['salaryman'], hours: [21, 25] },
    lines: [
      {
        t: {
          fr: 'Je reviens d’un pot d’entreprise. Je n’ai bu que du thé, je vous jure.',
          en: 'Coming back from a work drink. I had tea, I promise.',
          ja: { f: '飲み会の帰りです。お茶しか飲んでませんけどね。', m: '飲み会の帰りだよ。お茶しか飲んでないけどな。' },
        },
      },
      {
        t: {
          fr: 'Bon. Presque.',
          en: 'Well. Mostly.',
          ja: '……ほとんどは。',
        },
        gap: 0.9,
      },
    ],
  },
  {
    id: 'pp.sal.suit',
    when: { archetype: ['salaryman'] },
    lines: [
      {
        t: {
          fr: 'Ce costume a douze ans. Il fait encore illusion de loin.',
          en: 'This suit is twelve years old. It still holds up from a distance.',
          ja: 'このスーツ、十二年目です。遠目にはまだ持ちます。',
        },
      },
    ],
  },
  {
    id: 'pp.sal.transfer',
    when: { archetype: ['salaryman'] },
    lines: [
      {
        t: {
          fr: 'On me mute à Ōsaka. Je l’ai appris ce matin, en réunion.',
          en: 'They are transferring me to Osaka. I found out this morning, in a meeting.',
          ja: { f: '大阪に転勤なの。今朝、会議で聞いたわ。', m: '大阪に転勤だ。今朝、会議で聞いた。' },
        },
      },
    ],
  },
  {
    id: 'pp.sal.same.train',
    when: { archetype: ['salaryman'] },
    lines: [
      {
        t: {
          fr: 'Le même train depuis onze ans. Le même wagon, la même porte.',
          en: 'The same train for eleven years. Same carriage, same door.',
          ja: '十一年、同じ電車です。同じ車両の同じドア。',
        },
      },
    ],
  },
  {
    id: 'pp.sal.quit',
    when: { archetype: ['salaryman'], hours: [21, 26] },
    lines: [
      {
        t: {
          fr: 'Je vais démissionner. Je le dis chaque soir dans ce train.',
          en: 'I am going to quit. I say that every evening on this train.',
          ja: { f: '会社辞めるの。毎晩この電車で言ってるけど。', m: '会社辞めるよ。毎晩この電車で言ってるけどな。' },
        },
      },
    ],
  },
  {
    id: 'pp.sal.shoes',
    when: { archetype: ['salaryman'] },
    lines: [
      {
        t: {
          fr: 'Vingt-deux mille pas aujourd’hui. Avec ces chaussures.',
          en: 'Twenty-two thousand steps today. In these shoes.',
          ja: '今日、二万二千歩です。この靴で。',
        },
      },
    ],
  },

  // --- Office lady ---
  {
    id: 'pp.ol.late',
    when: { archetype: ['officeLady'], hours: [7, 10] },
    lines: [
      {
        t: {
          fr: 'Je vais être en retard de six minutes. Six.',
          en: 'I am going to be six minutes late. Six.',
          ja: '六分遅刻します。六分。',
        },
      },
    ],
  },
  {
    id: 'pp.ol.shoes',
    when: { archetype: ['officeLady'] },
    lines: [
      {
        t: {
          fr: 'Je garde des baskets dans mon sac. Je change au dernier moment.',
          en: 'I keep trainers in my bag. I change at the last minute.',
          ja: 'かばんにスニーカーを入れてるんです。直前で履き替えます。',
        },
      },
    ],
  },
  {
    id: 'pp.ol.lunch',
    when: { archetype: ['officeLady'], hours: [11, 15] },
    lines: [
      {
        t: {
          fr: 'Onze minutes pour déjeuner. J’ai compté.',
          en: 'Eleven minutes for lunch. I timed it.',
          ja: 'お昼休み、実質十一分でした。数えました。',
        },
      },
    ],
  },
  {
    id: 'pp.ol.colleague',
    when: { archetype: ['officeLady'] },
    lines: [
      {
        t: {
          fr: 'Ma collègue m’a envoyé quarante messages depuis midi. Quarante.',
          en: 'My colleague has sent me forty messages since noon. Forty.',
          ja: '同僚から昼だけで四十件。四十件ですよ。',
        },
      },
    ],
  },
  {
    id: 'pp.ol.promotion',
    when: { archetype: ['officeLady'] },
    lines: [
      {
        t: {
          fr: 'On m’a proposé le poste. Je n’ai encore rien répondu.',
          en: 'They offered me the position. I have not answered yet.',
          ja: 'その役職、打診されました。まだ返事してません。',
        },
      },
      {
        t: {
          fr: 'Je décide en général entre deux stations.',
          en: 'I usually decide somewhere between two stations.',
          ja: 'だいたい駅と駅の間で決めるんです。',
        },
        gap: 0.6,
      },
    ],
  },
  {
    id: 'pp.ol.escape',
    when: { archetype: ['officeLady'], hours: [18, 23] },
    lines: [
      {
        t: {
          fr: { f: 'Je suis descendue deux stations trop tôt, exprès. Pour marcher.', m: 'Je suis descendu deux stations trop tôt, exprès. Pour marcher.' },
          en: 'I got off two stops early on purpose. Just to walk.',
          ja: 'わざと二駅手前で降りるんです。歩きたくて。',
        },
      },
    ],
  },

  // --- Étudiants ---
  {
    id: 'pp.stu.exam',
    when: { archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Examen demain. Je révise depuis Shinagawa.',
          en: 'Exam tomorrow. I have been revising since Shinagawa.',
          ja: { f: '明日試験なの。品川からずっと詰め込んでる。', m: '明日試験なんだ。品川からずっと詰め込んでる。' },
        },
      },
    ],
  },
  {
    id: 'pp.stu.club',
    when: { archetype: ['student'], hours: [16, 21] },
    lines: [
      {
        t: {
          fr: 'Le club finit à sept heures. Je rentre toujours avec ce train.',
          en: 'Club runs until seven. I always take this train home.',
          ja: { f: '部活が七時までなの。いつもこの電車。', m: '部活が七時までなんだ。いつもこの電車。' },
        },
      },
    ],
  },
  {
    id: 'pp.stu.parttime',
    when: { archetype: ['student'], hours: [17, 24] },
    lines: [
      {
        t: {
          fr: 'Je sors du konbini. Six heures debout, et je recommence demain.',
          en: 'Just finished my convenience store shift. Six hours on my feet, again tomorrow.',
          ja: { f: 'コンビニのバイト上がり。六時間立ちっぱなし、明日もだけど。', m: 'コンビニのバイト上がり。六時間立ちっぱなし、明日もだ。' },
        },
      },
    ],
  },
  {
    id: 'pp.stu.friend',
    when: { archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Mon amie devait monter à la même porte. Elle a raté la rame.',
          en: 'My friend was supposed to get on at the same door. She missed it.',
          ja: '友だちと同じドアで待ち合わせだったのに、乗り遅れたって。',
        },
      },
    ],
  },
  {
    id: 'pp.stu.future',
    when: { archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Je ne sais pas encore ce que je veux faire. On me le demande tous les jours.',
          en: 'I still don’t know what I want to do. People ask me every day.',
          ja: { f: 'まだ何がしたいか分からないの。毎日聞かれるけど。', m: 'まだ何がしたいか分からないんだ。毎日聞かれるけど。' },
        },
      },
    ],
  },
  {
    id: 'pp.stu.music',
    when: { archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Vous connaissez ce groupe ? Ils jouent à Shimokitazawa samedi.',
          en: 'Do you know this band? They are playing in Shimokitazawa on Saturday.',
          ja: 'このバンド知ってます？　土曜に下北で演るんですよ。',
        },
      },
    ],
  },
  {
    id: 'pp.stu.sleep',
    when: { archetype: ['student'], hours: [6, 9] },
    lines: [
      {
        t: {
          fr: { f: 'Je me suis couchée à trois heures. Pour rien, en plus.', m: 'Je me suis couché à trois heures. Pour rien, en plus.' },
          en: 'I went to bed at three. For nothing, too.',
          ja: { f: '三時に寝たの。しかも何もしてないのに。', m: '三時に寝た。しかも何もしてないのに。' },
        },
      },
    ],
  },

  // --- Séniors ---
  {
    id: 'pp.sen.before',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'Avant, ces rames étaient vertes. D’un vert plus franc que celui-là.',
          en: 'These trains used to be green. A stronger green than this one.',
          ja: '昔はもっと濃い緑でしたよ、この電車。',
        },
      },
    ],
  },
  {
    id: 'pp.sen.station.change',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'J’ai vu cette gare être démolie et reconstruite deux fois.',
          en: 'I have watched this station be torn down and rebuilt twice.',
          ja: 'この駅、建て替えを二回見ましたよ。',
        },
      },
    ],
  },
  {
    id: 'pp.sen.grandchild',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'Je vais voir ma petite-fille. Elle habite au bout de la ligne.',
          en: 'I am off to see my granddaughter. She lives at the far end of the line.',
          ja: '孫に会いに行くんです。線の反対側に住んでましてね。',
        },
      },
    ],
  },
  {
    id: 'pp.sen.stand',
    when: { senior: true, posture: ['standing'] },
    lines: [
      {
        t: {
          fr: 'Non, non, restez assis. Je tiens encore debout.',
          en: 'No, no, stay seated. I can still stand.',
          ja: 'いえいえ、座っててください。まだ立てますから。',
        },
      },
    ],
  },
  {
    id: 'pp.sen.slow',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'Tout le monde court. Le train part quand même à l’heure.',
          en: 'Everyone runs. The train leaves on time regardless.',
          ja: 'みんな走りますね。電車は結局時間どおりなのに。',
        },
      },
    ],
  },
  {
    id: 'pp.sen.window.open',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'Mon père prenait déjà cette ligne. À l’époque, on ouvrait les fenêtres.',
          en: 'My father rode this line too. Back then you could open the windows.',
          ja: '父もこの線に乗ってました。あの頃は窓が開いたんですよ。',
        },
      },
    ],
  },
  {
    id: 'pp.sen.doctor',
    when: { senior: true, hours: [8, 12] },
    lines: [
      {
        t: {
          fr: 'Rendez-vous chez le médecin. Tous les deux mois, même wagon.',
          en: 'Doctor’s appointment. Every two months, same carriage.',
          ja: '病院の日でしてね。二か月に一度、同じ車両です。',
        },
      },
    ],
  },

  // --- Touristes ---
  {
    id: 'pp.tou.lost',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: { f: 'Excusez-moi. Je crois que je suis perdue.', m: 'Excusez-moi. Je crois que je suis perdu.' },
          en: 'Excuse me. I think I am lost.',
          ja: 'すみません。道に迷ったみたいで。',
        },
      },
      {
        t: {
          fr: 'Enfin - sur une ligne circulaire, est-ce qu’on peut vraiment être perdu ?',
          en: 'Then again - on a loop line, can you really be lost?',
          ja: 'でも環状線で迷うって、あり得るんでしょうか。',
        },
        gap: 0.7,
      },
    ],
  },
  {
    id: 'pp.tou.pass',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'J’ai un pass pour sept jours. Je prends tous les trains que je peux.',
          en: 'I have a seven-day pass. I am riding every train I can.',
          ja: '七日間のパスを持ってるんです。乗れる電車は全部乗ります。',
        },
      },
    ],
  },
  {
    id: 'pp.tou.quiet',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Personne ne parle. Chez moi, un wagon comme ça serait insupportable de bruit.',
          en: 'Nobody talks. Back home a carriage like this would be unbearably loud.',
          ja: '誰も喋らないんですね。うちの国だと、この車両はうるさくてたまらないですよ。',
        },
      },
    ],
  },
  {
    id: 'pp.tou.ontime',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Le train est arrivé à la seconde près. À la seconde.',
          en: 'The train arrived to the second. The second.',
          ja: '秒単位で来ましたよ。秒単位です。',
        },
      },
    ],
  },
  {
    id: 'pp.tou.map',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Ce plan a trente couleurs. J’en ai compris deux.',
          en: 'This map has thirty colours. I understand two of them.',
          ja: 'この路線図、三十色ありますよね。二色しか分かりません。',
        },
      },
    ],
  },
  {
    id: 'pp.tou.food',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'J’ai mangé au sous-sol d’un grand magasin. Je n’ai pas de mots.',
          en: 'I ate in a department store basement. I have no words.',
          ja: 'デパ地下で食べました。言葉が出ません。',
        },
      },
    ],
  },
  {
    id: 'pp.tou.photo',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Je photographie chaque quai. Trente gares, trente photos.',
          en: 'I photograph every platform. Thirty stations, thirty pictures.',
          ja: 'ホームを全部撮ってるんです。三十駅、三十枚。',
        },
      },
    ],
  },
  {
    id: 'pp.tou.language',
    when: { archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Je connais dix mots de japonais. Trois servent à commander des nouilles.',
          en: 'I know ten words of Japanese. Three of them order noodles.',
          ja: '日本語、十語しか知りません。うち三語は麺の注文用です。',
        },
      },
    ],
  },

  // --- Décontractés ---
  {
    id: 'pp.cas.nowhere',
    when: { archetype: ['casual'] },
    lines: [
      {
        t: {
          fr: 'Je ne vais nulle part de précis. J’avais besoin de sortir.',
          en: 'I am not going anywhere in particular. I just needed to get out.',
          ja: { f: '特にどこも。出かけたかっただけなの。', m: '特にどこも。出かけたかっただけ。' },
        },
      },
    ],
  },
  {
    id: 'pp.cas.thinking',
    when: { archetype: ['casual'] },
    lines: [
      {
        t: {
          fr: 'Je réfléchis mieux en mouvement. C’est pour ça que je tourne.',
          en: 'I think better when I am moving. That is why I keep going round.',
          ja: '動いてる方が考えがまとまるんです。だからぐるぐる回ってます。',
        },
      },
    ],
  },
  {
    id: 'pp.cas.date',
    when: { archetype: ['casual'], hours: [17, 22] },
    lines: [
      {
        t: {
          fr: 'Premier rendez-vous. Je serai en avance de vingt minutes.',
          en: 'First date. I will be twenty minutes early.',
          ja: '初デートです。二十分も早く着いてしまいそうで。',
        },
      },
    ],
  },
  {
    id: 'pp.cas.moving',
    when: { archetype: ['casual'] },
    lines: [
      {
        t: {
          fr: 'Je déménage la semaine prochaine. Je fais mes adieux à la ligne.',
          en: 'I am moving away next week. I am saying goodbye to the line.',
          ja: '来週引っ越すんです。この線にお別れを言ってるところで。',
        },
      },
    ],
  },

  // --- Accessoires ---
  {
    id: 'pp.acc.mask',
    when: { needs: ['mask'] },
    lines: [
      {
        t: {
          fr: 'Je le garde par habitude, maintenant. Je ne sais plus faire autrement.',
          en: 'I keep it on out of habit now. I would not know how else to be.',
          ja: 'もう習慣で着けてます。外し方が分からなくなりました。',
        },
      },
    ],
  },
  {
    id: 'pp.acc.mask.cold',
    when: { needs: ['mask'], months: [11, 12, 1, 2, 3] },
    lines: [
      {
        t: {
          fr: 'Ça tient chaud au visage. C’est la vraie raison, en hiver.',
          en: 'It keeps your face warm. That is the real reason in winter.',
          ja: '顔が暖かいんですよ。冬はそれが本当の理由です。',
        },
      },
    ],
  },
  {
    id: 'pp.acc.glasses',
    when: { needs: ['glasses'] },
    lines: [
      {
        t: {
          fr: 'Mes lunettes se couvrent de buée dès que je monte. Chaque fois.',
          en: 'My glasses fog up the moment I board. Every time.',
          ja: '乗った瞬間に眼鏡が曇るんです。毎回です。',
        },
      },
    ],
  },
  {
    id: 'pp.acc.bag',
    when: { needs: ['bag'] },
    lines: [
      {
        t: {
          fr: 'Ce sac pèse une tonne. Je ne sais même plus ce qu’il y a dedans.',
          en: 'This bag weighs a ton. I don’t even know what is in it any more.',
          ja: 'このかばん、重くて。中身ももう分かりません。',
        },
      },
    ],
  },
  {
    id: 'pp.acc.bag.front',
    when: { needs: ['bag'], crowdMin: 0.6 },
    lines: [
      {
        t: {
          fr: 'On doit porter son sac devant soi quand c’est plein. Je l’oublie toujours.',
          en: 'You are meant to carry your bag in front when it is full. I always forget.',
          ja: '混んでるときはかばんを前に持つんですよね。いつも忘れます。',
        },
      },
    ],
  },
  {
    id: 'pp.acc.hat',
    when: { needs: ['hat'] },
    lines: [
      {
        t: {
          fr: 'Cette casquette a fait trois pays. Elle tient encore.',
          en: 'This cap has been through three countries. It is still going.',
          ja: 'この帽子、三か国回ってます。まだ持ちますね。',
        },
      },
    ],
  },
  {
    id: 'pp.acc.scarf',
    when: { needs: ['scarf'] },
    lines: [
      {
        t: {
          fr: 'Ma mère l’a tricotée. Elle m’appelle pour vérifier que je la porte.',
          en: 'My mother knitted it. She calls to check that I am wearing it.',
          ja: '母が編んでくれたんです。ちゃんと巻いてるか電話で確認されます。',
        },
      },
    ],
  },

  // --- Genre / vie personnelle ---
  {
    id: 'pp.her.night',
    when: { feminine: true, hours: [22, 26] },
    lines: [
      {
        t: {
          fr: 'Je prends toujours le wagon près du chef de quai, la nuit.',
          en: 'At night I always take the carriage near the platform attendant.',
          ja: '夜はいつも駅員さんに近い車両にします。',
        },
      },
    ],
  },
  {
    id: 'pp.her.heels',
    when: { feminine: true },
    lines: [
      {
        t: {
          fr: { f: 'Je suis debout depuis six heures ce matin. Sur ces talons.', m: 'Je suis debout depuis six heures ce matin.' },
          en: 'I have been on my feet since six this morning. In these heels.',
          ja: '朝六時から立ちっぱなしです。このヒールで。',
        },
      },
    ],
  },
  {
    id: 'pp.him.tie',
    when: { feminine: false },
    lines: [
      {
        t: {
          fr: 'Je desserre ma cravate ici. Deux stations avant chez moi, jamais avant.',
          en: 'I loosen my tie here. Two stops before home, never earlier.',
          ja: 'ここでネクタイを緩めます。家の二駅前、それより早くは緩めません。',
        },
      },
    ],
  },
  {
    id: 'pp.parent',
    when: { archetype: ['salaryman', 'officeLady', 'casual'], hours: [17, 22] },
    lines: [
      {
        t: {
          fr: 'Mon fils dort quand je rentre. Il dort encore quand je pars.',
          en: 'My son is asleep when I get home. Still asleep when I leave.',
          ja: '帰ると息子は寝てます。出るときもまだ寝てます。',
        },
      },
    ],
  },
  {
    id: 'pp.alone',
    lines: [
      {
        t: {
          fr: { f: 'Je vis seule. Ce wagon, c’est le seul endroit où il y a du monde.', m: 'Je vis seul. Ce wagon, c’est le seul endroit où il y a du monde.' },
          en: 'I live alone. This carriage is the only place with people in it.',
          ja: { f: '一人暮らしなの。人がいるのはこの車両だけ。', m: '一人暮らしでね。人がいるのはこの車両だけなんだ。' },
        },
      },
    ],
  },
];
