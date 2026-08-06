// Briques de construction partagées entre Landmarks et SegmentEnvironment :
// contexte de collecte (matériaux/géométries pour disposal et fondus) et
// primitives silhouette/néon. Les helpers poussent dans les tableaux du ctx
// fourni, l'appelant garde donc la main sur le cycle de vie et les fondus.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Ctx {
  group: THREE.Group;
  sil: THREE.MeshBasicMaterial[]; // silhouettes non éclairées (s'assombrissent la nuit).
  glow: THREE.MeshBasicMaterial[]; // écrans/néons émissifs (s'illuminent la nuit).
  geos: THREE.BufferGeometry[];
  r: () => number;
}

/**
 * Fond les maillages d'une silhouette, matériau par matériau.
 *
 * Les primitives ci-dessus posent UN maillage par boîte : c'est ce qui les rend
 * lisibles à écrire, et c'est ruineux à dessiner. Un bosquet, c'est jusqu'à
 * vingt-deux maillages - donc vingt-deux appels de rendu - pour trois teintes.
 * Tant qu'un quartier ne citait qu'une ou deux silhouettes, personne ne l'a vu ;
 * le jour où chaque gare a cité les quatre familles que le relevé lui résout,
 * la scène à quai est passée de sept cents à neuf cent quatre-vingt-sept appels,
 * au-dessus du budget.
 *
 * On fond donc chaque groupe une fois construit. Les matériaux ne changent pas -
 * `sil` et `glow` en rendent un par teinte, et le fondu d'approche continue de
 * les piloter -, seule la découpe en maillages disparaît. Les géométries
 * d'origine sont libérées ici même : elles ne servent plus à personne.
 */
export function mergeByMaterial(group: THREE.Group, geos: THREE.BufferGeometry[]): void {
  const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const mat = child.material as THREE.Material;
    const at = byMaterial.get(mat);
    if (at) at.push(child);
    else byMaterial.set(mat, [child]);
  }
  for (const [mat, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const parts: THREE.BufferGeometry[] = [];
    for (const m of meshes) {
      m.updateMatrix();
      parts.push(m.geometry.clone().applyMatrix4(m.matrix));
    }
    const merged = mergeGeometries(parts, false) as THREE.BufferGeometry | null;
    for (const p of parts) p.dispose();
    if (!merged) continue;
    for (const m of meshes) {
      group.remove(m);
      const i = geos.indexOf(m.geometry);
      if (i >= 0) geos.splice(i, 1);
      m.geometry.dispose();
    }
    geos.push(merged);
    group.add(new THREE.Mesh(merged, mat));
  }
}

export function sil(ctx: Ctx, color: string): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, fog: true, depthWrite: false });
  m.userData.base = m.color.clone();
  ctx.sil.push(m);
  return m;
}

export function glow(ctx: Ctx, color: string): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    fog: true,
    depthWrite: false,
    toneMapped: false,
  });
  ctx.glow.push(m);
  return m;
}

export function box(
  ctx: Ctx,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): void {
  const g = new THREE.BoxGeometry(w, h, d);
  ctx.geos.push(g);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  ctx.group.add(m);
}

export function plane(
  ctx: Ctx,
  mat: THREE.Material,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
): void {
  const g = new THREE.PlaneGeometry(w, h);
  ctx.geos.push(g);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  ctx.group.add(m);
}

// Véhicule qui défile (near) : tram, rame shinkansen, rame de banlieue, loco.
export function vehicle(ctx: Ctx, kind: 'tram' | 'shinkansen' | 'commuter' | 'loco'): void {
  if (kind === 'tram') {
    box(ctx, sil(ctx, '#3aa0c0'), 2.4, 3.0, 9, 0, 1.6, 0);
    plane(ctx, glow(ctx, '#fff2c0'), 1.9, 1.0, 0, 2.2, 4.55);
  } else if (kind === 'shinkansen') {
    box(ctx, sil(ctx, '#eef2f6'), 3.0, 3.2, 22, 0, 1.9, 0);
    box(ctx, sil(ctx, '#2f6fd0'), 3.05, 0.6, 22, 0, 1.7, 0);
  } else if (kind === 'commuter') {
    // Rame argentée à bande verte (une E235 croisée sur la boucle parallèle) ;
    // bandeau de fenêtres émissif, éclatant la nuit.
    box(ctx, sil(ctx, '#d9dde1'), 3.0, 3.2, 22, 0, 1.9, 0);
    box(ctx, sil(ctx, '#6fae3f'), 3.05, 0.55, 22, 0, 2.72, 0);
    box(ctx, glow(ctx, '#fff3cf'), 3.02, 0.75, 20.5, 0, 2.15, 0);
  } else {
    box(ctx, sil(ctx, '#26262c'), 2.6, 3.0, 6, 0, 1.7, 0);
    const cm = sil(ctx, '#3a3a40');
    const g = new THREE.CylinderGeometry(1.3, 1.3, 5.5, 12);
    ctx.geos.push(g);
    const m = new THREE.Mesh(g, cm);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, 1.8, 1.5);
    ctx.group.add(m);
  }
}
