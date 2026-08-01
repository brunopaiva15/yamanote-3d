// Les surfaces qui ferment une gare : béton du mur de fond, enduit peint du
// hall, faïence du soubassement, dalles de plafond.
//
// POURQUOI. Tout ce qui ferme une gare était un aplat : une boîte, une couleur
// de palette, une rugosité constante, et rien d'autre. Sous une lumière douce,
// un aplat clair ne ressemble à rien - ni béton, ni enduit, juste du gris. Ce
// qui fait qu'un mur de gare EST un mur de gare, ce sont ses défauts : la
// reprise de bétonnage, les trous de banche, les coulures qui en descendent,
// les fissures capillaires, la reprise d'enduit qui n'a pas tout à fait la même
// teinte, et le pied noirci par vingt ans de semelles et de serpillière.
//
// TOUT EST DESSINÉ AUTOUR DU BLANC CASSÉ. Les matériaux gardent la `color` de
// la palette (data/stationLayouts) et la texture la MODULE : elle assombrit et
// elle éclaircit, elle n'impose jamais sa propre teinte, et la gare la plus
// chaude reste la plus chaude. Une texture de béton gris aurait ramené les
// trente palettes au même gris - exactement ce qu'on cherche à quitter.
//
// L'ÉCHELLE VIENT DE LA GÉOMÉTRIE, PAS DE `repeat`. Un mur de fond fait deux
// cent vingt-quatre mètres et une joue de trémie un mètre et demi : la même
// texture répétée au même pas donne du moiré sur l'une et une tache unique sur
// l'autre. Les UV sont donc mises à l'échelle réelle par `three/station/wallBox`
// et `repeat` reste à (1, 1). Conséquence utile : sur un mur, v couvre TOUJOURS
// la hauteur entière, ce qui permet d'y peindre un pied sale et un haut
// empoussiéré qui tombent au bon endroit quelle que soit la hauteur du mur.
//
// LE COÛT. Quatre canevas et leurs cartes de rugosité, construits UNE FOIS pour
// toute la boucle (les défauts d'un mur ne sont pas une propriété de la gare) et
// gardés en cache ici. Changer de gare ne les redessine pas.

import * as THREE from 'three';
import { rng } from './procedural';

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  return { c, g };
}

/**
 * Texture de surface.
 *
 * `tileV` dit si la hauteur se répète. Un MUR ne se répète pas en hauteur - sa
 * texture EST le mur, du pied au couronnement - alors qu'un plafond ou un
 * carrelage se répète dans les deux sens.
 */
