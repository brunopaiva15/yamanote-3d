// Invite « adresser la parole », sous le réticule.
//
// Elle n'apparaît que lorsqu'un voyageur est vraiment en face, à portée de
// voix (systems/paxTargeting) : c'est ce qui apprend la touche sans jamais
// avoir à l'expliquer.

import { useStore } from '../store';
import { useT } from '../i18n';
import { useTalkTarget } from './useTalkTarget';

export function TalkPrompt() {
  const started = useStore((s) => s.started);
  const touch = useStore((s) => s.touch);
  const t = useT();
  const near = useTalkTarget();

  // Sur tactile, l'invite est inutile : c'est le bouton « Parler » qui sert,
  // et il n'apparaît lui aussi que devant quelqu'un.
  if (!started || touch || !near) return null;
  return <div className="hud-prompt">{t.hud.talk}</div>;
}
