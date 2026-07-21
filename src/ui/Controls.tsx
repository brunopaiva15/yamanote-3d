// Contrôles tactiles : joystick virtuel à gauche pour marcher, bouton
// s'asseoir à droite. Le regard se fait en glissant sur la scène elle-même.

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { input } from '../systems/input';

const RADIUS = 52;

export function Controls() {
  const started = useStore((s) => s.started);
  const touch = useStore((s) => s.touch);
  const seated = useStore((s) => s.seated);
  const setTouch = useStore((s) => s.setTouch);
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
      <button
        className="touch-sit"
        onClick={() => {
          input.sitRequest = true;
        }}
      >
        {seated ? 'Se lever' : "S'asseoir"}
      </button>
    </>
  );
}
