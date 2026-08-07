// Entrée de la page de fréquentation, distincte de celle du jeu.
//
// Elle n'appelle PAS `startVisitAnalytics` : consulter les statistiques ne doit
// pas en produire. C'est la raison d'être de cette entrée séparée - un simple
// `if` dans `src/main.tsx` aurait suffi à ne pas compter la page, mais aurait
// fait entrer React, le store, l'i18n et le chargeur de jeu dans le morceau
// téléchargé pour lire un histogramme.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatsPage } from './StatsPage';
import './stats.css';

const racine = document.getElementById('root');
if (!racine) throw new Error('Élément racine introuvable');

createRoot(racine).render(
  <StrictMode>
    <StatsPage />
  </StrictMode>,
);
