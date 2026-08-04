// Voyager ensemble, depuis la rame et non depuis le menu.
//
// --- Pourquoi ici et pas au menu --------------------------------------------
//
// L'entrée vivait d'abord au pied de l'écran d'accueil. C'était déjà discret,
// et ce n'était pas la bonne place : le menu est ce qu'on voit AVANT de jouer,
// et tout ce qui s'y trouve se présente comme une option du voyage - la date,
// la gare, le sens, la version. Y ajouter les salons en faisait une décision à
// prendre avant de monter, alors que c'en est une qu'on prend en cours de
// route, quand on a envie d'appeler quelqu'un.
//
// Et techniquement, rejoindre en marche est le chemin le MIEUX rodé : c'est
// exactement celui d'un retardataire (`hello`, l'hôte répond, resynchronisation
// dure par `applyWorldSnapshot`). Rejoindre depuis le menu passait, lui, par un
// monde déjà tiré au sort qu'il fallait ensuite remplacer.
//
// --- Discret veut dire discret ----------------------------------------------
//
// Un point, en bout de barre, effacé tant qu'on ne le survole pas : exactement
// le traitement du menu d'incidents voisin, et pour la même raison - ce n'est
// pas un réglage, on ne doit pas tomber dessus en cherchant le volume. Quand on
// est en salon, le point s'allume et porte le nombre de voyageurs, ce qui est
// la seule information qui mérite d'être vue en permanence.
//
// Sans configuration réseau, le bouton n'existe pas du tout.

import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { netEnabled } from '../systems/net/config';
import {
  NAME_MAX_LENGTH,
  clearRoomError,
  createRoom,
  joinRoom,
  leaveRoom,
  roomFromUrl,
  useRoom,
} from '../systems/net/room';
import { ROOM_CAPACITY } from '../systems/net/protocol';
import { ROOM_CODE_LENGTH } from '../systems/net/roomCode';

/** Le prénom se retient d'une session à l'autre : on ne le retape pas. */
const NAME_KEY = 'yamanote-room-name';

function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* stockage refusé (navigation privée) : le prénom vaut pour cette fois */
  }
}

