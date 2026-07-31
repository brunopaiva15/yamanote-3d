// Les surfaces imprimées du niveau de correspondance.
//
// Elles sont à part de `textures/procedural`, qui fait déjà trois mille cinq
// cents lignes et couvre le quai, la rame, la ville et les visages. Ce qui suit
// ne sert qu'au hall : façades de distributeurs de titres, portes de consignes,
// enseignes de commerce, plans de quartier, et les trente tampons de gare.
//
// TOUT EST DESSINÉ, RIEN N'EST ÉCRIT DEUX FOIS. Les noms de gare viennent de
// `data/stations`, les sorties de `data/lines` : une enseigne qui inventerait
// son texte finirait par contredire le panneau d'à côté.

import * as THREE from 'three';
import { fitFillText } from './procedural';
import { STATIONS } from '../data/stations';

const JP_FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif';

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  return { c, g };
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Le vert JR East, celui des portillons et de toute la signalétique de sortie. */
const JR_GREEN = '#0d8a3e';
/** Le jaune des ajusteurs de titres et des repères d'attention. */
const CAUTION = '#f2b705';

// --- Billetterie ---------------------------------------------------------

/**
 * Façade d'un 券売機 : la batterie de distributeurs de titres.
 *
 * Une batterie n'est pas une machine répétée trois fois : c'est un bandeau
 * continu au-dessus, le plan tarifaire, puis des postes séparés par des joints
 * verticaux. C'est le bandeau qui la fait reconnaître de loin - il porte le
 * pictogramme du billet et la mention きっぷ, en réserve blanche sur vert.
 */
export function makeTicketFaceTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const { c, g } = makeCanvas(W, H);

  // Caisse : gris perle, plus clair en haut comme toute tôle éclairée d'en haut.
  const body = g.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, '#e9eaea');
  body.addColorStop(1, '#c9cccd');
  g.fillStyle = body;
  g.fillRect(0, 0, W, H);

  // Bandeau d'enseigne.
  g.fillStyle = JR_GREEN;
  g.fillRect(0, 0, W, 92);
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  fitFillText(g, 'きっぷ', 34, 66, 200, 56, 'bold');
  g.font = `500 34px ${JP_FONT}`;
  g.fillText('Tickets', 244, 64);
  // Pictogramme de billet, à droite du bandeau.
  g.fillStyle = '#ffffff';
  g.fillRect(W - 150, 22, 112, 50);
  g.fillStyle = JR_GREEN;
  g.fillRect(W - 138, 32, 88, 30);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) g.fillRect(W - 128 + i * 22, 40, 12, 14);

  // Quatre postes, séparés par un joint sombre.
  const posts = 4;
  const pw = W / posts;
  for (let i = 0; i < posts; i++) {
    const x = i * pw;
    g.strokeStyle = '#9aa0a3';
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, 94, pw - 3, H - 96);

    // Écran tactile, incliné : la zone sombre bleutée qu'on voit de loin.
    const scr = g.createLinearGradient(x, 120, x, 250);
    scr.addColorStop(0, '#1d3a52');
    scr.addColorStop(1, '#0e2233');
    g.fillStyle = scr;
    g.fillRect(x + 22, 118, pw - 44, 134);
    // Grille tarifaire à l'écran : des cases de prix, c'est tout ce qu'on lit.
    g.fillStyle = '#3f7fae';
    for (let r = 0; r < 3; r++) {
      for (let cI = 0; cI < 4; cI++) {
        g.fillRect(x + 34 + cI * ((pw - 68) / 4), 132 + r * 40, (pw - 80) / 4, 30);
      }
    }

    // Fente à billets, fente à monnaie, sébile de rendu.
    g.fillStyle = '#3a3f44';
    g.fillRect(x + 40, 276, pw - 150, 16);
    g.fillRect(x + pw - 92, 272, 22, 46);
    g.fillStyle = '#22262a';
    g.fillRect(x + 34, 342, pw - 68, 54);
    // Lecteur IC : la cible bleue, toujours en saillie et toujours au même
    // endroit - c'est le seul geste que fait un voyageur pressé.
    g.fillStyle = '#1f5fbf';
    g.fillRect(x + pw - 118, 342, 74, 54);
    g.fillStyle = '#cfe0f5';
    g.fillRect(x + pw - 106, 354, 50, 30);

    // Socle en retrait.
    g.fillStyle = '#7f8589';
    g.fillRect(x + 6, H - 44, pw - 12, 44);
  }
  return toTexture(c);
}

