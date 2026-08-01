// L'appareil qu'on a en face, sondé pour l'interface.
//
// Même idiome que useTalkTarget : la visée vit dans systems/interaction et se
// rafraîchit dix fois par seconde ; l'invite et le bouton tactile n'ont besoin
// que de savoir ce qu'ils doivent dire.

import { useEffect, useState } from 'react';
import { prompt, type PromptKey } from '../systems/interaction';

/** Le texte d'une invite, ses variables substituées. */
export function promptText(
  key: PromptKey,
  labels: Record<PromptKey, string>,
  name: string,
  amount: number,
): string {
  return labels[key].replace('{name}', name).replace('{n}', amount.toLocaleString('en-US'));
}

export function useDevicePrompt(): PromptKey | null {
  const [key, setKey] = useState<PromptKey | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setKey(prompt.key), 120);
    return () => window.clearInterval(id);
  }, []);
  return key;
}
