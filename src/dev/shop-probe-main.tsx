// Point d'entrée de /shop-probe.html (dev uniquement, hors build de production :
// vite ne bundle que index.html et about.html).

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ShopProbe } from './ShopProbe';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Élément racine introuvable');

createRoot(rootElement).render(
  <StrictMode>
    <ShopProbe />
  </StrictMode>,
);
