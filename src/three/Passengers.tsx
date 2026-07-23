// Aiguillage du rendu des PNJ : si des modèles 3D riggés sont installés
// (public/models/manifest.json, via `npm run models:import`), on rend les
// personnages « librairie » (LibraryPassengers) ; sinon, ou si un GLB échoue
// au chargement, on retombe sur l'ancien rendu procédural. La logique de jeu
// (systems/passengers) est strictement la même dans les deux cas.

import { Component, Suspense, type ReactNode } from 'react';
import { initPassengers } from '../systems/passengers';
import { useCharacterManifest } from './characters/manifest';
import { LibraryPassengers } from './LibraryPassengers';
import { ProceduralPassengers } from './ProceduralPassengers';

// Un GLB manquant/corrompu fait échouer useGLTF pendant le rendu : cette
// frontière d'erreur ramène proprement au rendu procédural.
class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.warn('Modèles de personnages illisibles, rendu procédural utilisé :', error);
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Passengers() {
  initPassengers();
  const manifest = useCharacterManifest();
  if (manifest === undefined) return null; // vérification du manifest en cours
  if (manifest === null) return <ProceduralPassengers />;
  return (
    <ModelErrorBoundary fallback={<ProceduralPassengers />}>
      <Suspense fallback={null}>
        <LibraryPassengers manifest={manifest} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
