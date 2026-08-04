// La barre du HUD ne doit pas bouger quand on la touche.
//
// Née d'un défaut rapporté depuis un téléphone : « le HUD, sur mobile, quand je
// clique dessus, il change d'emplacement ». C'était exact, et mesurable - un
// appui sur « Son » déplaçait trois commandes voisines d'un coup.
//
// La mécanique : sur un écran étroit, `.hud-bottom` passe à la ligne et se
// CENTRE (trois rangées sur un 412 px). Il suffit donc qu'un bouton change de
// largeur pour que toute sa rangée se recentre. Or « Son activé » fait dix
// caractères et « Son coupé » neuf : le curseur de volume, juste à côté,
// glissait sous le doigt au moment précis où l'on allait le saisir. Le compteur
// du salon, qui apparaît dans son bouton à l'entrée dans une rame, faisait la
// même chose au menu d'incidents voisin.
//
// Le remède est `.hud-swap` : les deux libellés cohabitent dans une cellule de
// grille, l'inactif masqué par `visibility` - donc toujours encombrant. Le
// bouton fait la largeur du plus long des deux, quelle que soit la langue.
//
// --- Pourquoi une garde de source plutôt qu'un test de rendu ----------------
//
// Parce que le défaut n'est PAS dans une valeur qu'on pourrait lire : il est
// dans le fait qu'un jour, quelqu'un - moi le premier - réécrira
// `{muted ? off : on}` en une ligne parce que c'est plus court à lire, et rien
// ne s'en apercevra. Le dépôt tient déjà ses invariants d'architecture par
// lecture du source (`tests/netSourceGuards.test.ts`, `tests/audioVersion.test.ts`) ;
// celui-ci est de la même famille. Le comportement, lui, a été mesuré au
// navigateur dans les trois langues : trois commandes déplacées avant, zéro
// après.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(resolvePath(ROOT, rel), 'utf8');
}

test('le bouton du son porte ses DEUX libellés, pas seulement celui du moment', () => {
  const hud = read('src/ui/Hud.tsx');
  const bloc = hud.slice(hud.indexOf('onClick={toggleMute}'));
  const fin = bloc.indexOf('</button>');
  const bouton = bloc.slice(0, fin);
  assert.ok(bouton.includes('hud-swap'), 'le bouton du son doit réserver sa largeur');
  assert.ok(
    bouton.includes('t.hud.soundOn') && bouton.includes('t.hud.soundOff'),
    'les deux libellés doivent être rendus, sinon la largeur change à la bascule',
  );
});

test('le bouton assis/debout aussi', () => {
  // Il n'apparaît qu'au clavier - au doigt, c'est le gros bouton du coin - mais
  // une fenêtre étroite au clavier passe par la même mise en page.
  const hud = read('src/ui/Hud.tsx');
  const bloc = hud.slice(hud.indexOf('input.sitRequest = true'));
  const bouton = bloc.slice(0, bloc.indexOf('</button>'));
  assert.ok(bouton.includes('hud-swap'));
  assert.ok(bouton.includes('t.hud.stand') && bouton.includes('t.hud.sit'));
});

test('le compteur du salon a sa place réservée même quand on voyage seul', () => {
  const menu = read('src/ui/RoomMenu.tsx');
  const bloc = menu.slice(menu.indexOf('room-dot'));
  const bouton = bloc.slice(0, bloc.indexOf('</button>'));
  assert.ok(bouton.includes('hud-swap'), 'sans réservation, entrer dans une rame décale la barre');
  assert.ok(
    bouton.includes('ROOM_CAPACITY'),
    'le gabarit doit être le chiffre le plus large possible, pas une valeur en dur',
  );
});

test('`.hud-swap` masque par visibility, et surtout pas par display', () => {
  // C'est TOUTE l'astuce, et elle tient à un mot : `display: none` retirerait
  // l'élément du flux, la largeur redeviendrait variable, et le défaut
  // reviendrait à l'identique sans que rien ne le signale.
  const css = read('src/styles.css');
  const regle = css.slice(css.indexOf('.hud-swap-ghost'));
  const corps = regle.slice(0, regle.indexOf('}'));
  assert.ok(corps.includes('visibility: hidden'), 'le fantôme doit rester encombrant');
  assert.ok(!corps.includes('display: none'), 'display: none rendrait la réservation inutile');

  // Et les deux libellés doivent bien se superposer, sinon le bouton fait la
  // somme des deux largeurs au lieu de la plus grande.
  const pile = css.slice(css.indexOf('.hud-swap > *'));
  assert.ok(pile.slice(0, pile.indexOf('}')).includes('grid-area: 1 / 1'));
});
