// Voyager ensemble : une ligne au pied du menu, et rien de plus.
//
// Le multijoueur de ce jeu n'est pas son argument. C'est une promenade
// contemplative où l'on regarde la ville défiler ; pouvoir y emmener quelqu'un
// est un plaisir de plus, pas la raison d'être. L'entrée reste donc au même
// poids typographique que le compteur de voyageurs juste au-dessus : un lien
// sobre, replié par défaut, sans icône, sans majuscules, sans bandeau.
//
// Et quand le réseau n'est pas configuré, la ligne n'existe PAS. Pas grisée,
// pas accompagnée d'un « bientôt disponible » : absente. C'est le contrat que
// `systems/presence` tient depuis toujours pour son compteur - sans clés, aucune
// trace à l'écran d'une fonctionnalité qui n'existe pas.

import { useEffect, useState } from 'react';
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

export function RoomJoin() {
  const t = useT();
  const status = useRoom((s) => s.status);
  const error = useRoom((s) => s.error);
  const code = useRoom((s) => s.code);
  const roster = useRoom((s) => s.roster);
  const hostId = useRoom((s) => s.hostId);
  const selfId = useRoom((s) => s.selfId);

  // Le bloc s'ouvre de lui-même quand on arrive par un lien de salon : celui
  // qui clique sur « rejoins-moi » ne doit pas avoir à chercher où l'on saisit
  // un code, il doit le trouver déjà rempli.
  const [open, setOpen] = useState(() => roomFromUrl() !== null);
  const [codeInput, setCodeInput] = useState(() => roomFromUrl() ?? '');
  const [name, setName] = useState(storedName);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  // Sans configuration, la fonctionnalité n'existe pas.
  if (!netEnabled) return null;

  const busy = status === 'joining';

  const remember = (value: string) => {
    setName(value);
    storeName(value);
  };

  const doCreate = async () => {
    await createRoom(name);
  };

  const doJoin = async () => {
    await joinRoom(codeInput, name);
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

  // --- Dans un salon : le code, et qui est là ------------------------------
  if (status === 'joined' && code) {
    return (
      <div className="start-room start-room-joined">
        <p className="start-room-code">
          <span className="start-room-code-label">{t.room.codeLabel}</span>
          <strong>{code}</strong>
          <button type="button" className="start-room-link" onClick={() => void doCopy()}>
            {copied ? t.room.copied : t.room.copy}
          </button>
        </p>
        <p className="start-room-roster">
          {roster.length + 1} {t.room.travellers}
          {roster.length > 0 && (
            <span className="start-room-names">
              {' · '}
              {roster.map((p) => (
                <span key={p.id}>
                  {p.name || '—'}
                  {p.id === hostId && ` (${t.room.host})`}
                  {!p.attached && ` (${t.room.ashore})`}
                </span>
              ))}
            </span>
          )}
          {hostId === selfId && <span className="start-room-names">{` · ${t.room.host}`}</span>}
        </p>
        <button type="button" className="start-room-link" onClick={() => leaveRoom()}>
          {t.room.leave}
        </button>
      </div>
    );
  }

  // --- Replié : une ligne ---------------------------------------------------
  if (!open) {
    return (
      <p className="start-room">
        <button type="button" className="start-room-link" onClick={() => setOpen(true)}>
          {t.room.together}
        </button>
      </p>
    );
  }

  // --- Déplié : deux champs, deux boutons ----------------------------------
  return (
    <div className="start-room start-room-open">
      <div className="start-room-row">
        <label className="start-room-field">
          <span>{t.room.nameLabel}</span>
          <input
            type="text"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            placeholder={t.room.namePlaceholder}
            onChange={(e) => remember(e.target.value)}
          />
        </label>
        <label className="start-room-field">
          <span>{t.room.codeLabel}</span>
          <input
            type="text"
            value={codeInput}
            maxLength={ROOM_CODE_LENGTH + 2}
            placeholder={t.room.codePlaceholder}
            // Le code s'affiche en majuscules pendant la frappe : le joueur voit
            // tout de suite la forme attendue, et `normalizeRoomCode` n'a plus
            // qu'à confirmer.
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase());
              // Corriger son code efface le reproche : laisser « ce code ne
              // ressemble à rien » sous un champ qu'on vient de rectifier fait
              // croire que la nouvelle saisie est refusée elle aussi.
              clearRoomError();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doJoin();
            }}
          />
        </label>
      </div>
      <div className="start-room-row">
        <button
          type="button"
          className="start-room-link"
          disabled={busy || codeInput.trim().length === 0}
          onClick={() => void doJoin()}
        >
          {busy ? t.room.joining : t.room.join}
        </button>
        <span className="start-room-sep" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="start-room-link"
          disabled={busy}
          onClick={() => void doCreate()}
        >
          {t.room.create}
        </button>
        <span className="start-room-sep" aria-hidden="true">
          ·
        </span>
        <button type="button" className="start-room-link" onClick={() => setOpen(false)}>
          {t.room.close}
        </button>
      </div>
      {errorText && <p className="start-room-error">{errorText}</p>}
      <p className="start-room-hint">{t.room.hint}</p>
    </div>
  );
}
