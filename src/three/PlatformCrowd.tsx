// Aiguillage du rendu de la foule du quai : modèles librairie si disponibles,
// sinon personnages procéduraux. Même logique (systems/platformCrowd).
//
// Les chiens en caisse de transport (three/PlatformPets) sont greffés à la
// branche librairie : la caisse pend à un os de main, que les personnages
// procéduraux n'ont pas. Ils ont leur propre repli - un pack animalier absent
// ou illisible laisse simplement le quai sans chiens.

import { Suspense } from 'react';
import { initPlatformCrowd } from '../systems/platformCrowd';
import { useAnimalManifest } from './characters/animals';
import { useCharacterManifest } from './characters/manifest';
import { ModelErrorBoundary } from './characters/ModelErrorBoundary';
import { LibraryPlatformCrowd } from './LibraryPlatformCrowd';
import { PlatformPets } from './PlatformPets';
import { ProceduralPlatformCrowd } from './ProceduralPlatformCrowd';

function Pets() {
  const animals = useAnimalManifest();
  if (!animals) return null;
  return (
    <ModelErrorBoundary what="Modèles animaliers" fallback={null}>
      <Suspense fallback={null}>
        <PlatformPets manifest={animals} />
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
    <ModelErrorBoundary what="Modèles de foule de quai" fallback={<ProceduralPlatformCrowd />}>
      <Suspense fallback={null}>
        <LibraryPlatformCrowd manifest={manifest} />
      </Suspense>
      <Pets />
    </ModelErrorBoundary>
  );
}
