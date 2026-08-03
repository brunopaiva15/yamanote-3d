// Le bandeau lumineux de porte, sous l'afficheur.
//
// Sur l'E235, au-dessus de chaque baie, court une réglette de diodes orange qui
// s'allume quand les vantaux vont bouger et clignote pendant qu'ils bougent
// (three/DoorCloseLed). C'est le seul indicateur du wagon qui parle de la
// PORTE, et c'est exactement ce qui manque à une version qu'on écoute : on
// entend le carillon, on entend l'air comprimé, mais on ne voit pas les trois
// secondes de coulissement.
//
// Les trois couleurs sont celles de la réglette réelle - éteinte, veilleuse,
// allumée -, et l'avancement de la barre est l'ouverture réelle des vantaux,
// telle que `systems/doorMotion` la calcule.

import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import { runtime } from '../../systems/runtime';

/** Période de sondage (ms) : assez fin pour voir coulisser, assez rare pour l'écran. */
const SAMPLE_MS = 120;

interface DoorSample {
  open: number;
  target: number;
}

function useDoors(): DoorSample {
  const [s, setS] = useState<DoorSample>({ open: 0, target: 0 });
  useEffect(() => {
    const tick = () =>
      setS((prev) =>
        // Ne re-rendre que si la valeur a bougé d'un demi pour cent : portes
        // closes, la barre est immobile pendant deux minutes et n'a aucune
        // raison de faire travailler React quatre cents fois.
        Math.abs(prev.open - runtime.doorOpen) < 0.005 && prev.target === runtime.doorTarget
          ? prev
          : { open: runtime.doorOpen, target: runtime.doorTarget },
      );
    tick();
    const id = window.setInterval(tick, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, []);
  return s;
}

export function DoorState() {
  const t = useT();
  const { open, target } = useDoors();
  const doorSide = useStore((s) => s.doorSide);

  const moving = open > 0.01 && open < 0.99;
  const word = !moving
    ? open >= 0.99
      ? t.audio.doors.open
      : t.audio.doors.closed
    : target > open
      ? t.audio.doors.opening
      : t.audio.doors.closing;

  return (
    <div className={`lcd-doors${moving ? ' is-moving' : ''}${open >= 0.99 ? ' is-open' : ''}`}>
      <span className="lcd-doors-label">{t.audio.doorsLabel}</span>
      {/* Le côté d'ouverture, dit comme la rame le dit : une flèche vers la
          paroi concernée. C'est la première chose qu'on cherche en arrivant. */}
      <span className="lcd-doors-side" aria-hidden="true">
        {doorSide === 1 ? '▶' : '◀'}
      </span>
      <span
        className="lcd-doors-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(open * 100)}
        aria-label={`${t.audio.doorsLabel} : ${word}`}
      >
        <span className="lcd-doors-fill" style={{ width: `${Math.round(open * 100)}%` }} />
      </span>
      <span className="lcd-doors-word">{word}</span>
    </div>
  );
}