/**
 * Façade d'un 精算機, l'ajusteur de fin de course.
 *
 * Même caisse, mais une seule, et signalée en JAUNE : c'est la machine qu'on
 * cherche en catastrophe quand on est descendu trop loin, et le jaune est là
 * pour qu'on la trouve sans lire.
 */
export function makeFareAdjustTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  const body = g.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, '#eceded');
  body.addColorStop(1, '#cdd0d1');
  g.fillStyle = body;
  g.fillRect(0, 0, W, H);

  g.fillStyle = CAUTION;
  g.fillRect(0, 0, W, 104);
  g.fillStyle = '#241f10';
  g.textAlign = 'center';
  fitFillText(g, 'のりこし精算', W / 2, 60, W - 60, 54, 'bold');
  g.font = `500 30px ${JP_FONT}`;
  g.fillText('Fare Adjustment', W / 2, 92);

  const scr = g.createLinearGradient(0, 130, 0, 280);
  scr.addColorStop(0, '#1d3a52');
  scr.addColorStop(1, '#0e2233');
  g.fillStyle = scr;
  g.fillRect(46, 130, W - 92, 150);
  g.fillStyle = '#3f7fae';
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 3; i++) g.fillRect(66 + i * 130, 150 + r * 62, 110, 48);
  }
  g.fillStyle = '#3a3f44';
  g.fillRect(80, 306, 240, 18);
  g.fillRect(W - 140, 300, 26, 52);
  g.fillStyle = '#22262a';
  g.fillRect(70, 374, 250, 58);
  g.fillStyle = '#1f5fbf';
  g.fillRect(W - 160, 374, 90, 58);
  g.fillStyle = '#7f8589';
  g.fillRect(8, H - 46, W - 16, 46);
  return toTexture(c);
}

/**
 * Front de consignes (コインロッカー) : trois tailles de portes.
 *
 * Une consigne se lit à sa TRAME - petites portes en haut, grandes en bas,
 * chacune numérotée, une serrure et un voyant. La borne de paiement, elle, est
 * une colonne à part, plus haute, à un bout.
 */
export function makeLockerTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#3f4a52';
  g.fillRect(0, 0, W, H);

  // Trois rangs : deux de petites portes, un de moyennes, un de grandes.
  const rows = [
    { y: 24, h: 190, n: 8 },
    { y: 230, h: 190, n: 8 },
    { y: 436, h: 250, n: 5 },
    { y: 700, h: 300, n: 3 },
  ];
  let number = 1;
  for (const row of rows) {
    const dw = W / row.n;
    for (let i = 0; i < row.n; i++) {
      const x = i * dw + 8;
      const w = dw - 16;
      const door = g.createLinearGradient(x, row.y, x, row.y + row.h);
      door.addColorStop(0, '#dfe2e2');
      door.addColorStop(1, '#b9bec1');
      g.fillStyle = door;
      g.fillRect(x, row.y, w, row.h);
      g.strokeStyle = '#8d9599';
      g.lineWidth = 3;
      g.strokeRect(x, row.y, w, row.h);
      // Numéro, serrure, voyant : les trois choses qu'une porte porte.
      g.fillStyle = '#2a2f33';
      g.textAlign = 'left';
      g.font = `bold ${Math.min(30, row.h * 0.16)}px ${JP_FONT}`;
      g.fillText(String(number++), x + 12, row.y + 34);
      g.fillStyle = '#6f767a';
      g.fillRect(x + w - 44, row.y + row.h / 2 - 16, 30, 32);
      g.fillStyle = (number + i) % 3 === 0 ? '#c8332b' : '#2f7a44';
      g.fillRect(x + w - 40, row.y + 16, 22, 10);
    }
  }
  return toTexture(c);
}

