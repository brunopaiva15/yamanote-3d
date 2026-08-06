# Cahier d'enregistrement des annonces

476 lignes uniques, réparties en 6 rôles vocaux. Chaque rôle est une voix distincte.

## Consignes de diction

Toutes les valeurs ci-dessous sont MESURÉES sur un enregistrement de l'annonce
réelle (「次は。渋谷。渋谷。お出口は右側です。」, sonorisation de la rame), pas
choisies. `scripts/voice-lab/rapport.py` vérifie qu'une prise livrée les
respecte.

| Ce qu'il faut | Valeur relevée |
| --- | --- |
| Hauteur médiane | **236 Hz** (plancher 173, sommet 284) |
| Étendue d'intonation | 10,6 demi-tons sur la phrase |
| Durée de 「次は」 | 0,51 s |
| Durée d'un nom de gare | 0,67 s |
| Durée de 「お出口は右側です」 | 1,57 s — **d'un seul trait, sans pause interne** |
| Silence avant le nom de gare | 0,34 s |
| Silence entre les deux répétitions du nom | 0,43 s |
| Silence avant la phrase de sortie | 0,31 s |

Trois points qui comptent plus que les chiffres :

1. **Le nom de gare est dit DEUX FOIS**, séparé par un silence court, et il est
   plus BRILLANT que la phrase qui l'introduit sans être plus aigu : 236 Hz
   contre 256 pour 「次は」, mais un centroïde spectral de 1200 Hz contre 839.
   C'est un sourire, pas une montée.
2. **Aucune pause longue à l'intérieur d'une annonce.** Les silences internes
   font tous entre 0,30 et 0,45 s. Les pauses d'une seconde entendues sur un
   enregistrement long séparent deux annonces, pas deux morceaux d'une même.
3. **Ton d'annonce automatique** : posé, régulier, chaleureux. Pas de
   sur-articulation, pas d'emphase expressive.

## Prise de son

Mono, 48 kHz, 24 bits, sans traitement (ni compression, ni réverbération, ni
égalisation) : le jeu applique lui-même le timbre du diffuseur de plafond et la
réverbération de cabine (`src/systems/audioEngine.ts`). Un fichier par ligne
ci-dessous, silence de tête et de queue coupé.


## Les lignes

### Japonais · sonorisation de la rame — 117 lignes

