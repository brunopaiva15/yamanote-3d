// Manifest des personnages « librairie » : public/models/manifest.json décrit
// les GLB installés (fichier, archétypes couverts, genre, réglages optionnels).
// Il est généré par `npm run models:import` (voir scripts/models-import.mjs) ;
// son absence fait retomber le rendu sur les personnages procéduraux.

import { useEffect, useState } from 'react';
import type { Archetype } from '../../systems/appearance';

// Clips logiques consommés par le rendu ; les noms réels des packs sont
// résolus par correspondance floue (voir library.ts), avec override possible.
// `collapse` : chute complète au sol (clip « Death » des packs, joué à
// l'endroit puis à l'envers pour le relevé - voir characters/fall.ts).
// `stagger` : déséquilibre rattrapé sur ses jambes (clip « HitRecieve »).
export type LogicalClip = 'sitIdle' | 'standIdle' | 'walk' | 'collapse' | 'stagger';

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

/**
 * Le manifest, lu UNE FOIS pour la session.
 *
 * Deux consommateurs permanents - les PNJ de la rame et la foule du quai -
 * n'auraient jamais rendu ce cache nécessaire : ils se montent au démarrage et
 * ne se démontent plus. Les commerces, eux, se montent et se démontent à
 * CHAQUE gare, et leur vendeur demande le manifest en arrivant : sans cache,
 * c'était deux requêtes de plus par arrêt, soixante par tour de boucle, pour
 * un fichier qui ne change jamais.
 *
 * La promesse est mémorisée, pas seulement son résultat : deux composants qui
 * se montent dans la même image partagent la requête en vol.
 */
let pending: Promise<CharacterManifest | null> | null = null;

function loadManifest(): Promise<CharacterManifest | null> {
  pending ??= fetch(`${MODELS_BASE}manifest.json`, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => (isValidManifest(data) ? data : null))
    .catch(() => null);
  return pending;
}

// undefined = vérification en cours, null = absent/invalide → fallback procédural.
export function useCharacterManifest(): CharacterManifest | null | undefined {
  const [manifest, setManifest] = useState<CharacterManifest | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadManifest().then((data) => {
      if (alive) setManifest(data);
    });
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
}
