// Aiguillage du rendu des PNJ : si des modèles 3D riggés sont installés
// (public/models/manifest.json, via `npm run models:import`), on rend les
// personnages « librairie » (LibraryPassengers) ; sinon, ou si un GLB échoue
// au chargement, on retombe sur l'ancien rendu procédural. La logique de jeu
// (systems/passengers) est strictement la même dans les deux cas.

import { Suspense } from 'react';
import { initPassengers } from '../systems/passengers';
import { useCharacterManifest } from './characters/manifest';
import { ModelErrorBoundary } from './characters/ModelErrorBoundary';
import { LibraryPassengers } from './LibraryPassengers';
import { ProceduralPassengers } from './ProceduralPassengers';

export function Passengers() {
  initPassengers();
  const manifest = useCharacterManifest();
  if (manifest === undefined) return null; // vérification du manifest en cours
  if (manifest === null) return <ProceduralPassengers />;
  return (
    <ModelErrorBoundary what="Modèles de personnages" fallback={<ProceduralPassengers />}>
      <Suspense fallback={null}>
        <LibraryPassengers manifest={manifest} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