// --- Commerce ------------------------------------------------------------

/**
 * Bandeau d'enseigne du konbini de gare.
 *
 * NEWDAYS est une marque JR East et son bandeau est bleu, blanc et vert ; on
 * n'imite pas un logo, on en garde la STRUCTURE - un aplat franc, le nom en
 * capitales, et la mention 24時間 quand la boutique est ouverte en continu,
 * parce que c'est elle qu'on cherche à quatre heures du matin.
 */
export function makeKonbiniSignTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 192;
  const { c, g } = makeCanvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a4f9c');
  grad.addColorStop(1, '#12417f');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Filet vert en pied : le rappel JR.
  g.fillStyle = JR_GREEN;
  g.fillRect(0, H - 16, W, 16);

  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  fitFillText(g, 'NEWDAYS', 44, H * 0.68, W * 0.52, 104, 'bold');
  g.fillStyle = '#cfe0f5';
  g.font = `600 40px ${JP_FONT}`;
  g.fillText('コンビニエンスストア', W * 0.6, H * 0.45);
  g.fillStyle = CAUTION;
  g.fillRect(W * 0.6, H * 0.56, 190, 52);
  g.fillStyle = '#241f10';
  g.textAlign = 'center';
  fitFillText(g, '24時間', W * 0.6 + 95, H * 0.56 + 40, 170, 38, 'bold');
  return toTexture(c);
}

/**
 * Ce qu'on voit à travers la vitrine d'un konbini : des gondoles.
 *
 * Peint plutôt que modélisé, et c'est un choix de budget assumé - l'intérieur
 * n'est visible que de trois quarts, à travers un verre, et une gondole
 * modélisée coûterait cent fois ce qu'elle rapporte. Ce qui compte est la
 * STRATIFICATION : des rayonnages horizontaux, des couleurs par étage, et de la
 * lumière au fond.
 */
export function makeKonbiniInteriorTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  // Fond éclairé : un konbini est le point le plus lumineux d'un hall.
  const back = g.createLinearGradient(0, 0, 0, H);
  back.addColorStop(0, '#fffdf4');
  back.addColorStop(1, '#e6e3d8');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);

  // Rayonnages : cinq étages, des produits par petits blocs de couleur.
  const TONES = ['#d8452e', '#2f7a44', '#e0a51f', '#1f5fbf', '#8a3f9c', '#c86a18', '#d9d2c4'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let shelf = 0; shelf < 5; shelf++) {
    const y = 46 + shelf * 92;
    g.fillStyle = '#cdc7b8';
    g.fillRect(0, y + 66, W, 10);
    let x = 6;
    while (x < W - 10) {
      const w = 22 + rnd() * 34;
      const h = 40 + rnd() * 22;
      g.fillStyle = TONES[Math.floor(rnd() * TONES.length)];
      g.fillRect(x, y + 66 - h, w, h);
      // Étiquette de prix, blanche, sur le nez du rayon.
      if (rnd() > 0.72) {
        g.fillStyle = '#ffffff';
        g.fillRect(x + 2, y + 68, w - 4, 8);
      }
      x += w + 4 + rnd() * 8;
    }
  }
  // Vitrine réfrigérée à droite : plus froide, plus bleue, portes vitrées.
  g.fillStyle = 'rgba(150,190,215,0.35)';
  g.fillRect(W * 0.72, 0, W * 0.28, H);
  g.strokeStyle = '#9fb6c4';
  g.lineWidth = 6;
  for (let i = 0; i < 3; i++) g.strokeRect(W * 0.72 + i * (W * 0.093), 10, W * 0.093, H - 20);
  return toTexture(c);
}

// --- Signalétique murale -------------------------------------------------

