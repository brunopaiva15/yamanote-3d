// Le joystick tactile part du POINT D'APPUI, pas du centre du disque.
//
// Né d'un défaut rapporté depuis une tablette tenue à l'horizontale : « le
// joystick veut toujours aller à droite ». C'était exact, et la géométrie
// suffit à l'expliquer.
//
// Le disque fait 128 px et il est ancré dans le coin bas gauche de l'écran
// (styles.css, `.joystick`). Sur un téléphone, le pouce tombe dessus. Sur une
// tablette à l'horizontale, la main tient l'appareil par le bord et le pouce
// n'atteint que le bord INTÉRIEUR du cercle - le bord droit, toujours le même.
// Or l'axe se mesurait depuis le centre : un appui à 45 px du centre valait
// déjà +0,87 sur l'axe droite/gauche AVANT le moindre mouvement, et glisser
// vers la gauche ne faisait que revenir vers le centre. Le joueur partait à
// droite dès qu'il posait le doigt, quoi qu'il fasse ensuite.
//
// Mesuré au navigateur, fenêtre de 1180 x 820 en pointeur grossier : le disque
// tombe à x = 26, y = 666, 128 px de côté - centre à 90 px du bord gauche. Un
// appui sur son bord droit (x = 146) est à +56 px du centre, soit l'axe à fond
// à droite dans l'ancien repère, avant tout mouvement ; et glisser 40 px vers
// la gauche laissait encore +16, donc toujours « à droite ». Depuis, le même
// appui rend zéro et les mêmes 40 px rendent -0,77.
//
// En repère relatif, l'appui vaut zéro où qu'il tombe. Les mesures ci-dessous
// portent sur `joyAxes` (src/systems/input.ts) : c'est là que vit la
// géométrie, `ui/Controls` ne fait plus que lui passer l'écart au point
// d'appui et placer le manche.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOY_DEAD, JOY_RADIUS, joyAxes } from '../src/systems/input.ts';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

test('poser le doigt ne demande aucune direction, où qu’il tombe', () => {
  // Le cas rapporté : le pouce se pose sur le bord droit du cercle. L'écart au
  // point d'appui est nul par construction - c'est TOUT le correctif.
  const a = joyAxes(0, 0);
  assert.equal(a.x, 0);
  assert.equal(a.y, 0);
});

test('une même amplitude vaut autant à gauche qu’à droite', () => {
  // L'ancien repère absolu n'avait pas cette symétrie : depuis un appui décalé
  // à droite, les 30 px vers la gauche restaient une demande vers la DROITE.
  const droite = joyAxes(30, 0);
  const gauche = joyAxes(-30, 0);
  assert.ok(droite.x > 0 && gauche.x < 0, 'les deux sens doivent exister');
  assert.equal(droite.x, -gauche.x);
  assert.equal(droite.x, 30 / JOY_RADIUS);
});

test('l’avant du jeu est le HAUT de l’écran', () => {
  // L'écran compte ses y vers le bas ; la marche compte son avant vers le haut.
  assert.ok(joyAxes(0, -30).y > 0, 'glisser vers le haut, c’est avancer');
  assert.ok(joyAxes(0, 30).y < 0, 'glisser vers le bas, c’est reculer');
});

test('la course est bornée : jamais plus que « à fond »', () => {
  // `moveAxes()` additionne clavier et joystick puis borne à 1 ; un joystick
  // qui rendrait déjà plus de 1 mangerait silencieusement l'appoint clavier.
  const loin = joyAxes(400, -400);
  assert.ok(Math.hypot(loin.x, loin.y) <= 1 + 1e-9);
  assert.ok(Math.abs(Math.hypot(loin.x, loin.y) - 1) < 1e-9, 'plein axe au-delà de la course');
  assert.ok(Math.hypot(loin.dx, loin.dy) <= JOY_RADIUS + 1e-9, 'le manche reste dans son disque');
});

test('une zone morte tient le personnage immobile sous un pouce posé', () => {
  const dormant = joyAxes(JOY_DEAD - 1, 0);
  assert.equal(dormant.x, 0);
  assert.equal(dormant.y, 0);
  assert.ok(joyAxes(JOY_DEAD + 1, 0).x > 0, 'au-delà, le geste compte');
});

// --- Gardes de source -------------------------------------------------------
//
// La géométrie ci-dessus ne vaut que si `ui/Controls` lui donne bien l'écart au
// POINT D'APPUI. Repasser à l'écart au centre du disque ramènerait le défaut à
// l'identique, et aucune des mesures précédentes ne s'en apercevrait.

function read(rel: string): string {
  return readFileSync(resolvePath(ROOT, rel), 'utf8');
}

test('Controls mesure l’écart au point d’appui, et non au centre du disque', () => {
  const controls = read('src/ui/Controls.tsx');
  const bloc = controls.slice(controls.indexOf('const onMove'));
  const corps = bloc.slice(0, bloc.indexOf('\n    };'));
  assert.ok(corps.includes('origin.current.x'), 'le geste doit partir du point d’appui');
  assert.ok(
    !/rect|getBoundingClientRect/.test(corps),
    'reprendre le centre du disque en cours de geste ramène la dérive',
  );
});

test('un second doigt ne vole pas le geste en cours', () => {
  // L'autre main tient la tablette, et sa paume effleure le coin de l'écran :
  // sans cette garde, le geste changeait de pointeur, le doigt qui pilotait
  // n'était plus écouté, et l'axe restait figé sur sa dernière valeur.
  const controls = read('src/ui/Controls.tsx');
  const bloc = controls.slice(controls.indexOf('const onDown'));
  const corps = bloc.slice(0, bloc.indexOf('\n    };'));
  assert.ok(/pointerId\.current !== null\)\s*return/.test(corps));
});

test('toute fin de geste remet les axes à zéro, capture volée comprise', () => {
  // Un `pointerup` manquant - geste système, doigt sorti de la page - laissait
  // le joueur marcher tout seul, sans fin.
  const controls = read('src/ui/Controls.tsx');
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    assert.ok(controls.includes(`addEventListener('${ev}', onUp)`), `${ev} doit relâcher l’axe`);
  }
});