1. お客様にお待たせしております。ただいま。電力の復旧作業を行っております。運転再開まで。いましばらくお待ちください。危険ですので。ドアの非常用コックには。手を触れないでください。
2. お客様にお願いいたします。優先席付近では。携帯電話の電源をお切りください。それ以外の場所では。マナーモードに設定のうえ。通話はお控えください。ご協力をお願いいたします。
3. お客様にお願いいたします。電車は事故防止のため。やむを得ず急停車することがありますので。お立ちのお客様は。つり革や手すりにおつかまりください。
4. お客様にご案内いたします。ただいま。お客様の救護を行っております。発車まで。いましばらくお待ちください。
5. お客様にご案内いたします。ただいま。信号確認のため。急停車いたしました。安全の確認を行っておりますので。恐れ入りますが。いましばらくお待ちください。
6. お客様にご案内いたします。ただいま。安全の確認を行っております。運転再開まで。いましばらくお待ちください。ご迷惑をおかけいたします。
7. お客様にご案内いたします。ただいま。架線の停電のため。この電車は停車しております。車内の照明は非常灯に切り替わっております。復旧の見通しが立ち次第。ご案内いたしますので。車内でお待ちください。
8. お客様にご案内いたします。ただいま。線路内の安全確認のため。急停車いたしました。安全の確認を行っておりますので。恐れ入りますが。いましばらくお待ちください。
9. お客様にご案内いたします。ただいま。車両の点検のため。急停車いたしました。安全の確認を行っておりますので。恐れ入りますが。いましばらくお待ちください。
10. お客様をお待たせしております。引き続き。お客様の救護を行っております。発車まで。いましばらくお待ちください。
11. お待たせいたしました。お客様の救護が終了しましたので。まもなく発車いたします。
12. お待たせいたしました。ただいま。電気が復旧いたしました。車内の機器を確認のうえ。まもなく運転を再開いたします。ご迷惑をおかけいたしました。
13. お待たせいたしました。安全の確認がとれましたので。まもなく運転を再開いたします。
14. この電車には。優先席があります。優先席を必要とされるお客様がいらっしゃいましたら。席をお譲りください。お客様のご協力をお願いいたします。
15. この電車は。山手線内回り。上野・池袋方面ゆきです。
16. この電車は。山手線内回り。品川・東京方面ゆきです。
17. この電車は。山手線内回り。新宿・渋谷方面ゆきです。
18. この電車は。山手線内回り。東京・上野方面ゆきです。
19. この電車は。山手線内回り。池袋・新宿方面ゆきです。
20. この電車は。山手線内回り。渋谷・品川方面ゆきです。
21. この電車は。山手線外回り。上野・東京方面ゆきです。
22. この電車は。山手線外回り。品川・渋谷方面ゆきです。
23. この電車は。山手線外回り。新宿・池袋方面ゆきです。
24. この電車は。山手線外回り。東京・品川方面ゆきです。
25. この電車は。山手線外回り。池袋・上野方面ゆきです。
26. この電車は。山手線外回り。渋谷・新宿方面ゆきです。
27. まもなく。上野。上野。お出口は。左側です。
28. まもなく。五反田。五反田。お出口は。右側です。
29. まもなく。代々木。代々木。お出口は。左側です。
30. まもなく。原宿。原宿。お出口は。右側です。
31. まもなく。品川。品川。お出口は。右側です。
32. まもなく。大塚。大塚。お出口は。右側です。
33. まもなく。大崎。大崎。お出口は。右側です。
34. まもなく。巣鴨。巣鴨。お出口は。右側です。
35. まもなく。御徒町。御徒町。お出口は。左側です。
36. まもなく。恵比寿。恵比寿。お出口は。右側です。
37. まもなく。新大久保。新大久保。お出口は。右側です。
38. まもなく。新宿。新宿。お出口は。左側です。
39. まもなく。新橋。新橋。お出口は。左側です。
40. まもなく。日暮里。日暮里。お出口は。左側です。
41. まもなく。有楽町。有楽町。お出口は。左側です。
42. まもなく。東京。東京。お出口は。左側です。
43. まもなく。池袋。池袋。お出口は。左側です。
44. まもなく。浜松町。浜松町。お出口は。左側です。
45. まもなく。渋谷。渋谷。お出口は。右側です。
46. まもなく。田町。田町。お出口は。左側です。
47. まもなく。田端。田端。お出口は。左側です。
48. まもなく。目白。目白。お出口は。右側です。
49. まもなく。目黒。目黒。お出口は。右側です。
50. まもなく。神田。神田。お出口は。左側です。
51. まもなく。秋葉原。秋葉原。お出口は。左側です。
52. まもなく。西日暮里。西日暮里。お出口は。左側です。
53. まもなく。駒込。駒込。お出口は。右側です。
54. まもなく。高田馬場。高田馬場。お出口は。右側です。
55. まもなく。高輪ゲートウェイ。高輪ゲートウェイ。お出口は。右側です。
56. まもなく。鶯谷。鶯谷。お出口は。左側です。
57. ドアから離れてください。
58. ドアが閉まります。ご注意ください。
59. ドアが閉まりません。ドアから離れてください。
60. 中央・総武線。都営大江戸線は。お乗換です。
61. 中央線。中央・総武線。埼京線。湘南新宿ライン。小田急線。京王線。東京メトロ丸ノ内線。都営新宿線。大江戸線は。お乗換です。
62. 中央線。京浜東北線。東海道線。横須賀線。総武線快速。京葉線。上野東京ライン。東海道新幹線。東京メトロ丸ノ内線は。お乗換です。
63. 京浜東北線。中央・総武線。東京メトロ日比谷線。つくばエクスプレスは。お乗換です。
64. 京浜東北線。中央線。東京メトロ銀座線は。お乗換です。
65. 京浜東北線。宇都宮線。高崎線。常磐線。上野東京ライン。東北・上越新幹線。東京メトロ銀座線。日比谷線。京成線は。お乗換です。
66. 京浜東北線。常磐線。京成線。日暮里・舎人ライナーは。お乗換です。
67. 京浜東北線。東京メトロ千代田線。日暮里・舎人ライナーは。お乗換です。
68. 京浜東北線。東京メトロ有楽町線は。お乗換です。
69. 京浜東北線。東京メトロ銀座線。日比谷線。都営大江戸線は。お乗換です。
70. 京浜東北線。東京モノレール。都営浅草線。大江戸線は。お乗換です。
71. 京浜東北線は。お乗換です。
72. 埼京線。湘南新宿ライン。りんかい線は。お乗換です。
73. 埼京線。湘南新宿ライン。東京メトロ丸ノ内線。有楽町線。副都心線。東武東上線。西武池袋線は。お乗換です。
74. 埼京線。湘南新宿ライン。東京メトロ日比谷線は。お乗換です。
75. 埼京線。湘南新宿ライン。東京メトロ銀座線。半蔵門線。副都心線。東急東横線。田園都市線。京王井の頭線は。お乗換です。
76. 急停車します。ご注意ください。
77. 本日も。山手線を。ご利用くださいまして。ありがとうございます。
78. 東京メトロ千代田線。副都心線は。お乗換です。
79. 東京メトロ南北線。都営三田線。東急目黒線は。お乗換です。
80. 東京メトロ南北線は。お乗換です。
81. 東海道線。横須賀線。京浜東北線。上野東京ライン。東京メトロ銀座線。都営浅草線。ゆりかもめは。お乗換です。
82. 東海道線。横須賀線。京浜東北線。上野東京ライン。東海道新幹線。京急線は。お乗換です。
83. 次は。上野。上野。お出口は。左側です。
84. 次は。五反田。五反田。お出口は。右側です。
85. 次は。代々木。代々木。お出口は。左側です。
86. 次は。原宿。原宿。お出口は。右側です。
87. 次は。品川。品川。お出口は。右側です。
88. 次は。大塚。大塚。お出口は。右側です。
89. 次は。大崎。大崎。お出口は。右側です。
90. 次は。巣鴨。巣鴨。お出口は。右側です。
91. 次は。御徒町。御徒町。お出口は。左側です。
92. 次は。恵比寿。恵比寿。お出口は。右側です。
93. 次は。新大久保。新大久保。お出口は。右側です。
94. 次は。新宿。新宿。お出口は。左側です。
95. 次は。新橋。新橋。お出口は。左側です。
96. 次は。日暮里。日暮里。お出口は。左側です。
97. 次は。有楽町。有楽町。お出口は。左側です。
98. 次は。東京。東京。お出口は。左側です。
99. 次は。池袋。池袋。お出口は。左側です。
100. 次は。浜松町。浜松町。お出口は。左側です。
101. 次は。渋谷。渋谷。お出口は。右側です。
102. 次は。田町。田町。お出口は。左側です。
103. 次は。田端。田端。お出口は。左側です。
104. 次は。目白。目白。お出口は。右側です。
105. 次は。目黒。目黒。お出口は。右側です。
106. 次は。神田。神田。お出口は。左側です。
107. 次は。秋葉原。秋葉原。お出口は。左側です。
108. 次は。西日暮里。西日暮里。お出口は。左側です。
109. 次は。駒込。駒込。お出口は。右側です。
110. 次は。高田馬場。高田馬場。お出口は。右側です。
111. 次は。高輪ゲートウェイ。高輪ゲートウェイ。お出口は。右側です。
112. 次は。鶯谷。鶯谷。お出口は。左側です。
113. 西武新宿線。東京メトロ東西線は。お乗換です。
114. 都営三田線は。お乗換です。
115. 都営浅草線。東急池上線は。お乗換です。
116. 都電荒川線は。お乗換です。
117. 電車とホームの間が空いているところがありますので。足元にご注意ください。

