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

// --- Et la remise en page qui ne venait pas des libellés --------------------
//
// Les gardes ci-dessus règlent le cas d'un bouton qui change de largeur. Il en
// restait un autre, bien plus grossier, et c'est celui que deux captures d'un
// vrai téléphone ont montré : la barre ne se recentrait pas, elle changeait
// carrément de CONTENU.
//
// `touch` démarrait à `false` et ne passait à `true` qu'au premier
// `touchstart`. Or « S'asseoir » n'est dans la barre QU'AU CLAVIER - au doigt,
// c'est le gros bouton du pouce, avec le joystick. Le tout premier appui du
// joueur, y compris sur un bouton du HUD, retirait donc une commande de la
// barre et en faisait apparaître deux ailleurs : les rangées se recomposaient,
// et le bouton qu'on visait n'était plus là où on l'avait vu.
//
// La question se pose maintenant AVANT le premier contact.

test('le mode tactile est décidé avant le premier contact, pas à son occasion', () => {
  const store = read('src/store.ts');
  assert.ok(
    /touch:\s*coarsePointer\(\)/.test(store),
    'un `touch: false` en dur ramène la remise en page au premier appui',
  );
});

test('la détection paresseuse reste, mais seulement en rattrapage', () => {
  // Elle a encore un rôle : le portable à écran tactile, dont le pointeur
  // principal est le trackpad, démarre à juste titre au clavier et ne doit
  // basculer que s'il touche vraiment l'écran. La retirer le priverait des
  // contrôles tactiles pour toujours.
  const controls = read('src/ui/Controls.tsx');
  assert.ok(controls.includes("addEventListener('touchstart'"));
});

test('la détection interroge le pointeur PRINCIPAL, pas la présence d’un écran tactile', () => {
  // `navigator.maxTouchPoints` vaut aussi pour le portable à écran tactile :
  // s'en servir l'enverrait au joystick sans qu'il ait rien demandé.
  const browser = read('src/systems/browser.ts');
  const bloc = browser.slice(browser.indexOf('export function coarsePointer'));
  const corps = bloc.slice(0, bloc.indexOf('\n}'));
  assert.ok(corps.includes('(pointer: coarse)'));
  assert.ok(!corps.includes('maxTouchPoints'));
  // Et hors navigateur - les tests tournent sous node - elle doit répondre
  // sans lever : le store l'appelle à son ouverture, donc à l'import.
  assert.ok(corps.includes("typeof window === 'undefined'"));
});

test('les deux pastilles discrètes ne se quittent pas quand la barre passe à la ligne', () => {
  // Séparées, elles se plaçaient au pire endroit : celle du salon glissée à
  // l'extrême droite de la rangée précédente - sous la main du voisin de siège -
  // et celle des incidents seule au milieu d'une rangée pour elle toute seule.
  // Groupées, elles partagent la dernière rangée. Mesuré à 360, 390 et 412 px :
  // même rangée, six pixels d'écart, rien qui déborde.
  const hud = read('src/ui/Hud.tsx');
  const groupe = hud.slice(hud.indexOf('hud-discreet'));
  const fin = groupe.indexOf('</div>');
  assert.ok(fin > 0, 'le groupe doit être un vrai conteneur, pas une classe posée à côté');
  const corps = groupe.slice(0, fin);
  assert.ok(corps.includes('<RoomMenu />') && corps.includes('<IncidentMenu />'));
});

test('le groupe garde l’espacement de la barre, il n’en invente pas un autre', () => {
  // `gap: inherit` suit la barre y compris là où elle se resserre sur un écran
  // étroit : rien ne trahit qu'il y a un groupe. Une valeur en dur ferait
  // respirer ces deux boutons-là différemment de tous les autres.
  const css = read('src/styles.css');
  const regle = css.slice(css.indexOf('.hud-discreet {'));
  assert.ok(regle.slice(0, regle.indexOf('}')).includes('gap: inherit'));
});