/**
 * 周辺案内図 - le plan de quartier affiché en zone libre.
 *
 * Ce n'est pas une carte lisible et ça n'a pas à l'être : à un mètre, un plan
 * de gare est une trame de blocs beiges, des rues blanches, une tache verte de
 * parc, une ligne bleue d'eau, et un point rouge « vous êtes ici ». C'est cette
 * signature-là qu'on reconnaît, et c'est elle qu'on dessine.
 */
export function makeAreaMapTexture(index: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 700;
  const { c, g } = makeCanvas(W, H);
  const station = STATIONS[((index % 30) + 30) % 30];

  g.fillStyle = '#f6f4ec';
  g.fillRect(0, 0, W, H);
  // Bandeau de titre.
  g.fillStyle = JR_GREEN;
  g.fillRect(0, 0, W, 84);
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  fitFillText(g, `${station.kanji}駅周辺案内図`, 28, 58, W * 0.6, 52, 'bold');
  g.font = `500 30px ${JP_FONT}`;
  g.fillText(`${station.romaji} Area Guide`, W * 0.64, 56);

  // Trame de rues et d'îlots, déterministe par gare.
  let seed = 1013 + index * 977;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const top = 96;
  g.fillStyle = '#e6e0cf';
  g.fillRect(0, top, W, H - top);
  g.fillStyle = '#ffffff';
  const avenues = [0.22, 0.48, 0.74];
  for (const a of avenues) g.fillRect(0, top + (H - top) * a, W, 26);
  for (let i = 0; i < 5; i++) g.fillRect(W * (0.12 + i * 0.18), top, 22, H - top);
  // Îlots bâtis.
  g.fillStyle = '#d4cdb8';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = top + rnd() * (H - top);
    g.fillRect(x, y, 24 + rnd() * 52, 20 + rnd() * 44);
  }
  // Un parc, une rivière : les deux taches qui donnent l'échelle.
  g.fillStyle = '#bcd6a8';
  g.fillRect(W * (0.05 + rnd() * 0.5), top + (H - top) * rnd() * 0.5, 190, 150);
  g.strokeStyle = '#a8c8dd';
  g.lineWidth = 22;
  g.beginPath();
  g.moveTo(0, top + (H - top) * (0.3 + rnd() * 0.5));
  g.bezierCurveTo(W * 0.35, top + H * 0.4, W * 0.6, top + H * 0.7, W, top + (H - top) * 0.8);
  g.stroke();

  // La gare elle-même : la barre verte de la Yamanote, en travers.
  g.fillStyle = '#80c241';
  g.fillRect(0, top + (H - top) * 0.46, W, 40);
  g.fillStyle = '#ffffff';
  g.fillRect(W * 0.38, top + (H - top) * 0.44, 220, 60);
  g.strokeStyle = '#2a2f33';
  g.lineWidth = 4;
  g.strokeRect(W * 0.38, top + (H - top) * 0.44, 220, 60);
  g.fillStyle = '#2a2f33';
  g.textAlign = 'center';
  fitFillText(g, station.kanji, W * 0.38 + 110, top + (H - top) * 0.44 + 44, 200, 40, 'bold');

  // « Vous êtes ici ».
  const hx = W * 0.5;
  const hy = top + (H - top) * 0.58;
  g.fillStyle = '#c8332b';
  g.beginPath();
  g.arc(hx, hy, 18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(hx, hy, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c8332b';
  g.textAlign = 'left';
  fitFillText(g, '現在地', hx + 26, hy + 10, 180, 34, 'bold');
  return toTexture(c);
}

// --- 駅スタンプ ----------------------------------------------------------

/**
 * Motif d'un tampon de gare. Huit dessins pour trente gares, mais aucun tampon
 * n'est le doublon d'un autre : le nom, le code JY et le cartouche changent
 * toujours. C'est d'ailleurs ainsi que fonctionne la vraie série - le motif dit
 * le quartier, le texte dit la gare.
 */
type StampMotif =
  | 'brick' | 'dog' | 'torii' | 'tower' | 'tram' | 'lantern' | 'bridge' | 'yard';

const MOTIFS: StampMotif[] = [
  'brick', 'brick', 'tower', 'lantern', 'lantern', // Tokyo, Kanda, Akihabara, Okachimachi, Ueno
  'lantern', 'bridge', 'bridge', 'yard', 'torii', // Uguisudani, Nippori, Nishi-Nippori, Tabata, Komagome
  'lantern', 'tram', 'tower', 'torii', 'lantern', // Sugamo, Ōtsuka, Ikebukuro, Mejiro, Takadanobaba
  'lantern', 'tower', 'bridge', 'torii', 'dog', // Shin-Ōkubo, Shinjuku, Yoyogi, Harajuku, Shibuya
  'brick', 'torii', 'bridge', 'yard', 'tower', // Ebisu, Meguro, Gotanda, Ōsaki, Shinagawa
  'tower', 'bridge', 'tower', 'brick', 'brick', // Takanawa GW, Tamachi, Hamamatsuchō, Shimbashi, Yūrakuchō
];

/** Dessine le motif dans un carré centré en (0,0) de demi-côté `r`. */
function drawMotif(g: CanvasRenderingContext2D, motif: StampMotif, r: number): void {
  g.lineWidth = Math.max(3, r * 0.055);
  g.lineJoin = 'round';
  switch (motif) {
    case 'brick': {
      // Halle de brique : deux pignons et une horloge.
      g.strokeRect(-r * 0.8, -r * 0.1, r * 1.6, r * 0.8);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-r * 0.8 + i * r * 0.53, -r * 0.1);
        g.lineTo(-r * 0.8 + i * r * 0.53 + r * 0.265, -r * 0.5);
        g.lineTo(-r * 0.8 + (i + 1) * r * 0.53, -r * 0.1);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, r * 0.18, r * 0.16, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 'dog': {
      // Un chien assis, de profil : trois arcs et deux oreilles.
      g.beginPath();
      g.moveTo(-r * 0.45, r * 0.6);
      g.lineTo(-r * 0.45, -r * 0.1);
      g.quadraticCurveTo(-r * 0.4, -r * 0.5, 0, -r * 0.5);
      g.quadraticCurveTo(r * 0.35, -r * 0.5, r * 0.4, r * 0.05);
      g.lineTo(r * 0.45, r * 0.6);
      g.stroke();
      g.beginPath();
      g.moveTo(-r * 0.2, -r * 0.5);
      g.lineTo(-r * 0.3, -r * 0.72);
      g.lineTo(-r * 0.05, -r * 0.6);
      g.stroke();
      g.beginPath();
      g.moveTo(r * 0.1, -r * 0.52);
      g.lineTo(r * 0.16, -r * 0.75);
      g.lineTo(r * 0.32, -r * 0.55);
      g.stroke();
      break;
    }
    case 'torii': {
      g.beginPath();
      g.moveTo(-r * 0.85, -r * 0.45);
      g.lineTo(r * 0.85, -r * 0.45);
      g.moveTo(-r * 0.7, -r * 0.18);
      g.lineTo(r * 0.7, -r * 0.18);
      g.moveTo(-r * 0.5, -r * 0.45);
      g.lineTo(-r * 0.6, r * 0.7);
      g.moveTo(r * 0.5, -r * 0.45);
      g.lineTo(r * 0.6, r * 0.7);
      g.stroke();
      break;
    }
    case 'tower': {
      g.beginPath();
      g.moveTo(-r * 0.55, r * 0.7);
      g.lineTo(-r * 0.16, -r * 0.4);
      g.lineTo(0, -r * 0.85);
      g.lineTo(r * 0.16, -r * 0.4);
      g.lineTo(r * 0.55, r * 0.7);
      g.moveTo(-r * 0.36, r * 0.16);
      g.lineTo(r * 0.36, r * 0.16);
      g.moveTo(-r * 0.24, -r * 0.16);
      g.lineTo(r * 0.24, -r * 0.16);
      g.stroke();
      break;
    }
    case 'tram': {
      g.strokeRect(-r * 0.7, -r * 0.4, r * 1.4, r * 0.8);
      g.strokeRect(-r * 0.5, -r * 0.22, r * 0.4, r * 0.34);
      g.strokeRect(r * 0.1, -r * 0.22, r * 0.4, r * 0.34);
      g.beginPath();
      g.arc(-r * 0.36, r * 0.55, r * 0.14, 0, Math.PI * 2);
      g.arc(r * 0.36, r * 0.55, r * 0.14, 0, Math.PI * 2);
      g.moveTo(0, -r * 0.4);
      g.lineTo(0, -r * 0.75);
      g.stroke();
      break;
    }
    case 'lantern': {
      // Lanterne de fête, celle des rues marchandes.
      g.beginPath();
      g.ellipse(0, r * 0.05, r * 0.5, r * 0.62, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(-r * 0.28, -r * 0.62);
      g.lineTo(r * 0.28, -r * 0.62);
      g.moveTo(-r * 0.28, r * 0.7);
      g.lineTo(r * 0.28, r * 0.7);
      for (let i = -1; i <= 1; i++) {
        g.moveTo(-r * 0.48, i * r * 0.3);
        g.lineTo(r * 0.48, i * r * 0.3);
      }
      g.stroke();
      break;
    }
    case 'bridge': {
      g.beginPath();
      g.moveTo(-r * 0.85, r * 0.35);
      g.quadraticCurveTo(0, -r * 0.75, r * 0.85, r * 0.35);
      g.moveTo(-r * 0.85, r * 0.55);
      g.lineTo(r * 0.85, r * 0.55);
      g.stroke();
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.32, r * 0.55);
        g.lineTo(i * r * 0.32, r * 0.35 - Math.cos(i * 0.5) * r * 0.35);
        g.stroke();
      }
      break;
    }
    case 'yard': {
      // Faisceau de voies, vu en perspective : la signature d'un dépôt.
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.5, r * 0.7);
        g.lineTo(i * r * 0.16, -r * 0.7);
        g.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const y = -r * 0.7 + i * r * 0.46;
        const w = r * (0.2 + i * 0.16);
        g.beginPath();
        g.moveTo(-w * 2.2, y);
        g.lineTo(w * 2.2, y);
        g.stroke();
      }
      break;
    }
  }
}