### Anglais · sonorisation de la rame — 117 lignes

1. Attention please. Due to a power failure on the overhead line. This train has stopped between stations. The lighting has switched to emergency lamps. Please remain inside the train. And wait for further announcements.
2. Attention please. This train has made an emergency stop due to a signal check. Please wait while safety checks are carried out.
3. Attention please. This train has made an emergency stop due to a track safety check. Please wait while safety checks are carried out.
4. Attention please. This train has made an emergency stop due to a train inspection. Please wait while safety checks are carried out.
5. Attention please. We are currently assisting a passenger. Please wait a little longer before departure.
6. It may be necessary for the train to stop suddenly to prevent an accident. So please be careful.
7. Please change here for the Chuo-Sobu Line and the Toei Oedo Line.
8. Please change here for the Chuo. Chuo-Sobu. Saikyo and Shonan-Shinjuku Lines. The Odakyu Line. The Keio Line. The Tokyo Metro Marunouchi Line. And the Toei Shinjuku and Oedo Lines.
9. Please change here for the Chuo. Keihin-Tohoku. Tokaido. Yokosuka. Sobu. Keiyo and Ueno-Tokyo Lines. The Tokaido Shinkansen. And the Tokyo Metro Marunouchi Line.
10. Please change here for the Keihin-Tohoku Line and the Tokyo Metro Yurakucho Line.
11. Please change here for the Keihin-Tohoku Line.
12. Please change here for the Keihin-Tohoku Line. The Tokyo Metro Chiyoda Line. And the Nippori-Toneri Liner.
13. Please change here for the Keihin-Tohoku Line. The Tokyo Metro Ginza and Hibiya Lines. And the Toei Oedo Line.
14. Please change here for the Keihin-Tohoku Line. The Tokyo Monorail. And the Toei Asakusa and Oedo Lines.
15. Please change here for the Keihin-Tohoku and Chuo Lines. And the Tokyo Metro Ginza Line.
16. Please change here for the Keihin-Tohoku and Chuo-Sobu Lines. The Tokyo Metro Hibiya Line. And the Tsukuba Express.
17. Please change here for the Keihin-Tohoku and Joban Lines. The Keisei Line. And the Nippori-Toneri Liner.
18. Please change here for the Keihin-Tohoku. Utsunomiya. Takasaki. Joban and Ueno-Tokyo Lines. The Tohoku and Joetsu Shinkansen. The Tokyo Metro Ginza and Hibiya Lines. And the Keisei Line.
19. Please change here for the Saikyo and Shonan-Shinjuku Lines. And the Rinkai Line.
20. Please change here for the Saikyo and Shonan-Shinjuku Lines. And the Tokyo Metro Hibiya Line.
21. Please change here for the Saikyo and Shonan-Shinjuku Lines. The Tokyo Metro Ginza. Hanzomon and Fukutoshin Lines. The Tokyu Toyoko and Den-en-toshi Lines. And the Keio Inokashira Line.
22. Please change here for the Saikyo and Shonan-Shinjuku Lines. The Tokyo Metro Marunouchi. Yurakucho and Fukutoshin Lines. The Tobu Tojo Line. And the Seibu Ikebukuro Line.
23. Please change here for the Seibu Shinjuku Line and the Tokyo Metro Tozai Line.
24. Please change here for the Toden Arakawa Line.
25. Please change here for the Toei Asakusa Line and the Tokyu Ikegami Line.
26. Please change here for the Toei Mita Line.
27. Please change here for the Tokaido. Yokosuka. Keihin-Tohoku and Ueno-Tokyo Lines. The Tokaido Shinkansen. And the Keikyu Line.
28. Please change here for the Tokaido. Yokosuka. Keihin-Tohoku and Ueno-Tokyo Lines. The Tokyo Metro Ginza Line. The Toei Asakusa Line. And the Yurikamome.
29. Please change here for the Tokyo Metro Chiyoda and Fukutoshin Lines.
30. Please change here for the Tokyo Metro Namboku Line.
31. Please change here for the Tokyo Metro Namboku Line. The Toei Mita Line. And the Tokyu Meguro Line.
32. Please stand clear of the doors.
33. Please switch off your mobile phone when you are near the priority seats. In other areas. Please set it to silent mode and refrain from talking on the phone.
34. Please watch your step when you leave the train.
35. Safety checks are still under way. We apologize for the delay. And thank you for your patience.
36. Thank you for using the Yamanote Line.
37. Thank you for waiting. Assistance has been completed. This train will depart shortly.
38. Thank you for waiting. Power has been restored. After equipment checks. This train will shortly resume service. We apologize for the delay.
39. Thank you for waiting. Safety has been confirmed. And this train will shortly resume service.
40. Thank you for your patience. We are still assisting a passenger. Please wait a little longer before departure.
41. Thank you for your patience. Work to restore power is under way. Please wait a little longer. And for your own safety. Do not operate the emergency door release.
42. The doors are closing. Please stand clear of the doors.
43. The doors cannot close. Please stand clear of the doors.
44. The next station is. Akihabara. JY. 03. The doors on the left side will open.
45. The next station is. Akihabara. The doors on the left side will open.
46. The next station is. Ebisu. JY. 21. The doors on the right side will open.
47. The next station is. Ebisu. The doors on the right side will open.
48. The next station is. Gotanda. JY. 23. The doors on the right side will open.
49. The next station is. Gotanda. The doors on the right side will open.
50. The next station is. Hamamatsuchō. JY. 28. The doors on the left side will open.
51. The next station is. Hamamatsuchō. The doors on the left side will open.
52. The next station is. Harajuku. JY. 19. The doors on the right side will open.
53. The next station is. Harajuku. The doors on the right side will open.
54. The next station is. Ikebukuro. JY. 13. The doors on the left side will open.
55. The next station is. Ikebukuro. The doors on the left side will open.
56. The next station is. Kanda. JY. 02. The doors on the left side will open.
57. The next station is. Kanda. The doors on the left side will open.
58. The next station is. Komagome. JY. 10. The doors on the right side will open.
59. The next station is. Komagome. The doors on the right side will open.
60. The next station is. Meguro. JY. 22. The doors on the right side will open.
61. The next station is. Meguro. The doors on the right side will open.
62. The next station is. Mejiro. JY. 14. The doors on the right side will open.
63. The next station is. Mejiro. The doors on the right side will open.
64. The next station is. Nippori. JY. 07. The doors on the left side will open.
65. The next station is. Nippori. The doors on the left side will open.
66. The next station is. Nishi-Nippori. JY. 08. The doors on the left side will open.
67. The next station is. Nishi-Nippori. The doors on the left side will open.
68. The next station is. Okachimachi. JY. 04. The doors on the left side will open.
69. The next station is. Okachimachi. The doors on the left side will open.
70. The next station is. Shibuya. JY. 20. The doors on the right side will open.
71. The next station is. Shibuya. The doors on the right side will open.
72. The next station is. Shimbashi. JY. 29. The doors on the left side will open.
73. The next station is. Shimbashi. The doors on the left side will open.
74. The next station is. Shin-Ōkubo. JY. 16. The doors on the right side will open.
75. The next station is. Shin-Ōkubo. The doors on the right side will open.
76. The next station is. Shinagawa. JY. 25. The doors on the right side will open.
77. The next station is. Shinagawa. The doors on the right side will open.
78. The next station is. Shinjuku. JY. 17. The doors on the left side will open.
79. The next station is. Shinjuku. The doors on the left side will open.
80. The next station is. Sugamo. JY. 11. The doors on the right side will open.
81. The next station is. Sugamo. The doors on the right side will open.
82. The next station is. Tabata. JY. 09. The doors on the left side will open.
83. The next station is. Tabata. The doors on the left side will open.
84. The next station is. Takadanobaba. JY. 15. The doors on the right side will open.
85. The next station is. Takadanobaba. The doors on the right side will open.
86. The next station is. Takanawa Gateway. JY. 26. The doors on the right side will open.
87. The next station is. Takanawa Gateway. The doors on the right side will open.
88. The next station is. Tamachi. JY. 27. The doors on the left side will open.
89. The next station is. Tamachi. The doors on the left side will open.
90. The next station is. Tokyo. JY. 01. The doors on the left side will open.
91. The next station is. Tokyo. The doors on the left side will open.
92. The next station is. Ueno. JY. 05. The doors on the left side will open.
93. The next station is. Ueno. The doors on the left side will open.
94. The next station is. Uguisudani. JY. 06. The doors on the left side will open.
95. The next station is. Uguisudani. The doors on the left side will open.
96. The next station is. Yoyogi. JY. 18. The doors on the left side will open.
97. The next station is. Yoyogi. The doors on the left side will open.
98. The next station is. Yūrakuchō. JY. 30. The doors on the left side will open.
99. The next station is. Yūrakuchō. The doors on the left side will open.
100. The next station is. Ōsaki. JY. 24. The doors on the right side will open.
101. The next station is. Ōsaki. The doors on the right side will open.
102. The next station is. Ōtsuka. JY. 12. The doors on the right side will open.
103. The next station is. Ōtsuka. The doors on the right side will open.
104. There are priority seats in most cars. Please offer your seat to those who may need it.
105. This is a Yamanote Line train bound for Ikebukuro and Shinjuku.
106. This is a Yamanote Line train bound for Ikebukuro and Ueno.
107. This is a Yamanote Line train bound for Shibuya and Shinagawa.
108. This is a Yamanote Line train bound for Shibuya and Shinjuku.
109. This is a Yamanote Line train bound for Shinagawa and Shibuya.
110. This is a Yamanote Line train bound for Shinagawa and Tokyo.
111. This is a Yamanote Line train bound for Shinjuku and Ikebukuro.
112. This is a Yamanote Line train bound for Shinjuku and Shibuya.
113. This is a Yamanote Line train bound for Tokyo and Shinagawa.
114. This is a Yamanote Line train bound for Tokyo and Ueno.
115. This is a Yamanote Line train bound for Ueno and Ikebukuro.
116. This is a Yamanote Line train bound for Ueno and Tokyo.
117. This train will make an emergency stop. Please hold on.

