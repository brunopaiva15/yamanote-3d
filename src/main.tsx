import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startVisitAnalytics } from './systems/analytics';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Élément racine introuvable');

// Le battement de fréquentation part de l'OUVERTURE de la page, pas du démarrage
// du jeu : quelqu'un qui lit le menu puis s'en va est venu, et c'est la question
// posée. Sans clés Supabase, l'appel ne fait rien du tout - pas même un import.
startVisitAnalytics();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