/**
 * Le 駅スタンプ d'une gare : l'empreinte, telle qu'elle est reproduite sur le
 * couvercle de la table et sur le cahier.
 *
 * Un tampon de gare est TOUJOURS la même composition - un cercle épais, le
 * motif au milieu, le nom de la gare en haut, la mention 記念 en bas - et c'est
 * cette constance qui fait qu'on les collectionne. L'encre est le violet-rouge
 * des tampons JR East.
 */
export function makeStampTexture(index: number): THREE.CanvasTexture {
  const i = ((index % 30) + 30) % 30;
  const station = STATIONS[i];
  const S = 512;
  const { c, g } = makeCanvas(S, S);
  g.fillStyle = '#f7f3e8';
  g.fillRect(0, 0, S, S);

  const ink = '#8d2b45';
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.translate(S / 2, S / 2);

  // Double cercle : gros trait dehors, filet dedans.
  g.lineWidth = 14;
  g.beginPath();
  g.arc(0, 0, S * 0.44, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, S * 0.39, 0, Math.PI * 2);
  g.stroke();

  // Le motif, au centre, un peu remonté : le bas est pris par le texte.
  g.save();
  g.translate(0, -S * 0.05);
  drawMotif(g, MOTIFS[i], S * 0.2);
  g.restore();

  // Nom de la gare, en haut, dans la couronne.
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  fitFillText(g, station.kanji, 0, -S * 0.24, S * 0.6, 58, 'bold');
  // Code JY et mention, en bas.
  fitFillText(g, `${station.romaji}`, 0, S * 0.2, S * 0.62, 34, '600');
  fitFillText(g, `${station.jy}　記念スタンプ`, 0, S * 0.3, S * 0.62, 30, 'bold');
  return toTexture(c);
}

