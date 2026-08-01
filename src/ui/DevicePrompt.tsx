// L'invite : ce que la touche ferait, ici, maintenant.
//
// C'est la SEULE chose que l'interface ajoute au monde, et elle existait déjà -
// « Appuyez sur E pour parler » sous le réticule. La raison est la même : dans
// la vraie vie on tend la main, et une main ne se dessine pas au milieu de
// l'écran. Tout le reste - le crédit inséré, le solde d'une carte, le tarif
// prélevé, le motif d'un refus - est écrit SUR l'appareil, à l'endroit exact où
// une vraie machine l'écrit, et se lit en la regardant.
//
// L'invite nomme ce qu'on vise (le nom de l'article, son prix) parce que c'est
// ce que le doigt fait : on le pose sur un bouton précis, pas sur « la
// machine ». Rien n'y est écrit que la plaquette du couloir ne porte déjà.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { prompt } from '../systems/interaction';
import { promptText, useDevicePrompt } from './useDevicePrompt';

/** Le nom et le montant courants, sondés avec l'invite. */
function useDetails(): { name: string; amount: number } {
  const [d, setD] = useState({ name: '', amount: 0 });
  useEffect(() => {
    const id = window.setInterval(() => {
      setD((prev) =>
        prev.name === prompt.name && prev.amount === prompt.amount
          ? prev
          : { name: prompt.name, amount: prompt.amount },
      );
    }, 120);
    return () => window.clearInterval(id);
  }, []);
  return d;
}

export function DevicePrompt() {
  const started = useStore((s) => s.started);
  const touch = useStore((s) => s.touch);
  const t = useT();
  const key = useDevicePrompt();
  const details = useDetails();
  if (!started || !key) return null;
  // Au doigt, une invite ACTIONNABLE est déjà le bouton du coin bas droit
  // (ui/Controls) : la répéter ici ferait dire deux fois la même chose. Seul ce
  // qui n'appelle aucun geste - « vide, à jeter », « épuisé » - reste affiché.
  const idle = key === 'emptyHands' || key === 'soldOut';
  if (touch && !idle) return null;
  return (
    <div className="hud-prompt hud-prompt--device">
      {promptText(key, t.devices.prompt, details.name, details.amount)}
    </div>
  );
}