### Japonais · quai, sens intérieur (内回り) — 90 lignes

1. 11番線、ドアが閉まります。ご注意ください。
2. 14番線、ドアが閉まります。ご注意ください。
3. 1番線、ドアが閉まります。ご注意ください。
4. 2番線、ドアが閉まります。ご注意ください。
5. 3番線、ドアが閉まります。ご注意ください。
6. 4番線、ドアが閉まります。ご注意ください。
7. 5番線、ドアが閉まります。ご注意ください。
8. 6番線、ドアが閉まります。ご注意ください。
9. まもなく、11番線に、山手線内回り、池袋・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
10. まもなく、12番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
11. まもなく、14番線に、山手線内回り、渋谷・品川方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
12. まもなく、1番線に、山手線内回り、品川・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
13. まもなく、1番線に、山手線内回り、新宿・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
14. まもなく、1番線に、山手線内回り、東京・上野方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
15. まもなく、1番線に、山手線内回り、池袋・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
16. まもなく、1番線に、山手線内回り、渋谷・品川方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
17. まもなく、1番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
18. まもなく、2番線に、山手線内回り、上野・池袋方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
19. まもなく、2番線に、山手線内回り、品川・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
20. まもなく、2番線に、山手線内回り、新宿・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
21. まもなく、2番線に、山手線内回り、東京・上野方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
22. まもなく、2番線に、山手線内回り、池袋・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
23. まもなく、2番線に、山手線内回り、渋谷・品川方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
24. まもなく、3番線に、山手線内回り、上野・池袋方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
25. まもなく、3番線に、山手線内回り、池袋・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
26. まもなく、3番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
27. まもなく、4番線に、山手線内回り、上野・池袋方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
28. まもなく、4番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
29. まもなく、5番線に、山手線内回り、新宿・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
30. まもなく、5番線に、山手線内回り、東京・上野方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
31. まもなく、6番線に、山手線内回り、新宿・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
32. 上野、上野。ご乗車、ありがとうございます。
33. 五反田、五反田。ご乗車、ありがとうございます。
34. 今度の、11番線の電車は、山手線内回り、池袋・新宿方面行きです。
35. 今度の、14番線の電車は、山手線内回り、渋谷・品川方面行きです。
36. 今度の、1番線の電車は、山手線内回り、品川・東京方面行きです。
37. 今度の、1番線の電車は、山手線内回り、新宿・渋谷方面行きです。
38. 今度の、1番線の電車は、山手線内回り、東京・上野方面行きです。
39. 今度の、1番線の電車は、山手線内回り、池袋・新宿方面行きです。
40. 今度の、1番線の電車は、山手線内回り、渋谷・品川方面行きです。
41. 今度の、2番線の電車は、山手線内回り、上野・池袋方面行きです。
42. 今度の、2番線の電車は、山手線内回り、品川・東京方面行きです。
43. 今度の、2番線の電車は、山手線内回り、新宿・渋谷方面行きです。
44. 今度の、2番線の電車は、山手線内回り、東京・上野方面行きです。
45. 今度の、2番線の電車は、山手線内回り、池袋・新宿方面行きです。
46. 今度の、2番線の電車は、山手線内回り、渋谷・品川方面行きです。
47. 今度の、3番線の電車は、山手線内回り、上野・池袋方面行きです。
48. 今度の、3番線の電車は、山手線内回り、池袋・新宿方面行きです。
49. 今度の、4番線の電車は、山手線内回り、上野・池袋方面行きです。
50. 今度の、5番線の電車は、山手線内回り、新宿・渋谷方面行きです。
51. 今度の、5番線の電車は、山手線内回り、東京・上野方面行きです。
52. 今度の、6番線の電車は、山手線内回り、新宿・渋谷方面行きです。
53. 代々木、代々木。ご乗車、ありがとうございます。
54. 原宿、原宿。ご乗車、ありがとうございます。
55. 品川、品川。ご乗車、ありがとうございます。
56. 大塚、大塚。ご乗車、ありがとうございます。
57. 大崎、大崎。ご乗車、ありがとうございます。
58. 山手線は、お客さま救護の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
59. 山手線は、ドア点検の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
60. 山手線は、ホーム上の安全確認の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
61. 山手線は、架線の停電の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
62. 山手線は、線路内人立入りの影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
63. 山手線は、車両点検の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
64. 巣鴨、巣鴨。ご乗車、ありがとうございます。
65. 御徒町、御徒町。ご乗車、ありがとうございます。
66. 恵比寿、恵比寿。ご乗車、ありがとうございます。
67. 新大久保、新大久保。ご乗車、ありがとうございます。
68. 新宿、新宿。ご乗車、ありがとうございます。
69. 新橋、新橋。ご乗車、ありがとうございます。
70. 日暮里、日暮里。ご乗車、ありがとうございます。
71. 有楽町、有楽町。ご乗車、ありがとうございます。
72. 本日も、山手線を、ご利用くださいまして、ありがとうございます。
73. 東京、東京。ご乗車、ありがとうございます。
74. 池袋、池袋。ご乗車、ありがとうございます。
75. 浜松町、浜松町。ご乗車、ありがとうございます。
76. 渋谷、渋谷。ご乗車、ありがとうございます。
77. 田町、田町。ご乗車、ありがとうございます。
78. 田端、田端。ご乗車、ありがとうございます。
79. 目白、目白。ご乗車、ありがとうございます。
80. 目黒、目黒。ご乗車、ありがとうございます。
81. 神田、神田。ご乗車、ありがとうございます。
82. 秋葉原、秋葉原。ご乗車、ありがとうございます。
83. 西日暮里、西日暮里。ご乗車、ありがとうございます。
84. 電車がまいります。ご注意ください。
85. 電車が通過します。ご注意ください。
86. 電車とホームの間が空いているところがありますので、足元にご注意ください。
87. 駒込、駒込。ご乗車、ありがとうございます。
88. 高田馬場、高田馬場。ご乗車、ありがとうございます。
89. 高輪ゲートウェイ、高輪ゲートウェイ。ご乗車、ありがとうございます。
90. 鶯谷、鶯谷。ご乗車、ありがとうございます。