/**
 * Le cahier ouvert posé sur la table du tampon : deux pages, des empreintes
 * déjà prises, et une case vide. C'est ce détail qui dit qu'on n'est pas le
 * premier à passer.
 */
export function makeStampBookTexture(index: number): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, W, H);
  // Pli central.
  g.fillStyle = '#ddd6c4';
  g.fillRect(W / 2 - 3, 0, 6, H);
  g.strokeStyle = '#cbc3ae';
  g.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    g.strokeRect(24 + ((i - 1) % 2) * (W / 2 - 40), 30, W / 2 - 70, H - 70);
  }
  // Deux empreintes pâles, une case vide : on a déjà tamponné, pas partout.
  g.globalAlpha = 0.5;
  g.strokeStyle = '#8d2b45';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(W * 0.25, H * 0.44, 62, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.32;
  g.beginPath();
  g.arc(W * 0.72, H * 0.44, 58, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = '#7a7263';
  g.textAlign = 'center';
  fitFillText(g, `${STATIONS[((index % 30) + 30) % 30].kanji}駅`, W * 0.25, H * 0.9, 180, 26, '600');
  return toTexture(c);
}

/**
 * Le bandeau qui coiffe la table du tampon : 駅スタンプ, en vert, avec le
 * pictogramme. Sans lui, la table n'est qu'un meuble bas de plus.
 */
export function makeStampSignTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = JR_GREEN;
  g.fillRect(0, 0, 14, H);
  g.fillStyle = '#1c1c1a';
  g.textAlign = 'left';
  fitFillText(g, '駅スタンプ', 34, H * 0.56, W * 0.5, 52, 'bold');
  g.fillStyle = '#4a4a46';
  g.font = `500 26px ${JP_FONT}`;
  g.fillText('Station Stamp', 36, H * 0.85);
  // Le tampon lui-même, en pictogramme.
  g.fillStyle = '#8d2b45';
  g.fillRect(W - 118, 30, 74, 22);
  g.fillRect(W - 94, 52, 26, 30);
  g.fillRect(W - 122, 82, 82, 16);
  return toTexture(c);
}

