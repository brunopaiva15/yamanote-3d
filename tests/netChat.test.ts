// Le journal du tchat : ce qu'il garde, ce qu'il refuse, ce qu'il dédoublonne.
//
// Le nettoyage et le débit sont déjà éprouvés à part (tests/netChatLimiter) ;
// ce fichier-ci vérifie le JOURNAL, et surtout deux choses qui ne se voient
// qu'à plusieurs :
//
//  · un message retransmis ne doit pas apparaître deux fois. Supabase ne
//    garantit pas l'unicité, et une reconnexion peut parfaitement ramener une
//    phrase déjà lue ;
//  · le prénom affiché vient du ROSTER, pas du message. Sans ça, un pair
//    pourrait s'annoncer sous le nom d'un autre à chaque phrase - ce qui,
//    dans un salon privé entre amis, serait surtout une blague pénible.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { bubbleFor, chatOpen, resetChat, sendChat, setChatOpen, startChat, useChat } =
  await import('../src/systems/net/chat.ts');
const { deliverRoomMessage, useRoom } = await import('../src/systems/net/room.ts');
const { clearPeers, syncRoster } = await import('../src/systems/net/peers.ts');
const { PROTOCOL_VERSION } = await import('../src/systems/net/protocol.ts');

/**
 * On simule un salon en posant l'état du store directement.
 *
 * Ouvrir un vrai canal demanderait un serveur Supabase ; ce qu'on éprouve ici
 * est le TRAITEMENT des messages, qui n'en a pas besoin. `roomSend` sort dans
 * le vide - aucun canal n'est ouvert - et c'est très bien : l'affichage local
 * d'un envoi ne dépend pas du réseau, et c'est même la propriété qu'on veut.
 */
function salon(): void {
  useRoom.setState({
    status: 'joined',
    error: null,
    code: 'ABC234',
    selfId: 'moi',
    selfName: 'Aya',
    selfAvatar: 1,
    roster: [],
    hostId: 'moi',
  });
}

function neuf(): void {
  resetChat();
  clearPeers();
  salon();
  startChat();
}

/**
 * Injecte un message comme s'il arrivait du canal.
 *
 * Par `deliverRoomMessage`, c'est-à-dire par le chemin EXACT que prend un vrai
 * message : une réception éprouvée par un chemin parallèle n'éprouverait que le
 * chemin parallèle.
 */
function recu(from: string, id: number, text: string): void {
  deliverRoomMessage('chat', { v: PROTOCOL_VERSION, from, id, text, t: Date.now() });
}

test('un message envoyé apparaît tout de suite, sans attendre le réseau', () => {
  neuf();
  assert.equal(sendChat('Bonjour'), true);
  const messages = useChat.getState().messages;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'Bonjour');
  assert.equal(messages[0].self, true);
  assert.equal(messages[0].name, 'Aya');
});

test('un message vide, ou vide une fois nettoyé, ne part pas', () => {
  neuf();
  assert.equal(sendChat(''), false);
  assert.equal(sendChat('    '), false);
  assert.equal(sendChat('\n\t'), false);
  assert.equal(useChat.getState().messages.length, 0);
});

test('hors salon, rien ne part', () => {
  neuf();
  useRoom.setState({ status: 'idle' });
  assert.equal(sendChat('coucou'), false);
  assert.equal(useChat.getState().messages.length, 0);
});

test('la rafale est bornée, et le refus se signale à l’interface', () => {
  neuf();
  // Trois répliques coup sur coup passent ; la quatrième dans la même seconde
  // est une machine, pas une conversation.
  assert.equal(sendChat('un'), true);
  assert.equal(sendChat('deux'), true);
  assert.equal(sendChat('trois'), true);
  assert.equal(sendChat('quatre'), false);
  assert.equal(useChat.getState().throttled, true);
  assert.equal(useChat.getState().messages.length, 3);
});

test('le journal ne dépasse pas cinquante lignes', () => {
  neuf();
  // Soixante émetteurs DIFFÉRENTS, et non soixante messages d'un seul : le seau
  // à jetons est par pair, et une rafale d'un même bavard serait jetée bien
  // avant d'atteindre le plafond du journal. C'est d'ailleurs ce que ce test a
  // commencé par démontrer, à mes dépens.
  for (let i = 0; i < 60; i++) recu(`pair-${i}`, 1, `message ${i}`);
  const messages = useChat.getState().messages;
  assert.equal(messages.length, 50);
  // Ce sont les plus RÉCENTS qu'on garde.
  assert.equal(messages[messages.length - 1].text, 'message 59');
});

