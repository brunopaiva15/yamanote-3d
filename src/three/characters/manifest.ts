// Manifest des personnages « librairie » : public/models/manifest.json décrit
// les GLB installés (fichier, archétypes couverts, genre, réglages optionnels).
// Il est généré par `npm run models:import` (voir scripts/models-import.mjs) ;
// son absence fait retomber le rendu sur les personnages procéduraux.

import { useEffect, useState } from 'react';
import type { Archetype } from '../../systems/appearance';

// Clips logiques consommés par le rendu ; les noms réels des packs sont
// résolus par correspondance floue (voir library.ts), avec override possible.
export type LogicalClip = 'sitIdle' | 'standIdle' | 'walk';

// Rôles de teinte : la couleur vient du descripteur d'apparence du passager.
// topDark/bottomDark : même couleur assombrie, pour préserver les habits
// deux-tons des packs (ex. chemise + ombrage) après recoloration.
export type TintRole = 'skin' | 'hair' | 'top' | 'topDark' | 'bottom' | 'bottomDark' | 'shoes' | 'bag' | 'none';

export interface CharacterVariant {
  id: string;
  file: string; // GLB dans public/models/
  archetypes: Archetype[]; // archétypes que cette variante peut incarner
  feminine?: boolean; // silhouette féminine (défaut : false)
  faceYaw?: number; // correction d'orientation si le modèle ne regarde pas +Z
  clips?: Partial<Record<LogicalClip, string>>; // noms exacts si la détection échoue
  sitHipY?: number; // hauteur des hanches du clip assis (unités normalisées), sinon mesurée
  tint?: boolean; // autoriser la teinte des matériaux nommés (défaut : true)
  tintMap?: Record<string, TintRole>; // nom de matériau → rôle (prioritaire sur la détection)
  bagProp?: boolean; // false : pas de sac-accessoire (le modèle a déjà le sien)
}

export interface CharacterManifest {
  version: 1;
  source?: string; // pack d'origine (traçabilité licence)
  license?: string;
  walkClipSpeed?: number; // vitesse (m/s) « auteur » du cycle de marche, défaut 1.4
  variants: CharacterVariant[];
}

export const MODELS_BASE = `${import.meta.env.BASE_URL}models/`;

function isValidManifest(data: unknown): data is CharacterManifest {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as CharacterManifest;
  return m.version === 1 && Array.isArray(m.variants) && m.variants.length > 0 && m.variants.every((v) => typeof v.file === 'string' && Array.isArray(v.archetypes));
}

// undefined = vérification en cours, null = absent/invalide → fallback procédural.
export function useCharacterManifest(): CharacterManifest | null | undefined {
  const [manifest, setManifest] = useState<CharacterManifest | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`${MODELS_BASE}manifest.json`, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive) setManifest(isValidManifest(data) ? data : null);
      })
      .catch(() => {
        if (alive) setManifest(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
}
