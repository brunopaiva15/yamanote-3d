// Ce qu'on dit à un inconnu dans un train : rien d'important.
// La banalité est le sujet — c'est elle qui rend la rame vivante.

import type { DialogueEntry } from './types';

export const DIALOGUE_SMALLTALK: readonly DialogueEntry[] = [
  {
    id: 'st.hello',
    lines: [
      {
        t: {
          fr: 'Bonjour. Vous allez loin ?',
          en: 'Hello. Going far?',
          ja: 'こんにちは。遠くまで行かれるんですか。',
        },
      },
    ],
  },
];