export function RoomMenu({ className = '' }: { className?: string }) {
  const t = useT();
  const status = useRoom((s) => s.status);
  const error = useRoom((s) => s.error);
  const code = useRoom((s) => s.code);
  const roster = useRoom((s) => s.roster);
  const hostId = useRoom((s) => s.hostId);
  const selfId = useRoom((s) => s.selfId);

  const [open, setOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [name, setName] = useState(storedName);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const urlTentee = useRef(false);

  // Arrivé par un lien de salon : on rejoint TOUT SEUL, une fois en jeu.
  //
  // Cliquer sur « rejoins-moi » puis devoir chercher où l'on saisit un code
  // serait absurde - le code est déjà dans l'adresse. En revanche, si ça
  // échoue, le panneau s'ouvre : un lien qui ne marche pas et ne dit rien est
  // pire qu'un lien qui explique pourquoi.
  useEffect(() => {
    if (!netEnabled || urlTentee.current) return;
    const depuisUrl = roomFromUrl();
    if (!depuisUrl) return;
    urlTentee.current = true;
    setCodeInput(depuisUrl);
    void joinRoom(depuisUrl, storedName()).then((ok) => {
      if (!ok) setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  // Un clic ailleurs referme, Échap aussi : le même geste que pour tout autre
  // panneau du HUD, et déjà celui qui rend la souris au navigateur.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!netEnabled) return null;

  const dedans = status === 'joined' && code !== null;
  const busy = status === 'joining';
  const total = roster.length + 1;

  const remember = (value: string) => {
    setName(value);
    storeName(value);
  };

  const doCopy = async () => {
    if (!code) return;
    try {
      const url = new URL(location.href);
      url.searchParams.set('room', code);
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
    } catch {
      // Presse-papiers refusé : le code reste lisible à l'écran, et c'est
      // largement suffisant pour le dicter.
    }
  };

  const errorText =
    error === 'code'
      ? t.room.errorCode
      : error === 'full'
        ? t.room.errorFull
        : error === 'network'
          ? t.room.errorNetwork
          : null;

  return (
    <div className={`room-menu ${className}`.trim()} ref={root}>
      <button
        className={`hud-button room-toggle${dedans ? ' is-joined' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={t.room.together}
        aria-label={t.room.together}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="room-dot" aria-hidden="true" />
        {/* La place du compteur est RÉSERVÉE en permanence, même seul.
            Sinon le bouton s'élargissait à l'entrée dans une rame, la rangée
            du HUD se recentrait, et le menu d'incidents voisin sautait de
            quelques pixels au moment où l'on venait de rejoindre - un
            mouvement qu'on ne s'explique pas, puisqu'on regardait ailleurs.
            Le chiffre le plus large possible sert de gabarit. */}
        <span className="hud-swap">
          {dedans && <span className="room-count">{total}</span>}
          <span className="hud-swap-ghost" aria-hidden="true">
            <span className="room-count">{ROOM_CAPACITY}</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="room-panel" role="menu">
          <div className="room-panel-title">{t.room.together}</div>

          {dedans ? (
            <>
              <p className="room-panel-code">
                <strong>{code}</strong>
                <button type="button" className="room-panel-link" onClick={() => void doCopy()}>
                  {copied ? t.room.copied : t.room.copy}
                </button>
              </p>
              <p className="room-panel-roster">
                {total} {t.room.travellers}
                {hostId === selfId && ` · ${t.room.host}`}
              </p>
              {roster.length > 0 && (
                <ul className="room-panel-list">
                  {roster.map((p) => (
                    <li key={p.id}>
                      {p.name || '—'}
                      {p.id === hostId && <span className="room-panel-tag">{t.room.host}</span>}
                      {!p.attached && <span className="room-panel-tag">{t.room.ashore}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="room-panel-link"
                onClick={() => {
                  leaveRoom();
                  setOpen(false);
                }}
              >
                {t.room.leave}
              </button>
            </>
          ) : (
            <>
              <label className="room-panel-field">
                <span>{t.room.nameLabel}</span>
                <input
                  type="text"
                  value={name}
                  maxLength={NAME_MAX_LENGTH}
                  placeholder={t.room.namePlaceholder}
                  onChange={(e) => remember(e.target.value)}
                />
              </label>
              <label className="room-panel-field">
                <span>{t.room.codeLabel}</span>
                <input
                  type="text"
                  className="room-panel-code-input"
                  value={codeInput}
                  maxLength={ROOM_CODE_LENGTH + 2}
                  placeholder={t.room.codePlaceholder}
                  onChange={(e) => {
                    setCodeInput(e.target.value.toUpperCase());
                    // Corriger son code efface le reproche : le laisser sous un
                    // champ qu'on vient de rectifier ferait croire que la
                    // nouvelle saisie est refusée elle aussi.
                    clearRoomError();
                  }}
                  onKeyDown={(e) => {
                    // Le clavier appartient au champ : sans ça, Entrée ouvrirait
                    // le tchat par-dessus, et M couperait le son en tapant un
                    // code.
                    e.stopPropagation();
                    if (e.key === 'Enter') void joinRoom(codeInput, name);
                  }}
                />
              </label>
              <div className="room-panel-actions">
                <button
                  type="button"
                  className="room-panel-link"
                  disabled={busy || codeInput.trim().length === 0}
                  onClick={() => void joinRoom(codeInput, name)}
                >
                  {busy ? t.room.joining : t.room.join}
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className="room-panel-link"
                  disabled={busy}
                  onClick={() => void createRoom(name)}
                >
                  {t.room.create}
                </button>
              </div>
              {errorText && <p className="room-panel-error">{errorText}</p>}
              <p className="room-panel-hint">{t.room.hint}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