### Japonais · quai, sens extérieur (外回り) — 95 lignes

1. 10番線、ドアが閉まります。ご注意ください。
2. 15番線、ドアが閉まります。ご注意ください。
3. 1番線、ドアが閉まります。ご注意ください。
4. 2番線、ドアが閉まります。ご注意ください。
5. 3番線、ドアが閉まります。ご注意ください。
6. 4番線、ドアが閉まります。ご注意ください。
7. 5番線、ドアが閉まります。ご注意ください。
8. 7番線、ドアが閉まります。ご注意ください。
9. 8番線、ドアが閉まります。ご注意ください。
10. まもなく、10番線に、山手線外回り、上野・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
11. まもなく、15番線に、山手線外回り、池袋・上野方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
12. まもなく、1番線に、山手線外回り、上野・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
13. まもなく、1番線に、山手線外回り、新宿・池袋方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
14. まもなく、1番線に、山手線外回り、池袋・上野方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
15. まもなく、1番線に、山手線外回り、渋谷・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
16. まもなく、1番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
17. まもなく、2番線に、山手線外回り、上野・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
18. まもなく、2番線に、山手線外回り、品川・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
19. まもなく、2番線に、山手線外回り、新宿・池袋方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
20. まもなく、2番線に、山手線外回り、東京・品川方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
21. まもなく、2番線に、山手線外回り、池袋・上野方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
22. まもなく、2番線に、山手線外回り、渋谷・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
23. まもなく、3番線に、山手線外回り、上野・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
24. まもなく、3番線に、山手線外回り、品川・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
25. まもなく、3番線に、山手線外回り、東京・品川方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
26. まもなく、3番線に、山手線外回り、渋谷・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
27. まもなく、4番線に、山手線外回り、品川・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
28. まもなく、4番線に、山手線外回り、渋谷・新宿方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
29. まもなく、4番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
30. まもなく、5番線に、山手線外回り、品川・渋谷方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
31. まもなく、6番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
32. まもなく、7番線に、山手線外回り、上野・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
33. まもなく、8番線に、山手線外回り、上野・東京方面行きがまいります。危ないですから、黄色い点字ブロックまで、お下がりください。
34. まもなく、9番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、お下がりください。
35. 上野、上野。ご乗車、ありがとうございます。
36. 五反田、五反田。ご乗車、ありがとうございます。
37. 今度の、10番線の電車は、山手線外回り、上野・東京方面行きです。
38. 今度の、15番線の電車は、山手線外回り、池袋・上野方面行きです。
39. 今度の、1番線の電車は、山手線外回り、上野・東京方面行きです。
40. 今度の、1番線の電車は、山手線外回り、新宿・池袋方面行きです。
41. 今度の、1番線の電車は、山手線外回り、池袋・上野方面行きです。
42. 今度の、1番線の電車は、山手線外回り、渋谷・新宿方面行きです。
43. 今度の、2番線の電車は、山手線外回り、上野・東京方面行きです。
44. 今度の、2番線の電車は、山手線外回り、品川・渋谷方面行きです。
45. 今度の、2番線の電車は、山手線外回り、新宿・池袋方面行きです。
46. 今度の、2番線の電車は、山手線外回り、東京・品川方面行きです。
47. 今度の、2番線の電車は、山手線外回り、池袋・上野方面行きです。
48. 今度の、2番線の電車は、山手線外回り、渋谷・新宿方面行きです。
49. 今度の、3番線の電車は、山手線外回り、上野・東京方面行きです。
50. 今度の、3番線の電車は、山手線外回り、品川・渋谷方面行きです。
51. 今度の、3番線の電車は、山手線外回り、東京・品川方面行きです。
52. 今度の、3番線の電車は、山手線外回り、渋谷・新宿方面行きです。
53. 今度の、4番線の電車は、山手線外回り、品川・渋谷方面行きです。
54. 今度の、4番線の電車は、山手線外回り、渋谷・新宿方面行きです。
55. 今度の、5番線の電車は、山手線外回り、品川・渋谷方面行きです。
56. 今度の、7番線の電車は、山手線外回り、上野・東京方面行きです。
57. 今度の、8番線の電車は、山手線外回り、上野・東京方面行きです。
58. 代々木、代々木。ご乗車、ありがとうございます。
59. 原宿、原宿。ご乗車、ありがとうございます。
60. 品川、品川。ご乗車、ありがとうございます。
61. 大塚、大塚。ご乗車、ありがとうございます。
62. 大崎、大崎。ご乗車、ありがとうございます。
63. 山手線は、お客さま救護の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
64. 山手線は、ドア点検の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
65. 山手線は、ホーム上の安全確認の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
66. 山手線は、架線の停電の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
67. 山手線は、線路内人立入りの影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
68. 山手線は、車両点検の影響で、一部の電車に遅れが出ています。お急ぎのところ、ご迷惑をおかけいたします。
69. 巣鴨、巣鴨。ご乗車、ありがとうございます。
70. 御徒町、御徒町。ご乗車、ありがとうございます。
71. 恵比寿、恵比寿。ご乗車、ありがとうございます。
72. 新大久保、新大久保。ご乗車、ありがとうございます。
73. 新宿、新宿。ご乗車、ありがとうございます。
74. 新橋、新橋。ご乗車、ありがとうございます。
75. 日暮里、日暮里。ご乗車、ありがとうございます。
76. 有楽町、有楽町。ご乗車、ありがとうございます。
77. 本日も、山手線を、ご利用くださいまして、ありがとうございます。
78. 東京、東京。ご乗車、ありがとうございます。
79. 池袋、池袋。ご乗車、ありがとうございます。
80. 浜松町、浜松町。ご乗車、ありがとうございます。
81. 渋谷、渋谷。ご乗車、ありがとうございます。
82. 田町、田町。ご乗車、ありがとうございます。
83. 田端、田端。ご乗車、ありがとうございます。
84. 目白、目白。ご乗車、ありがとうございます。
85. 目黒、目黒。ご乗車、ありがとうございます。
86. 神田、神田。ご乗車、ありがとうございます。
87. 秋葉原、秋葉原。ご乗車、ありがとうございます。
88. 西日暮里、西日暮里。ご乗車、ありがとうございます。
89. 電車がまいります。ご注意ください。
90. 電車が通過します。ご注意ください。
91. 電車とホームの間が空いているところがありますので、足元にご注意ください。
92. 駒込、駒込。ご乗車、ありがとうございます。
93. 高田馬場、高田馬場。ご乗車、ありがとうございます。
94. 高輪ゲートウェイ、高輪ゲートウェイ。ご乗車、ありがとうございます。
95. 鶯谷、鶯谷。ご乗車、ありがとうございます。

