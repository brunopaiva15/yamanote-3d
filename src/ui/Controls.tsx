// Contrôles tactiles : joystick virtuel à gauche pour marcher, bouton
// s'asseoir à droite. Le regard se fait en glissant sur la scène elle-même.

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { input, joyAxes, JOY_RADIUS } from '../systems/input';
import { useTalkTarget } from './useTalkTarget';
import { promptText, useDevicePrompt } from './useDevicePrompt';
import { prompt } from '../systems/interaction';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
  /** Point d'appui du geste en cours (coordonnées écran) et décalage du manche. */
  const origin = useRef({ x: 0, y: 0, kx: 0, ky: 0 });

  // Le RATTRAPAGE, et plus la détection principale.
  //
  // Un téléphone est reconnu dès la première image par `coarsePointer()`, qui
  // pose `touch` à l'ouverture du store : c'est ce qui empêche la barre du HUD
  // de se remettre en page sous le doigt au premier appui. Il reste le cas du
  // portable à écran tactile, dont le pointeur principal est le trackpad : il
  // démarre au clavier, à juste titre, et ne bascule que s'il touche vraiment
  // l'écran. C'est pour lui, et pour lui seul, que cet écouteur existe encore.
  useEffect(() => {
    const detect = () => setTouch(true);
    window.addEventListener('touchstart', detect, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', detect);
  }, [setTouch]);

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;

    // Le manche ne sort jamais de son disque, même quand un bord d'écran a
    // retenu celui-ci sous le pouce.
    const setKnob = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy);
      const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };

    // Le manche part de LÀ OÙ LE POUCE SE POSE, pas du centre du cercle.
    //
    // C'est tout le défaut du montage précédent : l'axe se mesurait depuis le
    // centre fixe du disque, si bien qu'un pouce posé sur le bord droit du
    // cercle valait déjà « à droite, presque à fond » sans que rien n'ait
    // bougé - et glisser vers la gauche ne faisait que revenir vers le centre,
    // jamais passer à gauche. Sur une tablette tenue à l'horizontale le défaut
    // est permanent : le disque est ancré dans le coin bas gauche, très loin
    // du pouce qui tient l'appareil, et celui-ci n'atteint jamais que le bord
    // INTÉRIEUR du cercle - toujours le même, toujours à droite. Le joueur
    // partait donc à droite dès qu'il touchait le joystick.
    //
    // En repère relatif, le geste vaut zéro à l'appui quel que soit l'endroit
    // touché, et une même amplitude vaut autant à gauche qu'à droite. Le
    // cercle vient en plus se poser sous le pouce le temps du geste, pour que
    // ce qu'on voit dise ce que le jeu lit.
    const onDown = (e: PointerEvent) => {
      // Un second doigt (l'autre main qui tient la tablette, la paume qui
      // effleure) ne vole pas le geste en cours.
      if (pointerId.current !== null) return;
      pointerId.current = e.pointerId;
      base.setPointerCapture(e.pointerId);

      base.style.transform = '';
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Le disque suit le pouce, sans jamais sortir de l'écran.
      const m = 6;
      const tx = clamp(e.clientX - cx, m - rect.left, window.innerWidth - m - rect.right);
      const ty = clamp(e.clientY - cy, m - rect.top, window.innerHeight - m - rect.bottom);
      base.style.transform = `translate(${tx}px, ${ty}px)`;

      origin.current = {
        x: e.clientX,
        y: e.clientY,
        // Reste du chemin quand le bord de l'écran a retenu le disque : c'est
        // ce qui garde le manche exactement sous le doigt.
        kx: e.clientX - (cx + tx),
        ky: e.clientY - (cy + ty),
      };
      input.joy.x = 0;
      input.joy.y = 0;
      setKnob(origin.current.kx, origin.current.ky);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      const a = joyAxes(e.clientX - origin.current.x, e.clientY - origin.current.y);
      input.joy.x = a.x;
      input.joy.y = a.y;
      setKnob(origin.current.kx + a.dx, origin.current.ky + a.dy);
    };
    const onUp = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      pointerId.current = null;
      input.joy.x = 0;
      input.joy.y = 0;
      setKnob(0, 0);
      base.style.transform = '';
    };

    base.addEventListener('pointerdown', onDown);
    base.addEventListener('pointermove', onMove);
    base.addEventListener('pointerup', onUp);
    base.addEventListener('pointercancel', onUp);
    // La capture reprise par le navigateur (geste système, doigt sorti de la
    // page) ne donne ni `pointerup` ni `pointercancel` partout : sans ce
    // dernier filet, l'axe restait figé sur sa dernière valeur et le joueur
    // marchait tout seul, sans fin.
    base.addEventListener('lostpointercapture', onUp);
    return () => {
      base.removeEventListener('pointerdown', onDown);
      base.removeEventListener('pointermove', onMove);
      base.removeEventListener('pointerup', onUp);
      base.removeEventListener('pointercancel', onUp);
      base.removeEventListener('lostpointercapture', onUp);
      pointerId.current = null;
      input.joy.x = 0;
      input.joy.y = 0;
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
