// Point d'entrée de /car-probe.html (dev uniquement, hors build de production :
// vite ne bundle que index.html).

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CarProbe } from './CarProbe';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Élément racine introuvable');

createRoot(rootElement).render(
  <StrictMode>
    <CarProbe />
  </StrictMode>,
);