test('un bavard n’entame que son propre droit de parole', () => {
  // La rafale d'un pair est jetée à la réception, mais elle ne doit pas faire
  // taire les autres : la victime d'un onglet déraillé serait alors le salon.
  neuf();
  for (let i = 0; i < 30; i++) recu('bavard', i, `spam ${i}`);
  const avant = useChat.getState().messages.length;
  recu('discret', 1, 'coucou');
  const apres = useChat.getState().messages;
  assert.equal(apres.length, avant + 1);
  assert.equal(apres[apres.length - 1].text, 'coucou');
});

test('une retransmission n’apparaît pas deux fois', () => {
  neuf();
  recu('toi', 7, 'une seule fois');
  recu('toi', 7, 'une seule fois');
  assert.equal(useChat.getState().messages.length, 1);
});

test('le prénom vient du roster, pas du message', () => {
  neuf();
  syncRoster(
    [{ id: 'toi', name: 'Kenji', avatar: 2, mode: 'full', attached: true, joinedAt: 1 }],
    'moi',
    0,
  );
  recu('toi', 1, 'salut');
  assert.equal(useChat.getState().messages[0].name, 'Kenji');
});

test('un message d’un inconnu passe, mais sans prénom emprunté', () => {
  neuf();
  recu('inconnu', 1, 'salut');
  const m = useChat.getState().messages[0];
  assert.equal(m.text, 'salut');
  assert.equal(m.name, '');
});

test('un message reçu est nettoyé lui aussi', () => {
  // Le nettoyage à l'envoi protège nos camarades de nos bogues ; celui-ci nous
  // protège d'un onglet resté ouvert sur une version d'avant.
  neuf();
  recu('toi', 1, 'ligne\nune\nligne');
  assert.equal(useChat.getState().messages[0].text, 'ligne une ligne');
});

test('un message mal formé est ignoré sans exploser', () => {
  neuf();
  deliverRoomMessage('chat', { v: PROTOCOL_VERSION, from: 'toi' });
  deliverRoomMessage('chat', null);
  deliverRoomMessage('chat', { v: 999, from: 'toi', id: 1, text: 'coucou', t: 0 });
  assert.equal(useChat.getState().messages.length, 0);
});

test('un autre événement du canal ne touche pas au tchat', () => {
  neuf();
  deliverRoomMessage('tick', { v: PROTOCOL_VERSION, from: 'toi' });
  assert.equal(useChat.getState().messages.length, 0);
});

// --- La bulle au-dessus des têtes ------------------------------------------

test('la bulle montre la dernière phrase de son auteur, puis s’efface', () => {
  neuf();
  const t0 = Date.now();
  recu('toi', 1, 'coucou');
  assert.equal(bubbleFor('toi', t0), 'coucou');
  // Cinq secondes de base, quarante millisecondes par caractère : « coucou »
  // fait six caractères, donc 5,24 s.
  assert.equal(bubbleFor('toi', t0 + 5_000), 'coucou');
  assert.equal(bubbleFor('toi', t0 + 6_000), null);
});

test('une phrase longue reste plus longtemps, mais pas indéfiniment', () => {
  neuf();
  const t0 = Date.now();
  recu('toi', 1, 'a'.repeat(140));
  // Plafond à neuf secondes : une bulle qui resterait quinze secondes gêne la
  // vue bien plus qu'elle ne se fait lire.
  assert.equal(bubbleFor('toi', t0 + 8_500), 'a'.repeat(140));
  assert.equal(bubbleFor('toi', t0 + 9_500), null);
});

test('la bulle de quelqu’un qui n’a rien dit est vide', () => {
  neuf();
  recu('toi', 1, 'coucou');
  assert.equal(bubbleFor('autre', Date.now()), null);
});

// --- Le compositeur ---------------------------------------------------------

test('l’état d’ouverture est lisible hors de React', () => {
  // `three/Player` le consulte soixante fois par seconde pour savoir s'il doit
  // jeter le mouvement de souris : passer par un abonnement zustand à cette
  // cadence serait absurde.
  neuf();
  assert.equal(chatOpen(), false);
  setChatOpen(true);
  assert.equal(chatOpen(), true);
  assert.equal(useChat.getState().open, true);
  setChatOpen(false);
  assert.equal(chatOpen(), false);
});

test('quitter le salon vide le journal et referme le champ', () => {
  neuf();
  sendChat('coucou');
  setChatOpen(true);
  resetChat();
  assert.equal(useChat.getState().messages.length, 0);
  assert.equal(chatOpen(), false);
});
