// Ce qu'on dit à un inconnu dans un train : rien d'important.
//
// La banalité est le sujet. Un voyageur ne vous confie pas sa vie — il
// remarque qu'il fait chaud, que la rame est vide, qu'il a failli rater la
// correspondance. C'est cette absence d'enjeu qui rend une rame vivante.
//
// Rien ici n'est conditionné à une gare ni à un archétype : ce fichier est le
// fond de sauce, celui qui répond toujours présent quand aucun autre ne colle.

import type { DialogueEntry } from './types';

export const DIALOGUE_SMALLTALK: readonly DialogueEntry[] = [
  {
    id: 'st.hello',
    weight: 2,
    lines: [
      {
        t: {
          fr: 'Bonjour. Vous allez loin ?',
          en: 'Hello. Going far?',
          ja: 'こんにちは。遠くまで行かれるんですか。',
        },
      },
    ],
  },
  {
    id: 'st.loop',
    weight: 2,
    lines: [
      {
        t: {
          fr: "Cette ligne tourne en rond, vous savez. On peut y rester toute la journée si on veut.",
          en: 'This line just goes in circles, you know. You could ride it all day.',
          ja: 'この線、ぐるぐる回るだけですからね。一日中乗っていられますよ。',
        },
      },
    ],
  },
  {
    id: 'st.loop.count',
    lines: [
      {
        t: {
          fr: "Un tour complet, c'est une heure. J'en ai fait deux, aujourd'hui.",
          en: 'One full loop takes an hour. I have done two today.',
          ja: '一周で一時間。今日はもう二周してます。',
        },
      },
      {
        t: {
          fr: { f: "Je ne suis pas pressée, c'est tout.", m: "Je ne suis pas pressé, c'est tout." },
          en: 'I am in no hurry, that is all.',
          ja: { f: '急いでないの、それだけ。', m: '急いでないんだ、それだけ。' },
        },
      },
    ],
  },
  {
    id: 'st.tired',
    weight: 2,
    lines: [
      {
        t: {
          fr: { f: 'Je suis épuisée. Vraiment épuisée.', m: 'Je suis épuisé. Vraiment épuisé.' },
          en: 'I am worn out. Completely worn out.',
          ja: { f: 'もう疲れちゃった。本当に。', m: 'もう疲れたよ。本当に。' },
        },
      },
    ],
  },
  {
    id: 'st.seat.free',
    when: { posture: ['standing'] },
    lines: [
      {
        t: {
          fr: "Il y a une place là-bas, si vous voulez. Moi je descends bientôt.",
          en: 'There is a seat over there, if you want it. I get off soon anyway.',
          ja: 'あちらに席が空いてますよ。私はもうすぐ降りますので。',
        },
      },
    ],
  },
  {
    id: 'st.seat.offer',
    when: { posture: ['seated'], senior: false },
    lines: [
      {
        t: {
          fr: 'Asseyez-vous, je vous en prie. Je descends au prochain arrêt.',
          en: 'Please, take my seat. I get off at the next stop.',
          ja: 'どうぞお座りください。次で降りますから。',
        },
      },
    ],
  },
  {
    id: 'st.quiet',
    lines: [
      {
        t: {
          fr: "C'est calme, non ? On entend presque les rails.",
          en: 'Quiet, isn’t it? You can almost hear the rails.',
          ja: '静かですね。レールの音が聞こえるくらい。',
        },
      },
    ],
  },
  {
    id: 'st.almost.missed',
    lines: [
      {
        t: {
          fr: "J'ai couru sur tout le quai. Les portes se fermaient.",
          en: 'I ran the whole length of the platform. The doors were closing.',
          ja: 'ホームを走ってきました。ドアが閉まりかけてて。',
        },
      },
      {
        t: {
          fr: 'Le chef de quai ne m’a rien dit. Il a vu que je faisais de mon mieux.',
          en: 'The platform attendant said nothing. He could see I was trying.',
          ja: '駅員さんは何も言いませんでした。必死なのが分かったんでしょうね。',
        },
        gap: 0.5,
      },
    ],
  },
  {
    id: 'st.forgot',
    lines: [
      {
        t: {
          fr: { f: 'Je crois que j’ai oublié mon parapluie au bureau. Encore.', m: 'Je crois que j’ai oublié mon parapluie au bureau. Encore.' },
          en: 'I think I left my umbrella at the office. Again.',
          ja: '傘、会社に忘れてきた気がします。また。',
        },
      },
    ],
  },
  {
    id: 'st.battery',
    lines: [
      {
        t: {
          fr: 'Plus que huit pour cent. Il faut que je tienne jusqu’à la maison.',
          en: 'Eight percent left. I just need it to last until I am home.',
          ja: 'あと八パーセント。家まで持ってほしいんですけど。',
        },
      },
    ],
  },
  {
    id: 'st.wrong.way',
    lines: [
      {
        t: {
          fr: { f: 'Je crois que je suis montée dans le mauvais sens.', m: 'Je crois que je suis monté dans le mauvais sens.' },
          en: 'I think I got on going the wrong way round.',
          ja: '逆回りに乗ってしまったみたいです。',
        },
      },
      {
        t: {
          fr: 'Ce n’est pas grave. Ça revient au même, au bout du compte.',
          en: 'It doesn’t matter. It comes to the same thing in the end.',
          ja: 'まあいいんです。結局は同じところに着きますから。',
        },
        gap: 0.6,
      },
    ],
  },
  {
    id: 'st.announcement',
    lines: [
      {
        t: {
          fr: 'À force, je connais les annonces par cœur. Je les dis avant elle.',
          en: 'I know the announcements by heart now. I say them before she does.',
          ja: 'アナウンス、もう覚えちゃいました。先に言えますよ。',
        },
      },
    ],
  },
  {
    id: 'st.melody',
    lines: [
      {
        t: {
          fr: 'Chaque quai a sa mélodie. Celle-ci, je la reconnaîtrais les yeux fermés.',
          en: 'Every platform has its own jingle. I would know this one anywhere.',
          ja: 'ホームごとにメロディーが違うんです。これは目をつぶっても分かります。',
        },
      },
    ],
  },
  {
    id: 'st.newtrain',
    lines: [
      {
        t: {
          fr: 'Ces rames sont encore neuves. Elles ne font presque pas de bruit.',
          en: 'These trains are still new. They barely make a sound.',
          ja: 'この車両、まだ新しいんですよ。ほとんど音がしません。',
        },
      },
    ],
  },
  {
    id: 'st.window',
    when: { place: 'car', moving: true },
    lines: [
      {
        t: {
          fr: 'Regardez par la fenêtre. On voit les toits jusqu’au bout.',
          en: 'Look out the window. You can see rooftops all the way out.',
          ja: '窓の外、見てください。屋根がずっと向こうまで続いてます。',
        },
      },
    ],
  },
  {
    id: 'st.coffee',
    lines: [
      {
        t: {
          fr: 'Troisième café de la journée. Ça ne fait plus rien.',
          en: 'Third coffee today. It stopped working a while ago.',
          ja: '今日三杯目のコーヒーです。もう効きません。',
        },
      },
    ],
  },
  {
    id: 'st.lunch',
    when: { hours: [11, 14] },
    lines: [
      {
        t: {
          fr: { f: 'Je n’ai pas déjeuné. J’y penserai en descendant.', m: 'Je n’ai pas déjeuné. J’y penserai en descendant.' },
          en: 'I skipped lunch. I will think about it when I get off.',
          ja: 'お昼、食べそびれました。降りてから考えます。',
        },
      },
    ],
  },
  {
    id: 'st.dinner',
    when: { hours: [18, 22] },
    lines: [
      {
        t: {
          fr: 'Il y a un endroit près de la sortie sud qui fait des rāmen jusqu’à trois heures.',
          en: 'There is a place by the south exit that does ramen until three in the morning.',
          ja: '南口の近くに、朝三時までやってるラーメン屋があるんです。',
        },
      },
    ],
  },
  {
    id: 'st.overtime',
    when: { hours: [20, 24], archetype: ['salaryman', 'officeLady'] },
    lines: [
      {
        t: {
          fr: { f: 'Je suis restée trois heures de plus. Personne ne me l’avait demandé.', m: 'Je suis resté trois heures de plus. Personne ne me l’avait demandé.' },
          en: 'I stayed three hours late. Nobody asked me to.',
          ja: { f: '三時間残業しちゃった。誰にも頼まれてないのに。', m: '三時間残業したよ。誰にも頼まれてないのに。' },
        },
      },
    ],
  },
  {
    id: 'st.sleep',
    lines: [
      {
        t: {
          fr: 'Quatre heures de sommeil. Je vais dormir debout, à ce rythme.',
          en: 'Four hours of sleep. I will be asleep on my feet at this rate.',
          ja: '睡眠四時間です。このままだと立ったまま寝ますね。',
        },
      },
    ],
  },
  {
    id: 'st.dream',
    lines: [
      {
        t: {
          fr: { f: 'Je me suis endormie deux stations. J’ai rêvé que je ratais mon arrêt.', m: 'Je me suis endormi deux stations. J’ai rêvé que je ratais mon arrêt.' },
          en: 'I dozed off for two stops. I dreamt I missed my stop.',
          ja: '二駅寝てしまいました。乗り過ごす夢を見ながら。',
        },
      },
    ],
  },
  {
    id: 'st.book',
    lines: [
      {
        t: {
          fr: 'Je lis toujours dans le train. C’est le seul moment où personne ne me parle.',
          en: 'I only ever read on the train. It is the one place nobody talks to me.',
          ja: '本は電車でしか読みません。誰にも話しかけられない唯一の場所なので。',
        },
      },
      {
        t: {
          fr: 'Enfin, presque.',
          en: 'Well. Almost.',
          ja: '……まあ、ほとんどは。',
        },
        gap: 0.8,
      },
    ],
  },
  {
    id: 'st.music',
    lines: [
      {
        t: {
          fr: 'La même chanson depuis Ueno. Je n’arrive pas à passer à la suivante.',
          en: 'Same song since Ueno. I cannot bring myself to skip it.',
          ja: '上野からずっと同じ曲です。次に進めなくて。',
        },
      },
    ],
  },
  {
    id: 'st.game',
    lines: [
      {
        t: {
          fr: 'Encore un niveau et je descends. C’est ce que j’ai dit il y a trois stations.',
          en: 'One more level and I get off. That is what I said three stops ago.',
          ja: 'あと一面で降ります。三駅前もそう言いましたけど。',
        },
      },
    ],
  },
  {
    id: 'st.cat',
    lines: [
      {
        t: {
          fr: 'Mon chat m’attend derrière la porte. Il sait à quelle heure je rentre.',
          en: 'My cat waits behind the door. He knows exactly when I come home.',
          ja: 'うちの猫が玄関で待ってるんです。帰る時間を知ってるんですよ。',
        },
      },
    ],
  },
  {
    id: 'st.rush.hate',
    when: { crowdMin: 0.72 },
    lines: [
      {
        t: {
          fr: 'On ne tient plus debout tout seul là-dedans. C’est la foule qui nous tient.',
          en: 'Nobody is standing on their own in here. The crowd holds you up.',
          ja: 'もう自分で立ってないですよね。人に支えられてるだけで。',
        },
      },
    ],
  },
  {
    id: 'st.rush.wait',
    when: { crowdMin: 0.8 },
    lines: [
      {
        t: {
          fr: { f: 'J’ai laissé passer deux rames. Celle-ci n’est pas mieux.', m: 'J’ai laissé passer deux rames. Celle-ci n’est pas mieux.' },
          en: 'I let two trains go by. This one is no better.',
          ja: '二本見送りました。これも変わりませんね。',
        },
      },
    ],
  },
  {
    id: 'st.empty',
    when: { crowdMax: 0.25 },
    lines: [
      {
        t: {
          fr: 'Une rame vide sur cette ligne, c’est presque inquiétant.',
          en: 'An empty train on this line is almost unsettling.',
          ja: 'この線でこんなに空いてると、かえって落ち着きませんね。',
        },
      },
    ],
  },
  {
    id: 'st.empty.enjoy',
    when: { crowdMax: 0.3 },
    lines: [
      {
        t: {
          fr: 'Profitez-en. Dans deux stations, on sera collés les uns aux autres.',
          en: 'Enjoy it. Two stops from now we will be packed shoulder to shoulder.',
          ja: '今のうちですよ。二駅先にはぎゅうぎゅうです。',
        },
      },
    ],
  },
  {
    id: 'st.smell',
    lines: [
      {
        t: {
          fr: 'Quelqu’un a mangé des takoyaki. Ça se sent d’ici.',
          en: 'Somebody has been eating takoyaki. You can smell it from here.',
          ja: '誰かたこ焼き食べましたね。ここまで匂います。',
        },
      },
    ],
  },
  {
    id: 'st.aircon',
    when: { months: [6, 7, 8, 9] },
    lines: [
      {
        t: {
          fr: 'La climatisation est réglée trop fort. On passe de la fournaise au frigo.',
          en: 'The air conditioning is set far too cold. You go from a furnace to a fridge.',
          ja: '冷房、効きすぎです。外は蒸し風呂なのに、ここは冷蔵庫ですよ。',
        },
      },
    ],
  },
  {
    id: 'st.heat',
    when: { months: [7, 8, 9] },
    lines: [
      {
        t: {
          fr: 'Trente-six degrés dehors. J’ai marché deux cents mètres et j’étais trempé.',
          en: 'Thirty-six degrees out there. I walked two hundred metres and I was soaked.',
          ja: '外は三十六度ですよ。二百メートル歩いただけで汗だくです。',
        },
      },
    ],
  },
  {
    id: 'st.cold',
    when: { months: [12, 1, 2] },
    lines: [
      {
        t: {
          fr: 'Il gèle sur le quai et il fait vingt-huit ici. Mon corps ne suit plus.',
          en: 'Freezing on the platform, twenty-eight in here. My body cannot keep up.',
          ja: 'ホームは凍えるのに車内は二十八度。体がついていきません。',
        },
      },
    ],
  },
  {
    id: 'st.rain',
    when: { months: [6, 7] },
    lines: [
      {
        t: {
          fr: 'La saison des pluies. Le sol du wagon est une patinoire.',
          en: 'Rainy season. The floor of this carriage is a skating rink.',
          ja: '梅雨ですね。床がつるつるで危ないです。',
        },
      },
    ],
  },
  {
    id: 'st.umbrella',
    when: { months: [6, 7, 9] },
    lines: [
      {
        t: {
          fr: 'Trois parapluies oubliés cette année. Ils doivent être quelque part.',
          en: 'Three umbrellas lost this year. They must be somewhere.',
          ja: '今年、傘を三本なくしました。どこかにはあるはずなんですけど。',
        },
      },
    ],
  },
  {
    id: 'st.sakura',
    when: { months: [3, 4] },
    lines: [
      {
        t: {
          fr: 'Les cerisiers sont ouverts. Tout le monde a le même projet ce week-end.',
          en: 'The cherry trees are out. Everyone has the same plan this weekend.',
          ja: '桜が咲きましたね。今週末はみんな同じことを考えてます。',
        },
      },
    ],
  },
  {
    id: 'st.year.end',
    when: { months: [12] },
    lines: [
      {
        t: {
          fr: 'Fin décembre. Les rames sentent la bière jusqu’à minuit.',
          en: 'End of December. The trains smell of beer until midnight.',
          ja: '年末ですね。終電までビールの匂いがします。',
        },
      },
    ],
  },
  {
    id: 'st.new.year',
    when: { months: [1] },
    lines: [
      {
        t: {
          fr: 'Bonne année. C’est la première fois que je le dis à un inconnu.',
          en: 'Happy new year. That is the first time I have said it to a stranger.',
          ja: 'あけましておめでとうございます。知らない人に言うのは初めてです。',
        },
      },
    ],
  },
  {
    id: 'st.silence',
    weight: 1.5,
    lines: [
      {
        t: {
          fr: '…',
          en: '…',
          ja: '……',
        },
      },
      {
        t: {
          fr: 'Pardon. Je pensais que vous étiez quelqu’un d’autre.',
          en: 'Sorry. I thought you were someone else.',
          ja: 'すみません。人違いでした。',
        },
        gap: 1.1,
      },
    ],
  },
  {
    id: 'st.stare',
    lines: [
      {
        t: {
          fr: { f: 'Vous me regardiez ? Je ne suis pas d’ici non plus, si ça peut vous rassurer.', m: 'Vous me regardiez ? Je ne suis pas d’ici non plus, si ça peut vous rassurer.' },
          en: 'Were you looking at me? I am not from here either, if that helps.',
          ja: '見てました？　私もここの人間じゃないですよ。',
        },
      },
    ],
  },
  {
    id: 'st.familiar',
    lines: [
      {
        t: {
          fr: { f: 'On s’est déjà vus, non ? Le même wagon, la même heure.', m: 'On s’est déjà vus, non ? Le même wagon, la même heure.' },
          en: 'We have met before, haven’t we? Same carriage, same hour.',
          ja: '前にもお会いしましたよね。同じ車両の、同じ時間帯で。',
        },
      },
      {
        t: {
          fr: 'On finit par reconnaître les gens, sur cette ligne.',
          en: 'You end up recognising people on this line.',
          ja: 'この線、だんだん顔を覚えちゃうんですよ。',
        },
        gap: 0.5,
      },
    ],
  },
  {
    id: 'st.doorside',
    lines: [
      {
        t: {
          fr: 'Restez de ce côté. Les portes s’ouvrent de l’autre.',
          en: 'Stay on this side. The doors open on the other one.',
          ja: 'こちら側にいた方がいいですよ。ドアは反対側です。',
        },
      },
    ],
  },
  {
    id: 'st.handle',
    when: { posture: ['standing'], moving: true },
    lines: [
      {
        t: {
          fr: 'Tenez-vous à quelque chose. Ça freine sec à l’entrée en gare.',
          en: 'Hold on to something. It brakes hard coming into the station.',
          ja: '何かにつかまってください。駅に入るとき、けっこう急に止まります。',
        },
      },
    ],
  },
  {
    id: 'st.priority',
    lines: [
      {
        t: {
          fr: 'Ces places-là sont prioritaires. Personne ne le regarde jamais, ce panneau.',
          en: 'Those are the priority seats. Nobody ever looks at that sign.',
          ja: 'そこは優先席です。あの表示、誰も見ないんですよね。',
        },
      },
    ],
  },
  {
    id: 'st.phone.rule',
    lines: [
      {
        t: {
          fr: 'On ne téléphone pas dans les rames, ici. On écrit.',
          en: 'You don’t take calls on trains here. You type.',
          ja: '車内では通話しないんです。みんな文字で済ませます。',
        },
      },
    ],
  },
  {
    id: 'st.ads',
    lines: [
      {
        t: {
          fr: 'Ces affiches changent toutes les semaines. Je les lis toutes, à force.',
          en: 'Those posters change every week. I end up reading all of them.',
          ja: 'あの中吊り、毎週変わるんです。結局全部読んじゃいます。',
        },
      },
    ],
  },
  {
    id: 'st.screen',
    lines: [
      {
        t: {
          fr: 'L’écran dit qu’il y a du retard sur la Chūō. Ça va nous retomber dessus.',
          en: 'The screen says the Chūō is delayed. That always lands on us next.',
          ja: '画面に中央線遅延って出てます。こっちにも回ってきますよ。',
        },
      },
    ],
  },
  {
    id: 'st.weekend',
    when: { weekend: true },
    lines: [
      {
        t: {
          fr: 'Le week-end, la ligne est plus lente et tout le monde s’en moque.',
          en: 'On weekends the line runs slower and nobody minds.',
          ja: '週末は運転がゆっくりですけど、誰も気にしませんね。',
        },
      },
    ],
  },
  {
    id: 'st.weekday',
    when: { weekend: false, hours: [7, 10] },
    lines: [
      {
        t: {
          fr: 'Lundi. Tout le monde a la même tête dans ce wagon.',
          en: 'Monday. Everyone in this carriage has the same face.',
          ja: '月曜日ですね。この車両、みんな同じ顔してます。',
        },
      },
    ],
  },
  {
    id: 'st.thanks',
    lines: [
      {
        t: {
          fr: 'Merci de m’avoir laissé passer tout à l’heure. On ne le fait plus beaucoup.',
          en: 'Thank you for letting me through earlier. People rarely do.',
          ja: 'さっきは通してくださってありがとうございます。最近少ないんですよ、そういう方。',
        },
      },
    ],
  },
  {
    id: 'st.goodbye',
    lines: [
      {
        t: {
          fr: 'Je descends ici. Bonne route.',
          en: 'This is my stop. Safe travels.',
          ja: 'ここで降ります。お気をつけて。',
        },
      },
    ],
  },
  {
    id: 'st.nothing',
    lines: [
      {
        t: {
          fr: 'Non, rien. J’avais juste envie de dire quelque chose à quelqu’un.',
          en: 'No, nothing. I just felt like saying something to someone.',
          ja: 'いえ、別に。誰かに何か言いたかっただけです。',
        },
      },
    ],
  },
  {
    id: 'st.talk.rare',
    lines: [
      {
        t: {
          fr: 'On ne se parle jamais, dans ces rames. Ça m’a pris comme ça.',
          en: 'Nobody talks on these trains. It just came over me.',
          ja: '車内で話しかけるなんて普通しないんですけどね。なんとなくです。',
        },
      },
    ],
  },
  {
    id: 'st.lost.thought',
    lines: [
      {
        t: {
          fr: { f: 'J’ai oublié ce que je voulais dire. Ça m’arrive tout le temps.', m: 'J’ai oublié ce que je voulais dire. Ça m’arrive tout le temps.' },
          en: 'I have forgotten what I wanted to say. It happens constantly.',
          ja: '何を言おうとしたか忘れました。よくあるんです。',
        },
      },
    ],
  },
  {
    id: 'st.ceiling',
    lines: [
      {
        t: {
          fr: 'Vous avez déjà regardé le plafond de ces rames ? Moi non plus, avant aujourd’hui.',
          en: 'Have you ever looked at the ceiling in these carriages? Neither had I, until today.',
          ja: 'この車両の天井、見たことあります？　私も今日が初めてです。',
        },
      },
    ],
  },
];