function toTexture(c: HTMLCanvasElement, tileV: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = tileV ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Carte de rugosité déduite de la carte de couleur.
 *
 * Ce qui est SALE est mat, ce qui est propre est lisse : la crasse du pied de
 * mur, une coulure, un joint creux ne renvoient pas la lumière comme l'enduit
 * intact d'à côté. Déduire la rugosité de la valeur donne cette corrélation
 * gratuitement, et surtout elle la donne ALIGNÉE - une seconde passe de bruit
 * indépendante aurait fait scintiller les joints sans jamais les creuser.
 */
function deriveRoughness(src: HTMLCanvasElement, lo: number, hi: number): THREE.CanvasTexture {
  const { c, g } = makeCanvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    const v = Math.round(255 * (hi - (hi - lo) * l));
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Dessine trois fois - une tuile à gauche, en place, à droite - pour que ce qui
 * déborde d'un bord revienne par l'autre. Sans cela, une coulure coupée net au
 * bord de la tuile se voit comme une couture verticale tous les deux mètres.
 */
function wrapX(g: CanvasRenderingContext2D, w: number, draw: () => void): void {
  for (const dx of [-w, 0, w]) {
    g.save();
    g.translate(dx, 0);
    draw();
    g.restore();
  }
}

/** Semis de micro-taches : le grain, ce qui empêche un aplat d'être un aplat. */
function grain(
  g: CanvasRenderingContext2D,
  r: () => number,
  w: number,
  h: number,
  count: number,
  strength: number,
): void {
  for (let i = 0; i < count; i++) {
    const light = r() > 0.5;
    const a = strength * (0.2 + r() * 0.8);
    g.fillStyle = light ? `rgba(255,255,255,${a})` : `rgba(58,56,52,${a})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 1.9, 1 + r() * 1.9);
  }
}

/**
 * Tache douce, sans bord.
 *
 * Un aplat elliptique aurait fait ce qu'il a fait au premier essai : des ronds.
 * Une valeur d'enduit ne s'arrête nulle part - elle se DILUE -, et il faut donc
 * un dégradé radial, dont le seul défaut est de coûter un objet par tache.
 */
function blot(
  g: CanvasRenderingContext2D,
  w: number,
  x: number,
  y: number,
  rad: number,
  rgb: string,
  alpha: number,
): void {
  const grad = g.createRadialGradient(x, y, rad * 0.12, x, y, rad);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(0.55, `rgba(${rgb},${alpha * 0.42})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  wrapX(g, w, () => {
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  });
}

/** Nuages larges : deux mètres carrés d'enduit n'ont jamais la même valeur. */
function mottle(
  g: CanvasRenderingContext2D,
  r: () => number,
  w: number,
  h: number,
  count: number,
  strength: number,
): void {
  const span = Math.min(w, h);
  for (let i = 0; i < count; i++) {
    const dark = r() > 0.45;
    const a = strength * (0.5 + r() * 0.9);
    blot(
      g,
      w,
      r() * w,
      r() * h,
      span * (0.09 + r() * 0.3),
      dark ? '106,103,96' : '255,255,255',
      dark ? a : a * 1.3,
    );
  }
}

/** Coulure : une traînée qui part d'un point haut et s'épuise en descendant. */
function coulure(
  g: CanvasRenderingContext2D,
  r: () => number,
  w: number,
  x: number,
  y0: number,
  len: number,
  width: number,
  alpha: number,
  tint = '78,74,66',
): void {
  const grad = g.createLinearGradient(0, y0, 0, y0 + len);
  grad.addColorStop(0, `rgba(${tint},${alpha})`);
  grad.addColorStop(0.4, `rgba(${tint},${alpha * 0.62})`);
  grad.addColorStop(1, `rgba(${tint},0)`);
  // Le tracé est tiré une fois et rejoué aux trois abscisses : deux appels de
  // rng distincts auraient donné trois coulures différentes au même endroit.
  const pts: [number, number][] = [[x, y0]];
  let cx = x;
  for (let t = 0.16; t <= 1.001; t += 0.16) {
    cx += (r() - 0.5) * width * 1.5;
    pts.push([cx, y0 + len * t]);
  }
  wrapX(g, w, () => {
    g.strokeStyle = grad;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
    g.stroke();
  });
}

/** Fissure capillaire : un trait d'un pixel qui hésite. */
function fissure(
  g: CanvasRenderingContext2D,
  r: () => number,
  w: number,
  x: number,
  y: number,
  len: number,
  alpha: number,
): void {
  const pts: [number, number][] = [[x, y]];
  let px = x;
  let py = y;
  let ang = Math.PI / 2 + (r() - 0.5) * 1.5;
  const steps = 7 + Math.floor(r() * 7);
  for (let i = 0; i < steps; i++) {
    ang += (r() - 0.5) * 0.85;
    px += Math.cos(ang) * (len / steps);
    py += Math.sin(ang) * (len / steps);
    pts.push([px, py]);
  }
  wrapX(g, w, () => {
    g.strokeStyle = `rgba(92,88,82,${alpha})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [qx, qy] of pts.slice(1)) g.lineTo(qx, qy);
    g.stroke();
  });
}

/** Trou de banche rebouché : le point qui dit « ce mur a été coffré ». */
function tieHole(g: CanvasRenderingContext2D, w: number, x: number, y: number): void {
  wrapX(g, w, () => {
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.arc(x, y, 6.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(124,120,112,0.45)';
    g.beginPath();
    g.arc(x, y, 4.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(78,74,68,0.4)';
    g.beginPath();
    g.arc(x, y + 0.7, 2.6, 0, Math.PI * 2);
    g.fill();
  });
}

// ---------------------------------------------------------------------------
// Mur de fond : béton banché
// ---------------------------------------------------------------------------

/** Largeur d'une tuile de mur, en mètres : la trame d'une banche. */
export const WALL_MODULE = 2.4;

const WALL_W = 512;
const WALL_H = 768;

function drawConcreteWall(seed: number): HTMLCanvasElement {
  const { c, g } = makeCanvas(WALL_W, WALL_H);
  const r = rng(seed);
  const W = WALL_W;
  const H = WALL_H;

  g.fillStyle = '#f0eee9';
  g.fillRect(0, 0, W, H);
  mottle(g, r, W, H, 46, 0.1);

  // Reprises de bétonnage : les deux lits horizontaux d'une banche, un filet
  // creux souligné d'un filet clair. C'est la seule ligne franche du mur.
  for (const t of [0.34, 0.68]) {
    const y = Math.round(H * t);
    g.fillStyle = 'rgba(92,88,82,0.44)';
    g.fillRect(0, y, W, 3);
    g.fillStyle = 'rgba(255,255,255,0.38)';
    g.fillRect(0, y + 3, W, 2);
  }

  // Joint vertical de banche, à cheval sur le bord de la tuile : c'est lui qui
  // donne le pas de 2,40 m qu'on lit sur toute la longueur du quai. Il est
  // FRANC - c'est la seule chose de ce mur qui en donne l'échelle, et au premier
  // essai, dessiné à trente pour cent, il ne se voyait plus à trois mètres.
  wrapX(g, W, () => {
    g.fillStyle = 'rgba(94,90,84,0.5)';
    g.fillRect(-2.5, 0, 5, H);
    g.fillStyle = 'rgba(74,70,64,0.3)';
    g.fillRect(-1, 0, 2, H);
    g.fillStyle = 'rgba(255,255,255,0.42)';
    g.fillRect(2.5, 0, 2, H);
  });

  // Trous de banche : deux par lit, plus deux au tiers de la hauteur.
  const holeRows = [0.34, 0.68, 0.15, 0.5].map((t) => Math.round(H * t));
  for (const y of holeRows) {
    for (const f of [0.28, 0.72]) tieHole(g, W, W * f, y);
  }

  // Coulures : sous chaque lit et sous chaque trou, là où l'eau s'arrête et
  // repart. Elles ne sont jamais ailleurs sur un vrai mur.
  for (const y of [Math.round(H * 0.34), Math.round(H * 0.68)]) {
    for (let i = 0; i < 7; i++) {
      coulure(g, r, W, r() * W, y + 2, 60 + r() * 210, 3 + r() * 7, 0.05 + r() * 0.07);
    }
  }
  for (const y of holeRows) {
    for (const f of [0.28, 0.72]) {
      coulure(g, r, W, W * f, y + 5, 40 + r() * 120, 4 + r() * 4, 0.05 + r() * 0.05);
    }
  }
  // Deux coulures de rouille : un scellement qui a pleuré. Presque rien en
  // surface, et c'est pourtant la seule tache colorée de tout le mur.
  for (let i = 0; i < 2; i++) {
    const y = holeRows[i];
    coulure(g, r, W, W * (i === 0 ? 0.28 : 0.72), y + 4, 90 + r() * 140, 4, 0.24, '150,92,44');
  }

  // Fissures capillaires : rares, courtes, et jamais deux au même endroit.
  for (let i = 0; i < 9; i++) {
    fissure(g, r, W, r() * W, r() * H * 0.9, 40 + r() * 130, 0.16 + r() * 0.16);
  }

  // Reprise d'enduit : le rectangle qui n'a pas tout à fait la même teinte que
  // le reste. C'est le défaut le plus banal d'un mur de gare - et il se dose
  // À LA BAISSE, parce qu'il revient à chaque tuile. Franc, il ne se lisait
  // plus comme une reprise : les deux rectangles réapparaissaient tous les
  // 2,40 m sur deux cent vingt mètres, et le mur prenait l'air d'un bardage.
  for (let i = 0; i < 2; i++) {
    const px = r() * W;
    const py = H * (0.2 + r() * 0.55);
    const pw = 70 + r() * 120;
    const ph = 60 + r() * 110;
    wrapX(g, W, () => {
      g.fillStyle = i === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(118,116,110,0.045)';
      g.fillRect(px, py, pw, ph);
      g.strokeStyle = 'rgba(104,100,94,0.07)';
      g.lineWidth = 1.5;
      g.strokeRect(px, py, pw, ph);
    });
  }

  grain(g, r, W, H, 9000, 0.055);

  // Pied de mur : la crasse monte d'une trentaine de centimètres, en frange
  // irrégulière. Un dégradé net aurait fait une plinthe peinte.
  const foot = g.createLinearGradient(0, H, 0, H * 0.86);
  foot.addColorStop(0, 'rgba(46,44,40,0.4)');
  foot.addColorStop(0.45, 'rgba(52,50,46,0.15)');
  foot.addColorStop(1, 'rgba(52,50,46,0)');
  g.fillStyle = foot;
  g.fillRect(0, H * 0.86, W, H * 0.14);
  for (let i = 0; i < 40; i++) {
    blot(g, W, r() * W, H - r() * 26, 14 + r() * 44, '46,44,40', 0.06 + r() * 0.1);
  }
  // Éclats du nu bas : le mur a pris des coups de chariot.
  for (let i = 0; i < 6; i++) {
    const x = r() * W;
    const y = H - 10 - r() * 60;
    const rx = 3 + r() * 6;
    const ry = 2 + r() * 4;
    const rot = r() * Math.PI;
    g.fillStyle = 'rgba(86,82,76,0.3)';
    wrapX(g, W, () => {
      g.beginPath();
      g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      g.fill();
    });
  }

  // Haut de mur : l'ombre et la suie de la sous-face d'auvent.
  const top = g.createLinearGradient(0, 0, 0, H * 0.12);
  top.addColorStop(0, 'rgba(48,48,50,0.22)');
  top.addColorStop(1, 'rgba(48,48,50,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, H * 0.12);

  return c;
}

// ---------------------------------------------------------------------------
// Hall souterrain : enduit peint
// ---------------------------------------------------------------------------

/** Largeur d'une tuile de paroi de hall, en mètres : la trame des panneaux. */
export const HALL_MODULE = 1.8;

const HALL_W = 512;
const HALL_H = 640;

function drawPaintedWall(seed: number): HTMLCanvasElement {
  const { c, g } = makeCanvas(HALL_W, HALL_H);
  const r = rng(seed);
  const W = HALL_W;
  const H = HALL_H;

  g.fillStyle = '#f4f2ee';
  g.fillRect(0, 0, W, H);
  mottle(g, r, W, H, 30, 0.075);

  // Joint creux entre panneaux, à cheval sur le bord, et ses trois vis.
  wrapX(g, W, () => {
    g.fillStyle = 'rgba(100,98,92,0.42)';
    g.fillRect(-2, 0, 4, H);
    g.fillStyle = 'rgba(255,255,255,0.38)';
    g.fillRect(2, 0, 1.5, H);
    for (const t of [0.18, 0.55, 0.88]) {
      g.fillStyle = 'rgba(88,86,82,0.45)';
      g.beginPath();
      g.arc(0, H * t, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  });

  // Fantômes d'affiches : le rectangle moins jauni que le reste, ses quatre
  // coins de scotch, et les trous des punaises. Un couloir de gare en est
  // couvert - c'est ce qui dit que le mur sert à quelque chose.
  for (let i = 0; i < 3; i++) {
    const pw = 90 + r() * 90;
    const ph = 120 + r() * 110;
    const px = r() * W;
    const py = H * (0.15 + r() * 0.4);
    wrapX(g, W, () => {
      // Le rectangle est plus CLAIR : l'affiche a protégé l'enduit du jour et
      // de la poussière pendant que tout autour jaunissait.
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fillRect(px, py, pw, ph);
      g.strokeStyle = 'rgba(128,122,110,0.16)';
      g.lineWidth = 1;
      g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      g.fillStyle = 'rgba(140,132,114,0.26)';
      for (const [cx, cy] of [
        [px, py],
        [px + pw - 15, py],
        [px, py + ph - 7],
        [px + pw - 15, py + ph - 7],
      ]) {
        g.fillRect(cx, cy, 15, 7);
      }
    });
  }

  // Traces de roulettes et de semelles : des arcs noirs, bas sur la paroi et
  // jamais plus haut que la hanche.
  //
  // Elles ne descendent PAS jusqu'au sol, et ce n'est pas une approximation :
  // un couloir de gare a un soubassement de faïence d'un mètre quinze, et il
  // couvre exactement la bande où l'on aurait spontanément mis ces traces.
  // Dessinées là, elles étaient parfaitement invisibles - il faut les poser
  // JUSTE AU-DESSUS du carrelage, là où la valise cogne l'enduit.
  for (let i = 0; i < 22; i++) {
    const x = r() * W;
    const y = H * (0.5 + r() * 0.22);
    const rad = 12 + r() * 46;
    const a0 = r() * Math.PI * 2;
    const a1 = a0 + 0.5 + r() * 0.9;
    g.strokeStyle = `rgba(52,50,50,${0.08 + r() * 0.14})`;
    g.lineWidth = 1.5 + r() * 3;
    wrapX(g, W, () => {
      g.beginPath();
      g.arc(x, y, rad, a0, a1);
      g.stroke();
    });
  }

  // Percements rebouchés : une signalétique déposée laisse toujours ses trous.
  for (let i = 0; i < 7; i++) {
    const x = r() * W;
    const y = H * (0.2 + r() * 0.5);
    wrapX(g, W, () => {
      g.fillStyle = 'rgba(120,116,110,0.3)';
      g.beginPath();
      g.arc(x, y, 2.4, 0, Math.PI * 2);
      g.fill();
    });
  }

  for (let i = 0; i < 5; i++) {
    coulure(g, r, W, r() * W, H * (0.05 + r() * 0.2), 90 + r() * 200, 4 + r() * 6, 0.045 + r() * 0.05);
  }
  for (let i = 0; i < 5; i++) {
    fissure(g, r, W, r() * W, r() * H * 0.85, 30 + r() * 90, 0.13 + r() * 0.12);
  }

  grain(g, r, W, H, 7000, 0.05);

  // Plinthe sale et haut empoussiéré : les deux bandes qu'on ne lave jamais.
  const foot = g.createLinearGradient(0, H, 0, H * 0.88);
  foot.addColorStop(0, 'rgba(44,42,40,0.34)');
  foot.addColorStop(1, 'rgba(44,42,40,0)');
  g.fillStyle = foot;
  g.fillRect(0, H * 0.88, W, H * 0.12);
  const top = g.createLinearGradient(0, 0, 0, H * 0.1);
  top.addColorStop(0, 'rgba(58,56,52,0.16)');
  top.addColorStop(1, 'rgba(58,56,52,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, H * 0.1);

  return c;
}

// ---------------------------------------------------------------------------
// Soubassement : faïence
// ---------------------------------------------------------------------------

/** Côté d'une tuile de faïence, en mètres. */
export const DADO_MODULE = 1.0;
/** Carreaux par tuile : des carreaux de 12,5 cm, le format courant. */
const DADO_CELLS = 8;

const DADO_S = 512;

function drawDadoTiles(seed: number): HTMLCanvasElement {
  const { c, g } = makeCanvas(DADO_S, DADO_S);
  const r = rng(seed);
  const S = DADO_S;
  const cell = S / DADO_CELLS;

  // Le fond EST le joint : les carreaux se posent dessus, en retrait d'un
  // millimètre et demi de chaque côté. Il est franchement plus sombre que
  // l'émail - sinon la trame disparaît à deux mètres et le soubassement
  // redevient le bandeau de couleur qu'il était avant d'être carrelé.
  g.fillStyle = '#b9b1a1';
  g.fillRect(0, 0, S, S);

  const inset = 2.2;
  for (let iy = 0; iy < DADO_CELLS; iy++) {
    for (let ix = 0; ix < DADO_CELLS; ix++) {
      const x = ix * cell + inset;
      const y = iy * cell + inset;
      const s = cell - inset * 2;
      // Chaque carreau a sa cuisson : c'est la variation d'un émail, pas du
      // bruit. Un aplat unique de faïence ne ressemble à rien.
      const v = 236 + Math.floor(r() * 20);
      g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      g.fillRect(x, y, s, s);
      // Chanfrein : clair en haut à gauche, sombre en bas à droite. C'est lui
      // qui donne le relief - sans lui, une grille de carrés.
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x, y, s, 2);
      g.fillRect(x, y, 2, s);
      g.fillStyle = 'rgba(104,98,88,0.34)';
      g.fillRect(x, y + s - 2, s, 2);
      g.fillRect(x + s - 2, y, 2, s);
      // Reflet oblique de l'émail : la faïence est le seul brillant du décor.
      const sheen = g.createLinearGradient(x, y, x + s, y + s);
      sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
      sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.fillStyle = sheen;
      g.fillRect(x, y, s, s);

      // Un carreau sur douze est plus terne, un sur trente est fêlé, et il en
      // manque un éclat de loin en loin. Sans ces trois-là, la faïence est un
      // motif imprimé.
      if (r() < 0.085) {
        g.fillStyle = `rgba(126,120,110,${0.1 + r() * 0.14})`;
        g.fillRect(x, y, s, s);
      }
      if (r() < 0.035) {
        g.strokeStyle = 'rgba(104,98,90,0.4)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + r() * s, y);
        g.lineTo(x + r() * s, y + s);
        g.stroke();
      }
      if (r() < 0.03) {
        g.fillStyle = 'rgba(120,114,104,0.42)';
        g.beginPath();
        g.arc(x + (r() < 0.5 ? 0 : s), y + (r() < 0.5 ? 0 : s), 2 + r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // Crasse dans les joints : elle s'accumule en bas, et par plaques ailleurs.
  for (let i = 0; i < 26; i++) {
    const ix = Math.floor(r() * DADO_CELLS);
    const iy = Math.floor(r() * DADO_CELLS);
    g.fillStyle = `rgba(78,72,64,${0.06 + r() * 0.12})`;
    g.fillRect(ix * cell - 1, iy * cell - 1, cell + 2, 3);
    g.fillRect(ix * cell - 1, iy * cell - 1, 3, cell + 2);
  }
  grain(g, r, S, S, 3000, 0.035);

  return c;
}

// ---------------------------------------------------------------------------
// Plafond de hall : dalles minérales
// ---------------------------------------------------------------------------

/** Côté d'une tuile de plafond, en mètres : deux dalles de 60. */
export const CEILING_MODULE = 1.2;

const CEIL_S = 512;

function drawCeilingPanels(seed: number): HTMLCanvasElement {
  const { c, g } = makeCanvas(CEIL_S, CEIL_S);
  const r = rng(seed);
  const S = CEIL_S;
  const half = S / 2;

  g.fillStyle = '#eceae6';
  g.fillRect(0, 0, S, S);

  // Ossature apparente : les tés qui portent les dalles, en croix au milieu et
  // à cheval sur les bords. C'est le seul motif franc d'un plafond de hall.
  g.fillStyle = 'rgba(146,144,138,0.42)';
  for (const p of [0, half, S]) {
    g.fillRect(p - 3, 0, 6, S);
    g.fillRect(0, p - 3, S, 6);
  }
  g.fillStyle = 'rgba(255,255,255,0.4)';
  for (const p of [0, half]) {
    g.fillRect(p + 3, 0, 1.5, S);
    g.fillRect(0, p + 3, S, 1.5);
  }

  // Perforation acoustique : le semis fin des dalles minérales.
  for (let i = 0; i < 5200; i++) {
    const x = r() * S;
    const y = r() * S;
    if (Math.min(x % half, half - (x % half)) < 8) continue;
    if (Math.min(y % half, half - (y % half)) < 8) continue;
    g.fillStyle = `rgba(150,148,142,${0.14 + r() * 0.2})`;
    g.fillRect(x, y, 1.4, 1.4);
  }

  // Auréoles de fuite : une dalle sur huit a pris l'eau une fois. C'est le
  // défaut de plafond qu'on reconnaît sans y penser.
  for (let i = 0; i < 3; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 26 + r() * 54;
    const stain = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    stain.addColorStop(0, 'rgba(154,132,96,0.16)');
    stain.addColorStop(0.7, 'rgba(154,132,96,0.09)');
    stain.addColorStop(1, 'rgba(154,132,96,0)');
    g.fillStyle = stain;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.6 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // Une dalle déposée et remise de travers : elle est plus sombre au bord.
  g.strokeStyle = 'rgba(126,122,116,0.3)';
  g.lineWidth = 2;
  g.strokeRect(half + 6, 6, half - 12, half - 12);

  mottle(g, r, S, S, 12, 0.03);
  grain(g, r, S, S, 3600, 0.03);

  return c;
}

// ---------------------------------------------------------------------------

export type StationWallTextures = {
  wall: THREE.CanvasTexture;
  wallRough: THREE.CanvasTexture;
  hall: THREE.CanvasTexture;
  hallRough: THREE.CanvasTexture;
  dado: THREE.CanvasTexture;
  dadoRough: THREE.CanvasTexture;
  ceiling: THREE.CanvasTexture;
  ceilingRough: THREE.CanvasTexture;
};

let cache: StationWallTextures | null = null;

/**
 * Les quatre surfaces, construites à la première demande et gardées ensuite.
 *
 * Elles ne dépendent pas de la gare : un mur de Nippori n'a pas d'autres
 * défauts qu'un mur d'Ōtsuka, seulement une autre teinte - et la teinte, c'est
 * la palette qui la donne. Les redessiner à chaque changement de gare aurait
 * coûté quatre canevas et quatre passes de rugosité pour un résultat identique.
 */
export function stationWallTextures(): StationWallTextures {
  if (cache) return cache;
  const wall = drawConcreteWall(9137);
  const hall = drawPaintedWall(4451);
  const dado = drawDadoTiles(2803);
  const ceiling = drawCeilingPanels(6619);
  cache = {
    wall: toTexture(wall, false),
    // Le béton reste mat de bout en bout : la crasse le rend seulement PLUS
    // mat. Ouvrir davantage la fourchette lui donnait des reflets de plastique.
    wallRough: deriveRoughness(wall, 0.8, 1),
    hall: toTexture(hall, false),
    hallRough: deriveRoughness(hall, 0.72, 0.98),
    dado: toTexture(dado, true),
    // La faïence, elle, est franchement brillante - et son joint ne l'est pas.
    // C'est ce contraste-là qui la fait lire comme du carrelage.
    dadoRough: deriveRoughness(dado, 0.24, 0.72),
    ceiling: toTexture(ceiling, true),
    ceilingRough: deriveRoughness(ceiling, 0.82, 1),
  };
  return cache;
}
