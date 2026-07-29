// Les vies.
//
// Le fond du catalogue : ce qu'on ne dit qu'à un inconnu, justement parce
// qu'on ne le reverra pas. Une confidence de deux stations, un souvenir, une
// décision prise entre deux gares. C'est ici que le genre pèse le plus —
// « je suis restée », « je suis resté » —, et ici qu'il faut le plus se retenir
// d'en faire trop : personne ne raconte sa vie entière à un voisin de wagon.

import type { DialogueEntry } from './types';

export const DIALOGUE_LIVES: readonly DialogueEntry[] = [
  // ——— Confidences ———
  {
    id: 'lv.decision',
    lines: [
      {
        t: {
          fr: 'J’ai pris une décision importante ce matin. Je ne l’ai encore dite à personne.',
          en: 'I made a big decision this morning. I have not told anyone yet.',
          ja: '今朝、大きな決断をしました。まだ誰にも言ってません。',
        },
      },
      {
        t: {
          fr: 'Voilà. Maintenant si.',
          en: 'There. Now I have.',
          ja: '……はい。今、言いました。',
        },
        gap: 0.9,
      },
    ],
  },
  {
    id: 'lv.letter',
    lines: [
      {
        t: {
          fr: { f: 'J’ai écrit une lettre que je n’enverrai pas. Je la garde dans mon sac.', m: 'J’ai écrit une lettre que je n’enverrai pas. Je la garde dans mon sac.' },
          en: 'I wrote a letter I will never send. I keep it in my bag.',
          ja: '出さない手紙を書きました。かばんに入れたままです。',
        },
      },
    ],
  },
  {
    id: 'lv.apology',
    lines: [
      {
        t: {
          fr: { f: 'Je devrais m’excuser auprès de quelqu’un. Ça fait trois ans que je devrais.', m: 'Je devrais m’excuser auprès de quelqu’un. Ça fait trois ans que je devrais.' },
          en: 'I should apologise to someone. I have needed to for three years.',
          ja: '謝らなきゃいけない人がいます。三年前からずっと。',
        },
      },
    ],
  },
  {
    id: 'lv.name.forgot',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'J’oublie les noms, maintenant. Les visages, non — les noms seulement.',
          en: 'I forget names now. Not faces. Just the names.',
          ja: '名前が出てこなくなりました。顔は覚えてるんですけどね。',
        },
      },
    ],
  },
  {
    id: 'lv.money.worry',
    lines: [
      {
        t: {
          fr: 'Je compte les jours jusqu’à la paie. Ça se voit ?',
          en: 'I am counting the days to payday. Does it show?',
          ja: '給料日まで指折り数えてます。顔に出てますか。',
        },
      },
    ],
  },
  {
    id: 'lv.love.told',
    when: { hours: [17, 26] },
    lines: [
      {
        t: {
          fr: { f: 'Je lui ai dit hier. Elle n’a rien répondu, mais elle a souri.', m: 'Je lui ai dit hier. Elle n’a rien répondu, mais elle a souri.' },
          en: 'I told her yesterday. She said nothing, but she smiled.',
          ja: '昨日、伝えました。返事はなかったけど、笑ってくれました。',
        },
      },
    ],
  },
  {
    id: 'lv.love.missed',
    lines: [
      {
        t: {
          fr: { f: 'Il descendait toujours à la même gare. Un jour il n’est plus monté.', m: 'Elle descendait toujours à la même gare. Un jour elle n’est plus montée.' },
          en: 'They always got off at the same station. One day they stopped getting on.',
          ja: 'いつも同じ駅で降りる人がいました。ある日から、乗ってこなくなって。',
        },
      },
    ],
  },
  {
    id: 'lv.wedding',
    when: { weekend: true },
    lines: [
      {
        t: {
          fr: 'Je vais à un mariage. Je ne connais que la moitié des gens.',
          en: 'I am off to a wedding. I know half the people at most.',
          ja: '結婚式に行くところです。知ってるのは半分くらいですけど。',
        },
      },
    ],
  },
  {
    id: 'lv.funeral',
    lines: [
      {
        t: {
          fr: 'Je reviens d’un enterrement. Je ne sais pas encore quoi en penser.',
          en: 'I am coming back from a funeral. I do not know what to make of it yet.',
          ja: 'お葬式の帰りです。まだ、うまく整理がつきません。',
        },
      },
    ],
  },
  {
    id: 'lv.baby',
    lines: [
      {
        t: {
          fr: 'On attend un enfant pour le printemps. Je le dis à voix haute pour m’y habituer.',
          en: 'We are expecting a child in the spring. I say it out loud to get used to it.',
          ja: '春に子どもが生まれます。慣れるために口に出してるんです。',
        },
      },
    ],
  },
  {
    id: 'lv.divorce',
    when: { hours: [19, 26] },
    lines: [
      {
        t: {
          fr: { f: 'On s’est séparés en janvier. Je prends encore le même train.', m: 'On s’est séparés en janvier. Je prends encore le même train.' },
          en: 'We separated in January. I still take the same train.',
          ja: '一月に別れました。電車だけは同じままです。',
        },
      },
    ],
  },
  {
    id: 'lv.sick',
    lines: [
      {
        t: {
          fr: 'On m’a donné des résultats ce matin. Ils sont bons. J’avais oublié ce que ça faisait.',
          en: 'I got test results this morning. They are good. I had forgotten what that felt like.',
          ja: '今朝、検査結果が出ました。良好でした。こんな気分、忘れてました。',
        },
      },
    ],
  },
  {
    id: 'lv.parent.old',
    when: { archetype: ['salaryman', 'officeLady', 'casual'] },
    lines: [
      {
        t: {
          fr: 'Mon père vieillit vite depuis un an. Je devrais y aller plus souvent.',
          en: 'My father has aged fast this past year. I should visit more.',
          ja: '父がこの一年で急に老けました。もっと帰らないと。',
        },
      },
    ],
  },

  // ——— Souvenirs ———
  {
    id: 'lv.first.day',
    lines: [
      {
        t: {
          fr: { f: 'Mon premier jour à Tokyo, je suis restée dans ce train trois tours de suite.', m: 'Mon premier jour à Tokyo, je suis resté dans ce train trois tours de suite.' },
          en: 'On my first day in Tokyo I stayed on this train for three whole loops.',
          ja: '上京した初日、この電車で三周しました。',
        },
      },
      {
        t: {
          fr: 'Je n’osais descendre nulle part.',
          en: 'I did not dare get off anywhere.',
          ja: 'どこで降りればいいか分からなくて。',
        },
        gap: 0.6,
      },
    ],
  },
  {
    id: 'lv.school.train',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'J’ai pris cette ligne pour aller au lycée. Puis au bureau. Puis à l’hôpital.',
          en: 'I took this line to school. Then to the office. Then to the hospital.',
          ja: 'この線で高校に通って、会社に通って、今は病院に通ってます。',
        },
      },
    ],
  },
  {
    id: 'lv.old.job',
    when: { senior: true },
    lines: [
      {
        t: {
          fr: 'J’ai travaillé quarante et un ans dans le même immeuble. Il n’existe plus.',
          en: 'I worked forty-one years in the same building. It is not there any more.',
          ja: '同じビルで四十一年働きました。もうありませんけどね。',
        },
      },
    ],
  },
  {
    id: 'lv.grandmother',
    lines: [
      {
        t: {
          fr: 'Ma grand-mère m’emmenait ici le samedi. Toujours à la même heure.',
          en: 'My grandmother used to bring me here on Saturdays. Always the same hour.',
          ja: '土曜には祖母がここに連れてきてくれました。いつも同じ時間に。',
        },
      },
    ],
  },
  {
    id: 'lv.snow.day',
    when: { months: [1, 2] },
    lines: [
      {
        t: {
          fr: 'Un jour de neige, la ligne s’est arrêtée trois heures. On a parlé, tous, dans le wagon.',
          en: 'One snowy day the line stopped for three hours. Everyone in the carriage talked.',
          ja: '雪の日に三時間止まったことがあります。あのときは車内の全員が話しました。',
        },
      },
    ],
  },
  {
    id: 'lv.photo.old',
    lines: [
      {
        t: {
          fr: 'J’ai une photo de moi sur ce quai, il y a vingt ans. Même endroit exactement.',
          en: 'I have a photo of myself on that platform twenty years ago. The exact same spot.',
          ja: '二十年前、あのホームで撮った写真があります。全く同じ場所で。',
        },
      },
    ],
  },

  // ——— Projets ———
  {
    id: 'lv.plan.quit.city',
    lines: [
      {
        t: {
          fr: { f: 'Je vais quitter Tokyo l’an prochain. Je le dis chaque année depuis six ans.', m: 'Je vais quitter Tokyo l’an prochain. Je le dis chaque année depuis six ans.' },
          en: 'I am leaving Tokyo next year. I have said that every year for six years.',
          ja: '来年こそ東京を出ます。六年前から毎年言ってますけど。',
        },
      },
    ],
  },
  {
    id: 'lv.plan.study',
    when: { archetype: ['student', 'casual'] },
    lines: [
      {
        t: {
          fr: 'Je me remets aux études à trente ans. Il paraît que c’est tard. Je ne trouve pas.',
          en: 'I am going back to study at thirty. Apparently that is late. I do not think so.',
          ja: '三十で学び直します。遅いと言われますけど、そうは思いません。',
        },
      },
    ],
  },
  {
    id: 'lv.plan.shop',
    lines: [
      {
        t: {
          fr: 'Je veux ouvrir un café. Six places, pas plus. J’ai déjà choisi les tasses.',
          en: 'I want to open a café. Six seats, no more. I have already chosen the cups.',
          ja: '喫茶店をやりたいんです。六席だけ。カップはもう決めてあります。',
        },
      },
    ],
  },
  {
    id: 'lv.plan.trip',
    lines: [
      {
        t: {
          fr: 'Cet été je pars vers le nord. Un train, puis un autre, sans réserver.',
          en: 'This summer I am heading north. One train, then another, nothing booked.',
          ja: '夏は北へ行きます。予約なしで、電車を乗り継いで。',
        },
      },
    ],
  },
  {
    id: 'lv.plan.language',
    when: { archetype: ['officeLady', 'casual', 'student'] },
    lines: [
      {
        t: {
          fr: 'J’apprends une langue dans le train. Trente minutes par jour, ça finit par compter.',
          en: 'I am learning a language on the train. Thirty minutes a day adds up.',
          ja: '電車で語学をやってます。一日三十分でも積もりますよ。',
        },
      },
    ],
  },
  {
    id: 'lv.plan.marathon',
    when: { months: [10, 11, 2, 3] },
    lines: [
      {
        t: {
          fr: 'Je cours le marathon en février. Je m’entraîne en descendant deux gares plus tôt.',
          en: 'I am running the marathon in February. I train by getting off two stops early.',
          ja: '二月にマラソンに出ます。二駅手前で降りるのが練習です。',
        },
      },
    ],
  },

  // ——— Petites joies ———
  {
    id: 'lv.joy.seat',
    when: { posture: ['seated'], crowdMin: 0.6 },
    lines: [
      {
        t: {
          fr: 'Assise, un jour de pointe. Ça peut suffire à sauver une journée.',
          en: 'A seat, on a peak-hour day. That alone can save a day.',
          ja: 'ラッシュの日に座れました。それだけで一日が救われます。',
        },
      },
    ],
  },
  {
    id: 'lv.joy.song',
    lines: [
      {
        t: {
          fr: 'La bonne chanson est tombée pile en entrant en gare. Ça n’arrive jamais.',
          en: 'The right song landed exactly as we pulled in. That never happens.',
          ja: '駅に入る瞬間に曲が決まりました。滅多にないことです。',
        },
      },
    ],
  },
  {
    id: 'lv.joy.smile',
    lines: [
      {
        t: {
          fr: 'Un enfant m’a souri à Ueno. J’ai tenu jusqu’ici grâce à ça.',
          en: 'A child smiled at me at Ueno. That got me this far.',
          ja: '上野で子どもが笑いかけてくれて。それでここまで持ちました。',
        },
      },
    ],
  },
  {
    id: 'lv.joy.finished',
    when: { hours: [17, 23] },
    lines: [
      {
        t: {
          fr: { f: 'J’ai fini un travail sur lequel j’étais depuis un an. Aujourd’hui.', m: 'J’ai fini un travail sur lequel j’étais depuis un an. Aujourd’hui.' },
          en: 'I finished a piece of work I have been on for a year. Today.',
          ja: '一年やってきた仕事が今日終わりました。',
        },
      },
    ],
  },
  {
    id: 'lv.joy.empty.car',
    when: { crowdMax: 0.25 },
    lines: [
      {
        t: {
          fr: 'Un wagon presque vide et vingt minutes devant moi. Je ne demande rien de plus.',
          en: 'An almost empty carriage and twenty minutes ahead of me. I ask for nothing more.',
          ja: 'がらがらの車内と、二十分の余裕。それ以上は望みません。',
        },
      },
    ],
  },

  // ——— Étrange, drôle ———
  {
    id: 'lv.odd.same.seat',
    lines: [
      {
        t: {
          fr: 'Je m’assois toujours à la même place. Si elle est prise, je reste debout.',
          en: 'I always sit in the same seat. If it is taken, I stand.',
          ja: 'いつも同じ席に座ります。取られてたら立ってます。',
        },
      },
    ],
  },
  {
    id: 'lv.odd.count',
    lines: [
      {
        t: {
          fr: 'Je compte les gens qui descendent. Aujourd’hui, quatre-vingt-douze.',
          en: 'I count the people getting off. Ninety-two so far today.',
          ja: '降りる人を数えてます。今日はここまでで九十二人。',
        },
      },
    ],
  },
  {
    id: 'lv.odd.eyes.closed',
    lines: [
      {
        t: {
          fr: 'Je peux dire la gare les yeux fermés. À l’oreille et au freinage.',
          en: 'I can name the station with my eyes shut. By ear, and by the braking.',
          ja: '目を閉じてても駅が分かります。音とブレーキで。',
        },
      },
    ],
  },
  {
    id: 'lv.odd.shoes',
    lines: [
      {
        t: {
          fr: 'Je regarde les chaussures, pas les visages. On apprend plus.',
          en: 'I look at shoes, not faces. You learn more.',
          ja: '顔じゃなくて靴を見ます。その方が分かるんです。',
        },
      },
    ],
  },
  {
    id: 'lv.odd.reflection',
    when: { moving: true, hours: [17, 27] },
    lines: [
      {
        t: {
          fr: 'La nuit, la vitre devient un miroir. On finit par se regarder soi-même.',
          en: 'At night the window turns into a mirror. You end up watching yourself.',
          ja: '夜の窓は鏡になります。結局、自分を見ることになるんです。',
        },
      },
    ],
  },
  {
    id: 'lv.odd.twin',
    lines: [
      {
        t: {
          fr: 'J’ai croisé quelqu’un qui me ressemblait, la semaine dernière. On s’est évités.',
          en: 'I passed someone who looked just like me last week. We avoided each other.',
          ja: '先週、自分そっくりの人とすれ違いました。お互い目を逸らして。',
        },
      },
    ],
  },
  {
    id: 'lv.odd.umbrella.count',
    when: { months: [6, 7] },
    lines: [
      {
        t: {
          fr: 'Dix-sept parapluies dans ce wagon. Je viens de les compter.',
          en: 'Seventeen umbrellas in this carriage. I just counted.',
          ja: 'この車両に傘が十七本。今数えました。',
        },
      },
    ],
  },
  {
    id: 'lv.odd.wrong.stop',
    lines: [
      {
        t: {
          fr: 'Je descends une gare trop loin exprès, parfois. Pour voir autre chose.',
          en: 'Sometimes I get off one stop too far on purpose. To see something else.',
          ja: 'たまにわざと一駅乗り過ごします。違う景色が見たくて。',
        },
      },
    ],
  },

  // ——— Le tour de la boucle ———
  {
    id: 'lv.loop.think',
    lines: [
      {
        t: {
          fr: 'Quand je ne sais pas quoi faire, je fais un tour complet. Ça remet les idées en place.',
          en: 'When I do not know what to do, I ride a whole loop. It sets things straight.',
          ja: '迷ったときは一周します。それで頭が片づくんです。',
        },
      },
    ],
  },
  {
    id: 'lv.loop.nowhere',
    lines: [
      {
        t: {
          fr: 'Une ligne qui ne va nulle part et qui ne s’arrête jamais. Ça me convient.',
          en: 'A line that goes nowhere and never stops. That suits me.',
          ja: 'どこにも行かず、終わりもしない線。私には合ってます。',
        },
      },
    ],
  },
  {
    id: 'lv.loop.same.people',
    lines: [
      {
        t: {
          fr: 'On revoit toujours les mêmes têtes. Et on ne se parle jamais.',
          en: 'You see the same faces over and over. And you never speak.',
          ja: '同じ顔ばかり見かけます。それでも話しかけないんですよね。',
        },
      },
      {
        t: {
          fr: 'Enfin. Aujourd’hui, exception.',
          en: 'Well. Today, an exception.',
          ja: '……今日は、例外ですけど。',
        },
        gap: 0.8,
      },
    ],
  },
  {
    id: 'lv.loop.time',
    lines: [
      {
        t: {
          fr: 'Une heure pour revenir au même endroit. C’est une bonne définition de la journée.',
          en: 'An hour to end up where you started. That is a fair definition of a day.',
          ja: '一時間かけて同じ場所に戻る。一日の定義としては悪くありません。',
        },
      },
    ],
  },
  {
    id: 'lv.loop.stranger',
    lines: [
      {
        t: {
          fr: 'C’est plus facile de parler à quelqu’un qu’on ne reverra pas. Vous ne trouvez pas ?',
          en: 'It is easier to talk to someone you will never see again. Don’t you think?',
          ja: '二度と会わない人の方が話しやすいですよね。そう思いませんか。',
        },
      },
    ],
  },
  {
    id: 'lv.loop.window.city',
    when: { moving: true },
    lines: [
      {
        t: {
          fr: 'Neuf millions de personnes dehors, et onze dans ce coin de wagon. C’est déjà beaucoup.',
          en: 'Nine million people out there, eleven in this corner of the carriage. That is plenty.',
          ja: '外には九百万人、この一角には十一人。それで十分です。',
        },
      },
    ],
  },
  {
    id: 'lv.loop.old.man',
    when: { senior: true, hours: [10, 16] },
    lines: [
      {
        t: {
          fr: 'Je monte le matin et je descends quand j’ai faim. Ça occupe une journée.',
          en: 'I get on in the morning and off when I get hungry. It fills a day.',
          ja: '朝乗って、お腹が空いたら降ります。それで一日が過ぎます。',
        },
      },
    ],
  },
  {
    id: 'lv.loop.quiet.company',
    lines: [
      {
        t: {
          fr: 'On est ensemble sans se connaître. C’est la seule chose que j’aime dans cette ville.',
          en: 'We are together without knowing each other. It is the one thing I love about this city.',
          ja: '知らない者同士が一緒にいる。この街で好きなのはそこだけです。',
        },
      },
    ],
  },
  {
    id: 'lv.loop.goodbye',
    lines: [
      {
        t: {
          fr: 'Voilà, c’est ma gare. Merci d’avoir écouté.',
          en: 'That is my station. Thank you for listening.',
          ja: '私の駅です。聞いてくださってありがとうございました。',
        },
      },
    ],
  },
];
