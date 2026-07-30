// scripts/announcements-export.ts
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// src/data/loop.ts
var STATION_COUNT = 30;
function wrapStation(index) {
  return (index % STATION_COUNT + STATION_COUNT) % STATION_COUNT;
}
function directionStep(dir) {
  return dir === "outer" ? -1 : 1;
}
function nextStation(index, dir) {
  return wrapStation(index + directionStep(dir));
}
function prevStation(index, dir) {
  return wrapStation(index - directionStep(dir));
}
function stationAtHop(from, hops, dir) {
  return wrapStation(from + hops * directionStep(dir));
}
var LOOP_LABEL_JP = {
  inner: "\u5185\u56DE\u308A",
  outer: "\u5916\u56DE\u308A"
};
function loopNameJp(dir) {
  return `\u5C71\u624B\u7DDA${LOOP_LABEL_JP[dir]}`;
}

// src/data/stations.ts
var STATIONS = [
  { jy: "JY01", kanji: "\u6771\u4EAC", kana: "\u3068\u3046\u304D\u3087\u3046", romaji: "Tokyo", code: "TYO", zh: "\u4E1C\u4EAC", ko: "\uB3C4\uCFC4" },
  { jy: "JY02", kanji: "\u795E\u7530", kana: "\u304B\u3093\u3060", romaji: "Kanda", code: "KND", zh: "\u795E\u7530", ko: "\uAC04\uB2E4" },
  { jy: "JY03", kanji: "\u79CB\u8449\u539F", kana: "\u3042\u304D\u306F\u3070\u3089", romaji: "Akihabara", code: "AKB", zh: "\u79CB\u53F6\u539F", ko: "\uC544\uD0A4\uD558\uBC14\uB77C" },
  { jy: "JY04", kanji: "\u5FA1\u5F92\u753A", kana: "\u304A\u304B\u3061\u307E\u3061", romaji: "Okachimachi", code: "OKC", zh: "\u5FA1\u5F92\u753A", ko: "\uC624\uCE74\uCE58\uB9C8\uCE58" },
  { jy: "JY05", kanji: "\u4E0A\u91CE", kana: "\u3046\u3048\u306E", romaji: "Ueno", code: "UEN", zh: "\u4E0A\u91CE", ko: "\uC6B0\uC5D0\uB178" },
  { jy: "JY06", kanji: "\u9DAF\u8C37", kana: "\u3046\u3050\u3044\u3059\u3060\u306B", romaji: "Uguisudani", code: "UGD", zh: "\u83BA\u8C37", ko: "\uC6B0\uAD6C\uC774\uC2A4\uB2E4\uB2C8" },
  { jy: "JY07", kanji: "\u65E5\u66AE\u91CC", kana: "\u306B\u3063\u307D\u308A", romaji: "Nippori", code: "NPR", zh: "\u65E5\u66AE\u91CC", ko: "\uB2DB\uD3EC\uB9AC" },
  { jy: "JY08", kanji: "\u897F\u65E5\u66AE\u91CC", kana: "\u306B\u3057\u306B\u3063\u307D\u308A", romaji: "Nishi-Nippori", code: "NNP", zh: "\u897F\u65E5\u66AE\u91CC", ko: "\uB2C8\uC2DC\uB2DB\uD3EC\uB9AC" },
  { jy: "JY09", kanji: "\u7530\u7AEF", kana: "\u305F\u3070\u305F", romaji: "Tabata", code: "TBT", zh: "\u7530\u7AEF", ko: "\uB2E4\uBC14\uD0C0" },
  { jy: "JY10", kanji: "\u99D2\u8FBC", kana: "\u3053\u307E\u3054\u3081", romaji: "Komagome", code: "KMG", zh: "\u9A79\u8FBC", ko: "\uACE0\uB9C8\uACE0\uBA54" },
  { jy: "JY11", kanji: "\u5DE3\u9D28", kana: "\u3059\u304C\u3082", romaji: "Sugamo", code: "SGM", zh: "\u5DE2\u9E2D", ko: "\uC2A4\uAC00\uBAA8" },
  { jy: "JY12", kanji: "\u5927\u585A", kana: "\u304A\u304A\u3064\u304B", romaji: "\u014Ctsuka", code: "OTS", zh: "\u5927\u585A", ko: "\uC624\uC4F0\uCE74" },
  { jy: "JY13", kanji: "\u6C60\u888B", kana: "\u3044\u3051\u3076\u304F\u308D", romaji: "Ikebukuro", code: "IKB", zh: "\u6C60\u888B", ko: "\uC774\uCF00\uBD80\uCFE0\uB85C" },
  { jy: "JY14", kanji: "\u76EE\u767D", kana: "\u3081\u3058\u308D", romaji: "Mejiro", code: "MJR", zh: "\u76EE\u767D", ko: "\uBA54\uC9C0\uB85C" },
  { jy: "JY15", kanji: "\u9AD8\u7530\u99AC\u5834", kana: "\u305F\u304B\u3060\u306E\u3070\u3070", romaji: "Takadanobaba", code: "TKB", zh: "\u9AD8\u7530\u9A6C\u573A", ko: "\uB2E4\uCE74\uB2E4\uB178\uBC14\uBC14" },
  { jy: "JY16", kanji: "\u65B0\u5927\u4E45\u4FDD", kana: "\u3057\u3093\u304A\u304A\u304F\u307C", romaji: "Shin-\u014Ckubo", code: "SOK", zh: "\u65B0\u5927\u4E45\u4FDD", ko: "\uC2E0\uC624\uCFE0\uBCF4" },
  { jy: "JY17", kanji: "\u65B0\u5BBF", kana: "\u3057\u3093\u3058\u3085\u304F", romaji: "Shinjuku", code: "SJK", zh: "\u65B0\u5BBF", ko: "\uC2E0\uC8FC\uCFE0" },
  { jy: "JY18", kanji: "\u4EE3\u3005\u6728", kana: "\u3088\u3088\u304E", romaji: "Yoyogi", code: "YOY", zh: "\u4EE3\u4EE3\u6728", ko: "\uC694\uC694\uAE30" },
  { jy: "JY19", kanji: "\u539F\u5BBF", kana: "\u306F\u3089\u3058\u3085\u304F", romaji: "Harajuku", code: "JYH", zh: "\u539F\u5BBF", ko: "\uD558\uB77C\uC8FC\uCFE0" },
  { jy: "JY20", kanji: "\u6E0B\u8C37", kana: "\u3057\u3076\u3084", romaji: "Shibuya", code: "SBY", zh: "\u6DA9\u8C37", ko: "\uC2DC\uBD80\uC57C" },
  { jy: "JY21", kanji: "\u6075\u6BD4\u5BFF", kana: "\u3048\u3073\u3059", romaji: "Ebisu", code: "EBS", zh: "\u60E0\u6BD4\u5BFF", ko: "\uC5D0\uBE44\uC2A4" },
  { jy: "JY22", kanji: "\u76EE\u9ED2", kana: "\u3081\u3050\u308D", romaji: "Meguro", code: "MGR", zh: "\u76EE\u9ED1", ko: "\uBA54\uAD6C\uB85C" },
  { jy: "JY23", kanji: "\u4E94\u53CD\u7530", kana: "\u3054\u305F\u3093\u3060", romaji: "Gotanda", code: "GTN", zh: "\u4E94\u53CD\u7530", ko: "\uACE0\uD0C4\uB2E4" },
  { jy: "JY24", kanji: "\u5927\u5D0E", kana: "\u304A\u304A\u3055\u304D", romaji: "\u014Csaki", code: "OSK", zh: "\u5927\u5D0E", ko: "\uC624\uC0AC\uD0A4" },
  { jy: "JY25", kanji: "\u54C1\u5DDD", kana: "\u3057\u306A\u304C\u308F", romaji: "Shinagawa", code: "SGW", zh: "\u54C1\u5DDD", ko: "\uC2DC\uB098\uAC00\uC640" },
  { jy: "JY26", kanji: "\u9AD8\u8F2A\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4", kana: "\u305F\u304B\u306A\u308F\u3052\u30FC\u3068\u3046\u3047\u3044", romaji: "Takanawa Gateway", code: "TGW", zh: "\u9AD8\u8F6EGateway", ko: "\uB2E4\uCE74\uB098\uC640 \uAC8C\uC774\uD2B8\uC6E8\uC774" },
  { jy: "JY27", kanji: "\u7530\u753A", kana: "\u305F\u307E\u3061", romaji: "Tamachi", code: "TMC", zh: "\u7530\u753A", ko: "\uB2E4\uB9C8\uCE58" },
  { jy: "JY28", kanji: "\u6D5C\u677E\u753A", kana: "\u306F\u307E\u307E\u3064\u3061\u3087\u3046", romaji: "Hamamatsuch\u014D", code: "HMC", zh: "\u6EE8\u677E\u753A", ko: "\uD558\uB9C8\uB9C8\uC4F0\uCD08" },
  { jy: "JY29", kanji: "\u65B0\u6A4B", kana: "\u3057\u3093\u3070\u3057", romaji: "Shimbashi", code: "SMB", zh: "\u65B0\u6865", ko: "\uC2E0\uBC14\uC2DC" },
  { jy: "JY30", kanji: "\u6709\u697D\u753A", kana: "\u3086\u3046\u3089\u304F\u3061\u3087\u3046", romaji: "Y\u016Brakuch\u014D", code: "YUR", zh: "\u6709\u4E50\u753A", ko: "\uC720\uB77C\uCFE0\uCD08" }
];
var DOOR_SIDE = [1, -1, 1, 1, -1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, 1, 1, -1, 1, -1, 1, -1];
var TRANSFERS = {
  JY01: {
    jp: "\u4E2D\u592E\u7DDA\u3001\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u6771\u6D77\u9053\u7DDA\u3001\u6A2A\u9808\u8CC0\u7DDA\u3001\u7DCF\u6B66\u7DDA\u5FEB\u901F\u3001\u4EAC\u8449\u7DDA\u3001\u4E0A\u91CE\u6771\u4EAC\u30E9\u30A4\u30F3\u3001\u6771\u6D77\u9053\u65B0\u5E79\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u4E38\u30CE\u5185\u7DDA",
    en: "the Chuo, Keihin-Tohoku, Tokaido, Yokosuka, Sobu, Keiyo and Ueno-Tokyo Lines, the Tokaido Shinkansen, and the Tokyo Metro Marunouchi Line"
  },
  JY02: { jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u4E2D\u592E\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u9280\u5EA7\u7DDA", en: "the Keihin-Tohoku and Chuo Lines, and the Tokyo Metro Ginza Line" },
  JY03: {
    jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u4E2D\u592E\u30FB\u7DCF\u6B66\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u65E5\u6BD4\u8C37\u7DDA\u3001\u3064\u304F\u3070\u30A8\u30AF\u30B9\u30D7\u30EC\u30B9",
    en: "the Keihin-Tohoku and Chuo-Sobu Lines, the Tokyo Metro Hibiya Line, and the Tsukuba Express"
  },
  JY04: {
    jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u9280\u5EA7\u7DDA\u3001\u65E5\u6BD4\u8C37\u7DDA\u3001\u90FD\u55B6\u5927\u6C5F\u6238\u7DDA",
    en: "the Keihin-Tohoku Line, the Tokyo Metro Ginza and Hibiya Lines, and the Toei Oedo Line"
  },
  JY05: {
    jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u5B87\u90FD\u5BAE\u7DDA\u3001\u9AD8\u5D0E\u7DDA\u3001\u5E38\u78D0\u7DDA\u3001\u4E0A\u91CE\u6771\u4EAC\u30E9\u30A4\u30F3\u3001\u6771\u5317\u30FB\u4E0A\u8D8A\u65B0\u5E79\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u9280\u5EA7\u7DDA\u3001\u65E5\u6BD4\u8C37\u7DDA\u3001\u4EAC\u6210\u7DDA",
    en: "the Keihin-Tohoku, Utsunomiya, Takasaki, Joban and Ueno-Tokyo Lines, the Tohoku and Joetsu Shinkansen, the Tokyo Metro Ginza and Hibiya Lines, and the Keisei Line"
  },
  JY07: {
    jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u5E38\u78D0\u7DDA\u3001\u4EAC\u6210\u7DDA\u3001\u65E5\u66AE\u91CC\u30FB\u820E\u4EBA\u30E9\u30A4\u30CA\u30FC",
    en: "the Keihin-Tohoku and Joban Lines, the Keisei Line, and the Nippori-Toneri Liner"
  },
  JY08: {
    jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u5343\u4EE3\u7530\u7DDA\u3001\u65E5\u66AE\u91CC\u30FB\u820E\u4EBA\u30E9\u30A4\u30CA\u30FC",
    en: "the Keihin-Tohoku Line, the Tokyo Metro Chiyoda Line, and the Nippori-Toneri Liner"
  },
  JY09: { jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA", en: "the Keihin-Tohoku Line" },
  JY10: { jp: "\u6771\u4EAC\u30E1\u30C8\u30ED\u5357\u5317\u7DDA", en: "the Tokyo Metro Namboku Line" },
  JY11: { jp: "\u90FD\u55B6\u4E09\u7530\u7DDA", en: "the Toei Mita Line" },
  JY12: { jp: "\u90FD\u96FB\u8352\u5DDD\u7DDA", en: "the Toden Arakawa Line" },
  JY13: {
    jp: "\u57FC\u4EAC\u7DDA\u3001\u6E58\u5357\u65B0\u5BBF\u30E9\u30A4\u30F3\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u4E38\u30CE\u5185\u7DDA\u3001\u6709\u697D\u753A\u7DDA\u3001\u526F\u90FD\u5FC3\u7DDA\u3001\u6771\u6B66\u6771\u4E0A\u7DDA\u3001\u897F\u6B66\u6C60\u888B\u7DDA",
    en: "the Saikyo and Shonan-Shinjuku Lines, the Tokyo Metro Marunouchi, Yurakucho and Fukutoshin Lines, the Tobu Tojo Line, and the Seibu Ikebukuro Line"
  },
  JY15: { jp: "\u897F\u6B66\u65B0\u5BBF\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u6771\u897F\u7DDA", en: "the Seibu Shinjuku Line and the Tokyo Metro Tozai Line" },
  JY17: {
    jp: "\u4E2D\u592E\u7DDA\u3001\u4E2D\u592E\u30FB\u7DCF\u6B66\u7DDA\u3001\u57FC\u4EAC\u7DDA\u3001\u6E58\u5357\u65B0\u5BBF\u30E9\u30A4\u30F3\u3001\u5C0F\u7530\u6025\u7DDA\u3001\u4EAC\u738B\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u4E38\u30CE\u5185\u7DDA\u3001\u90FD\u55B6\u65B0\u5BBF\u7DDA\u3001\u5927\u6C5F\u6238\u7DDA",
    en: "the Chuo, Chuo-Sobu, Saikyo and Shonan-Shinjuku Lines, the Odakyu Line, the Keio Line, the Tokyo Metro Marunouchi Line, and the Toei Shinjuku and Oedo Lines"
  },
  JY18: { jp: "\u4E2D\u592E\u30FB\u7DCF\u6B66\u7DDA\u3001\u90FD\u55B6\u5927\u6C5F\u6238\u7DDA", en: "the Chuo-Sobu Line and the Toei Oedo Line" },
  JY19: { jp: "\u6771\u4EAC\u30E1\u30C8\u30ED\u5343\u4EE3\u7530\u7DDA\u3001\u526F\u90FD\u5FC3\u7DDA", en: "the Tokyo Metro Chiyoda and Fukutoshin Lines" },
  JY20: {
    jp: "\u57FC\u4EAC\u7DDA\u3001\u6E58\u5357\u65B0\u5BBF\u30E9\u30A4\u30F3\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u9280\u5EA7\u7DDA\u3001\u534A\u8535\u9580\u7DDA\u3001\u526F\u90FD\u5FC3\u7DDA\u3001\u6771\u6025\u6771\u6A2A\u7DDA\u3001\u7530\u5712\u90FD\u5E02\u7DDA\u3001\u4EAC\u738B\u4E95\u306E\u982D\u7DDA",
    en: "the Saikyo and Shonan-Shinjuku Lines, the Tokyo Metro Ginza, Hanzomon and Fukutoshin Lines, the Tokyu Toyoko and Den-en-toshi Lines, and the Keio Inokashira Line"
  },
  JY21: {
    jp: "\u57FC\u4EAC\u7DDA\u3001\u6E58\u5357\u65B0\u5BBF\u30E9\u30A4\u30F3\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u65E5\u6BD4\u8C37\u7DDA",
    en: "the Saikyo and Shonan-Shinjuku Lines, and the Tokyo Metro Hibiya Line"
  },
  JY22: {
    jp: "\u6771\u4EAC\u30E1\u30C8\u30ED\u5357\u5317\u7DDA\u3001\u90FD\u55B6\u4E09\u7530\u7DDA\u3001\u6771\u6025\u76EE\u9ED2\u7DDA",
    en: "the Tokyo Metro Namboku Line, the Toei Mita Line, and the Tokyu Meguro Line"
  },
  JY23: { jp: "\u90FD\u55B6\u6D45\u8349\u7DDA\u3001\u6771\u6025\u6C60\u4E0A\u7DDA", en: "the Toei Asakusa Line and the Tokyu Ikegami Line" },
  JY24: {
    jp: "\u57FC\u4EAC\u7DDA\u3001\u6E58\u5357\u65B0\u5BBF\u30E9\u30A4\u30F3\u3001\u308A\u3093\u304B\u3044\u7DDA",
    en: "the Saikyo and Shonan-Shinjuku Lines, and the Rinkai Line"
  },
  JY25: {
    jp: "\u6771\u6D77\u9053\u7DDA\u3001\u6A2A\u9808\u8CC0\u7DDA\u3001\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u4E0A\u91CE\u6771\u4EAC\u30E9\u30A4\u30F3\u3001\u6771\u6D77\u9053\u65B0\u5E79\u7DDA\u3001\u4EAC\u6025\u7DDA",
    en: "the Tokaido, Yokosuka, Keihin-Tohoku and Ueno-Tokyo Lines, the Tokaido Shinkansen, and the Keikyu Line"
  },
  JY28: {
    jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u6771\u4EAC\u30E2\u30CE\u30EC\u30FC\u30EB\u3001\u90FD\u55B6\u6D45\u8349\u7DDA\u3001\u5927\u6C5F\u6238\u7DDA",
    en: "the Keihin-Tohoku Line, the Tokyo Monorail, and the Toei Asakusa and Oedo Lines"
  },
  JY29: {
    jp: "\u6771\u6D77\u9053\u7DDA\u3001\u6A2A\u9808\u8CC0\u7DDA\u3001\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u4E0A\u91CE\u6771\u4EAC\u30E9\u30A4\u30F3\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u9280\u5EA7\u7DDA\u3001\u90FD\u55B6\u6D45\u8349\u7DDA\u3001\u3086\u308A\u304B\u3082\u3081",
    en: "the Tokaido, Yokosuka, Keihin-Tohoku and Ueno-Tokyo Lines, the Tokyo Metro Ginza Line, the Toei Asakusa Line, and the Yurikamome"
  },
  JY30: { jp: "\u4EAC\u6D5C\u6771\u5317\u7DDA\u3001\u6771\u4EAC\u30E1\u30C8\u30ED\u6709\u697D\u753A\u7DDA", en: "the Keihin-Tohoku Line and the Tokyo Metro Yurakucho Line" }
};
var LOOP_HUB_JY = ["JY01", "JY05", "JY13", "JY17", "JY20", "JY25"];
var LOOP_HUB_INDICES = STATIONS.reduce((out2, st, i) => {
  if (LOOP_HUB_JY.includes(st.jy)) out2.push(i);
  return out2;
}, []);

// src/data/stationAnnouncements.ts
function atosVoiceForDirection(direction) {
  return direction === "inner" ? "atos-inner" : "atos-outer";
}
function ja(text, voice) {
  return { text, lang: "ja-JP", voice };
}
function en(text) {
  return { text, lang: "en-US", voice: "atos-en" };
}
function bound(index, dir) {
  const hubs = nextHubs(nextStation(index, dir), 2, dir);
  return {
    jp: hubs.map((h) => h.kanji).join("\u30FB"),
    en: hubs.length === 2 ? `${hubs[0].romaji} and ${hubs[1].romaji}` : hubs[0].romaji
  };
}
function platformPreAnnouncement(index, platform, dir) {
  const b = bound(index, dir);
  return [
    ja(
      `\u4ECA\u5EA6\u306E\u3001${platform}\u756A\u7DDA\u306E\u96FB\u8ECA\u306F\u3001${loopJp(dir)}\u3001${b.jp}\u65B9\u9762\u884C\u304D\u3067\u3059\u3002`,
      atosVoiceForDirection(dir)
    )
  ];
}
function platformGreeting(dir) {
  return [
    ja(
      "\u672C\u65E5\u3082\u3001\u5C71\u624B\u7DDA\u3092\u3001\u3054\u5229\u7528\u304F\u3060\u3055\u3044\u307E\u3057\u3066\u3001\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002",
      atosVoiceForDirection(dir)
    )
  ];
}
function platformApproachAnnouncement(index, platform, dir) {
  const b = bound(index, dir);
  return [
    ja(
      `\u307E\u3082\u306A\u304F\u3001${platform}\u756A\u7DDA\u306B\u3001${loopJp(dir)}\u3001${b.jp}\u65B9\u9762\u884C\u304D\u304C\u307E\u3044\u308A\u307E\u3059\u3002\u5371\u306A\u3044\u3067\u3059\u304B\u3089\u3001\u9EC4\u8272\u3044\u70B9\u5B57\u30D6\u30ED\u30C3\u30AF\u307E\u3067\u3001\u304A\u4E0B\u304C\u308A\u304F\u3060\u3055\u3044\u3002`,
      atosVoiceForDirection(dir)
    ),
    en(
      `Your attention, please. The Yamanote Line train bound for ${b.en} will soon arrive at track number ${platform}. For your safety, please stand behind the yellow line.`
    )
  ];
}
function platformTrainEnteringAnnouncement(dir) {
  return [ja("\u96FB\u8ECA\u304C\u307E\u3044\u308A\u307E\u3059\u3002\u3054\u6CE8\u610F\u304F\u3060\u3055\u3044\u3002", atosVoiceForDirection(dir))];
}
function platformPassAnnouncement(track, dir) {
  return [
    ja(
      `\u307E\u3082\u306A\u304F\u3001${track}\u756A\u7DDA\u3092\u3001\u96FB\u8ECA\u304C\u901A\u904E\u3057\u307E\u3059\u3002\u5371\u306A\u3044\u3067\u3059\u304B\u3089\u3001\u9EC4\u8272\u3044\u70B9\u5B57\u30D6\u30ED\u30C3\u30AF\u307E\u3067\u3001\u304A\u4E0B\u304C\u308A\u304F\u3060\u3055\u3044\u3002`,
      atosVoiceForDirection(dir)
    ),
    en(
      `Your attention, please. A train will pass through track number ${track}. For your safety, please stand behind the yellow line.`
    )
  ];
}
function platformPassWarning(dir) {
  return [ja("\u96FB\u8ECA\u304C\u901A\u904E\u3057\u307E\u3059\u3002\u3054\u6CE8\u610F\u304F\u3060\u3055\u3044\u3002", atosVoiceForDirection(dir))];
}
function platformArrivalAnnouncement(index, dir) {
  const st = STATIONS[index];
  return [
    ja(`${st.kanji}\u3001${st.kanji}\u3002\u3054\u4E57\u8ECA\u3001\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002`, atosVoiceForDirection(dir))
  ];
}
var PLATFORM_AGENT_MESSAGES = [
  {
    text: "\u964D\u308A\u308B\u304A\u5BA2\u3055\u307E\u3092\u5148\u306B\u304A\u901A\u3057\u304F\u3060\u3055\u3044\u3002",
    category: "alighting",
    weight: 3,
    delayedWeightMultiplier: 1.2
  },
  {
    text: "\u30C9\u30A2\u4ED8\u8FD1\u306E\u304A\u5BA2\u3055\u307E\u306F\u3001\u8ECA\u5185\u4E2D\u307B\u3069\u307E\u3067\u304A\u9032\u307F\u304F\u3060\u3055\u3044\u3002",
    category: "move-inside",
    weight: 3,
    minCrowd: 0.35,
    delayedWeightMultiplier: 2
  },
  {
    text: "\u30DB\u30FC\u30E0\u4E2D\u307B\u3069\u307E\u3067\u304A\u9032\u307F\u304F\u3060\u3055\u3044\u3002",
    category: "move-along-platform",
    weight: 2,
    minCrowd: 0.3,
    delayedWeightMultiplier: 1.6
  },
  {
    text: "\u99C6\u3051\u8FBC\u307F\u4E57\u8ECA\u306F\u3001\u304A\u3084\u3081\u304F\u3060\u3055\u3044\u3002",
    category: "no-rushing",
    weight: 2,
    delayedWeightMultiplier: 1.4
  },
  {
    text: "\u7121\u7406\u306A\u3054\u4E57\u8ECA\u306F\u304A\u3084\u3081\u304F\u3060\u3055\u3044\u3002\u6B21\u306E\u96FB\u8ECA\u3092\u3054\u5229\u7528\u304F\u3060\u3055\u3044\u3002",
    category: "wait-next-train",
    weight: 1,
    minCrowd: 0.65,
    delayedWeightMultiplier: 2.5
  },
  {
    text: "\u304A\u8377\u7269\u3001\u304A\u8EAB\u4F53\u3092\u3001\u30C9\u30A2\u304B\u3089\u304A\u5F15\u304D\u304F\u3060\u3055\u3044\u3002",
    category: "clear-doors",
    weight: 2,
    minCrowd: 0.5,
    delayedWeightMultiplier: 1.8
  }
];
function platformAgentMessage(n) {
  const i = (n % PLATFORM_AGENT_MESSAGES.length + PLATFORM_AGENT_MESSAGES.length) % PLATFORM_AGENT_MESSAGES.length;
  return [ja(PLATFORM_AGENT_MESSAGES[i].text, "agent")];
}
function platformDoorsClosingAnnouncement(platform, dir) {
  return [
    ja(`${platform}\u756A\u7DDA\u3001\u30C9\u30A2\u304C\u9589\u307E\u308A\u307E\u3059\u3002\u3054\u6CE8\u610F\u304F\u3060\u3055\u3044\u3002`, atosVoiceForDirection(dir))
  ];
}
var PLATFORM_DOOR_RELEASE = [
  "\u5371\u306A\u3044\u3067\u3059\u304B\u3089\u3001\u30C9\u30A2\u304B\u3089\u96E2\u308C\u3066\u304F\u3060\u3055\u3044\u3002",
  "\u304A\u8377\u7269\u3001\u304A\u8EAB\u4F53\u3092\u3001\u30C9\u30A2\u304B\u3089\u304A\u5F15\u304D\u304F\u3060\u3055\u3044\u3002",
  "\u30C9\u30A2\u304C\u9589\u307E\u308A\u307E\u305B\u3093\u3002\u3082\u3046\u4E00\u5EA6\u3001\u30C9\u30A2\u304B\u3089\u96E2\u308C\u3066\u304F\u3060\u3055\u3044\u3002"
];
function platformDoorReleaseAnnouncement(n) {
  const i = (n % PLATFORM_DOOR_RELEASE.length + PLATFORM_DOOR_RELEASE.length) % PLATFORM_DOOR_RELEASE.length;
  return [ja(PLATFORM_DOOR_RELEASE[i], "agent")];
}
function platformDoorCheckAnnouncement() {
  return [
    ja("\u304A\u5F85\u305F\u305B\u3057\u3066\u304A\u308A\u307E\u3059\u3002\u305F\u3060\u3044\u307E\u3001\u30C9\u30A2\u306E\u78BA\u8A8D\u3092\u884C\u3063\u3066\u304A\u308A\u307E\u3059\u3002", "agent"),
    ja("\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002", "agent")
  ];
}
var PLATFORM_DELAY_CAUSES = [
  "\u304A\u5BA2\u3055\u307E\u6551\u8B77",
  "\u30C9\u30A2\u70B9\u691C",
  "\u8ECA\u4E21\u70B9\u691C",
  "\u7DDA\u8DEF\u5185\u4EBA\u7ACB\u5165\u308A",
  "\u30DB\u30FC\u30E0\u4E0A\u306E\u5B89\u5168\u78BA\u8A8D",
  "\u67B6\u7DDA\u306E\u505C\u96FB"
];
var DELAY_CAUSE_OUTAGE = PLATFORM_DELAY_CAUSES.indexOf("\u67B6\u7DDA\u306E\u505C\u96FB");
function platformDelayAnnouncement(cause, dir) {
  const i = (cause % PLATFORM_DELAY_CAUSES.length + PLATFORM_DELAY_CAUSES.length) % PLATFORM_DELAY_CAUSES.length;
  return [
    ja(
      `\u5C71\u624B\u7DDA\u306F\u3001${PLATFORM_DELAY_CAUSES[i]}\u306E\u5F71\u97FF\u3067\u3001\u4E00\u90E8\u306E\u96FB\u8ECA\u306B\u9045\u308C\u304C\u51FA\u3066\u3044\u307E\u3059\u3002\u304A\u6025\u304E\u306E\u3068\u3053\u308D\u3001\u3054\u8FF7\u60D1\u3092\u304A\u304B\u3051\u3044\u305F\u3057\u307E\u3059\u3002`,
      atosVoiceForDirection(dir)
    )
  ];
}

// src/data/stationAnnouncementRules.ts
var GAP_JP = "\u96FB\u8ECA\u3068\u30DB\u30FC\u30E0\u306E\u9593\u304C\u7A7A\u3044\u3066\u3044\u308B\u3068\u3053\u308D\u304C\u3042\u308A\u307E\u3059\u306E\u3067\u3001\u8DB3\u5143\u306B\u3054\u6CE8\u610F\u304F\u3060\u3055\u3044\u3002";
var GAP_EN_CABIN = "Please watch your step when you leave the train.";
var GAP_EN_PLATFORM = "Please mind the gap between the train and the platform.";
var STATION_ANNOUNCEMENT_RULES = {
  // JY20 渋谷 - quai en courbe, donc écart variable entre la rame et le bord.
  //
  // Vérification : le quai Yamanote de Shibuya décrit une courbe, et la
  // réunion des deux voies sur un seul îlot (travaux de janvier 2023) n'a pas
  // redressé le tracé. L'écart existe donc des DEUX côtés de l'îlot - d'où
  // l'absence de `directions` - et JR East le signale, comme partout où le
  // dévers ou la courbe éloignent le seuil du bord.
  //
  // Deux canaux, et ce n'est pas la même chose : la rame le dit à l'approche,
  // aux gens qui vont descendre ; le quai le redit à l'arrivée, aux gens qui
  // sont sur le point de mettre le pied dans le train. Aucun des deux ne
  // reprend la phrase de l'autre au même instant - et en anglais, aucun des deux
  // ne dit tout à fait la même chose (voir GAP_EN_CABIN / GAP_EN_PLATFORM).
  JY20: {
    cabin: [{ jp: GAP_JP, en: GAP_EN_CABIN, position: "during-approach" }],
    platform: [{ jp: GAP_JP, en: GAP_EN_PLATFORM, phase: "arrival" }]
  }
};
function matchesDirection(notice, direction) {
  return !notice.directions || notice.directions.includes(direction);
}
function ruleFor(stationJy, rules) {
  return rules[stationJy];
}
function cabinNoticesForStation(stationJy, direction, position, rules = STATION_ANNOUNCEMENT_RULES) {
  const out2 = [];
  for (const notice of ruleFor(stationJy, rules)?.cabin ?? []) {
    if (notice.position !== position) continue;
    if (!matchesDirection(notice, direction)) continue;
    out2.push({ text: noCommas(notice.jp), lang: "ja-JP" });
    if (notice.en) out2.push({ text: noCommas(notice.en), lang: "en-US" });
  }
  return out2;
}
function platformNoticesForStation(stationJy, direction, phase, rules = STATION_ANNOUNCEMENT_RULES) {
  const out2 = [];
  const voice = atosVoiceForDirection(direction);
  for (const notice of ruleFor(stationJy, rules)?.platform ?? []) {
    if (notice.phase !== phase) continue;
    if (!matchesDirection(notice, direction)) continue;
    out2.push({ text: notice.jp, lang: "ja-JP", voice });
    if (notice.en) out2.push({ text: notice.en, lang: "en-US", voice: "atos-en" });
  }
  return out2;
}
var PLATFORM_NOTICE_PHASES = [
  "pre-approach",
  "approach",
  "arrival"
];

// src/data/announcements.ts
var loopJp = loopNameJp;
var MAJOR_HUBS = new Set(LOOP_HUB_INDICES);
function isMajorHub(index) {
  return MAJOR_HUBS.has(wrapStation(index));
}
function nextHubs(from, count, dir) {
  const out2 = [];
  for (let step = 0; step < 30 && out2.length < count; step++) {
    const i = stationAtHop(from, step, dir);
    if (MAJOR_HUBS.has(i)) out2.push(STATIONS[i]);
  }
  return out2;
}
function noCommas(text) {
  return text.replace(/、/g, "\u3002").replace(/,\s+(\p{L})/gu, (_m, c) => `. ${c.toUpperCase()}`).replace(/,/g, ".");
}
function doorSideJp(side) {
  return side === 1 ? "\u53F3" : "\u5DE6";
}
function doorSideEn(side) {
  return side === 1 ? "right" : "left";
}
function spokenJy(jy) {
  const m = /^([A-Z]+)(\d+)$/i.exec(jy);
  if (!m) return jy;
  return `${m[1].toUpperCase()}. ${m[2]}`;
}
function directionAnnouncement(index, dir) {
  const hubs = nextHubs(index, 2, dir);
  const jpHubs = hubs.map((h) => h.kanji).join("\u30FB");
  const enHubs = hubs.length === 2 ? `${hubs[0].romaji} and ${hubs[1].romaji}` : hubs[0].romaji;
  return [
    { text: `\u3053\u306E\u96FB\u8ECA\u306F\u3002${loopJp(dir)}\u3002${jpHubs}\u65B9\u9762\u3086\u304D\u3067\u3059\u3002`, lang: "ja-JP" },
    { text: `This is a Yamanote Line train bound for ${enHubs}.`, lang: "en-US" }
  ];
}
function nextStationAnnouncement(index, side) {
  const st = STATIONS[index];
  const sideJp = doorSideJp(side);
  const sideEn = doorSideEn(side);
  return [
    {
      text: `\u6B21\u306F\u3002${st.kanji}\u3002${st.kanji}\u3002\u304A\u51FA\u53E3\u306F\u3002${sideJp}\u5074\u3067\u3059\u3002`,
      lang: "ja-JP"
    },
    {
      text: `The next station is. ${st.romaji}. ${spokenJy(st.jy)}. The doors on the ${sideEn} side will open.`,
      lang: "en-US"
    }
  ];
}
function approachAnnouncement(index, side) {
  const st = STATIONS[index];
  const sideJp = doorSideJp(side);
  const sideEn = doorSideEn(side);
  return [
    {
      text: `\u307E\u3082\u306A\u304F\u3002${st.kanji}\u3002${st.kanji}\u3002\u304A\u51FA\u53E3\u306F\u3002${sideJp}\u5074\u3067\u3059\u3002`,
      lang: "ja-JP"
    },
    {
      text: `The next station is. ${st.romaji}. The doors on the ${sideEn} side will open.`,
      lang: "en-US"
    }
  ];
}
function transferAnnouncement(index) {
  const st = STATIONS[index];
  const tr = TRANSFERS[st.jy];
  if (!tr) return [];
  return [
    { text: `${noCommas(tr.jp)}\u306F\u3002\u304A\u4E57\u63DB\u3067\u3059\u3002`, lang: "ja-JP" },
    { text: `Please change here for ${noCommas(tr.en)}.`, lang: "en-US" }
  ];
}
function doorsClosingAnnouncement() {
  return [
    { text: "\u30C9\u30A2\u304C\u9589\u307E\u308A\u307E\u3059\u3002\u3054\u6CE8\u610F\u304F\u3060\u3055\u3044\u3002", lang: "ja-JP" },
    { text: "The doors are closing. Please stand clear of the doors.", lang: "en-US" }
  ];
}
function passengerAssistanceInitialAnnouncement() {
  return [
    { text: "\u304A\u5BA2\u69D8\u306B\u3054\u6848\u5185\u3044\u305F\u3057\u307E\u3059\u3002\u305F\u3060\u3044\u307E\u3002\u304A\u5BA2\u69D8\u306E\u6551\u8B77\u3092\u884C\u3063\u3066\u304A\u308A\u307E\u3059\u3002\u767A\u8ECA\u307E\u3067\u3002\u3044\u307E\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002", lang: "ja-JP" },
    { text: "Attention please. We are currently assisting a passenger. Please wait a little longer before departure.", lang: "en-US" }
  ];
}
function passengerAssistanceWaitAnnouncement() {
  return [
    { text: "\u304A\u5BA2\u69D8\u3092\u304A\u5F85\u305F\u305B\u3057\u3066\u304A\u308A\u307E\u3059\u3002\u5F15\u304D\u7D9A\u304D\u3002\u304A\u5BA2\u69D8\u306E\u6551\u8B77\u3092\u884C\u3063\u3066\u304A\u308A\u307E\u3059\u3002\u767A\u8ECA\u307E\u3067\u3002\u3044\u307E\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002", lang: "ja-JP" },
    { text: "Thank you for your patience. We are still assisting a passenger. Please wait a little longer before departure.", lang: "en-US" }
  ];
}
function passengerAssistanceResumeAnnouncement() {
  return [
    { text: "\u304A\u5F85\u305F\u305B\u3044\u305F\u3057\u307E\u3057\u305F\u3002\u304A\u5BA2\u69D8\u306E\u6551\u8B77\u304C\u7D42\u4E86\u3057\u307E\u3057\u305F\u306E\u3067\u3002\u307E\u3082\u306A\u304F\u767A\u8ECA\u3044\u305F\u3057\u307E\u3059\u3002", lang: "ja-JP" },
    { text: "Thank you for waiting. Assistance has been completed. This train will depart shortly.", lang: "en-US" }
  ];
}
function doorReleaseAnnouncement(insist = false) {
  if (insist) {
    return [
      { text: "\u30C9\u30A2\u304C\u9589\u307E\u308A\u307E\u305B\u3093\u3002\u30C9\u30A2\u304B\u3089\u96E2\u308C\u3066\u304F\u3060\u3055\u3044\u3002", lang: "ja-JP" },
      { text: "The doors cannot close. Please stand clear of the doors.", lang: "en-US" }
    ];
  }
  return [
    { text: "\u30C9\u30A2\u304B\u3089\u96E2\u308C\u3066\u304F\u3060\u3055\u3044\u3002", lang: "ja-JP" },
    { text: "Please stand clear of the doors.", lang: "en-US" }
  ];
}
function welcomeAnnouncement() {
  return [
    { text: "\u672C\u65E5\u3082\u3002\u5C71\u624B\u7DDA\u3092\u3002\u3054\u5229\u7528\u304F\u3060\u3055\u3044\u307E\u3057\u3066\u3002\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002", lang: "ja-JP" },
    { text: "Thank you for using the Yamanote Line.", lang: "en-US" }
  ];
}
function prioritySeatsAnnouncement() {
  return [
    {
      text: "\u3053\u306E\u96FB\u8ECA\u306B\u306F\u3002\u512A\u5148\u5E2D\u304C\u3042\u308A\u307E\u3059\u3002\u512A\u5148\u5E2D\u3092\u5FC5\u8981\u3068\u3055\u308C\u308B\u304A\u5BA2\u69D8\u304C\u3044\u3089\u3063\u3057\u3083\u3044\u307E\u3057\u305F\u3089\u3002\u5E2D\u3092\u304A\u8B72\u308A\u304F\u3060\u3055\u3044\u3002\u304A\u5BA2\u69D8\u306E\u3054\u5354\u529B\u3092\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002",
      lang: "ja-JP"
    },
    {
      text: "There are priority seats in most cars. Please offer your seat to those who may need it.",
      lang: "en-US"
    }
  ];
}
function mannersAnnouncement() {
  return [
    {
      text: "\u304A\u5BA2\u69D8\u306B\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002\u512A\u5148\u5E2D\u4ED8\u8FD1\u3067\u306F\u3002\u643A\u5E2F\u96FB\u8A71\u306E\u96FB\u6E90\u3092\u304A\u5207\u308A\u304F\u3060\u3055\u3044\u3002\u305D\u308C\u4EE5\u5916\u306E\u5834\u6240\u3067\u306F\u3002\u30DE\u30CA\u30FC\u30E2\u30FC\u30C9\u306B\u8A2D\u5B9A\u306E\u3046\u3048\u3002\u901A\u8A71\u306F\u304A\u63A7\u3048\u304F\u3060\u3055\u3044\u3002\u3054\u5354\u529B\u3092\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002",
      lang: "ja-JP"
    },
    {
      text: "Please switch off your mobile phone when you are near the priority seats. In other areas. Please set it to silent mode and refrain from talking on the phone.",
      lang: "en-US"
    }
  ];
}
function suddenStopAnnouncement() {
  return [
    {
      text: "\u304A\u5BA2\u69D8\u306B\u304A\u9858\u3044\u3044\u305F\u3057\u307E\u3059\u3002\u96FB\u8ECA\u306F\u4E8B\u6545\u9632\u6B62\u306E\u305F\u3081\u3002\u3084\u3080\u3092\u5F97\u305A\u6025\u505C\u8ECA\u3059\u308B\u3053\u3068\u304C\u3042\u308A\u307E\u3059\u306E\u3067\u3002\u304A\u7ACB\u3061\u306E\u304A\u5BA2\u69D8\u306F\u3002\u3064\u308A\u9769\u3084\u624B\u3059\u308A\u306B\u304A\u3064\u304B\u307E\u308A\u304F\u3060\u3055\u3044\u3002",
      lang: "ja-JP"
    },
    {
      text: "It may be necessary for the train to stop suddenly to prevent an accident. So please be careful.",
      lang: "en-US"
    }
  ];
}
var EMERGENCY_REASONS = [
  { jp: "\u4FE1\u53F7\u78BA\u8A8D", en: "a signal check" },
  { jp: "\u7DDA\u8DEF\u5185\u306E\u5B89\u5168\u78BA\u8A8D", en: "a track safety check" },
  { jp: "\u8ECA\u4E21\u306E\u70B9\u691C", en: "a train inspection" }
];
function emergencyBrakeAnnouncement() {
  return [
    { text: "\u6025\u505C\u8ECA\u3057\u307E\u3059\u3002\u3054\u6CE8\u610F\u304F\u3060\u3055\u3044\u3002", lang: "ja-JP" },
    { text: "This train will make an emergency stop. Please hold on.", lang: "en-US" }
  ];
}
function emergencyStopAnnouncement(reason) {
  const r = EMERGENCY_REASONS[(reason % EMERGENCY_REASONS.length + EMERGENCY_REASONS.length) % EMERGENCY_REASONS.length];
  return [
    {
      text: `\u304A\u5BA2\u69D8\u306B\u3054\u6848\u5185\u3044\u305F\u3057\u307E\u3059\u3002\u305F\u3060\u3044\u307E\u3002${r.jp}\u306E\u305F\u3081\u3002\u6025\u505C\u8ECA\u3044\u305F\u3057\u307E\u3057\u305F\u3002\u5B89\u5168\u306E\u78BA\u8A8D\u3092\u884C\u3063\u3066\u304A\u308A\u307E\u3059\u306E\u3067\u3002\u6050\u308C\u5165\u308A\u307E\u3059\u304C\u3002\u3044\u307E\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002`,
      lang: "ja-JP"
    },
    {
      text: `Attention please. This train has made an emergency stop due to ${r.en}. Please wait while safety checks are carried out.`,
      lang: "en-US"
    }
  ];
}
function emergencyWaitAnnouncement() {
  return [
    {
      text: "\u304A\u5BA2\u69D8\u306B\u3054\u6848\u5185\u3044\u305F\u3057\u307E\u3059\u3002\u305F\u3060\u3044\u307E\u3002\u5B89\u5168\u306E\u78BA\u8A8D\u3092\u884C\u3063\u3066\u304A\u308A\u307E\u3059\u3002\u904B\u8EE2\u518D\u958B\u307E\u3067\u3002\u3044\u307E\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002\u3054\u8FF7\u60D1\u3092\u304A\u304B\u3051\u3044\u305F\u3057\u307E\u3059\u3002",
      lang: "ja-JP"
    },
    {
      text: "Safety checks are still under way. We apologize for the delay. And thank you for your patience.",
      lang: "en-US"
    }
  ];
}
function emergencyResumeAnnouncement() {
  return [
    {
      text: "\u304A\u5F85\u305F\u305B\u3044\u305F\u3057\u307E\u3057\u305F\u3002\u5B89\u5168\u306E\u78BA\u8A8D\u304C\u3068\u308C\u307E\u3057\u305F\u306E\u3067\u3002\u307E\u3082\u306A\u304F\u904B\u8EE2\u3092\u518D\u958B\u3044\u305F\u3057\u307E\u3059\u3002",
      lang: "ja-JP"
    },
    {
      text: "Thank you for waiting. Safety has been confirmed. And this train will shortly resume service.",
      lang: "en-US"
    }
  ];
}
function outageStopAnnouncement() {
  return [
    {
      text: "\u304A\u5BA2\u69D8\u306B\u3054\u6848\u5185\u3044\u305F\u3057\u307E\u3059\u3002\u305F\u3060\u3044\u307E\u3002\u67B6\u7DDA\u306E\u505C\u96FB\u306E\u305F\u3081\u3002\u3053\u306E\u96FB\u8ECA\u306F\u505C\u8ECA\u3057\u3066\u304A\u308A\u307E\u3059\u3002\u8ECA\u5185\u306E\u7167\u660E\u306F\u975E\u5E38\u706F\u306B\u5207\u308A\u66FF\u308F\u3063\u3066\u304A\u308A\u307E\u3059\u3002\u5FA9\u65E7\u306E\u898B\u901A\u3057\u304C\u7ACB\u3061\u6B21\u7B2C\u3002\u3054\u6848\u5185\u3044\u305F\u3057\u307E\u3059\u306E\u3067\u3002\u8ECA\u5185\u3067\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002",
      lang: "ja-JP"
    },
    {
      text: "Attention please. Due to a power failure on the overhead line. This train has stopped between stations. The lighting has switched to emergency lamps. Please remain inside the train. And wait for further announcements.",
      lang: "en-US"
    }
  ];
}
function outageWaitAnnouncement() {
  return [
    {
      text: "\u304A\u5BA2\u69D8\u306B\u304A\u5F85\u305F\u305B\u3057\u3066\u304A\u308A\u307E\u3059\u3002\u305F\u3060\u3044\u307E\u3002\u96FB\u529B\u306E\u5FA9\u65E7\u4F5C\u696D\u3092\u884C\u3063\u3066\u304A\u308A\u307E\u3059\u3002\u904B\u8EE2\u518D\u958B\u307E\u3067\u3002\u3044\u307E\u3057\u3070\u3089\u304F\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002\u5371\u967A\u3067\u3059\u306E\u3067\u3002\u30C9\u30A2\u306E\u975E\u5E38\u7528\u30B3\u30C3\u30AF\u306B\u306F\u3002\u624B\u3092\u89E6\u308C\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002",
      lang: "ja-JP"
    },
    {
      text: "Thank you for your patience. Work to restore power is under way. Please wait a little longer. And for your own safety. Do not operate the emergency door release.",
      lang: "en-US"
    }
  ];
}
function outageRestoredAnnouncement() {
  return [
    {
      text: "\u304A\u5F85\u305F\u305B\u3044\u305F\u3057\u307E\u3057\u305F\u3002\u305F\u3060\u3044\u307E\u3002\u96FB\u6C17\u304C\u5FA9\u65E7\u3044\u305F\u3057\u307E\u3057\u305F\u3002\u8ECA\u5185\u306E\u6A5F\u5668\u3092\u78BA\u8A8D\u306E\u3046\u3048\u3002\u307E\u3082\u306A\u304F\u904B\u8EE2\u3092\u518D\u958B\u3044\u305F\u3057\u307E\u3059\u3002\u3054\u8FF7\u60D1\u3092\u304A\u304B\u3051\u3044\u305F\u3057\u307E\u3057\u305F\u3002",
      lang: "ja-JP"
    },
    {
      text: "Thank you for waiting. Power has been restored. After equipment checks. This train will shortly resume service. We apologize for the delay.",
      lang: "en-US"
    }
  ];
}
var GUIDANCE_SCHEDULE = [
  { beforeStationCode: "JY06", announcement: "priority-seats", confidence: "unverified" },
  { beforeStationCode: "JY16", announcement: "mobile-phone", confidence: "unverified" },
  { beforeStationCode: "JY26", announcement: "sudden-stop", confidence: "unverified" }
];
var GUIDANCE_BY_ID = {
  "priority-seats": prioritySeatsAnnouncement,
  "mobile-phone": mannersAnnouncement,
  "sudden-stop": suddenStopAnnouncement
};
function guidanceAnnouncements(index, direction) {
  const stationCode = STATIONS[wrapStation(index)].jy;
  const entry = GUIDANCE_SCHEDULE.find((candidate) => candidate.beforeStationCode === stationCode && (!candidate.direction || candidate.direction === direction));
  return entry ? GUIDANCE_BY_ID[entry.announcement]() : [];
}
function departureSequence(index, side, dir) {
  const jy = STATIONS[wrapStation(index)].jy;
  const out2 = [];
  if (isMajorHub(prevStation(index, dir))) {
    out2.push(...directionAnnouncement(index, dir));
  }
  out2.push(...nextStationAnnouncement(index, side));
  out2.push(...cabinNoticesForStation(jy, dir, "after-next-station"));
  out2.push(...transferAnnouncement(index));
  out2.push(...cabinNoticesForStation(jy, dir, "after-transfers"));
  out2.push(...guidanceAnnouncements(index, dir));
  return out2;
}
function approachSequence(index, side, dir) {
  const out2 = [];
  out2.push(...approachAnnouncement(index, side));
  out2.push(...transferAnnouncement(index));
  out2.push(...cabinNoticesForStation(STATIONS[wrapStation(index)].jy, dir, "during-approach"));
  return out2;
}

// src/data/stationGeometry.ts
var PSD_X = 1.78;
var PLATFORM_DEPTH = 5.4;
var PLATFORM_BACK_X = PSD_X + PLATFORM_DEPTH - 0.15;
var PLATFORM_MID_X = PSD_X + PLATFORM_DEPTH * 0.55;
var STAIR_HALF_Z = 2.6;
var ESCALATOR_HALF_Z = 2.8;
var ELEVATOR_HALF_Z = 0.95;
function directionBandZs(length) {
  const halfZ = length / 2;
  return [-halfZ + 31, -halfZ + 109, -halfZ + 161];
}
var STAIR_RISE = 0.175;
var STAIR_GOING = 0.31;
var STAIR_STEPS = 15;
var STAIR_CLEAR_HALF_X = 1.32;
var STAIR_CLEAR_Z1 = 2.42;
var STAIR_LAP = 0.02;
var STAIR_OPENING_HALF_X = STAIR_CLEAR_HALF_X + STAIR_LAP;
var STAIR_OPENING_Z0 = -STAIR_HALF_Z + STAIR_GOING;
var STAIR_OPENING_Z1 = STAIR_CLEAR_Z1 + STAIR_LAP;
var STAIR_LANDING_Y = -STAIR_STEPS * STAIR_RISE;
var STAIR_SOFFIT_Y = STAIR_LANDING_Y - 0.3;
var STAIR_LINTEL_Y = -0.48;
var STAIR_HEADROOM = STAIR_LINTEL_Y - STAIR_LANDING_Y;
var STAIR_LOWER_STEPS = 6;
var STAIR_LOWER_Y = STAIR_LANDING_Y - STAIR_LOWER_STEPS * STAIR_RISE;
var STAIR_LOWER_Z0 = STAIR_CLEAR_Z1;
var STAIR_LOWER_Z1 = STAIR_LOWER_Z0 + (STAIR_LOWER_STEPS + 1) * STAIR_GOING;
var STAIR_WALK_STEPS = 5;
var STAIR_WALK_Y = -STAIR_WALK_STEPS * STAIR_RISE;
var STAIR_WALK_LEN = (STAIR_WALK_STEPS + 1) * STAIR_GOING - 0.02;
var STAIR_FULL_LEN = (STAIR_STEPS + 1) * STAIR_GOING + 1.05;
var STAIR_FULL_STEPS = STAIR_STEPS + 3;

// src/data/config.ts
var CONFIG = {
  // Cycle station (secondes). depart et brake sont dimensionnés pour le profil
  // physique E235 de systems/trainPhysics (~0,84 m/s² au démarrage, arrêt
  // complet en ~23 s depuis 90 km/h - les dernières secondes ne servant qu'à
  // poser la rame, voir le lâcher final du freinage).
  //
  // La durée de croisière n'est PAS ici : elle se déduit de l'intervalle réel
  // du tronçon (data/segments, SEGMENT_HEADWAY_MIN → cruiseDuration), et varie
  // donc d'un tronçon à l'autre et d'un sens à l'autre. Un `cruiseTime: 59`
  // traînait à cette place, que plus personne ne lisait depuis le passage aux
  // intervalles réels : le supprimer évite qu'on le règle en croyant agir.
  //
  // dwellTime n'est PAS la durée d'arrêt non plus : celle-ci est tirée par arrêt
  // (stationCycle.dwellDuration, 40 à 65 s selon la gare, l'état de la ligne
  // et - surtout - la longueur de la 発車メロディ du quai, qu'on laisse aller
  // au bout de ses deux passages). C'est le forfait d'arrêt retiré de
  // l'intervalle réel du tronçon
  // pour dimensionner la croisière (segments.cruiseDuration) - le laisser bas
  // garde à la croisière de quoi placer l'annonce de départ ET celle
  // d'approche, qui cumulent jusqu'à 71 s de parole sur une même file.
  //
  // Le lâcher final allonge le freinage de deux secondes ; elles sont reprises
  // sur le forfait d'arrêt pour que la croisière - et donc l'horaire de la
  // boucle - ne bouge pas d'une seconde.
  brakeTime: 24,
  dwellTime: 20,
  departTime: 17,
  doorTime: 2.6,
  // Vitesses et hauteurs (mètres, m/s, km/h).
  maxSpeedKmh: 90,
  walkSpeed: 1.4,
  // Le quai est bien plus long que le wagon : sans presser le pas on n'en
  // verrait jamais le bout pendant un arrêt.
  runSpeed: 3,
  eyeHeight: 1.55,
  sitHeight: 1.16,
  // Station initiale (scène avant le clic). Au boarding, randomizeEntry()
  // re-tire gare + phase ; l'horloge se cale sur Tokyo au start.
  startIndex: Math.floor(Math.random() * 30),
  clockStart: 16 * 60 + 51,
  // Rendu. (Un `exposure: 0.85` a vécu ici sans jamais être appliqué à
  // `gl.toneMappingExposure` : l'exposition vient du ton mapping de la scène.)
  bloom: 0.25,
  // Géométrie intérieure du wagon (demi-dimensions).
  carHalfLength: 10,
  carHalfWidth: 1.4,
  carHeight: 2.38,
  doorCenters: [-7.5, -2.5, 2.5, 7.5],
  doorHalfWidth: 0.66,
  // Intervalle entre joints de rail (mètres).
  railJointGap: 23,
  // Sonorisation : diffuseurs de plafond du wagon (de part et d'autre du
  // caisson central, au droit de chaque porte). Ceux du QUAI ne sont pas ici :
  // ils appartiennent à la gare, qui les répartit sur toute sa longueur
  // (systems/stationPlacement, data/stationGeometry).
  speakerX: 1.02,
  speakerY: 2.364
  // encastré dans le plafond (sous-face à 2,38 m)
};
var V_MAX = CONFIG.maxSpeedKmh / 3.6;
var CABIN_SPEAKERS = CONFIG.doorCenters.flatMap(
  (z) => [1, -1].map((s) => [s * CONFIG.speakerX, CONFIG.speakerY, z])
);

// src/data/e235.ts
var E235 = {
  /** Entraxe des caisses : c'est la trame sur laquelle le quai est bâti. */
  pitch: 20,
  /** Longueur de caisse hors soufflet (20 000 mm bogie à bogie, caisse un peu plus courte). */
  bodyHalfLen: 9.8,
  /** Demi-largeur de caisse (2 950 mm). */
  halfWidth: 1.475,
  /** Ligne de toit (3 620 mm au-dessus du rail). */
  roofY: 2.49,
  /** Sommet du toit bombé. */
  roofCrownY: 2.6,
  /** Sommet des carénages de climatisation (≈ 4 070 mm rail). */
  acTopY: 2.92,
  /** Sous-face du châssis et bas de jupe. */
  underframeY: -0.1,
  skirtY: -0.74,
  /** Champignon du rail (1 130 mm sous le plancher). */
  railY: -1.13,
  /** Bogies : entraxe 13 800 mm, empattement 2 100 mm, roues Ø 810 mm. */
  bogieDz: 6.9,
  axleDz: 1.05,
  wheelR: 0.405,
  /** Portes : mêmes cotes que l'intérieur, sinon rien ne s'aligne. */
  doorCenters: CONFIG.doorCenters,
  doorHalfW: CONFIG.doorHalfWidth,
  doorH: 1.85,
  /** Face extérieure des vantaux, juste devant la peau de caisse. */
  doorFaceX: 1.5,
  /** Bandeau vitré, aligné sur les baies de l'intérieur. */
  windowBottom: 0.85,
  windowTop: 1.75,
  windowRadius: 0.11,
  /** Montant entre deux baies d'un même panneau. */
  pillar: 0.16,
  /**
   * Habillage uguisu (黄緑6号). Le E235-0 n'a PAS de bandeau continu en haut de
   * caisse : le vert est AUX PORTES, et il monte du bas de caisse jusqu'au
   * pavillon. Les vantaux, verts eux aussi, n'en sont que la partie basse
   * mobile ; au-dessus, c'est la caisse qui est verte. Entre deux portes, le
   * haut de caisse reste inox.
   */
  doorGreenTop: 2.38,
  /** Nez de cabine : longueur du masque vert et hauteur de son pare-brise. */
  cabLen: 2.1,
  windshieldBottom: 1.02,
  windshieldTop: 2.16
};
var CONSIST = [
  { no: 1, kind: "cab", label: "\u30AF\u30CFE235-0", panto: false },
  { no: 2, kind: "motor", label: "\u30E2\u30CFE235-0", panto: false },
  { no: 3, kind: "motor", label: "\u30E2\u30CFE234-0", panto: true },
  { no: 4, kind: "trailer", label: "\u30B5\u30CFE235-0", panto: false },
  { no: 5, kind: "motor", label: "\u30E2\u30CFE235-0", panto: false },
  { no: 6, kind: "motor", label: "\u30E2\u30CFE234-0", panto: true },
  { no: 7, kind: "trailer", label: "\u30B5\u30CFE235-500", panto: false },
  { no: 8, kind: "motor", label: "\u30E2\u30CFE235-0", panto: false },
  { no: 9, kind: "motor", label: "\u30E2\u30CFE234-0", panto: true },
  { no: 10, kind: "trailer", label: "\u30B5\u30CFE235-4600", panto: false },
  { no: 11, kind: "cab", label: "\u30AF\u30CFE234-0", panto: false }
];

// src/data/stationLayouts.ts
var FULL_PLATFORM_LEN = 224;
function bays(length, spacing, from = -0.5, to = 0.5) {
  const out2 = [];
  const z0 = length * from + spacing * 0.4;
  const z1 = length * to - spacing * 0.4;
  for (let z = z0; z <= z1; z += spacing) out2.push(z);
  return out2;
}
function takanawaDeckZs(length) {
  return [-length * 0.22, length * 0.275];
}
var PALETTES = {
  // Béton clair et acier gris : la gare JR ordinaire.
  standard: {
    slab: "#c8c9c4",
    wall: "#b8bab4",
    column: "#8e9296",
    canopy: "#5e646a",
    accent: "#80c241",
    lamp: "#fff2d4",
    tile: "#c7b394"
  },
  // Tranchée : tout est plus sombre, la lumière vient d'en haut.
  trench: {
    slab: "#b9bab5",
    wall: "#9a9c96",
    column: "#7c8085",
    canopy: "#4e545a",
    accent: "#80c241",
    lamp: "#ffeec6",
    tile: "#a8977c"
  },
  // Viaduc : dalle plus claire, structure peinte en gris perle.
  viaduct: {
    slab: "#cdcec8",
    wall: "#c2c4bd",
    column: "#9aa0a4",
    canopy: "#6a7076",
    accent: "#80c241",
    lamp: "#fff5dc",
    tile: "#cfbb99"
  },
  // Grande gare : béton lissé pâle, charpente claire.
  hub: {
    slab: "#d2d3ce",
    wall: "#c6c8c2",
    column: "#a6abaf",
    canopy: "#7a8188",
    accent: "#80c241",
    lamp: "#fff8e6",
    tile: "#d3c0a0"
  },
  // Tokyo : brique et acier riveté sombre de la halle Marunouchi.
  tokyo: {
    slab: "#cfc9c1",
    wall: "#9d5a48",
    column: "#5d4038",
    canopy: "#6b5348",
    accent: "#80c241",
    lamp: "#ffeec0",
    tile: "#7d4636"
  },
  // Shinjuku : forêt de piliers, éclairage jaune, tout est plus bas.
  shinjuku: {
    slab: "#c2c3bd",
    wall: "#adaea8",
    column: "#8b8f92",
    canopy: "#565c62",
    accent: "#80c241",
    lamp: "#ffe9ae",
    tile: "#b39a70"
  },
  // Shibuya : verre et acier blanc de la reconstruction de 2023.
  shibuya: {
    slab: "#d8d9d5",
    wall: "#dcded9",
    column: "#c6cacd",
    canopy: "#aeb5ba",
    accent: "#80c241",
    lamp: "#ffffff",
    tile: "#c8ced2"
  },
  // Takanawa Gateway : acier blanc, cèdre clair, verre. La plus lumineuse de la
  // boucle - elle empruntait jusqu'ici la palette de Shibuya, qui est grise.
  //
  // Blanche, mais pas BLANCHE PARTOUT : c'est le piège de cette gare-là. Le
  // fond de travée est un mur-rideau, donc un gris bleuté de verre et non un
  // aplat crème ; le soubassement et les bancs sont en cèdre. Le blanc reste au
  // sol, aux poteaux et à la membrane du toit, où il est juste.
  takanawa: {
    slab: "#dcdcd6",
    wall: "#a9b6bd",
    column: "#e9eae6",
    canopy: "#e9e5d9",
    accent: "#80c241",
    lamp: "#ffffff",
    tile: "#c9a97c",
    bench: "#c2a271"
  },
  // Vieux viaduc de brique et d'acier : Yūrakuchō, Shimbashi. Piliers épais,
  // maçonnerie sombre, arcades commerçantes en dessous.
  brickViaduct: {
    slab: "#c6c2ba",
    wall: "#8f6551",
    column: "#4f4a45",
    canopy: "#5a5450",
    accent: "#80c241",
    lamp: "#ffe9bc",
    tile: "#7a4d3c"
  },
  // Harajuku : le bâtiment blanc de 2020 d'un côté, le Meiji-jingū de l'autre.
  harajuku: {
    slab: "#d4d5cf",
    wall: "#dcdcd4",
    column: "#b9bdb8",
    canopy: "#8f9690",
    accent: "#80c241",
    lamp: "#fff6e0",
    tile: "#b8a582"
  }
};
var FAMILY = {
  ground: {
    depth: PLATFORM_DEPTH + 2.2,
    canopy: "steel",
    canopyY: 4.1,
    columnSpacing: 12,
    palette: "standard"
  },
  elevated: {
    depth: PLATFORM_DEPTH + 1.4,
    canopy: "steel",
    canopyY: 3.9,
    columnSpacing: 11,
    palette: "viaduct"
  },
  trench: {
    depth: PLATFORM_DEPTH + 0.8,
    canopy: "slab",
    canopyY: 3.3,
    columnSpacing: 9,
    palette: "trench"
  }
};
var KT = "Keihin-T\u014Dhoku";
var SPECS = [
  {
    // JY01 - halle monumentale, voies 4 et 5 sur deux quais partagés avec la
    // Keihin-Tōhoku. Depuis le quai, ce n'est pas la façade de brique qu'on
    // voit, c'est un gigantesque environnement ferroviaire couvert.
    name: "JY01 Tokyo",
    elevation: "ground",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["T\u014Dkaid\u014D", "Ch\u016B\u014D", "T\u014Dkaid\u014D Shinkansen"],
    signature: "tokyo",
    ambience: "hall",
    crowd: 2,
    depth: 10.5,
    canopy: "truss",
    // Sous la grande dalle de la halle (6,30 m) : l'auvent de quai reste dessous.
    canopyY: 5.5,
    columnSpacing: 16,
    palette: "tokyo"
  },
  {
    // JY02 - viaduc à trois quais centraux ; les voies 2 et 3 sont réunies sur
    // le même îlot. Quai étroit, charpente sombre, immeubles à toucher.
    name: "JY02 Kanda",
    elevation: "elevated",
    config: "island",
    parallel: [KT, "Ch\u016B\u014D", "Ginza"],
    ambience: "street",
    crowd: 1,
    depth: PLATFORM_DEPTH + 0.6,
    canopyY: 3.7
  },
  {
    // JY03 - viaducs croisés : les voies 5 et 6 de la Chūō–Sōbu passent
    // perpendiculairement au niveau supérieur. Poutres massives, plafonds bas,
    // plusieurs couches de circulation visibles à la fois.
    name: "JY03 Akihabara",
    elevation: "elevated",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["Ch\u016B\u014D\u2013S\u014Dbu", "Hibiya", "Tsukuba Express"],
    signature: "akihabara",
    ambience: "electric",
    crowd: 1.4,
    depth: PLATFORM_DEPTH + 1,
    canopyY: 3.7,
    columnSpacing: 9.5
  },
  {
    // JY04 - quatre voies parallèles sur viaduc, quais rectilignes et étroits,
    // couverture métallique presque continue. Ameyoko est juste dessous.
    name: "JY04 Okachimachi",
    elevation: "elevated",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["Ginza", "Hibiya", "\u014Cedo"],
    ambience: "market",
    crowd: 0.95,
    depth: PLATFORM_DEPTH + 0.9
  },
  {
    // JY05 - voies élevées, voies terminales et niveaux souterrains. Le quai
    // Yamanote est plus resserré qu'à Tokyo, mais le faisceau donne au décor
    // une profondeur considérable.
    name: "JY05 Ueno",
    openFarSide: true,
    elevation: "ground",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["Utsunomiya", "Takasaki", "J\u014Dban", "T\u014Dhoku Shinkansen"],
    signature: "ueno",
    ambience: "hall",
    crowd: 1.6,
    depth: 8.6,
    canopy: "truss",
    canopyY: 5.2,
    columnSpacing: 14,
    palette: "hub"
  },
  {
    // JY06 - la plus discrète de la boucle : deux quais centraux au sol,
    // toitures anciennes, garde-corps simples, vue sur les temples et les
    // arbres d'Ueno. « Vallée du rossignol » : les oiseaux font partie du lieu.
    name: "JY06 Uguisudani",
    elevation: "ground",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["T\u014Dhoku Shinkansen"],
    ambience: "birds",
    crowd: 0.55,
    depth: PLATFORM_DEPTH + 1.4,
    canopyY: 3.8,
    clock: false
  },
  {
    // JY07 - immense corridor ferroviaire au sol, voies 10 et 11 séparées.
    // Quais longs, ponts-concours au-dessus des rails, faisceau dégagé.
    name: "JY07 Nippori",
    openFarSide: true,
    elevation: "ground",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["J\u014Dban", "Keisei", "Nippori\u2013Toneri Liner"],
    signature: "nippori",
    ambience: "street",
    crowd: 1.2,
    depth: PLATFORM_DEPTH + 2.6,
    canopyY: 4.2
  },
  {
    // JY08 - compacte mais verticalement complexe : quais JR au niveau
    // supérieur, hall en dessous. Quais sobres, étroits, très techniques.
    name: "JY08 Nishi-Nippori",
    elevation: "elevated",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["Chiyoda", "Nippori\u2013Toneri Liner"],
    ambience: "street",
    crowd: 0.9,
    depth: PLATFORM_DEPTH + 0.8,
    canopyY: 3.6
  },
  {
    // JY09 - quatre voies en TRANCHÉE sous le bâtiment de gare, pas au sol :
    // murs de soutènement, passerelles, grande gare-pont au-dessus.
    name: "JY09 Tabata",
    elevation: "trench",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["T\u014Dhoku Shinkansen"],
    ambience: "quiet",
    crowd: 0.8
  },
  {
    // JY10 - unique quai central en tranchée, étroit et calme, talus
    // végétalisés et azalées le long de la voie. Là encore une tranchée, que
    // le tronçon au sol ne laissait pas deviner.
    name: "JY10 Komagome",
    elevation: "trench",
    config: "island",
    parallel: ["Namboku"],
    ambience: "quiet",
    crowd: 0.8,
    depth: PLATFORM_DEPTH + 0.5
  },
  {
    // JY11 - quai central en tranchée, murs latéraux proches, toiture
    // partielle, bâtiment de gare posé au-dessus des voies.
    name: "JY11 Sugamo",
    elevation: "trench",
    config: "island",
    parallel: ["Mita"],
    ambience: "quiet",
    crowd: 0.85
  },
  {
    // JY12 - quai aérien ouvert, la rue passe immédiatement en dessous et le
    // tram Arakawa traverse à côté. Le tronçon est en tranchée, la gare non.
    name: "JY12 Otsuka",
    elevation: "elevated",
    config: "island",
    parallel: ["Toden Arakawa"],
    signature: "otsuka",
    ambience: "tram",
    crowd: 0.9,
    depth: PLATFORM_DEPTH + 1.6,
    canopyY: 4
  },
  {
    // JY13 - quatre voies Yamanote (5 à 8) sur deux quais centraux : c'est ce
    // qui permet départs et terminus. Quais très larges, cages d'escalier
    // nombreuses, panneaux suspendus volumineux. Les voies 5 et 8, longtemps
    // nues, ont reçu leurs portes le 18 mars 2026 : la gare est désormais
    // entièrement équipée.
    name: "JY13 Ikebukuro",
    elevation: "ground",
    config: "terminusIsland",
    parallel: ["Saiky\u014D", "Sh\u014Dnan\u2013Shinjuku", "Seibu Ikebukuro", "T\u014Dbu T\u014Dj\u014D"],
    ambience: "hall",
    crowd: 2,
    depth: 9.8,
    canopy: "truss",
    canopyY: 5.6,
    columnSpacing: 14,
    palette: "hub"
  },
  {
    // JY14 - un seul bâtiment-pont au-dessus du quai, peu de locaux, vue
    // dégagée. L'une des deux seules gares sans correspondance ferroviaire.
    name: "JY14 Mejiro",
    elevation: "trench",
    config: "island",
    parallel: [],
    ambience: "quiet",
    crowd: 0.75,
    depth: PLATFORM_DEPTH + 0.6
  },
  {
    // JY15 - quai aérien étroit, toiture métallique continue, colonnes
    // nombreuses, lignes Seibu visibles juste à côté. Forte affluence
    // étudiante et accumulation de panneaux.
    name: "JY15 Takadanobaba",
    elevation: "elevated",
    config: "island",
    parallel: ["Seibu Shinjuku", "T\u014Dzai"],
    ambience: "students",
    crowd: 1.4,
    depth: PLATFORM_DEPTH + 0.7,
    canopyY: 3.7,
    columnSpacing: 9.5
  },
  {
    // JY16 - quai central étroit, toiture simple, ville extrêmement proche.
    // Le bâtiment actuel est plus vertical que l'ancienne petite gare.
    name: "JY16 Shin-Okubo",
    elevation: "elevated",
    config: "island",
    parallel: [],
    ambience: "street",
    crowd: 1,
    depth: PLATFORM_DEPTH + 0.5,
    canopyY: 3.8
  },
  {
    // JY17 - quai central des voies 14 et 15, au niveau du sol. Alignement
    // massif de quais, toiture presque continue, forêt de poteaux, visibilité
    // coupée par les autres quais. Pas encore de portes de quai Yamanote : la
    // restructuration en cours l'interdit.
    name: "JY17 Shinjuku",
    elevation: "ground",
    config: "island",
    parallel: ["Ch\u016B\u014D", "Ch\u016B\u014D\u2013S\u014Dbu", "Saiky\u014D", "Sh\u014Dnan\u2013Shinjuku", "Odaky\u016B", "Kei\u014D"],
    psd: "none",
    works: true,
    signature: "shinjuku",
    ambience: "hall",
    crowd: 2.2,
    depth: 8.4,
    canopy: "slab",
    canopyY: 4.2,
    columnSpacing: 9,
    palette: "shinjuku"
  },
  {
    // JY18 - quatre voies imbriquant Yamanote et Chūō–Sōbu : les voies 1 et 2
    // sont sur DEUX quais différents, chacune adossée à une voie Chūō–Sōbu.
    // Quais légèrement courbes, anciennes marquises, organisation asymétrique.
    name: "JY18 Yoyogi",
    elevation: "ground",
    config: "sharedIsland",
    sharedWith: "Ch\u016B\u014D\u2013S\u014Dbu",
    parallel: ["\u014Cedo"],
    ambience: "street",
    crowd: 0.9,
    depth: PLATFORM_DEPTH + 1,
    canopyY: 3.8
  },
  {
    // JY19 - LE seul couple de quais latéraux de la boucle, depuis la refonte
    // qui a remplacé l'ancien quai central. Takeshita d'un côté, la végétation
    // du Meiji-jingū de l'autre ; bâtiment clair et vitré, quais courbes.
    name: "JY19 Harajuku",
    elevation: "ground",
    config: "side",
    parallel: ["Chiyoda", "Fukutoshin"],
    signature: "harajuku",
    ambience: "park",
    crowd: 1.3,
    depth: PLATFORM_DEPTH + 0.8,
    canopy: "glass",
    canopyY: 4.6,
    palette: "harajuku"
  },
  {
    // JY20 - depuis 2023 les deux sens tiennent sur un unique quai central très
    // large, mais fortement courbé. Parois et plafonds provisoires, panneaux de
    // chantier partout, et toujours pas de portes de quai en 2026.
    name: "JY20 Shibuya",
    elevation: "elevated",
    config: "island",
    parallel: ["Saiky\u014D", "Sh\u014Dnan\u2013Shinjuku", "Ginza", "T\u014Dky\u016B T\u014Dyoko"],
    psd: "none",
    works: true,
    signature: "shibuya",
    ambience: "hall",
    crowd: 2,
    depth: 10,
    canopy: "glass",
    canopyY: 6.2,
    columnSpacing: 15,
    palette: "shibuya"
  },
  {
    // JY21 - quai central couvert sur viaduc, parallèle au quai
    // Saikyō/Shōnan–Shinjuku, très intégré au complexe Atre. L'extrémité est
    // se prolonge vers la longue passerelle d'Ebisu Garden Place.
    name: "JY21 Ebisu",
    elevation: "elevated",
    config: "island",
    parallel: ["Saiky\u014D", "Sh\u014Dnan\u2013Shinjuku", "Hibiya"],
    signature: "ebisu",
    ambience: "office",
    crowd: 1.2,
    depth: PLATFORM_DEPTH + 1.8,
    canopyY: 4.2
  },
  {
    // JY22 - quai central en tranchée, murs latéraux proches, Atre posé
    // au-dessus. Large au centre, effilé aux extrémités.
    name: "JY22 Meguro",
    elevation: "trench",
    config: "island",
    parallel: ["Namboku", "Mita", "T\u014Dky\u016B Meguro"],
    ambience: "quiet",
    crowd: 1,
    depth: PLATFORM_DEPTH + 1
  },
  {
    // JY23 - quai central légèrement courbé sur viaduc, ville et façades
    // commerciales à toucher, et la Tōkyū Ikegami spectaculairement perchée au
    // quatrième niveau. Le tronçon est en tranchée, la gare non.
    name: "JY23 Gotanda",
    elevation: "elevated",
    config: "island",
    parallel: ["T\u014Dky\u016B Ikegami", "Asakusa"],
    signature: "gotanda",
    ambience: "street",
    crowd: 1,
    depth: PLATFORM_DEPTH + 1.2,
    canopyY: 3.9
  },
  {
    // JY24 - quatre voies Yamanote (1 à 4) sur deux quais centraux : point
    // opérationnel de départ, de terminus et d'accès au dépôt. Portes en place
    // sur les voies principales 1 et 3 ; les secondaires 2 et 4 sont encore
    // en travaux civils (笠石) jusqu'à novembre 2026 au moins.
    name: "JY24 Osaki",
    openFarSide: true,
    elevation: "ground",
    config: "terminusIsland",
    parallel: ["Saiky\u014D", "Sh\u014Dnan\u2013Shinjuku", "Rinkai"],
    psd: "partial",
    ambience: "office",
    crowd: 1.3,
    depth: 8.8,
    canopyY: 4.6,
    columnSpacing: 13,
    palette: "hub"
  },
  {
    // JY25 - très grande gare au sol. Voies 1 et 3 sur deux quais séparés :
    // la numérotation n'est plus continue depuis le remaniement. Immense
    // toiture industrielle, longues perspectives, escaliers massifs, et
    // plusieurs secteurs encore en travaux sur le plan de 2026.
    name: "JY25 Shinagawa",
    openFarSide: true,
    elevation: "ground",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["T\u014Dkaid\u014D", "Yokosuka", "T\u014Dkaid\u014D Shinkansen", "Keiky\u016B"],
    works: true,
    ambience: "hall",
    crowd: 1.7,
    depth: 9.4,
    canopy: "truss",
    canopyY: 5.4,
    columnSpacing: 14,
    palette: "hub"
  },
  {
    // JY26 - grand quai central, second quai central pour la Keihin-Tōhoku.
    // Toiture blanche inspirée de l'origami, acier et bois clair, façades
    // vitrées, atrium visible depuis le quai : la plus lumineuse de la boucle,
    // et la seule dont l'architecture est entièrement propre.
    name: "JY26 Takanawa Gateway",
    elevation: "ground",
    config: "island",
    parallel: [KT],
    signature: "takanawaGateway",
    ambience: "quiet",
    crowd: 0.7,
    depth: 9,
    canopy: "glass",
    canopyY: 6,
    // Rien ne couvre le quai que la toiture pliée : voir `sigCanopy`.
    sigCanopy: true,
    columnSpacing: 15,
    palette: "takanawa"
  },
  {
    // JY27 - quatre voies sur deux quais centraux, les extérieures à la
    // Keihin-Tōhoku. Longues marquises, quais rectilignes, vaste
    // bâtiment-pont, et une partie du hall en travaux en 2026.
    name: "JY27 Tamachi",
    elevation: "ground",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["T\u014Dkaid\u014D"],
    works: true,
    ambience: "office",
    crowd: 1,
    depth: PLATFORM_DEPTH + 1.8
  },
  {
    // JY28 - quatre voies au niveau supérieur. Environnement très vertical, le
    // monorail de Haneda immédiatement à côté, éléments anciens mêlés aux
    // structures neuves et plusieurs zones en construction.
    name: "JY28 Hamamatsucho",
    elevation: "elevated",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["Tokyo Monorail", "Asakusa", "\u014Cedo"],
    works: true,
    signature: "hamamatsucho",
    ambience: "monorail",
    crowd: 1.1,
    depth: PLATFORM_DEPTH + 1.2,
    canopyY: 4
  },
  {
    // JY29 - grande gare élevée, quai central des voies 4 et 5. Vieux viaduc
    // métallique, couverture dense, quais parallèles multiples ; dessous, les
    // arcades et les couloirs bas contrastent avec les tours de Shiodome.
    name: "JY29 Shimbashi",
    // Huit voies parallèles sous la même couverture : rien ne ferme la travée.
    openFarSide: true,
    elevation: "elevated",
    config: "island",
    parallel: ["T\u014Dkaid\u014D", "Yokosuka", "Ginza", "Asakusa", "Yurikamome"],
    signature: "shimbashi",
    ambience: "office",
    crowd: 1.5,
    depth: PLATFORM_DEPTH + 2,
    canopyY: 4.1,
    palette: "brickViaduct"
  },
  {
    // JY30 - viaduc ancien en acier et maçonnerie, piliers épais, quai couvert
    // et étroit. Restaurants et petites cellules commerciales sous les voies ;
    // à l'ouest, l'International Forum tranche par sa modernité.
    name: "JY30 Yurakucho",
    elevation: "elevated",
    config: "sharedIsland",
    sharedWith: KT,
    parallel: ["Y\u016Brakuch\u014D"],
    signature: "yurakucho",
    ambience: "office",
    crowd: 1.1,
    depth: PLATFORM_DEPTH + 0.6,
    canopyY: 3.4,
    palette: "brickViaduct"
  }
];
function amenities(scale, kiosk, clock) {
  const half = FULL_PLATFORM_LEN / 2;
  return {
    benches: Math.round(6 * scale),
    vending: Math.max(1, Math.round(2 * scale)),
    kiosk,
    // Trémies réparties le long du quai, jamais en face d'une porte.
    stairs: [-half * 0.62, half * 0.1],
    escalators: scale > 1 ? [-half * 0.2, half * 0.55] : [half * 0.55],
    elevator: scale > 0.9 ? -half * 0.34 : null,
    clock
  };
}
function dodgePlanes(zs, solids) {
  return zs.flatMap((base) => {
    for (let d = 0; d <= 4.5; d += 0.9) {
      for (const s of d === 0 ? [0] : [-d, d]) {
        const z = base + s;
        if (!solids.some((o) => Math.abs(z - o.z) < o.r)) return [z];
      }
    }
    return [];
  });
}
function sigPlanFor(key, length, depth, spacing, am) {
  if (!key) return void 0;
  const usable = length / 2 - 3;
  const backX = PSD_X + depth / 2;
  const halfConsist = (CONSIST.length - 1) / 2 * E235.pitch;
  const accesses = [
    ...am.stairs.map((z) => ({ z, r: STAIR_HALF_Z + 0.75 })),
    ...am.escalators.map((z) => ({ z, r: ESCALATOR_HALF_Z + 0.75 })),
    ...am.elevator !== null ? [{ z: am.elevator, r: ELEVATOR_HALF_Z + 0.75 }] : []
  ];
  const gantries = [
    ...am.stairs.map((z) => ({ z: z - STAIR_HALF_Z - 1.6, r: 1.4 })),
    ...am.escalators.map((z) => ({ z: z - ESCALATOR_HALF_Z - 1.6, r: 1.4 }))
  ];
  const entries = [
    ...am.stairs.map((z) => ({ z: z - STAIR_HALF_Z + 0.1, r: 0.6 })),
    ...am.escalators.map((z) => ({ z: z - ESCALATOR_HALF_Z + 0.1, r: 0.6 }))
  ];
  const bands = directionBandZs(length).map((z) => ({ z, r: 4.65 }));
  const kiosk = am.kiosk ? [{ z: usable * 0.36, r: 3.15 }] : [];
  const clock = am.clock ? [{ z: 0, r: 0.8 }] : [];
  const columns = [];
  for (let z = -usable; z <= usable; z += spacing) columns.push({ z, r: 0.55 });
  const mirrors = [-1, 1].map((d) => ({ z: d * (halfConsist + 1.2), r: 0.5 }));
  const spinePosts = (zs, extra = []) => dodgePlanes(zs, [...accesses, ...gantries, ...bands, ...kiosk, ...clock, ...columns, ...extra]);
  switch (key) {
    case "tokyo":
      return { keepOut: bays(length, 16).map((z) => ({ z, r: 0.5 })), posts: [], runBlocks: [] };
    case "yurakucho": {
      const zs = dodgePlanes(bays(length, 7.2), [
        ...am.escalators.map((z) => ({ z, r: ESCALATOR_HALF_Z + 0.9 })),
        ...entries,
        ...columns,
        ...mirrors,
        ...gantries.map((g) => ({ z: g.z, r: 0.6 }))
      ]);
      return { keepOut: zs.map((z) => ({ z, r: 0.75 })), posts: [], runBlocks: [] };
    }
    case "shinjuku":
      return { keepOut: bays(length, 12).map((z) => ({ z, r: 0.55 })), posts: [], runBlocks: [] };
    case "shimbashi": {
      const zs = spinePosts(bays(length, 11));
      return {
        keepOut: zs.map((z) => ({ z, r: 0.8 })),
        posts: zs.map((z) => ({ x: backX, z })),
        runBlocks: []
      };
    }
    case "ebisu": {
      const built = length * 0.46;
      const zs = spinePosts(bays(built, 12).map((z) => z - length * 0.16));
      return {
        keepOut: zs.map((z) => ({ z, r: 0.8 })),
        posts: zs.map((z) => ({ x: backX, z })),
        runBlocks: []
      };
    }
    case "takanawaGateway": {
      const decks = takanawaDeckZs(length).map((z) => ({ z, r: 4.2 }));
      const zs = spinePosts(bays(length, 27), decks);
      return {
        keepOut: [...zs.map((z) => ({ z, r: 0.6 })), ...decks],
        posts: zs.map((z) => ({ x: backX, z })),
        // Les branches des colonnes-arbres s'ouvrent DANS la coupe, à la cote
        // même où courent la gouttière et le chemin de câbles : les conduites
        // s'interrompent au droit de chaque colonne, comme elles le font aux
        // gaines d'escalier mécanique.
        runBlocks: zs.map((z) => ({ z0: z - 1.3, z1: z + 1.3 }))
      };
    }
    case "hamamatsucho": {
      const joint = -length * 0.06;
      return {
        keepOut: [{ z: joint, r: 1.55 }],
        posts: [{ x: PSD_X + 0.3, z: joint }],
        runBlocks: [{ z0: joint - 1.8, z1: joint + 1.8 }]
      };
    }
    default:
      return void 0;
  }
}
function build(spec) {
  const f = FAMILY[spec.elevation];
  const am = amenities(spec.crowd, spec.kiosk ?? spec.crowd >= 1.4, spec.clock ?? true);
  const depth = spec.depth ?? f.depth;
  const columnSpacing = spec.columnSpacing ?? f.columnSpacing;
  return {
    elevation: spec.elevation,
    config: spec.config,
    sharedWith: spec.sharedWith,
    parallel: spec.parallel ?? [],
    psd: spec.psd ?? "full",
    works: spec.works ?? false,
    openFarSide: spec.openFarSide ?? false,
    length: FULL_PLATFORM_LEN,
    depth,
    canopy: spec.canopy ?? f.canopy,
    canopyY: spec.canopyY ?? f.canopyY,
    sigCanopy: spec.sigCanopy ?? false,
    columnSpacing,
    palette: PALETTES[spec.palette ?? f.palette],
    amenities: am,
    crowdScale: spec.crowd,
    ambience: spec.ambience,
    signature: spec.signature,
    sigPlan: sigPlanFor(spec.signature, FULL_PLATFORM_LEN, depth, columnSpacing, am)
  };
}
function hasPlatformDoors(index) {
  return layoutFor(index).psd !== "none";
}
var CACHE = /* @__PURE__ */ new Map();
function layoutFor(index) {
  const i = (index % 30 + 30) % 30;
  const hit = CACHE.get(i);
  if (hit) return hit;
  const layout = build(SPECS[i]);
  CACHE.set(i, layout);
  return layout;
}

// src/data/passingTrains.ts
var RAPID_FROM = 10 * 60 + 30;
var RAPID_TO = 15 * 60 + 30;
var NIGHT_FROM = 22 * 60;
var NIGHT_TO = 7 * 60;
var FACING_TRACK = {
  JY01: { inner: 3, outer: 6 },
  // 東京 - îlots 3・4 et 5・6
  JY03: { inner: 1, outer: 4 },
  // 秋葉原
  JY04: { inner: 4, outer: 1 },
  // 御徒町 - numérotation inversée
  JY05: { inner: 1, outer: 4 },
  // 上野
  JY06: { inner: 1, outer: 4 },
  // 鶯谷
  JY07: { inner: 12, outer: 9 },
  // 日暮里 - voies 9 à 12
  JY08: { inner: 4, outer: 1 },
  // 西日暮里 - comme 御徒町
  JY09: { inner: 1, outer: 4 },
  // 田端
  JY27: { inner: 1, outer: 4 },
  // 田町
  JY28: { inner: 1, outer: 4 },
  // 浜松町
  JY30: { inner: 1, outer: 4 }
  // 有楽町
};
function facingTrackNumber(index, direction) {
  const jy = STATIONS[index]?.jy;
  const facing = jy ? FACING_TRACK[jy] : void 0;
  if (!facing) return null;
  return facing[direction];
}
function passThroughStations() {
  const out2 = [];
  for (let i = 0; i < STATIONS.length; i++) {
    if (layoutFor(i).sharedWith && FACING_TRACK[STATIONS[i].jy]) out2.push(i);
  }
  return out2;
}

// src/data/platforms.ts
var YAMANOTE_PLATFORMS = {
  JY01: {
    station: "Tokyo",
    inner: { platform: 4, nextStation: "Kanda" },
    outer: { platform: 5, nextStation: "Yurakucho" }
  },
  JY02: {
    station: "Kanda",
    inner: { platform: 3, nextStation: "Akihabara" },
    outer: { platform: 2, nextStation: "Tokyo" }
  },
  JY03: {
    station: "Akihabara",
    inner: { platform: 2, nextStation: "Okachimachi" },
    outer: { platform: 3, nextStation: "Kanda" }
  },
  JY04: {
    station: "Okachimachi",
    inner: { platform: 3, nextStation: "Ueno" },
    outer: { platform: 2, nextStation: "Akihabara" }
  },
  JY05: {
    station: "Ueno",
    inner: { platform: 2, nextStation: "Uguisudani" },
    outer: { platform: 3, nextStation: "Okachimachi" }
  },
  JY06: {
    station: "Uguisudani",
    inner: { platform: 2, nextStation: "Nippori" },
    outer: { platform: 3, nextStation: "Ueno" }
  },
  JY07: {
    station: "Nippori",
    inner: { platform: 11, nextStation: "Nishi-Nippori" },
    outer: { platform: 10, nextStation: "Uguisudani" }
  },
  JY08: {
    station: "Nishi-Nippori",
    inner: { platform: 3, nextStation: "Tabata" },
    outer: { platform: 2, nextStation: "Nippori" }
  },
  JY09: {
    station: "Tabata",
    inner: { platform: 2, nextStation: "Komagome" },
    outer: { platform: 3, nextStation: "Nishi-Nippori" }
  },
  JY10: {
    station: "Komagome",
    inner: { platform: 2, nextStation: "Sugamo" },
    outer: { platform: 1, nextStation: "Tabata" }
  },
  JY11: {
    station: "Sugamo",
    inner: { platform: 2, nextStation: "Otsuka" },
    outer: { platform: 1, nextStation: "Komagome" }
  },
  JY12: {
    station: "Otsuka",
    inner: { platform: 1, nextStation: "Ikebukuro" },
    outer: { platform: 2, nextStation: "Sugamo" }
  },
  JY13: {
    station: "Ikebukuro",
    inner: { platform: 6, alternativePlatform: 5, nextStation: "Mejiro" },
    outer: { platform: 7, alternativePlatform: 8, nextStation: "Otsuka" }
  },
  JY14: {
    station: "Mejiro",
    inner: { platform: 1, nextStation: "Takadanobaba" },
    outer: { platform: 2, nextStation: "Ikebukuro" }
  },
  JY15: {
    station: "Takadanobaba",
    inner: { platform: 2, nextStation: "Shin-Okubo" },
    outer: { platform: 1, nextStation: "Mejiro" }
  },
  JY16: {
    station: "Shin-Okubo",
    inner: { platform: 2, nextStation: "Shinjuku" },
    outer: { platform: 1, nextStation: "Takadanobaba" }
  },
  JY17: {
    station: "Shinjuku",
    inner: { platform: 14, nextStation: "Yoyogi" },
    outer: { platform: 15, nextStation: "Shin-Okubo" }
  },
  JY18: {
    station: "Yoyogi",
    inner: { platform: 2, nextStation: "Harajuku" },
    outer: { platform: 1, nextStation: "Shinjuku" }
  },
  JY19: {
    station: "Harajuku",
    inner: { platform: 1, nextStation: "Shibuya" },
    outer: { platform: 2, nextStation: "Yoyogi" }
  },
  JY20: {
    station: "Shibuya",
    inner: { platform: 2, nextStation: "Ebisu" },
    outer: { platform: 1, nextStation: "Harajuku" }
  },
  JY21: {
    station: "Ebisu",
    inner: { platform: 2, nextStation: "Meguro" },
    outer: { platform: 1, nextStation: "Shibuya" }
  },
  JY22: {
    station: "Meguro",
    inner: { platform: 1, nextStation: "Gotanda" },
    outer: { platform: 2, nextStation: "Ebisu" }
  },
  JY23: {
    station: "Gotanda",
    inner: { platform: 1, nextStation: "Osaki" },
    outer: { platform: 2, nextStation: "Meguro" }
  },
  JY24: {
    station: "Osaki",
    inner: { platform: 1, alternativePlatform: 2, nextStation: "Shinagawa" },
    outer: { platform: 3, alternativePlatform: 4, nextStation: "Gotanda" }
  },
  JY25: {
    station: "Shinagawa",
    inner: { platform: 1, nextStation: "Takanawa Gateway" },
    outer: { platform: 3, nextStation: "Osaki" }
  },
  JY26: {
    station: "Takanawa Gateway",
    inner: { platform: 1, nextStation: "Tamachi" },
    outer: { platform: 2, nextStation: "Shinagawa" }
  },
  JY27: {
    station: "Tamachi",
    inner: { platform: 2, nextStation: "Hamamatsucho" },
    outer: { platform: 3, nextStation: "Takanawa Gateway" }
  },
  JY28: {
    station: "Hamamatsucho",
    inner: { platform: 2, nextStation: "Shimbashi" },
    outer: { platform: 3, nextStation: "Tamachi" }
  },
  JY29: {
    station: "Shimbashi",
    inner: { platform: 5, nextStation: "Yurakucho" },
    outer: { platform: 4, nextStation: "Hamamatsucho" }
  },
  JY30: {
    station: "Yurakucho",
    inner: { platform: 2, nextStation: "Tokyo" },
    outer: { platform: 3, nextStation: "Shimbashi" }
  }
};
function platformFor(jy, direction) {
  const legacy = YAMANOTE_PLATFORMS[jy]?.[direction];
  if (!legacy) return void 0;
  const profile = platformProfileFor(jy, direction);
  return {
    platform: profile.platform,
    nextStation: legacy.nextStation,
    ...legacy.alternativePlatform === void 0 ? {} : { alternativePlatform: legacy.alternativePlatform }
  };
}
function profileFromLegacy(stationCode, direction, platform, alternative) {
  const legacy = YAMANOTE_PLATFORMS[stationCode]?.[direction];
  if (!legacy) throw new Error(`Unknown Yamanote platform: ${stationCode}/${direction}`);
  const stationIndex = STATIONS.findIndex((station) => station.jy === stationCode);
  if (stationIndex < 0) throw new Error(`Unknown Yamanote station: ${stationCode}`);
  const nextIndex = (stationIndex + (direction === "inner" ? 1 : -1) + STATIONS.length) % STATIONS.length;
  const nextStationCode = STATIONS[nextIndex].jy;
  const installed = layoutFor(stationIndex).psd === "partial" ? platform === legacy.platform : hasPlatformDoors(stationIndex);
  return {
    stationCode,
    direction,
    platform,
    nextStationCode,
    doorSide: DOOR_SIDE[stationIndex] === 1 ? "right" : "left",
    serviceRoles: alternative ? ["alternative", "originating", "terminating", "depot-access"] : ["through"],
    platformDoors: { installed, ...installed ? { type: "half-height" } : {} },
    departureMelody: { compositionId: `${stationCode.toLowerCase()}-${direction}-${platform}` },
    automaticVoice: {
      japaneseRole: direction === "inner" ? "atos-inner" : "atos-outer",
      englishRole: "atos-en"
    },
    evidence: {
      doorSide: {
        value: DOOR_SIDE[stationIndex] === 1 ? "right" : "left",
        confidence: "unverified",
        sourceNote: "Valeur h\xE9rit\xE9e du relev\xE9 station-only; aucune correction factuelle appliqu\xE9e."
      },
      platformDoors: {
        value: installed,
        confidence: "estimated",
        checkedAt: "2026-07-30",
        sourceNote: "Fallback conservateur de stationLayouts.psd pendant la migration par quai."
      }
    }
  };
}
function platformProfileFor(stationCode, direction, options = {}) {
  const legacy = YAMANOTE_PLATFORMS[stationCode]?.[direction];
  if (!legacy) throw new Error(`Unknown Yamanote platform: ${stationCode}/${direction}`);
  const requestedAlternative = options.alternative === true;
  const platform = options.platform ?? (requestedAlternative ? legacy.alternativePlatform : void 0) ?? legacy.platform;
  const alternative = platform !== legacy.platform;
  if (alternative && platform !== legacy.alternativePlatform) {
    throw new Error(`Unknown platform ${platform} for ${stationCode}/${direction}`);
  }
  return profileFromLegacy(stationCode, direction, platform, alternative);
}
var PLATFORM_NUMBERS = Object.fromEntries(
  Object.entries(YAMANOTE_PLATFORMS).map(([jy, info]) => [
    jy,
    { inner: info.inner.platform, outer: info.outer.platform }
  ])
);

// src/data/clipKey.ts
function clipKey(lang, text, voiceRole) {
  const s = voiceRole ? `${lang}|${voiceRole}|${text}` : `${lang}|${text}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// scripts/announcements-export.ts
var CABIN_VOICE = {
  "ja-JP": { voice: "jf_alpha", speed: 1.15 },
  "en-US": { voice: "af_heart", speed: 0.93 }
};
var STATION_VOICE = {
  "atos-inner": { voice: "jf_alpha", speed: 1.1 },
  "atos-outer": { voice: "jm_kumo", speed: 1.15 },
  // L'agent parle un peu plus vite : elle improvise, elle n'articule pas un script.
  agent: { voice: "jf_nezumi", speed: 1.22 },
  "atos-en": { voice: "am_michael", speed: 0.88 }
};
var DIRECTIONS = ["inner", "outer"];
function platformsFor(jy, direction) {
  const info = platformFor(jy, direction);
  if (!info) return [1];
  const out2 = [info.platform];
  if (info.alternativePlatform != null) out2.push(info.alternativePlatform);
  return out2;
}
function stripDiacritics(s) {
  return s.normalize("NFD").replace(/\p{M}+/gu, "");
}
function spellStationCode(s) {
  return s.replace(/\bJY\.\s*0*(\d+)/g, "J Y. $1");
}
var JA_READINGS = [
  [/山手線/g, "\u30E4\u30DE\u30CE\u30C6\u7DDA"],
  // « yamate-sen » → yamanote-sen
  [/内回り/g, "\u30A6\u30C1\u30DE\u30EF\u30EA"],
  // 線内回り recollé en « sennai mawari »
  [/外回り/g, "\u30BD\u30C8\u30DE\u30EF\u30EA"],
  // idem pour l'autre sens : 線外回り → « sengai mawari »
  [/方面行き/g, "\u65B9\u9762\u3086\u304D"],
  // « hōmen-iki » → hōmen-yuki, comme la rame
  [/人立入り/g, "\u3072\u3068\u7ACB\u5165\u308A"],
  // « jinritsu-iri » → hito-tachiiri
  [/ホーム中ほど/g, "\u30DB\u30FC\u30E0\u306A\u304B\u307B\u3069"],
  // « hōmu chū-hodo » → hōmu nakahodo
  [/大江戸線/g, "\u304A\u304A\u3048\u3069\u7DDA"]
  // « dai-edo-sen » → ōedo-sen
];
function ttsText(u) {
  if (u.lang === "en-US") return spellStationCode(stripDiacritics(u.text));
  let out2 = u.text;
  for (const [pattern, reading] of JA_READINGS) out2 = out2.replace(pattern, reading);
  return out2;
}
var utterances = [];
for (const direction of DIRECTIONS) {
  for (let i = 0; i < STATIONS.length; i++) {
    utterances.push(...departureSequence(i, DOOR_SIDE[i], direction));
    utterances.push(...approachSequence(i, DOOR_SIDE[i], direction));
  }
}
utterances.push(...doorsClosingAnnouncement());
utterances.push(...doorReleaseAnnouncement());
utterances.push(...doorReleaseAnnouncement(true));
utterances.push(...welcomeAnnouncement());
utterances.push(...emergencyBrakeAnnouncement());
for (let r = 0; r < EMERGENCY_REASONS.length; r++) {
  utterances.push(...emergencyStopAnnouncement(r));
}
utterances.push(...emergencyWaitAnnouncement());
utterances.push(...emergencyResumeAnnouncement());
utterances.push(...outageStopAnnouncement());
utterances.push(...outageWaitAnnouncement());
utterances.push(...outageRestoredAnnouncement());
utterances.push(...passengerAssistanceInitialAnnouncement());
utterances.push(...passengerAssistanceWaitAnnouncement());
utterances.push(...passengerAssistanceResumeAnnouncement());
var stationUtterances = [];
for (const direction of DIRECTIONS) {
  for (let i = 0; i < STATIONS.length; i++) {
    for (const platform of platformsFor(STATIONS[i].jy, direction)) {
      stationUtterances.push(...platformPreAnnouncement(i, platform, direction));
      stationUtterances.push(...platformApproachAnnouncement(i, platform, direction));
      stationUtterances.push(...platformDoorsClosingAnnouncement(platform, direction));
    }
    stationUtterances.push(...platformArrivalAnnouncement(i, direction));
    for (const phase of PLATFORM_NOTICE_PHASES) {
      stationUtterances.push(...platformNoticesForStation(STATIONS[i].jy, direction, phase));
    }
  }
}
for (const direction of DIRECTIONS) {
  for (const i of passThroughStations()) {
    const track = facingTrackNumber(i, direction);
    if (track != null) stationUtterances.push(...platformPassAnnouncement(track, direction));
  }
}
for (const direction of DIRECTIONS) {
  stationUtterances.push(...platformPassWarning(direction));
  stationUtterances.push(...platformGreeting(direction));
  stationUtterances.push(...platformTrainEnteringAnnouncement(direction));
  for (let c = 0; c < PLATFORM_DELAY_CAUSES.length; c++) {
    stationUtterances.push(...platformDelayAnnouncement(c, direction));
  }
}
for (let n = 0; n < PLATFORM_AGENT_MESSAGES.length; n++) {
  stationUtterances.push(...platformAgentMessage(n));
}
for (let n = 0; n < PLATFORM_DOOR_RELEASE.length; n++) {
  stationUtterances.push(...platformDoorReleaseAnnouncement(n));
}
stationUtterances.push(...platformDoorCheckAnnouncement());
var byKey = /* @__PURE__ */ new Map();
function add(u, setting, role) {
  const key = clipKey(u.lang, u.text, role);
  const existing = byKey.get(key);
  if (existing && existing.text !== u.text) {
    throw new Error(`Collision de cl\xE9 ${key} : \xAB ${existing.text} \xBB / \xAB ${u.text} \xBB`);
  }
  if (existing && existing.voice !== setting.voice) {
    throw new Error(`Texte \xAB ${u.text} \xBB r\xE9clam\xE9 par ${existing.voice} et ${setting.voice}`);
  }
  byKey.set(key, {
    key,
    lang: u.lang,
    text: u.text,
    tts: ttsText(u),
    voice: setting.voice,
    speed: setting.speed,
    ...role ? { role } : {}
  });
}
for (const u of utterances) add(u, CABIN_VOICE[u.lang]);
for (const u of stationUtterances) add(u, STATION_VOICE[u.voice], u.voice);
var ITEMS = [...byKey.values()];
var out = {
  items: ITEMS,
  // Lectures de référence : le générateur vérifie que open_jtalk lit chaque
  // gare comme sa transcription kana et bascule sur le kana en cas d'écart.
  stations: STATIONS.map((s) => ({ kanji: s.kanji, kana: s.kana }))
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dest = process.argv[2] ?? "announcements-texts.json";
  writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`${out.items.length} annonces \u2192 ${dest}`);
}
export {
  ITEMS
};
