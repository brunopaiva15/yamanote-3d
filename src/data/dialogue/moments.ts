// L'heure, la saison, la foule, la phase du trajet.
//
// La même personne ne dit pas la même chose à sept heures du matin et à une
// heure du matin. C'est l'heure de Tokyo qui commande ici : le silence tendu
// de la pointe, l'ennui suspendu de l'après-midi, la fatigue heureuse du
// dernier train. Le reste vient de l'état du trajet - à quai, en approche,
// bondé, désert.

import type { DialogueEntry } from './types';

export const DIALOGUE_MOMENTS: readonly DialogueEntry[] = [
  // --- Premier train ---
  {
    id: 'mo.first.train',
    when: { hours: [4, 6] },
    lines: [
      {
        t: {
          fr: 'Premier train. Il n’y a que nous et ceux qui n’ont pas dormi.',
          en: 'First train. Just us and the ones who never went to bed.',
          ja: '始発です。乗ってるのは、寝てない人と私たちだけ。',
        },
      },
    ],
  },
  {
    id: 'mo.dawn.light',
    when: { hours: [4, 7] },
    lines: [
      {
        t: {
          fr: 'Le jour se lève entre deux immeubles, juste là. Ça dure deux minutes.',
          en: 'The sun comes up between two buildings, right there. It lasts two minutes.',
          ja: 'ビルの隙間から日が昇ります。二分だけの景色です。',
        },
      },
    ],
  },
  {
    id: 'mo.dawn.clean',
    when: { hours: [4, 6] },
    lines: [
      {
        t: {
          fr: 'Le wagon vient d’être nettoyé. Ça ne durera pas jusqu’à huit heures.',
          en: 'The carriage has just been cleaned. It will not last until eight.',
          ja: '車内、掃除したてですね。八時までは持ちませんけど。',
        },
      },
    ],
  },

  // --- Pointe du matin ---
  {
    id: 'mo.rush.silence',
    when: { hours: [7, 10], crowdMin: 0.6 },
    lines: [
      {
        t: {
          fr: 'Personne ne dit un mot à cette heure-ci. Vous et moi faisons exception.',
          en: 'Nobody says a word at this hour. You and I are the exception.',
          ja: 'この時間は誰も喋りません。私たちが例外です。',
        },
      },
    ],
  },
  {
    id: 'mo.rush.push',
    when: { hours: [7, 10], crowdMin: 0.75 },
    lines: [
      {
        t: {
          fr: 'Ne poussez pas, ça ne sert à rien. Tout le monde descend au même endroit.',
          en: 'No point pushing. Everyone gets off at the same place anyway.',
          ja: '押しても無駄ですよ。どうせみんな同じところで降りますから。',
        },
      },
    ],
  },
  {
    id: 'mo.rush.doors',
    when: { hours: [7, 10], crowdMin: 0.7, phase: ['dwell'] },
    lines: [
      {
        t: {
          fr: 'Descendez d’abord, remontez ensuite. C’est plus rapide, croyez-moi.',
          en: 'Step off first, get back on after. It is faster, believe me.',
          ja: '一度降りてから乗り直した方が早いですよ。本当に。',
        },
      },
    ],
  },
  {
    id: 'mo.rush.monday',
    when: { hours: [7, 10], weekend: false },
    lines: [
      {
        t: {
          fr: 'Encore quatre jours. Je les compte depuis la gare de départ.',
          en: 'Four more days. I have been counting since the first station.',
          ja: 'あと四日。最初の駅から数えてます。',
        },
      },
    ],
  },
  {
    id: 'mo.morning.breakfast',
    when: { hours: [6, 10] },
    lines: [
      {
        t: {
          fr: 'Un onigiri avalé sur le quai. C’est tout ce que j’aurai avant midi.',
          en: 'A rice ball on the platform. That is all I get before noon.',
          ja: 'ホームでおにぎりひとつ。お昼まではこれだけです。',
        },
      },
    ],
  },

  // --- Milieu de journée ---
  {
    id: 'mo.midday.calm',
    when: { hours: [10, 16] },
    lines: [
      {
        t: {
          fr: 'À cette heure-ci, la ligne appartient à ceux qui n’ont rien à faire.',
          en: 'At this hour the line belongs to people with nothing to do.',
          ja: 'この時間の山手線は、暇な人のものです。',
        },
      },
    ],
  },
  {
    id: 'mo.midday.sun',
    when: { hours: [11, 15], moving: true },
    lines: [
      {
        t: {
          fr: 'Le soleil traverse tout le wagon quand on tourne. Là, à l’instant.',
          en: 'The sun sweeps right through the carriage on the curves. There - just then.',
          ja: 'カーブで日差しが車内を横切るんです。ほら、今。',
        },
      },
    ],
  },
  {
    id: 'mo.midday.errand',
    when: { hours: [10, 16], weekend: false },
    lines: [
      {
        t: {
          fr: 'Une course à faire en plein après-midi. Ça me change de tout.',
          en: 'An errand in the middle of the afternoon. It makes a change from everything.',
          ja: '平日の昼間に用事なんて、なんだか新鮮です。',
        },
      },
    ],
  },
  {
    id: 'mo.afternoon.school',
    when: { hours: [15, 18], archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Les lycéens montent tous à la même heure. Le wagon change de bruit.',
          en: 'The school crowd all get on at once. The carriage changes sound.',
          ja: '高校生が一斉に乗ってきます。車内の音が変わるんですよ。',
        },
      },
    ],
  },

  // --- Pointe du soir ---
  {
    id: 'mo.evening.tired',
    when: { hours: [17, 21] },
    lines: [
      {
        t: {
          fr: 'Le soir, tout le monde regarde par terre. Le matin, on regarde son téléphone.',
          en: 'In the evening everyone looks at the floor. In the morning it is the phone.',
          ja: '夕方はみんな床を見てます。朝はスマホですけどね。',
        },
      },
    ],
  },
  {
    id: 'mo.evening.friday',
    when: { hours: [18, 24], weekend: false },
    lines: [
      {
        t: {
          fr: 'Vendredi soir. La rame sent la bière depuis Shimbashi.',
          en: 'Friday night. The carriage has smelled of beer since Shimbashi.',
          ja: '金曜の夜ですね。新橋からずっとビールの匂いです。',
        },
      },
    ],
  },
  {
    id: 'mo.evening.home',
    when: { hours: [18, 23] },
    lines: [
      {
        t: {
          fr: 'Encore vingt minutes et je suis chez moi. C’est la meilleure partie.',
          en: 'Twenty more minutes and I am home. This is the best part.',
          ja: 'あと二十分で家です。ここがいちばんいい時間ですね。',
        },
      },
    ],
  },

  // --- Nuit ---
  {
    id: 'mo.night.last',
    when: { hours: [23, 26] },
    lines: [
      {
        t: {
          fr: 'C’est presque le dernier. Après, c’est le taxi ou le café ouvert la nuit.',
          en: 'This is nearly the last one. After that it is a taxi or an all-night café.',
          ja: 'そろそろ終電です。逃したらタクシーか、朝までカフェですね。',
        },
      },
    ],
  },
  {
    id: 'mo.night.sleeper',
    when: { hours: [22, 26] },
    lines: [
      {
        t: {
          fr: 'Regardez-le. Il va se réveiller au dépôt, à ce rythme.',
          en: 'Look at him. At this rate he wakes up at the depot.',
          ja: 'あの人、このままだと車庫で起きますよ。',
        },
      },
    ],
  },
  {
    id: 'mo.night.shoes',
    when: { hours: [23, 26], feminine: true },
    lines: [
      {
        t: {
          fr: 'J’ai mes chaussures à la main depuis Shibuya. Je ne le regrette pas.',
          en: 'I have been carrying my shoes since Shibuya. No regrets.',
          ja: '渋谷から靴を手に持ってます。後悔はしてません。',
        },
      },
    ],
  },
  {
    id: 'mo.night.quiet.city',
    when: { hours: [23, 27], moving: true },
    lines: [
      {
        t: {
          fr: 'La ville s’éteint par quartiers entiers. On voit lesquels dorment déjà.',
          en: 'The city switches off in whole districts. You can see which ones sleep first.',
          ja: '街が区画ごとに消えていきます。どこが先に眠るか分かりますよ。',
        },
      },
    ],
  },
  {
    id: 'mo.night.karaoke',
    when: { hours: [22, 26], archetype: ['student', 'casual'] },
    lines: [
      {
        t: {
          fr: 'Cinq heures de karaoké. Je n’ai plus de voix, mais ça valait le coup.',
          en: 'Five hours of karaoke. No voice left, but it was worth it.',
          ja: { f: 'カラオケ五時間。声出ないけど、楽しかった。', m: 'カラオケ五時間。声出ないけど、楽しかったよ。' },
        },
      },
    ],
  },

  // --- Phase du trajet ---
  {
    id: 'mo.dwell.doors',
    when: { phase: ['dwell'] },
    lines: [
      {
        t: {
          fr: 'Les portes vont se refermer. Elles ne préviennent qu’une fois.',
          en: 'The doors are about to close. They only warn you once.',
          ja: 'もうすぐドアが閉まります。合図は一度きりですよ。',
        },
      },
    ],
  },
  {
    id: 'mo.dwell.melody',
    when: { phase: ['dwell'] },
    lines: [
      {
        t: {
          fr: 'Quand la mélodie s’arrête, il est déjà trop tard pour courir.',
          en: 'Once the jingle stops, it is already too late to run.',
          ja: 'メロディが止まったら、走ってももう遅いです。',
        },
      },
    ],
  },
  {
    id: 'mo.depart',
    when: { phase: ['depart'] },
    lines: [
      {
        t: {
          fr: 'Voilà. Une gare de plus. Il en reste vingt-neuf.',
          en: 'There. One more station. Twenty-nine to go.',
          ja: 'はい、ひと駅。あと二十九です。',
        },
      },
    ],
  },
  {
    id: 'mo.brake',
    when: { phase: ['brake'] },
    lines: [
      {
        t: {
          fr: 'Tenez-vous bien. Ce conducteur freine tard.',
          en: 'Hold tight. This driver brakes late.',
          ja: 'つかまってください。この運転士さん、ブレーキが遅いんです。',
        },
      },
    ],
  },
  {
    id: 'mo.cruise.speed',
    when: { phase: ['cruise'], moving: true },
    lines: [
      {
        t: {
          fr: 'On ne dépasse jamais les quatre-vingts. Les gares sont trop rapprochées.',
          en: 'We never go over eighty. The stations are too close together.',
          ja: '八十キロも出ません。駅の間隔が短すぎるので。',
        },
      },
    ],
  },
  {
    id: 'mo.next.station',
    when: { phase: ['cruise', 'brake'] },
    lines: [
      {
        t: {
          fr: 'Prochain arrêt, {next}. Vous descendez là ?',
          en: 'Next stop is {next}. Is that yours?',
          ja: '次は{next}ですね。降りられます？',
        },
      },
    ],
  },
  {
    id: 'mo.here.station',
    when: { phase: ['dwell'] },
    lines: [
      {
        t: {
          fr: 'On est à {here}. Il fait toujours plus frais sur ce quai-là.',
          en: 'We are at {here}. It is always cooler on that platform.',
          ja: '{here}ですね。このホームはいつも少し涼しいんです。',
        },
      },
    ],
  },

  // --- Foule ---
  {
    id: 'mo.crowd.record',
    when: { crowdMin: 0.85 },
    lines: [
      {
        t: {
          fr: 'Je n’avais pas vu ça depuis des mois. On ne peut plus lever le bras.',
          en: 'I have not seen it like this in months. You cannot even lift an arm.',
          ja: '久しぶりですね、ここまでは。腕も上げられません。',
        },
      },
    ],
  },
  {
    id: 'mo.crowd.breathe',
    when: { crowdMin: 0.8 },
    lines: [
      {
        t: {
          fr: 'Respirez par le nez et regardez en l’air. C’est la seule méthode.',
          en: 'Breathe through your nose and look up. That is the only method.',
          ja: '鼻で息をして、上を見るんです。それしかありません。',
        },
      },
    ],
  },
  {
    id: 'mo.crowd.next',
    when: { crowdMin: 0.7, phase: ['dwell'] },
    lines: [
      {
        t: {
          fr: 'La suivante est dans deux minutes et sera vide. Personne n’attend jamais.',
          en: 'The next one is two minutes away and will be empty. Nobody ever waits.',
          ja: '次は二分後で空いてるんですけどね。誰も待ちません。',
        },
      },
    ],
  },
  {
    id: 'mo.empty.night',
    when: { crowdMax: 0.3, hours: [22, 27] },
    lines: [
      {
        t: {
          fr: 'Un wagon vide la nuit, c’est autre chose. On entend chaque joint de rail.',
          en: 'An empty carriage at night is something else. You hear every rail joint.',
          ja: '夜の空いた車内は別物です。レールの継ぎ目が全部聞こえます。',
        },
      },
    ],
  },
  {
    id: 'mo.empty.seat',
    when: { crowdMax: 0.35, posture: ['seated'] },
    lines: [
      {
        t: {
          fr: 'Une banquette entière pour moi. Ça n’arrive pas deux fois par mois.',
          en: 'A whole bench to myself. That does not happen twice a month.',
          ja: 'ロングシートを独り占め。月に二回もない贅沢です。',
        },
      },
    ],
  },

  // --- Le joueur ---
  {
    id: 'mo.player.seated',
    when: { playerSeated: true },
    lines: [
      {
        t: {
          fr: 'Vous avez trouvé une place. C’est déjà une victoire, sur cette ligne.',
          en: 'You found a seat. On this line, that is already a win.',
          ja: '座れましたね。この線ではそれだけで勝ちです。',
        },
      },
    ],
  },
  {
    id: 'mo.player.standing',
    when: { playerSeated: false, place: 'car', crowdMax: 0.5 },
    lines: [
      {
        t: {
          fr: 'Il y a des places libres, vous savez. Vous n’êtes pas obligé de rester debout.',
          en: 'There are free seats, you know. You do not have to stand.',
          ja: '席、空いてますよ。立ってなくても大丈夫です。',
        },
      },
    ],
  },
  {
    id: 'mo.player.watching',
    lines: [
      {
        t: {
          fr: 'Vous observez les gens, non ? Moi aussi. C’est le meilleur endroit pour ça.',
          en: 'You are watching people, aren’t you? So am I. Best place for it.',
          ja: '人を見てますね。私もです。ここは絶好の場所ですから。',
        },
      },
    ],
  },
  {
    id: 'mo.player.round',
    lines: [
      {
        t: {
          fr: 'Vous avez fait le tour, on dirait. Vous étiez déjà là tout à l’heure.',
          en: 'You have been round the loop, haven’t you. You were here earlier.',
          ja: '一周されました？　さっきもいらっしゃいましたよね。',
        },
      },
    ],
  },

  // --- Saisons ---
  {
    id: 'mo.season.typhoon',
    when: { months: [8, 9, 10] },
    lines: [
      {
        t: {
          fr: 'Un typhon arrive jeudi. Ils arrêteront tout à seize heures, comme d’habitude.',
          en: 'A typhoon is due Thursday. They will stop everything at four, as usual.',
          ja: '木曜に台風が来ます。いつもどおり十六時で止めるでしょうね。',
        },
      },
    ],
  },
  {
    id: 'mo.season.autumn',
    when: { months: [10, 11] },
    lines: [
      {
        t: {
          fr: 'Les ginkgos jaunissent le long de la voie. Deux semaines, pas plus.',
          en: 'The ginkgos are turning along the tracks. Two weeks, no more.',
          ja: '線路沿いの銀杏が色づいてます。二週間だけの景色です。',
        },
      },
    ],
  },
  {
    id: 'mo.season.golden',
    when: { months: [4, 5] },
    lines: [
      {
        t: {
          fr: 'Semaine de congés. La ville se vide et la ligne devient supportable.',
          en: 'Holiday week. The city empties out and the line becomes bearable.',
          ja: '大型連休ですね。街が空いて、この線もやっと乗れるようになります。',
        },
      },
    ],
  },
  {
    id: 'mo.season.obon',
    when: { months: [8] },
    lines: [
      {
        t: {
          fr: 'Tout le monde est reparti au pays. Il n’y a plus que nous.',
          en: 'Everyone has gone back to their home town. Only us left.',
          ja: 'みんな帰省しました。残ってるのは私たちだけです。',
        },
      },
    ],
  },
  {
    id: 'mo.weekend.family',
    when: { weekend: true, hours: [9, 17] },
    lines: [
      {
        t: {
          fr: 'Le samedi, il y a des enfants dans les rames. Ça change tout.',
          en: 'On Saturdays there are children on the trains. It changes everything.',
          ja: '土曜は子どもが乗ってますね。それだけで雰囲気が違います。',
        },
      },
    ],
  },
  {
    id: 'mo.weekend.slow',
    when: { weekend: true },
    lines: [
      {
        t: {
          fr: 'Personne ne court aujourd’hui. Regardez le quai : personne.',
          en: 'Nobody is running today. Look at the platform: nobody.',
          ja: '今日は誰も走ってません。ホームを見てください、誰も。',
        },
      },
    ],
  },
];
