// Contrôles tactiles : joystick virtuel à gauche pour marcher, bouton
// s'asseoir à droite. Le regard se fait en glissant sur la scène elle-même.

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { input } from '../systems/input';
import { useTalkTarget } from './useTalkTarget';
import { promptText, useDevicePrompt } from './useDevicePrompt';
import { prompt } from '../systems/interaction';

const RADIUS = 52;

export function Controls() {
  const started = useStore((s) => s.started);
  const touch = useStore((s) => s.touch);
  const seated = useStore((s) => s.seated);
  const setTouch = useStore((s) => s.setTouch);
  const t = useT();
  const talkNear = useTalkTarget();
  const device = useDevicePrompt();
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    const detect = () => setTouch(true);
    window.addEventListener('touchstart', detect, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', detect);
  }, [setTouch]);

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;

    const setKnob = (dx: number, dy: number) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const onDown = (e: PointerEvent) => {
      pointerId.current = e.pointerId;
      base.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      input.joy.x = dx / RADIUS;
      input.joy.y = -dy / RADIUS;
      setKnob(dx, dy);
    };
    const onUp = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      pointerId.current = null;
      input.joy.x = 0;
      input.joy.y = 0;
      setKnob(0, 0);
    };

    base.addEventListener('pointerdown', onDown);
    base.addEventListener('pointermove', onMove);
    base.addEventListener('pointerup', onUp);
    base.addEventListener('pointercancel', onUp);
    return () => {
      base.removeEventListener('pointerdown', onDown);
      base.removeEventListener('pointermove', onMove);
      base.removeEventListener('pointerup', onUp);
      base.removeEventListener('pointercancel', onUp);
    };
  }, [started, touch]);

  if (!started || !touch) return null;

  return (
    <>
      <div className="joystick" ref={baseRef}>
        <div className="joystick-knob" ref={knobRef} />
      </div>
      {/* Un appareil en face passe devant le bouton « parler » : la touche est
          unique côté clavier (systems/interaction), le bouton l'est aussi. Le
          libellé n'a pas de préfixe de touche - il n'y en a pas au doigt. */}
      {device && device !== 'emptyHands' && device !== 'soldOut' && (
        <button
          className="touch-act"
          onClick={() => {
            input.talkRequest = true;
          }}
        >
          {promptText(device, t.devices.prompt, prompt.name, prompt.amount).replace(/^E\s*—\s*/, '')}
        </button>
      )}
      {!device && talkNear && (
        <button
          className="touch-talk"
          onClick={() => {
            input.talkRequest = true;
          }}
        >
          {t.hud.talkShort}
        </button>
      )}
      <button
        className="touch-sit"
        onClick={() => {
          input.sitRequest = true;
        }}
      >
        {seated ? t.hud.stand : t.hud.sit}
      </button>
    </>
  );
}
