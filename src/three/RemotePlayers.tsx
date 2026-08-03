// Aiguillage du rendu des joueurs distants.
//
// Exactement celui de `three/Passengers` et `three/PlatformCrowd`, et c'est tout
// son intérêt : si des modèles riggés sont installés (public/models/manifest.json,
// via `npm run models:import`), un camarade de salon est un personnage comme les
// autres ; sinon, ou si un GLB échoue au chargement, on retombe sur le rendu
// procédural.
//
// Ce fichier est né d'un défaut rapporté depuis un vrai salon : « son personnage
// est moche et ne ressemble pas aux personnages ». C'était exact. La première
// version rendait TOUJOURS en procédural - le repli - alors que tous les
// voisins, eux, étaient des modèles. Une silhouette de polygones bruts au milieu
// de trente personnages riggés ne passe pas inaperçue, et surtout elle dit au
// joueur que son ami n'appartient pas au même monde que le reste de la rame.

import { Suspense } from 'react';
import { useCharacterManifest } from './characters/manifest';
import { ModelErrorBoundary } from './characters/ModelErrorBoundary';
import { LibraryRemotePlayers } from './LibraryRemotePlayers';
import { ProceduralRemotePlayers } from './ProceduralRemotePlayers';

export function RemotePlayers() {
  const manifest = useCharacterManifest();
  if (manifest === undefined) return null; // vérification du manifest en cours
  if (manifest === null) return <ProceduralRemotePlayers />;
  return (
    <ModelErrorBoundary what="Modèles de joueurs distants" fallback={<ProceduralRemotePlayers />}>
      {/* Pendant le chargement des GLB, on ne rend RIEN plutôt que le repli
          procédural : quelques images d'une silhouette de polygones qui se
          transforme en personnage se remarqueraient bien plus qu'une absence
          d'une demi-seconde. */}
      <Suspense fallback={null}>
        <LibraryRemotePlayers manifest={manifest} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
