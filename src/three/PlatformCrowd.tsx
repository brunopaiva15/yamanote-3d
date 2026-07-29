// Aiguillage du rendu de la foule du quai : modèles librairie si disponibles,
// sinon personnages procéduraux. Même logique (systems/platformCrowd).
//
// Les chiens promenés (three/PlatformDogs) sont greffés à la branche
// librairie : la laisse s'accroche à un os de main, que les personnages
// procéduraux n'ont pas. Ils ont leur propre repli — un pack animalier absent
// ou illisible laisse simplement le quai sans chiens.

import { Component, Suspense, type ReactNode } from 'react';
import { initPlatformCrowd } from '../systems/platformCrowd';
import { useAnimalManifest } from './characters/animals';
import { useCharacterManifest } from './characters/manifest';
import { LibraryPlatformCrowd } from './LibraryPlatformCrowd';
import { PlatformDogs } from './PlatformDogs';
import { ProceduralPlatformCrowd } from './ProceduralPlatformCrowd';

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.warn('Modèles de foule de quai illisibles, rendu procédural :', error);
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Dogs() {
  const animals = useAnimalManifest();
  if (!animals) return null;
  return (
    <ModelErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <PlatformDogs manifest={animals} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

export function PlatformCrowd() {
  initPlatformCrowd();
  const manifest = useCharacterManifest();
  if (manifest === undefined) return null;
  if (manifest === null) return <ProceduralPlatformCrowd />;
  return (
    <ModelErrorBoundary fallback={<ProceduralPlatformCrowd />}>
      <Suspense fallback={null}>
        <LibraryPlatformCrowd manifest={manifest} />
      </Suspense>
      <Dogs />
    </ModelErrorBoundary>
  );
}
