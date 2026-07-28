// Sonde de gare : que se traverse-t-il, réellement ?
//
// Le placement du mobilier arbitre des emprises AU SOL — deux rectangles en
// (x, z), à hauteur de marche. C'est ce qu'il faut pour que le joueur ne
// traverse pas un banc, et c'est tout ce que ça garantit. Or l'essentiel d'une
// gare est SUSPENDU : panneaux, potences, bannières, bandeaux, diffuseurs,
// caméras, chemins de câbles, gouttières — posés chacun par son fichier, avec
// ses propres constantes, sans que personne n'arbitre. Résultat : ça
// s'entrechoque, et aucun contrôle en deux dimensions ne peut le voir.
//
// Cette sonde lit le graphe de scène tel qu'il est rendu — pas des cotes
// re-déduites — et rapporte les paires de volumes qui s'interpénètrent. Elle
// est branchée en développement seulement, et s'appelle depuis la console ou
// depuis un navigateur piloté :
//
//   __stationProbe()            → paires en conflit, triées par pénétration
//   __stationProbe({ min: 0.1 }) → seuil de pénétration (m)

import * as THREE from 'three';
import { DOOR_SIDE, STATIONS } from '../data/stations';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';

interface Volume {
  label: string;
  box: THREE.Box3;
}

interface Hit {
  a: string;
  b: string;
  /** Pénétration la plus faible des trois axes (m) : la profondeur réelle. */
  depth: number;
  at: [number, number, number];
}

/** Étiquette d'un objet : le premier ancêtre nommé, en remontant. */
function labelOf(o: THREE.Object3D): string {
  let cur: THREE.Object3D | null = o;
  const parts: string[] = [];
  while (cur) {
    if (cur.name) parts.unshift(cur.name);
    if (cur.name === 'gare') break;
    cur = cur.parent;
  }
  return parts.length ? parts.join('/') : '(sans nom)';
}

/** Volumes de tous les maillages visibles sous `root`, instances comprises. */
function collect(root: THREE.Object3D): Volume[] {
  const out: Volume[] = [];
  const geoBox = new THREE.Box3();
  const m = new THREE.Matrix4();

  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return;
    const label = labelOf(mesh);

    const im = mesh as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        m.premultiply(im.matrixWorld);
        geoBox.copy(bb).applyMatrix4(m);
        out.push({ label, box: geoBox.clone() });
      }
      return;
    }
    geoBox.copy(bb).applyMatrix4(mesh.matrixWorld);
    out.push({ label, box: geoBox.clone() });
  });
  return out;
}

/**
 * Profondeur d'interpénétration de deux boîtes : le plus petit des trois
 * recouvrements. Deux volumes qui se touchent par une face en partagent un nul
 * ou presque — c'est un contact, pas un choc.
 */
function penetration(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (dx <= 0 || dy <= 0 || dz <= 0) return 0;
  return Math.min(dx, dy, dz);
}

/**
 * Paires qui s'entrechoquent, regroupées par familles et triées par gravité.
 *
 * `ignore` liste les paires de familles dont l'interpénétration est VOULUE :
 * une affiche est collée sur son caisson, un coffret est vissé sur son poteau,
 * un vantail coulisse dans son muret. Les y laisser noierait le signal.
 */
export function probeStation(
  scene: THREE.Object3D,
  opts: { min?: number; ignore?: string[] } = {},
): { pairs: { a: string; b: string; count: number; worst: number; at: number[] }[]; volumes: number } {
  const min = opts.min ?? 0.04;
  const ignore = new Set(opts.ignore ?? []);
  const station = scene.getObjectByName('gare');
  if (!station) return { pairs: [], volumes: 0 };

  const vols = collect(station);
  const hits: Hit[] = [];
  for (let i = 0; i < vols.length; i++) {
    for (let j = i + 1; j < vols.length; j++) {
      if (vols[i].label === vols[j].label) continue;
      const d = penetration(vols[i].box, vols[j].box);
      if (d < min) continue;
      const key = [vols[i].label, vols[j].label].sort().join(' ✕ ');
      if (ignore.has(key)) continue;
      const c = vols[i].box.getCenter(new THREE.Vector3());
      hits.push({
        a: vols[i].label,
        b: vols[j].label,
        depth: d,
        at: [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)],
      });
    }
  }

  const byPair = new Map<string, { a: string; b: string; count: number; worst: number; at: number[] }>();
  for (const h of hits) {
    const [a, b] = [h.a, h.b].sort();
    const key = `${a} ✕ ${b}`;
    const cur = byPair.get(key);
    if (!cur) byPair.set(key, { a, b, count: 1, worst: h.depth, at: h.at });
    else {
      cur.count++;
      if (h.depth > cur.worst) {
        cur.worst = h.depth;
        cur.at = h.at;
      }
    }
  }
  return {
    pairs: [...byPair.values()].sort((x, y) => y.worst - x.worst),
    volumes: vols.length,
  };
}

