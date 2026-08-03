// Le tchat du salon : trois dernières lignes en bas à gauche, et un champ.
//
// --- Où il se pose, et pourquoi là -----------------------------------------
//
// Au-DESSUS du bandeau de sous-titres, jamais dessous. Les sous-titres sont la
// voix du monde - les annonces, les carillons, la sono du quai -, et ce jeu est
// bâti autour d'elles. Un tchat qui leur passerait devant contredirait tout le
// reste. On lit donc `--subtitles-h`, la hauteur RÉELLE que le bandeau occupe à
// cet instant (ui/usePublishedHeight) : elle dépend de la langue et du nombre de
// lignes qu'une annonce japonaise prend, et un nombre écrit en dur serait faux
// dans deux langues sur trois.
//
// --- Les trois gardes d'entrée ---------------------------------------------
//
// Ouvrir un champ de saisie par-dessus un jeu en vue subjective demande trois
// précautions, et deux d'entre elles ne se voient qu'à l'usage :
//
//  1. le CLAVIER n'atteint pas le jeu : déjà acquis, `isTypingTarget`
//     (systems/browser) est consulté par three/Player ;
//  2. le VERROU DE POINTEUR doit être relâché, sinon la souris continue de
//     tourner la caméra pendant qu'on écrit - et le regard accumulé se déverse
//     d'un coup à la fermeture, ce qui donne une embardée ;
//  3. les TOUCHES ENFONCÉES doivent être purgées : ouvrir le tchat en courant
//     laisse `KeyW` et `ShiftLeft` dans `input.keys`, et le joueur traverse le
//     wagon pendant qu'il tape.

import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { input } from '../systems/input';
import { resetChat, sendChat, setChatOpen, startChat, useChat } from '../systems/net/chat';
import { useRoom } from '../systems/net/room';
import { CHAT_MAX_LENGTH } from '../systems/net/protocol';

/** Au-delà, une ligne du journal s'estompe. */
const FADE_AFTER_MS = 12_000;
/** Lignes visibles quand le champ est fermé. */
const CLOSED_LINES = 3;

export function Chat() {
  const t = useT();
  const inRoom = useRoom((s) => s.status === 'joined');
  const messages = useChat((s) => s.messages);
  const open = useChat((s) => s.open);
  const throttled = useChat((s) => s.throttled);
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLInputElement>(null);
  // Le journal s'estompe avec le temps : il faut donc redessiner de temps en
  // temps, mais pas à 60 fps - une fois par seconde suffit à faire pâlir du
  // texte, et c'est mille re-rendus de moins par minute.
  const [, tick] = useState(0);

  useEffect(() => {
    if (!inRoom) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1_000);
    return () => window.clearInterval(id);
  }, [inRoom]);

  // L'abonnement au canal se fait ICI et non dans `net/room`, et c'est une
  // question de sens de dépendance : `net/chat` a besoin de `net/room` pour
  // émettre, et si `net/room` avait besoin de `net/chat` pour brancher
  // l'écoute, les deux modules s'importeraient l'un l'autre. L'interface, elle,
  // connaît légitimement les deux.
  useEffect(() => {
    if (!inRoom) return;
    startChat();
    return () => resetChat();
  }, [inRoom]);

  // Entrée ouvre, Échap ferme. Le raccourci vit au niveau `window` et teste
  // lui-même `isTypingTarget` : sans ça, appuyer sur Entrée dans le champ de
  // date du menu rouvrirait le tchat.
  useEffect(() => {
    if (!inRoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setChatOpen(false);
        return;
      }
      if (e.key !== 'Enter' || open) return;
      const cible = e.target as HTMLElement | null;
      const tag = cible?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || cible?.isContentEditable) return;
      e.preventDefault();
      setChatOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inRoom, open]);

  // Les gardes 2 et 3, à l'ouverture.
  useEffect(() => {
    if (!open) return;
    try {
      document.exitPointerLock();
    } catch {
      /* pas de verrou à relâcher : tant mieux */
    }
    // On marche encore : ces touches-là ne se relèveront jamais, puisque le
    // `keyup` partira dans le champ de saisie.
    input.keys.clear();
    input.joy.x = 0;
    input.joy.y = 0;
    input.talkRequest = false;
    field.current?.focus();
  }, [open]);

  if (!inRoom) return null;

  const envoyer = () => {
    if (sendChat(draft)) setDraft('');
  };

  const maintenant = Date.now();
  const visibles = open ? messages.slice(-8) : messages.slice(-CLOSED_LINES);

  return (
    <div className={`chat${open ? ' chat-open' : ''}`}>
      {visibles.length > 0 && (
        <ul className="chat-log" aria-live="polite">
          {visibles.map((m) => (
            <li
              key={m.key}
              className={`chat-line${m.self ? ' chat-self' : ''}${
                !open && maintenant - m.at > FADE_AFTER_MS ? ' chat-faded' : ''
              }`}
            >
              {m.name && <span className="chat-name">{m.name}</span>}
              <span className="chat-text">{m.text}</span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="chat-composer">
          <input
            ref={field}
            type="text"
            value={draft}
            maxLength={CHAT_MAX_LENGTH}
            placeholder={t.room.chatPlaceholder}
            aria-label={t.room.chatPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Le clavier appartient au champ : on empêche la touche de
              // remonter jusqu'au raccourci global, qui la rouvrirait aussitôt.
              e.stopPropagation();
              if (e.key === 'Enter') envoyer();
              if (e.key === 'Escape') setChatOpen(false);
            }}
            onBlur={() => setChatOpen(false)}
          />
          <button
            type="button"
            className="chat-send"
            disabled={throttled || draft.trim().length === 0}
            // `onMouseDown` et non `onClick` : le `blur` du champ referme le
            // compositeur avant qu'un `click` n'ait le temps de se produire.
            onMouseDown={(e) => {
              e.preventDefault();
              envoyer();
            }}
          >
            {t.room.send}
          </button>
        </div>
      )}
    </div>
  );
}
