// Les trente milieux de quai Yamanote, dans l'ordre JY croissant.
//
// Coordonnées publiées, en JGD2011, à une dizaine de mètres près. Elles ne
// décrivent PAS la voie - c'est data/geo/yamanote-loop.geojson qui la porte,
// depuis OpenStreetMap - mais elles disent où s'arrête le train, et c'est par
// leur projection sur l'axe relevé que les gares entrent dans la polyligne.
//
// Shibuya, Ebisu, Sugamo et Ōtsuka reprennent au mètre près les ancrages du
// prototype PLATEAU (scripts/plateau/config.mjs) : les deux tables ne doivent
// pas dériver l'une de l'autre.
//
// Cette table était dans scripts/geo-loop.mjs ; elle en est sortie pour que
// l'import du tracé et le générateur de src/data/tokyoGeo.ts lisent la même.

export const PLATFORMS = [
  { jy: 'JY01', name: 'Tokyo', lat: 35.68123, lon: 139.76679 },
  { jy: 'JY02', name: 'Kanda', lat: 35.69169, lon: 139.77088 },
  { jy: 'JY03', name: 'Akihabara', lat: 35.6984, lon: 139.77313 },
  { jy: 'JY04', name: 'Okachimachi', lat: 35.70745, lon: 139.77475 },
  { jy: 'JY05', name: 'Ueno', lat: 35.7138, lon: 139.7772 },
  { jy: 'JY06', name: 'Uguisudani', lat: 35.72125, lon: 139.7784 },
  { jy: 'JY07', name: 'Nippori', lat: 35.728, lon: 139.7707 },
  { jy: 'JY08', name: 'Nishi-Nippori', lat: 35.73215, lon: 139.7667 },
  { jy: 'JY09', name: 'Tabata', lat: 35.738, lon: 139.7608 },
  { jy: 'JY10', name: 'Komagome', lat: 35.7366, lon: 139.7481 },
  { jy: 'JY11', name: 'Sugamo', lat: 35.73352, lon: 139.7393 },
  { jy: 'JY12', name: 'Otsuka', lat: 35.73147, lon: 139.72855 },
  { jy: 'JY13', name: 'Ikebukuro', lat: 35.7295, lon: 139.7104 },
  { jy: 'JY14', name: 'Mejiro', lat: 35.7211, lon: 139.7062 },
  { jy: 'JY15', name: 'Takadanobaba', lat: 35.7127, lon: 139.7038 },
  { jy: 'JY16', name: 'Shin-Okubo', lat: 35.70135, lon: 139.7 },
  { jy: 'JY17', name: 'Shinjuku', lat: 35.6899, lon: 139.70055 },
  { jy: 'JY18', name: 'Yoyogi', lat: 35.6832, lon: 139.702 },
  { jy: 'JY19', name: 'Harajuku', lat: 35.6702, lon: 139.70275 },
  { jy: 'JY20', name: 'Shibuya', lat: 35.65845, lon: 139.70165 },
  { jy: 'JY21', name: 'Ebisu', lat: 35.6467, lon: 139.71005 },
  { jy: 'JY22', name: 'Meguro', lat: 35.63395, lon: 139.7157 },
  { jy: 'JY23', name: 'Gotanda', lat: 35.6259, lon: 139.7235 },
  { jy: 'JY24', name: 'Osaki', lat: 35.6197, lon: 139.7286 },
  { jy: 'JY25', name: 'Shinagawa', lat: 35.62855, lon: 139.7387 },
  { jy: 'JY26', name: 'Takanawa Gateway', lat: 35.6357, lon: 139.7407 },
  { jy: 'JY27', name: 'Tamachi', lat: 35.64565, lon: 139.7476 },
  { jy: 'JY28', name: 'Hamamatsucho', lat: 35.6553, lon: 139.757 },
  { jy: 'JY29', name: 'Shimbashi', lat: 35.6661, lon: 139.75855 },
  { jy: 'JY30', name: 'Yurakucho', lat: 35.6749, lon: 139.7631 },
];
