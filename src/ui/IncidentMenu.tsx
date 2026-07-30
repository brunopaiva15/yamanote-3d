// Le bouton qui provoque un arrêt en pleine voie.
//
// Les deux événements arrivent d'eux-mêmes - c'est même tout leur intérêt qu'ils
// tombent sans prévenir -, mais ils sont RARES : dix à vingt-quatre gares pour
// le coup de frein, trente-quatre à soixante-dix pour la coupure de courant,
// soit jusqu'à trois heures de trajet. Une session ordinaire peut n'en croiser
// aucun. Ce menu n'invente donc rien et ne double aucune mécanique : il appelle
// exactement les mêmes fonctions que le tirage automatique (`stationCycle`), il
// avance simplement l'échéance.
//
// D'où la discrétion voulue : une icône seule, en bout de barre, plus effacée
// que les réglages voisins tant qu'on ne la survole pas. Ce n'est pas un
// réglage, c'est une provocation - on ne tombe pas dessus en cherchant le
// volume.

import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { beginEmergencyStop, beginPowerOutage } from '../systems/stationCycle';
import { canForcePassengerAssistance, forcePassengerAssistance } from '../systems/passengerAssistance';

/**
 * Ce que le menu a le droit de déclencher, à cet instant.
 *
 * Les deux mêmes conditions que `beginEmergencyStop` / `beginPowerOutage` :
 * la rame doit rouler en pleine voie, et rien ne doit être déjà en cours. On
 * les recopie ici pour pouvoir DIRE pourquoi c'est grisé - un bouton mort sans
 * explication est pire qu'un bouton absent.
 */
type Availability = 'ready' | 'notCruising' | 'running';

function availability(phase: string): Availability {
  const stage = runtime.emergencyStop.stage;
  if (stage === 'coasting' || stage === 'braking' || stage === 'stopped') return 'running';
  // Sur le quai, la phase du store reste 'dwell' : la même condition couvre
  // donc aussi le joueur descendu de la rame, pour qui le cycle station ne
  // tourne plus du tout (voir three/Engine).
  if (phase !== 'cruise') return 'notCruising';
  return 'ready';
}

export function IncidentMenu({ className = '' }: { className?: string }) {
  const t = useT();
  const phase = useStore((s) => s.phase);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Availability>('notCruising');
  const root = useRef<HTMLDivElement>(null);

  // L'état vit dans runtime, pas dans le store : on le sonde comme l'horloge du
  // HUD, et seulement panneau ouvert - il n'y a personne pour le lire sinon.
  useEffect(() => {
    if (!open) return;
    const tick = () => setState(availability(useStore.getState().phase));
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [open, phase]);

  // Un clic ailleurs referme, comme n'importe quel menu ; Échap aussi, qui est
  // déjà le geste pour rendre la souris au navigateur.
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

  const ready = state === 'ready';
  const assistanceReady = canForcePassengerAssistance();
  const reason = state === 'running' ? t.incidents.alreadyRunning : t.incidents.onlyOnTheRun;

  function fire(begin: () => void) {
    begin();
    setOpen(false);
  }

  return (
    <div className={`incident-menu ${className}`.trim()} ref={root}>
      <button
        className="hud-button incident-toggle"
        onClick={() => setOpen((v) => !v)}
        title={t.incidents.label}
        aria-label={t.incidents.label}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span aria-hidden="true">⚠</span>
      </button>

      {open && (
        <div className="incident-panel" role="menu">
          <div className="incident-title">{t.incidents.title}</div>
          {ready ? null : <div className="incident-reason">{reason}</div>}
          <button
            className="incident-choice"
            role="menuitem"
            disabled={!ready}
            onClick={() => fire(beginEmergencyStop)}
          >
            <span className="incident-choice-name">{t.incidents.brake.name}</span>
            <span className="incident-choice-note">{t.incidents.brake.note}</span>
          </button>
          <button
            className="incident-choice"
            role="menuitem"
            disabled={!ready}
            onClick={() => fire(beginPowerOutage)}
          >
            <span className="incident-choice-name">{t.incidents.outage.name}</span>
            <span className="incident-choice-note">{t.incidents.outage.note}</span>
          </button>
          <button
            className="incident-choice"
            role="menuitem"
            disabled={!assistanceReady}
            title={assistanceReady ? t.incidents.assistance.note : t.incidents.assistance.unavailable}
            onClick={() => fire(() => { forcePassengerAssistance(); })}
          >
            <span className="incident-choice-name">{t.incidents.assistance.name}</span>
            <span className="incident-choice-note">
              {assistanceReady ? t.incidents.assistance.note : t.incidents.assistance.unavailable}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