/**
 * Ce que la scène coûte réellement, tel que le pilote le voit.
 *
 * Les chiffres qui comptent — appels de rendu, triangles, programmes — ne
 * dépendent pas de la carte : on peut donc les relever sous SwiftShader et en
 * tirer un budget valable partout. Le temps par image, lui, n'y veut rien dire.
 *
 * `gl.info` se remet à zéro à chaque `render()`, et le post-traitement en
 * appelle plusieurs par image : lu naïvement, il ne rapporte que la dernière
 * passe plein écran — un appel, un triangle. On coupe donc la remise à zéro
 * automatique et on cumule sur un nombre d'images connu.
 */
function probePerf(
  scene: THREE.Object3D,
  gl: THREE.WebGLRenderer,
): Record<string, number> {
  let meshes = 0;
  let instanced = 0;
  let instances = 0;
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const im = m as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      instanced++;
      instances += im.count;
    }
  });
  return {
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    programs: gl.info.programs?.length ?? 0,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    meshes,
    instanced,
    instances,
  };
}

/** Branche la sonde sur `window`, en développement uniquement. */
export function installStationProbe(scene: THREE.Object3D, gl: THREE.WebGLRenderer): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as Record<string, unknown>;
  w.__probePerf = () => probePerf(scene, gl);
  w.__probePerfReset = () => {
    gl.info.autoReset = false;
    gl.info.reset();
  };
  w.__stationProbe = (opts?: { min?: number; ignore?: string[] }) => probeStation(scene, opts);
  // Se poser sur une gare donnée, à l'arrêt : c'est l'état où tout est monté
  // et immobile, donc le seul où une mesure a du sens.
  w.__probeGoto = (i: number, phase: 'dwell' | 'brake' = 'dwell') => {
    const k = ((i % 30) + 30) % 30;
    useStore.setState({ index: k, platformIndex: k, phase, doorSide: DOOR_SIDE[k] });
    runtime.platformFade = 1;
    runtime.platformSlide = 0;
  };

  w.__probeName = () => STATIONS[useStore.getState().index].romaji;

  // Se poser EN PLEINE VOIE, quartier choisi : l'état où l'on juge le décor.
  // Le quai est retiré, sinon il masque tout ce qu'on vient regarder.
  w.__probeCruise = (i: number) => {
    const k = ((i % 30) + 30) % 30;
    useStore.setState({ index: k, phase: 'cruise', doorSide: DOOR_SIDE[k] });
    runtime.phaseT = 8;
    runtime.platformFade = 0;
    runtime.platformSlide = 0;
  };

  // État courant : de quoi diagnostiquer une capture qui ne montre pas ce
  // qu'on croyait avoir demandé.
  w.__probeState = () => ({
    clockMin: Math.round(runtime.clockMin),
    index: useStore.getState().index,
    phase: useStore.getState().phase,
    platformFade: +runtime.platformFade.toFixed(2),
    distance: Math.round(runtime.distance),
  });

  // Heure de Tokyo, en minutes depuis minuit. L'horloge avance ensuite d'une
  // minute par minute réelle : la valeur posée tient le temps d'une capture.
  w.__probeClock = (minutes: number) => {
    runtime.clockMin = ((minutes % 1440) + 1440) % 1440;
  };
}