### Japonais · agent de quai au micro — 10 lignes

1. お待たせしております。ただいま、ドアの確認を行っております。
2. お荷物、お身体を、ドアからお引きください。
3. しばらくお待ちください。
4. ドアが閉まりません。もう一度、ドアから離れてください。
5. ドア付近のお客さまは、車内中ほどまでお進みください。
6. ホーム中ほどまでお進みください。
7. 危ないですから、ドアから離れてください。
8. 無理なご乗車はおやめください。次の電車をご利用ください。
9. 降りるお客さまを先にお通しください。
10. 駆け込み乗車は、おやめください。

### Anglais · quai — 47 lignes

1. Please mind the gap between the train and the platform.
2. Your attention, please. A train will pass through track number 1. For your safety, please stand behind the yellow line.
3. Your attention, please. A train will pass through track number 12. For your safety, please stand behind the yellow line.
4. Your attention, please. A train will pass through track number 3. For your safety, please stand behind the yellow line.
5. Your attention, please. A train will pass through track number 4. For your safety, please stand behind the yellow line.
6. Your attention, please. A train will pass through track number 6. For your safety, please stand behind the yellow line.
7. Your attention, please. A train will pass through track number 9. For your safety, please stand behind the yellow line.
8. Your attention, please. The Yamanote Line train bound for Ikebukuro and Shinjuku will soon arrive at track number 1. For your safety, please stand behind the yellow line.
9. Your attention, please. The Yamanote Line train bound for Ikebukuro and Shinjuku will soon arrive at track number 11. For your safety, please stand behind the yellow line.
10. Your attention, please. The Yamanote Line train bound for Ikebukuro and Shinjuku will soon arrive at track number 2. For your safety, please stand behind the yellow line.
11. Your attention, please. The Yamanote Line train bound for Ikebukuro and Shinjuku will soon arrive at track number 3. For your safety, please stand behind the yellow line.
12. Your attention, please. The Yamanote Line train bound for Ikebukuro and Ueno will soon arrive at track number 1. For your safety, please stand behind the yellow line.
13. Your attention, please. The Yamanote Line train bound for Ikebukuro and Ueno will soon arrive at track number 15. For your safety, please stand behind the yellow line.
14. Your attention, please. The Yamanote Line train bound for Ikebukuro and Ueno will soon arrive at track number 2. For your safety, please stand behind the yellow line.
15. Your attention, please. The Yamanote Line train bound for Shibuya and Shinagawa will soon arrive at track number 1. For your safety, please stand behind the yellow line.
16. Your attention, please. The Yamanote Line train bound for Shibuya and Shinagawa will soon arrive at track number 14. For your safety, please stand behind the yellow line.
17. Your attention, please. The Yamanote Line train bound for Shibuya and Shinagawa will soon arrive at track number 2. For your safety, please stand behind the yellow line.
18. Your attention, please. The Yamanote Line train bound for Shibuya and Shinjuku will soon arrive at track number 1. For your safety, please stand behind the yellow line.
19. Your attention, please. The Yamanote Line train bound for Shibuya and Shinjuku will soon arrive at track number 2. For your safety, please stand behind the yellow line.
20. Your attention, please. The Yamanote Line train bound for Shibuya and Shinjuku will soon arrive at track number 3. For your safety, please stand behind the yellow line.
21. Your attention, please. The Yamanote Line train bound for Shibuya and Shinjuku will soon arrive at track number 4. For your safety, please stand behind the yellow line.
22. Your attention, please. The Yamanote Line train bound for Shinagawa and Shibuya will soon arrive at track number 2. For your safety, please stand behind the yellow line.
23. Your attention, please. The Yamanote Line train bound for Shinagawa and Shibuya will soon arrive at track number 3. For your safety, please stand behind the yellow line.
24. Your attention, please. The Yamanote Line train bound for Shinagawa and Shibuya will soon arrive at track number 4. For your safety, please stand behind the yellow line.
25. Your attention, please. The Yamanote Line train bound for Shinagawa and Shibuya will soon arrive at track number 5. For your safety, please stand behind the yellow line.
26. Your attention, please. The Yamanote Line train bound for Shinagawa and Tokyo will soon arrive at track number 1. For your safety, please stand behind the yellow line.
27. Your attention, please. The Yamanote Line train bound for Shinagawa and Tokyo will soon arrive at track number 2. For your safety, please stand behind the yellow line.
28. Your attention, please. The Yamanote Line train bound for Shinjuku and Ikebukuro will soon arrive at track number 1. For your safety, please stand behind the yellow line.
29. Your attention, please. The Yamanote Line train bound for Shinjuku and Ikebukuro will soon arrive at track number 2. For your safety, please stand behind the yellow line.
30. Your attention, please. The Yamanote Line train bound for Shinjuku and Shibuya will soon arrive at track number 1. For your safety, please stand behind the yellow line.
31. Your attention, please. The Yamanote Line train bound for Shinjuku and Shibuya will soon arrive at track number 2. For your safety, please stand behind the yellow line.
32. Your attention, please. The Yamanote Line train bound for Shinjuku and Shibuya will soon arrive at track number 5. For your safety, please stand behind the yellow line.
33. Your attention, please. The Yamanote Line train bound for Shinjuku and Shibuya will soon arrive at track number 6. For your safety, please stand behind the yellow line.
34. Your attention, please. The Yamanote Line train bound for Tokyo and Shinagawa will soon arrive at track number 2. For your safety, please stand behind the yellow line.
35. Your attention, please. The Yamanote Line train bound for Tokyo and Shinagawa will soon arrive at track number 3. For your safety, please stand behind the yellow line.
36. Your attention, please. The Yamanote Line train bound for Tokyo and Ueno will soon arrive at track number 1. For your safety, please stand behind the yellow line.
37. Your attention, please. The Yamanote Line train bound for Tokyo and Ueno will soon arrive at track number 2. For your safety, please stand behind the yellow line.
38. Your attention, please. The Yamanote Line train bound for Tokyo and Ueno will soon arrive at track number 5. For your safety, please stand behind the yellow line.
39. Your attention, please. The Yamanote Line train bound for Ueno and Ikebukuro will soon arrive at track number 2. For your safety, please stand behind the yellow line.
40. Your attention, please. The Yamanote Line train bound for Ueno and Ikebukuro will soon arrive at track number 3. For your safety, please stand behind the yellow line.
41. Your attention, please. The Yamanote Line train bound for Ueno and Ikebukuro will soon arrive at track number 4. For your safety, please stand behind the yellow line.
42. Your attention, please. The Yamanote Line train bound for Ueno and Tokyo will soon arrive at track number 1. For your safety, please stand behind the yellow line.
43. Your attention, please. The Yamanote Line train bound for Ueno and Tokyo will soon arrive at track number 10. For your safety, please stand behind the yellow line.
44. Your attention, please. The Yamanote Line train bound for Ueno and Tokyo will soon arrive at track number 2. For your safety, please stand behind the yellow line.
45. Your attention, please. The Yamanote Line train bound for Ueno and Tokyo will soon arrive at track number 3. For your safety, please stand behind the yellow line.
46. Your attention, please. The Yamanote Line train bound for Ueno and Tokyo will soon arrive at track number 7. For your safety, please stand behind the yellow line.
47. Your attention, please. The Yamanote Line train bound for Ueno and Tokyo will soon arrive at track number 8. For your safety, please stand behind the yellow line.

