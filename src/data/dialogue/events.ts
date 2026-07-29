// Ce qu'on dit sans qu'on vous ait rien demandé.
//
// Toutes les entrées d'ici portent un `trigger` autre que `ask` : elles ne
// sortent jamais du tirage ordinaire, seulement quand le monde les provoque —
// on a bousculé quelqu'un, un voisin vient de s'étaler, le joueur s'assoit à
// côté, la rame arrive en gare.
//
// C'est la moitié la plus vivante du catalogue : une réplique qu'on n'a pas
// sollicitée prouve que les gens sont là même quand on ne les regarde pas.

import type { DialogueEntry } from './types';

export const DIALOGUE_EVENTS: readonly DialogueEntry[] = [
  // ——— Bousculade ———
  {
    id: 'ev.bump.polite',
    when: { trigger: 'bump' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Pardon. C’est moi qui étais mal placé.',
          en: 'Sorry. I was in the way.',
          ja: 'すみません。私が邪魔でしたね。',
        },
      },
    ],
  },
  {
    id: 'ev.bump.annoyed',
    when: { trigger: 'bump' },
    lines: [
      {
        t: {
          fr: 'Hé. Vous pourriez faire attention.',
          en: 'Hey. Watch where you are going.',
          ja: { f: 'ちょっと。気をつけてくださいよ。', m: 'おい。気をつけてくれよ。' },
        },
      },
    ],
  },
  {
    id: 'ev.bump.angry',
    when: { trigger: 'bump', crowdMax: 0.5 },
    lines: [
      {
        t: {
          fr: 'Il y a de la place partout et vous venez ici. Bravo.',
          en: 'There is room everywhere and you come here. Well done.',
          ja: { f: 'こんなに空いてるのに、わざわざここですか。', m: 'こんなに空いてるのに、わざわざここかよ。' },
        },
      },
    ],
  },
  {
    id: 'ev.bump.crowded',
    when: { trigger: 'bump', crowdMin: 0.7 },
    lines: [
      {
        t: {
          fr: 'Ce n’est pas grave. À ce niveau-là, on est tous dans le même paquet.',
          en: 'Never mind. At this point we are all one lump anyway.',
          ja: '大丈夫ですよ。ここまで混んでたら、もうみんな一緒くたです。',
        },
      },
    ],
  },
  {
    id: 'ev.bump.senior',
    when: { trigger: 'bump', senior: true },
    lines: [
      {
        t: {
          fr: 'Doucement, jeune homme. Je ne tiens plus aussi bien qu’avant.',
          en: 'Gently, now. I do not keep my balance like I used to.',
          ja: 'そんなに慌てないで。昔ほど踏ん張りが利かないんですよ。',
        },
      },
    ],
  },
  {
    id: 'ev.bump.foot',
    when: { trigger: 'bump' },
    lines: [
      {
        t: {
          fr: 'Mon pied. Non, non, ça va. Ça va.',
          en: 'My foot. No, no, it is fine. It is fine.',
          ja: '足が……。いえ、大丈夫です。大丈夫。',
        },
      },
    ],
  },
  {
    id: 'ev.bump.tourist',
    when: { trigger: 'bump', archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Oh — pardon, pardon. Je ne sais jamais de quel côté me pousser.',
          en: 'Oh — sorry, sorry. I never know which way to move.',
          ja: 'あ、すみません。どっちに避ければいいのかいつも分からなくて。',
        },
      },
    ],
  },

  // ——— Quelqu'un est tombé ———
  {
    id: 'ev.fall.concern',
    when: { trigger: 'fallNearby' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Vous avez vu ? J’espère qu’il ne s’est pas fait mal.',
          en: 'Did you see that? I hope they are not hurt.',
          ja: '今の、見ました？　怪我してなければいいんですけど。',
        },
      },
    ],
  },
  {
    id: 'ev.fall.brake',
    when: { trigger: 'fallNearby' },
    lines: [
      {
        t: {
          fr: 'Ce freinage était sec. Ça arrive quand on entre trop vite.',
          en: 'That was a hard stop. It happens when they come in too fast.',
          ja: '今のブレーキ、強かったですね。進入が速いとこうなります。',
        },
      },
    ],
  },
  {
    id: 'ev.fall.strap',
    when: { trigger: 'fallNearby', posture: ['standing'] },
    lines: [
      {
        t: {
          fr: 'Voilà pourquoi je ne lâche jamais la poignée. Jamais.',
          en: 'That is why I never let go of the strap. Never.',
          ja: 'だから私は吊り革を離さないんです。絶対に。',
        },
      },
    ],
  },
  {
    id: 'ev.fall.laugh',
    when: { trigger: 'fallNearby', archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Je ne devrais pas rire. Je ne devrais vraiment pas.',
          en: 'I should not laugh. I really should not.',
          ja: '笑っちゃいけないんですけど。本当にいけないんですけど。',
        },
      },
    ],
  },

  // ——— Le joueur vient de monter / descendre ———
  {
    id: 'ev.board.welcome',
    when: { trigger: 'boarding' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Vous avez eu de la chance. Les portes se refermaient.',
          en: 'You made it. Those doors were closing.',
          ja: 'ぎりぎりでしたね。ドアが閉まりかけてましたよ。',
        },
      },
    ],
  },
  {
    id: 'ev.board.room',
    when: { trigger: 'boarding', crowdMin: 0.6 },
    lines: [
      {
        t: {
          fr: 'Avancez vers le centre. Il y a toujours de la place au milieu.',
          en: 'Move down inside. There is always room in the middle.',
          ja: '奥へどうぞ。真ん中はいつも空いてます。',
        },
      },
    ],
  },
  // Le doute sur le sens, dit par quelqu'un qui a vu la scène cent fois. Il
  // nomme le sens RÉEL de la rame : c'est toute la valeur de la réplique.
  {
    id: 'ev.board.wrong',
    when: { trigger: 'boarding', direction: 'inner' },
    lines: [
      {
        t: {
          fr: 'Vous êtes sûr de votre sens ? Celui-ci fait le tour par l’intérieur.',
          en: 'Sure you are going the right way? This one runs the inner loop.',
          ja: '方向、合ってます？　これは内回りですよ。',
        },
      },
    ],
  },
  {
    id: 'ev.board.wrong.outer',
    when: { trigger: 'boarding', direction: 'outer' },
    lines: [
      {
        t: {
          fr: 'Vous êtes sûr de votre sens ? Celui-ci fait le tour par l’extérieur.',
          en: 'Sure you are going the right way? This one runs the outer loop.',
          ja: '方向、合ってます？　これは外回りですよ。',
        },
      },
    ],
  },
  {
    id: 'ev.board.platform',
    when: { trigger: 'boarding', place: 'platform' },
    lines: [
      {
        t: {
          fr: 'Vous descendez ici ? Il y a plus joli comme gare, mais bon.',
          en: 'Getting off here? There are prettier stations, but never mind.',
          ja: 'ここで降りるんですか。もっと綺麗な駅もありますけどね。',
        },
      },
    ],
  },

  // ——— Le joueur s'assoit à côté ———
  {
    id: 'ev.sat.hello',
    when: { trigger: 'satDown' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Je me pousse un peu. Voilà.',
          en: 'Let me shift over. There.',
          ja: '少し詰めますね。どうぞ。',
        },
      },
    ],
  },
  {
    id: 'ev.sat.long',
    when: { trigger: 'satDown' },
    lines: [
      {
        t: {
          fr: 'Vous en avez pour longtemps ? Je descends dans trois stations.',
          en: 'Long way to go? I get off in three stops.',
          ja: '長いんですか。私は三駅で降ります。',
        },
      },
    ],
  },
  {
    id: 'ev.sat.tired',
    when: { trigger: 'satDown', hours: [18, 26] },
    lines: [
      {
        t: {
          fr: 'S’asseoir. C’est tout ce que je demandais à cette journée.',
          en: 'Sitting down. That is all I asked of this day.',
          ja: '座れた。今日一日、それだけを願ってました。',
        },
      },
    ],
  },
  {
    id: 'ev.sat.senior',
    when: { trigger: 'satDown', senior: true },
    lines: [
      {
        t: {
          fr: 'Asseyez-vous, asseyez-vous. On tient à deux, largement.',
          en: 'Sit, sit. There is room for two easily.',
          ja: 'どうぞどうぞ。二人でも十分座れますよ。',
        },
      },
    ],
  },

  // ——— On passe simplement à côté ———
  {
    id: 'ev.pass.excuse',
    when: { trigger: 'passby' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Pardon, je vous laisse passer.',
          en: 'Sorry — after you.',
          ja: 'あ、どうぞお先に。',
        },
      },
    ],
  },
  {
    id: 'ev.pass.direction',
    when: { trigger: 'passby', place: 'platform' },
    lines: [
      {
        t: {
          fr: 'La sortie est de l’autre côté. Tout le monde se trompe ici.',
          en: 'The exit is the other way. Everybody gets it wrong here.',
          ja: '出口は反対側です。ここはみんな間違えます。',
        },
      },
    ],
  },
  {
    id: 'ev.pass.look',
    when: { trigger: 'passby' },
    lines: [
      {
        t: {
          fr: 'Vous cherchez quelque chose ? Je connais la ligne par cœur.',
          en: 'Looking for something? I know this line by heart.',
          ja: '何かお探しですか。この線なら詳しいですよ。',
        },
      },
    ],
  },
  {
    id: 'ev.pass.door',
    when: { trigger: 'passby', place: 'car', phase: ['dwell'] },
    lines: [
      {
        t: {
          fr: 'Attention, ne restez pas dans l’embrasure. Elles se ferment vite.',
          en: 'Careful, don’t stand in the doorway. They close quickly.',
          ja: 'ドアのところは危ないですよ。閉まるの、速いですから。',
        },
      },
    ],
  },

  // ——— Arrivée en gare ———
  {
    id: 'ev.arr.here',
    when: { trigger: 'arrival' },
    weight: 2,
    lines: [
      {
        t: {
          fr: '{here}. C’est là que je descends. Bonne continuation.',
          en: '{here}. This is me. Enjoy the rest of your ride.',
          ja: '{here}ですね。ここで失礼します。良い旅を。',
        },
      },
    ],
  },
  {
    id: 'ev.arr.almost',
    when: { trigger: 'arrival' },
    lines: [
      {
        t: {
          fr: 'J’ai failli m’endormir. Encore une station et c’était fichu.',
          en: 'I nearly nodded off. One more stop and it would have been over.',
          ja: '寝るところでした。あと一駅で乗り過ごしてました。',
        },
      },
    ],
  },
  {
    id: 'ev.arr.transfer',
    when: { trigger: 'arrival', station: [0, 4, 12, 16, 19, 24, 28] },
    lines: [
      {
        t: {
          fr: 'Correspondance à {here}. Suivez la foule, elle sait où elle va.',
          en: 'Transfer at {here}. Follow the crowd, it knows the way.',
          ja: '{here}で乗り換えです。人の流れについていけば大丈夫。',
        },
      },
    ],
  },
  {
    id: 'ev.arr.wait',
    when: { trigger: 'arrival', place: 'platform' },
    lines: [
      {
        t: {
          fr: 'La rame suivante arrive déjà. C’est ça, cette ligne.',
          en: 'The next one is already coming. That is this line for you.',
          ja: 'もう次が来ますよ。この線はそういうものです。',
        },
      },
    ],
  },
  {
    id: 'ev.arr.rain',
    when: { trigger: 'arrival', months: [6, 7, 9] },
    lines: [
      {
        t: {
          fr: 'Il pleut dehors. Vous avez un parapluie, au moins ?',
          en: 'It is raining out there. Do you have an umbrella at least?',
          ja: '外は雨ですよ。傘はお持ちですか。',
        },
      },
    ],
  },

  // ——— Second souffle : de quoi ne pas se répéter ———
  //
  // Un déclencheur qui n'aurait que deux ou trois répliques se ferait
  // reconnaître dès le deuxième trajet. Ce bloc-ci n'est conditionné à rien :
  // il répond toujours, quel que soit l'état du monde.
  {
    id: 'ev.bump.silent',
    when: { trigger: 'bump' },
    lines: [
      {
        t: {
          fr: 'Non, non. Ce n’est rien.',
          en: 'No, no. It is nothing.',
          ja: 'いえ、いえ。何でもないです。',
        },
      },
    ],
  },
  {
    id: 'ev.bump.balance',
    when: { trigger: 'bump' },
    lines: [
      {
        t: {
          fr: 'J’ai failli tomber. Ça va, j’ai rattrapé.',
          en: 'I nearly went over. It is fine, I caught myself.',
          ja: '転びかけました。大丈夫、持ち直しました。',
        },
      },
    ],
  },
  {
    id: 'ev.bump.sigh',
    when: { trigger: 'bump' },
    lines: [
      {
        t: {
          fr: 'Bon. Ce n’est pas votre faute, c’est la journée.',
          en: 'Right. It is not you, it is the day I am having.',
          ja: 'まあ、あなたのせいじゃありません。今日がそういう日なんです。',
        },
      },
    ],
  },
  {
    id: 'ev.fall.helped',
    when: { trigger: 'fallNearby' },
    lines: [
      {
        t: {
          fr: 'Quelqu’un l’a aidé à se relever. On le fait encore, c’est bien.',
          en: 'Someone helped them up. People still do that. Good.',
          ja: '誰かが助け起こしましたね。まだそういう人がいる、いいことです。',
        },
      },
    ],
  },
  {
    id: 'ev.fall.me',
    when: { trigger: 'fallNearby' },
    lines: [
      {
        t: {
          fr: 'Ça m’est arrivé l’an dernier. Devant tout le wagon.',
          en: 'That happened to me last year. In front of the whole carriage.',
          ja: '去年、私もやりました。車両中の前で。',
        },
      },
    ],
  },
  {
    id: 'ev.fall.floor',
    when: { trigger: 'fallNearby' },
    lines: [
      {
        t: {
          fr: 'Le sol est glissant quand il a plu. Ils ne le sablent jamais.',
          en: 'The floor gets slick after rain. They never grit it.',
          ja: '雨の日は床が滑るんです。何もしてくれませんけどね。',
        },
      },
    ],
  },
  {
    id: 'ev.board.seat',
    when: { trigger: 'boarding' },
    lines: [
      {
        t: {
          fr: 'Il y avait une place là il y a dix secondes. Vous l’avez ratée de peu.',
          en: 'There was a seat there ten seconds ago. You just missed it.',
          ja: '十秒前まで席が空いてたんですよ。惜しかったですね。',
        },
      },
    ],
  },
  {
    id: 'ev.board.again',
    when: { trigger: 'boarding' },
    lines: [
      {
        t: {
          fr: 'Encore vous. On fait le même tour, on dirait.',
          en: 'You again. We seem to be going round together.',
          ja: 'またお会いしましたね。同じところを回ってるみたいです。',
        },
      },
    ],
  },
  {
    id: 'ev.board.breath',
    when: { trigger: 'boarding' },
    lines: [
      {
        t: {
          fr: 'Reprenez votre souffle. Le train ne repart pas tout de suite.',
          en: 'Get your breath back. The train is not going anywhere yet.',
          ja: '息を整えてください。まだ発車しませんから。',
        },
      },
    ],
  },
  {
    id: 'ev.sat.window',
    when: { trigger: 'satDown' },
    lines: [
      {
        t: {
          fr: 'Vous avez la meilleure place. On voit toute la ville d’ici.',
          en: 'You have the best seat. You can see the whole city from there.',
          ja: 'そこ、いちばんいい席ですよ。街が全部見えます。',
        },
      },
    ],
  },
  {
    id: 'ev.sat.silent',
    when: { trigger: 'satDown' },
    lines: [
      {
        t: {
          fr: 'Ne vous inquiétez pas, je ne parle pas tout le trajet.',
          en: 'Don’t worry, I won’t talk the whole way.',
          ja: 'ご心配なく。ずっと喋ったりしませんから。',
        },
      },
    ],
  },
  {
    id: 'ev.sat.warm',
    when: { trigger: 'satDown' },
    lines: [
      {
        t: {
          fr: 'La banquette est chauffée en hiver. C’est le seul luxe de cette ligne.',
          en: 'The seats are heated in winter. The one luxury on this line.',
          ja: '冬は座席が温かいんです。この線で唯一の贅沢ですね。',
        },
      },
    ],
  },
  {
    id: 'ev.pass.nothing',
    when: { trigger: 'passby' },
    lines: [
      {
        t: {
          fr: 'Ah — non, rien. Je vous ai pris pour quelqu’un.',
          en: 'Ah — no, nothing. I mistook you for someone.',
          ja: 'あ、いえ。人違いでした。',
        },
      },
    ],
  },
  {
    id: 'ev.pass.mind',
    when: { trigger: 'passby' },
    lines: [
      {
        t: {
          fr: 'Attention à la marche en descendant. Elle est plus haute qu’elle en a l’air.',
          en: 'Mind the step on your way out. It is higher than it looks.',
          ja: '降りるとき段差にご注意を。見た目より高いんです。',
        },
      },
    ],
  },
  {
    id: 'ev.pass.hurry',
    when: { trigger: 'passby' },
    lines: [
      {
        t: {
          fr: 'Vous avez l’air pressé. Le prochain est dans deux minutes, vous savez.',
          en: 'You look in a hurry. The next one is two minutes away, you know.',
          ja: 'お急ぎですか。次は二分後に来ますよ。',
        },
      },
    ],
  },
  {
    id: 'ev.arr.doors',
    when: { trigger: 'arrival' },
    lines: [
      {
        t: {
          fr: 'Les portes s’ouvrent de ce côté. Ne vous mettez pas dans le passage.',
          en: 'The doors open on this side. Best not to stand in the way.',
          ja: 'ドアはこちら側です。通り道に立たない方がいいですよ。',
        },
      },
    ],
  },
  {
    id: 'ev.arr.stay',
    when: { trigger: 'arrival' },
    lines: [
      {
        t: {
          fr: 'Moi je reste. Je fais encore un tour, je crois.',
          en: 'I am staying on. Another loop, I think.',
          ja: '私は残ります。もう一周してみようかと。',
        },
      },
    ],
  },
  {
    id: 'ev.arr.crowd',
    when: { trigger: 'arrival' },
    lines: [
      {
        t: {
          fr: 'Regardez le quai. Ils vont tous monter dans notre voiture.',
          en: 'Look at that platform. They are all coming into our carriage.',
          ja: 'ホーム、見てください。全員この車両に乗ってきますよ。',
        },
      },
    ],
  },

  // ——— Arrêt d'urgence : la peur ———
  //
  // Deux temps, et le catalogue les distingue par `moving` :
  //
  // - LE COUP DE FREIN. On ne sait pas encore ce qui se passe, on s'est
  //   raccroché à ce qu'on a pu, et on le dit tout de suite.
  // - L'IMMOBILISATION. La rame est arrêtée en pleine voie, le silence s'est
  //   installé, et la peur change de nature : elle devient l'attente.
  //
  // Ces répliques sont les seules à sortir plusieurs fois de suite, par des
  // voisins différents (systems/conversation) : un wagon qui freine en urgence
  // ne produit pas une remarque polie, il produit un brouhaha inquiet.
  {
    id: 'ev.em.what',
    when: { trigger: 'emergency', place: 'car' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Qu’est-ce qui se passe ?!',
          en: 'What is going on?!',
          ja: '今の、何ですか！',
        },
      },
      {
        gap: 0.7,
        t: {
          fr: 'J’ai eu peur. J’ai vraiment eu peur.',
          en: 'That scared me. That really scared me.',
          ja: { f: '怖かった……本当に怖かったわ。', m: '怖かった……本当に怖かった。' },
        },
      },
    ],
  },
  {
    id: 'ev.em.scared',
    when: { trigger: 'emergency', place: 'car' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'J’ai peur. Je n’aime pas ça du tout.',
          en: 'I am scared. I do not like this one bit.',
          ja: { f: '怖い。こういうの、本当に苦手なの。', m: '怖い。こういうの、本当に苦手なんだ。' },
        },
      },
    ],
  },
  {
    id: 'ev.em.heart',
    when: { trigger: 'emergency', place: 'car' },
    lines: [
      {
        t: {
          fr: 'Mon cœur bat encore. J’ai cru qu’on avait percuté quelque chose.',
          en: 'My heart is still going. I thought we had hit something.',
          ja: '心臓がまだドキドキしてます。何かにぶつかったのかと思って。',
        },
      },
    ],
  },
  {
    id: 'ev.em.hard',
    when: { trigger: 'emergency', place: 'car' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Ce n’était pas un freinage normal, ça. J’ai peur, là.',
          en: 'That was not normal braking. I am frightened now.',
          ja: '今のは普通のブレーキじゃないですよ。……怖いです。',
        },
      },
    ],
  },
  {
    id: 'ev.em.hands',
    when: { trigger: 'emergency', place: 'car' },
    lines: [
      {
        t: {
          fr: 'Regardez, mes mains tremblent encore. J’ai eu peur.',
          en: 'Look, my hands are still shaking. That frightened me.',
          ja: { f: '見て、手がまだ震えてるの。怖かった。', m: '見て、手がまだ震えてる。怖かった。' },
        },
      },
    ],
  },
  {
    id: 'ev.em.hush',
    when: { trigger: 'emergency', place: 'car' },
    lines: [
      {
        t: {
          fr: 'Tout le monde s’est tu d’un coup. C’est ça qui fait peur.',
          en: 'Everyone went quiet at once. That is the frightening part.',
          ja: 'みんな一斉に黙りましたね。それがまた怖い。',
        },
      },
    ],
  },
  {
    id: 'ev.em.window',
    when: { trigger: 'emergency', place: 'car' },
    lines: [
      {
        t: {
          fr: 'J’ai regardé dehors et j’ai eu peur de ce que j’allais voir.',
          en: 'I looked out and I was afraid of what I would see.',
          ja: '外を見て、何が見えるのかと思うと怖くなりました。',
        },
      },
    ],
  },
  {
    id: 'ev.em.hold',
    when: { trigger: 'emergency', place: 'car', posture: ['standing'] },
    lines: [
      {
        t: {
          fr: 'Tenez-vous bien. Ce coup de frein m’a fait peur.',
          en: 'Hold on tight. That braking frightened me.',
          ja: 'しっかり掴まってください。今のブレーキ、怖かったです。',
        },
      },
    ],
  },
  {
    id: 'ev.em.senior',
    when: { trigger: 'emergency', place: 'car', senior: true },
    lines: [
      {
        t: {
          fr: 'À mon âge, une secousse pareille fait peur. J’ai bien cru tomber.',
          en: 'At my age a jolt like that is frightening. I nearly went down.',
          ja: 'この歳になると、ああいう揺れは怖いですよ。転ぶかと思いました。',
        },
      },
    ],
  },
  {
    id: 'ev.em.tourist',
    when: { trigger: 'emergency', place: 'car', archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'C’est normal, ça ? Non ? Bon, là j’ai peur.',
          en: 'Is this normal? No? All right, now I am scared.',
          ja: 'これ、普通ですか？　違う？　……ちょっと怖いんですけど。',
        },
      },
    ],
  },
  {
    id: 'ev.em.student',
    when: { trigger: 'emergency', place: 'car', archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'J’ai eu trop peur. Sérieux, j’ai crié.',
          en: 'That scared me so bad. I actually screamed.',
          ja: { f: 'めっちゃ怖かった。声出ちゃったんだけど。', m: 'めっちゃ怖かった。声出たんだけど。' },
        },
      },
    ],
  },
  {
    id: 'ev.em.crowded',
    when: { trigger: 'emergency', place: 'car', crowdMin: 0.65 },
    lines: [
      {
        t: {
          fr: 'Serrés comme on est, si ça recommence, j’ai peur qu’on tombe tous ensemble.',
          en: 'Packed in like this, if it happens again I am afraid we all go down together.',
          ja: 'この混み方でもう一度来たら、みんなで倒れそうで怖いです。',
        },
      },
    ],
  },
  {
    id: 'ev.em.stop.silence',
    when: { trigger: 'emergency', place: 'car', moving: false },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'On est arrêtés en pleine voie. C’est ce silence qui me fait peur.',
          en: 'We are stopped out on the open track. It is the silence that frightens me.',
          ja: '線路の真ん中で止まってますね。この静けさが怖いんです。',
        },
      },
    ],
  },
  {
    id: 'ev.em.stop.why',
    when: { trigger: 'emergency', place: 'car', moving: false },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Ils ne disent pas vraiment pourquoi.',
          en: 'They are not really saying why.',
          ja: 'はっきりした理由は言ってくれませんね。',
        },
      },
      {
        gap: 0.8,
        t: {
          fr: 'C’est ça qui me fait peur, en fait.',
          en: 'That is the part that scares me, honestly.',
          ja: { f: 'それが怖いのよね、正直。', m: 'それが怖いんだよな、正直。' },
        },
      },
    ],
  },
  {
    id: 'ev.em.stop.long',
    when: { trigger: 'emergency', place: 'car', moving: false },
    lines: [
      {
        t: {
          fr: 'J’ai peur qu’on reste là longtemps. Je préviens chez moi.',
          en: 'I am afraid we will be here a while. I am letting them know at home.',
          ja: '長くなりそうで怖いです。家に連絡しておきます。',
        },
      },
    ],
  },
  {
    id: 'ev.em.stop.calm',
    when: { trigger: 'emergency', place: 'car', moving: false },
    lines: [
      {
        t: {
          fr: 'Respirez. Moi aussi j’ai peur, mais ça va repartir.',
          en: 'Just breathe. I am scared too, but it will start moving again.',
          ja: { f: '深呼吸して。私も怖いけど、また動きますから。', m: '深呼吸して。僕も怖いけど、また動きますから。' },
        },
      },
    ],
  },
  {
    id: 'ev.em.stop.senior',
    when: { trigger: 'emergency', place: 'car', senior: true, moving: false },
    lines: [
      {
        t: {
          fr: 'Depuis le grand tremblement de terre, un train arrêté comme ça me fait peur.',
          en: 'Ever since the big earthquake, a train stopped like this frightens me.',
          ja: '震災を経験してから、こうして止まると怖くてね。',
        },
      },
    ],
  },
  {
    id: 'ev.em.stop.night',
    when: { trigger: 'emergency', place: 'car', moving: false, hours: [22, 26] },
    lines: [
      {
        t: {
          fr: 'La nuit, arrêtés au milieu de nulle part, ça me fait peur.',
          en: 'At night, stopped in the middle of nowhere, this frightens me.',
          ja: '夜にこんな所で止まると、やっぱり怖いです。',
        },
      },
    ],
  },
  {
    id: 'ev.em.stop.signal',
    when: { trigger: 'emergency', place: 'car', moving: false },
    lines: [
      {
        t: {
          fr: 'Je n’ai presque plus de réseau. Ne pas pouvoir appeler, ça me fait peur.',
          en: 'I have almost no signal. Not being able to call is what scares me.',
          ja: '電波がほとんど入らない。連絡できないのが怖いです。',
        },
      },
    ],
  },

  // --- Coupure de caténaire (停電) -----------------------------------------
  //
  // L'autre événement collectif, et il ne se dit pas comme le premier.
  //
  // Un coup de frein s'annonce par une secousse : on se raccroche, on a peur,
  // on le dit tout de suite. Une coupure de courant n'a rien à rattraper. Ce
  // qui se remarque, c'est ce qui MANQUE — le chant de l'onduleur, le souffle
  // de la clim, les écrans au-dessus des portes. La première réplique d'une
  // coupure n'est donc jamais « qu'est-ce qui se passe ?! » mais quelque chose
  // de plus bas, de plus lent, et souvent un simple constat.
  //
  // Deux moments, comme pour l'urgence, distingués par `moving` : la rame
  // roule encore sur son élan, puis elle est posée en pleine voie et l'attente
  // s'installe.
  {
    id: 'ev.po.lights',
    when: { trigger: 'outage', place: 'car', moving: true },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'La lumière a baissé.',
          en: 'The lights just dropped.',
          ja: '照明、落ちましたね。',
        },
      },
      {
        gap: 0.9,
        t: {
          fr: 'Et on n’entend plus le moteur.',
          en: 'And the motors have gone quiet.',
          ja: { f: 'モーターの音も消えたわ。', m: 'モーターの音も消えたな。' },
        },
      },
    ],
  },
  {
    id: 'ev.po.quiet',
    when: { trigger: 'outage', place: 'car', moving: true },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'On roule sur l’élan, là. Il n’y a plus rien qui pousse.',
          en: 'We are just coasting now. Nothing is pushing us.',
          ja: '惰性で走ってますね。もう何も動かしてない。',
        },
      },
    ],
  },
  {
    id: 'ev.po.screens',
    when: { trigger: 'outage', place: 'car' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Les écrans au-dessus des portes sont noirs.',
          en: 'The screens above the doors have gone black.',
          ja: 'ドアの上のモニター、真っ暗です。',
        },
      },
    ],
  },
  {
    id: 'ev.po.aircon',
    when: { trigger: 'outage', place: 'car' },
    lines: [
      {
        t: {
          fr: 'La clim s’est arrêtée. On l’entend d’un coup, ce silence.',
          en: 'The air conditioning has stopped. You suddenly hear how quiet it is.',
          ja: { f: '空調が止まったわ。急に静かになったのが分かる。', m: '空調が止まったな。急に静かになったのが分かる。' },
        },
      },
    ],
  },
  {
    id: 'ev.po.teiden',
    when: { trigger: 'outage', place: 'car', moving: false },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'C’est une panne de courant. La caténaire.',
          en: 'It is a power failure. The overhead line.',
          ja: '停電ですね。架線でしょう。',
        },
      },
      {
        gap: 1,
        t: {
          fr: 'Tant qu’il n’y a pas de courant, on ne bouge pas.',
          en: 'With no power we are not going anywhere.',
          ja: '電気が来ないうちは動けません。',
        },
      },
    ],
  },
  {
    id: 'ev.po.nobattery',
    when: { trigger: 'outage', place: 'car', moving: false, archetype: ['student'] },
    lines: [
      {
        t: {
          fr: 'Sur les rames de Yokosuka il y a une batterie pour aller jusqu’à la gare suivante.',
          en: 'The Yokosuka Line sets have a battery to reach the next station.',
          ja: '横須賀線の車両には、次の駅まで行けるバッテリーが付いてるんですよ。',
        },
      },
      {
        gap: 1.1,
        t: {
          fr: 'Les vertes, non. On attend.',
          en: 'The green ones do not. We wait.',
          ja: { f: 'この緑のには無いの。だから待つしかないわ。', m: 'この緑のには無いんだ。だから待つしかない。' },
        },
      },
    ],
  },
  {
    id: 'ev.po.emergency.lamps',
    when: { trigger: 'outage', place: 'car', moving: false },
    lines: [
      {
        t: {
          fr: 'Il reste les lampes de secours. Les batteries tiennent l’essentiel.',
          en: 'The emergency lamps are still on. The batteries carry the essentials.',
          ja: '非常灯は点いてます。バッテリーが最低限は持たせてくれる。',
        },
      },
    ],
  },
  {
    id: 'ev.po.doors',
    when: { trigger: 'outage', place: 'car', moving: false },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Surtout, personne n’ouvre les portes.',
          en: 'Whatever happens, nobody opens the doors.',
          ja: '絶対に、自分でドアを開けないでください。',
        },
      },
      {
        gap: 1,
        t: {
          fr: 'La voie d’à côté peut être circulée, et le courant peut revenir n’importe quand.',
          en: 'The next track may still be running, and the power can come back any moment.',
          ja: '隣の線路は動いてるかもしれないし、電気だっていつ戻るか分かりません。',
        },
      },
    ],
  },
  {
    id: 'ev.po.hot',
    when: { trigger: 'outage', place: 'car', moving: false, months: [6, 7, 8, 9] },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Sans ventilation, ça va monter vite ici.',
          en: 'With no ventilation it is going to get hot in here fast.',
          ja: '換気が止まると、ここはすぐ暑くなりますよ。',
        },
      },
    ],
  },
  {
    id: 'ev.po.cold',
    when: { trigger: 'outage', place: 'car', moving: false, months: [12, 1, 2] },
    lines: [
      {
        t: {
          fr: 'Le chauffage est coupé aussi. On va le sentir passer.',
          en: 'The heating is off as well. We are going to feel that.',
          ja: '暖房も切れてますね。だんだん冷えてきます。',
        },
      },
    ],
  },
  {
    id: 'ev.po.wait',
    when: { trigger: 'outage', place: 'car', moving: false },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'On en a pour un moment. Ça ne se répare pas en deux minutes, une caténaire.',
          en: 'We will be here a while. Overhead wires do not get fixed in two minutes.',
          ja: '長くなりますよ。架線はそう簡単には直りません。',
        },
      },
    ],
  },
  {
    id: 'ev.po.tourist',
    when: { trigger: 'outage', place: 'car', moving: false, archetype: ['tourist'] },
    lines: [
      {
        t: {
          fr: 'Je croyais que les trains japonais ne s’arrêtaient jamais.',
          en: 'I thought Japanese trains never stopped.',
          ja: '日本の電車は止まらないと思っていました。',
        },
      },
    ],
  },
  {
    id: 'ev.po.senior',
    when: { trigger: 'outage', place: 'car', moving: false, senior: true },
    lines: [
      {
        t: {
          fr: 'On finira à pied le long de la voie, vous verrez. Ça s’est déjà vu.',
          en: 'We will end up walking down the track, you will see. It has happened before.',
          ja: '線路を歩かされることになりますよ。前にもありました。',
        },
      },
    ],
  },
  {
    id: 'ev.po.night',
    when: { trigger: 'outage', place: 'car', moving: false, hours: [22, 26] },
    lines: [
      {
        t: {
          fr: 'Dans le noir comme ça, on voit la ville par la vitre. C’est presque beau.',
          en: 'Dark like this, you can actually see the city through the window. It is almost beautiful.',
          ja: 'こう暗いと、窓から街が見えますね。少しきれいです。',
        },
      },
    ],
  },
  {
    id: 'ev.po.calm',
    when: { trigger: 'outage', place: 'car', moving: false },
    lines: [
      {
        t: {
          fr: 'Ce n’est pas un accident, au moins. Juste du courant en moins.',
          en: 'At least it is not an accident. Just no power.',
          ja: { f: '事故じゃないだけましよ。電気が来ないだけ。', m: '事故じゃないだけましだ。電気が来ないだけ。' },
        },
      },
    ],
  },

  // Le courant revient. Personne ne dit la même chose que pendant l'attente :
  // ce qui se dit là, c'est le soulagement, et il est bref.
  {
    id: 'ev.pb.lights',
    when: { trigger: 'powerBack', place: 'car' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Ah, la lumière est revenue.',
          en: 'Ah, the lights are back.',
          ja: 'あ、電気が戻りました。',
        },
      },
    ],
  },
  {
    id: 'ev.pb.aircon',
    when: { trigger: 'powerBack', place: 'car' },
    lines: [
      {
        t: {
          fr: 'La clim repart. On respire.',
          en: 'The air conditioning is starting up again. That is better.',
          ja: '空調が動き出しましたね。助かります。',
        },
      },
    ],
  },
  {
    id: 'ev.pb.screens',
    when: { trigger: 'powerBack', place: 'car' },
    lines: [
      {
        t: {
          fr: 'Les écrans se rallument. On va repartir.',
          en: 'The screens are coming back on. We will be moving soon.',
          ja: 'モニターも点きました。もう動きますよ。',
        },
      },
    ],
  },
  {
    id: 'ev.pb.late',
    when: { trigger: 'powerBack', place: 'car' },
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Je vais être en retard, mais tant pis. Au moins on repart.',
          en: 'I am going to be late, but never mind. At least we are moving.',
          ja: { f: '遅刻だけど、まあいいわ。動くだけまし。', m: '遅刻だけど、まあいいさ。動くだけまし。' },
        },
      },
    ],
  },
];