/**
 * Devanture du guichet みどりの窓口 : le bandeau vert, et derrière la vitre
 * les postes, leurs écrans et leur file d'attente.
 */
export function makeOfficeTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#eceae2';
  g.fillRect(0, 0, W, H);
  g.fillStyle = JR_GREEN;
  g.fillRect(0, 0, W, 96);
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  fitFillText(g, 'みどりの窓口', 34, 68, W * 0.45, 60, 'bold');
  g.font = `500 32px ${JP_FONT}`;
  g.fillText('JR Ticket Office', W * 0.5, 66);

  // Vitre : trois postes, une banque, des écrans allumés.
  g.fillStyle = 'rgba(158,180,196,0.4)';
  g.fillRect(0, 96, W, H - 96);
  g.fillStyle = '#cfd3d2';
  g.fillRect(0, H - 130, W, 130);
  for (let i = 0; i < 3; i++) {
    const x = 60 + i * 320;
    g.fillStyle = '#22303a';
    g.fillRect(x, 190, 190, 120);
    g.fillStyle = '#3f7fae';
    g.fillRect(x + 14, 204, 162, 92);
    // Hygiaphone et guichet.
    g.fillStyle = '#9aa4a8';
    g.fillRect(x + 40, H - 130, 110, 22);
  }
  return toTexture(c);
}

/**
 * Bandeau d'enseigne du kiosque de quai.
 *
 * Un kiosque n'est pas un konbini en petit : son bandeau est plus bas, plus
 * long, et il porte des PRIX - journaux, magazines, boissons - parce qu'on
 * l'achète en passant, sans entrer. C'est cette ligne de chiffres qui le fait
 * lire comme un point de vente et non comme un local technique.
 */
