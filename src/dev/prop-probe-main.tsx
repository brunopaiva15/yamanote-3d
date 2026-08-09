// Point d'entrée de /prop-probe.html (dev uniquement, hors build de production :
// vite ne bundle que les entrées déclarées dans vite.config.ts).

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PropProbe } from './PropProbe';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Élément racine introuvable');

createRoot(rootElement).render(
  <StrictMode>
    <PropProbe />
  </StrictMode>,
);
