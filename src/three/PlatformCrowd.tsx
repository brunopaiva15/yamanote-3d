// Aiguillage du rendu de la foule du quai : modèles librairie si disponibles,
// sinon personnages procéduraux. Même logique (systems/platformCrowd).

import { Component, Suspense, type ReactNode } from 'react';
import { initPlatformCrowd } from '../systems/platformCrowd';
import { useCharacterManifest } from './characters/manifest';
import { LibraryPlatformCrowd } from './LibraryPlatformCrowd';
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
    </ModelErrorBoundary>
  );
}