export function makeKioskSignTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 128;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#1a4f9c';
  g.fillRect(0, 0, W, H);
  g.fillStyle = JR_GREEN;
  g.fillRect(0, H - 10, W, 10);
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  fitFillText(g, 'NEWDAYS', 30, H * 0.66, W * 0.26, 66, 'bold');
  g.fillStyle = CAUTION;
  fitFillText(g, 'KIOSK', W * 0.3, H * 0.64, W * 0.12, 52, 'bold');

  // La ligne de prix : c'est elle qui dit qu'on peut acheter en passant.
  const items: [string, string][] = [
    ['新聞', '¥160'],
    ['雑誌', '¥520'],
    ['お茶', '¥150'],
    ['おにぎり', '¥180'],
  ];
  let x = W * 0.46;
  for (const [label, price] of items) {
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(x, 22, 128, H - 48);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    fitFillText(g, label, x + 64, 62, 116, 30, '600');
    g.fillStyle = CAUTION;
    fitFillText(g, price, x + 64, 94, 116, 30, 'bold');
    x += 136;
  }
  g.textAlign = 'left';
  return toTexture(c);
}

/** Ce qu'un panneau suspendu du hall annonce. */
export type GuideKind =
  /** Jaune : la sortie. */
  | 'exit'
  /** Blanc : les quais, en remontant. */
  | 'platform'
  /** Blanc : les portillons, depuis la zone libre. */
  | 'gates'
  /** Bleu : les installations - toilettes, ascenseur, consignes. */
  | 'facility';

/**
 * Panneau suspendu du hall.
 *
 * Une gare japonaise se lit à TROIS COULEURS et jamais à autre chose : le jaune
 * mène dehors, le blanc mène aux trains, le bleu mène aux installations. Un
 * voyageur qui ne lit pas un mot de japonais s'oriente sur la couleur seule -
 * c'est le service que rend cette signalétique, et c'est pourquoi elle ne
 * s'invente pas.
 *
 * `dir` oriente la flèche : -1 vers la gauche, 0 tout droit, +1 vers la droite.
 */
export function makeConcourseGuideTexture(kind: GuideKind, dir: -1 | 0 | 1): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const { c, g } = makeCanvas(W, H);

  const skin = {
    exit: { bg: CAUTION, ink: '#1c1c1a', jp: '出口', en: 'Exit' },
    platform: { bg: '#ffffff', ink: '#1c1c1a', jp: 'のりば', en: 'Platforms' },
    gates: { bg: '#ffffff', ink: '#1c1c1a', jp: '改札口', en: 'Gates' },
    facility: { bg: '#1f5fbf', ink: '#ffffff', jp: 'お手洗い・ロッカー', en: 'Toilets / Lockers' },
  }[kind];

  g.fillStyle = skin.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1c1c1a';
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);

  // La flèche, toujours du côté où l'on va : c'est elle qu'on lit en premier.
  const ax = dir === 1 ? W - 130 : 130;
  g.save();
  g.translate(ax, H / 2);
  // La flèche de base pointe à gauche. « Tout droit » se dit VERS LE HAUT sur
  // un panneau japonais - vers le bas, c'est « descendre », ce qui n'est pas la
  // même consigne du tout.
  if (dir === 1) g.rotate(Math.PI);
  else if (dir === 0) g.rotate(Math.PI / 2);
  g.fillStyle = skin.ink;
  g.beginPath();
  g.moveTo(-72, 0);
  g.lineTo(-14, -58);
  g.lineTo(-14, -22);
  g.lineTo(72, -22);
  g.lineTo(72, 22);
  g.lineTo(-14, 22);
  g.lineTo(-14, 58);
  g.closePath();
  g.fill();
  g.restore();

  const textX = dir === 1 ? 46 : 236;
  g.fillStyle = skin.ink;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  fitFillText(g, skin.jp, textX, H * 0.56, W - 400, 78, 'bold');
  g.font = `500 40px ${JP_FONT}`;
  g.fillText(skin.en, textX + 4, H * 0.84, W - 400);
  return toTexture(c);
}
