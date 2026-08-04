// Sonde de gare : que se traverse-t-il, réellement ?
//
// Le placement du mobilier arbitre des emprises AU SOL - deux rectangles en
// (x, z), à hauteur de marche. C'est ce qu'il faut pour que le joueur ne
// traverse pas un banc, et c'est tout ce que ça garantit. Or l'essentiel d'une
// gare est SUSPENDU : panneaux, potences, bannières, bandeaux, diffuseurs,
// caméras, chemins de câbles, gouttières - posés chacun par son fichier, avec
// ses propres constantes, sans que personne n'arbitre. Résultat : ça
// s'entrechoque, et aucun contrôle en deux dimensions ne peut le voir.
//
// Cette sonde lit le graphe de scène tel qu'il est rendu - pas des cotes
// re-déduites - et rapporte les paires de volumes qui s'interpénètrent. Elle
// est branchée en développement seulement, et s'appelle depuis la console ou
// depuis un navigateur piloté :
//
//   __stationProbe()            → paires en conflit, triées par pénétration
//   __stationProbe({ min: 0.1 }) → seuil de pénétration (m)

import * as THREE from 'three';
import { DOOR_SIDE, STATIONS } from '../data/stations';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { input } from '../systems/input';
import { placementFor } from '../systems/stationPlacement';
import { platformToWorld } from '../systems/playerFrame';
import { concourseBays, shellsOf } from '../data/stationConcourseBuild';
import { psdGates } from '../three/station/psdLayout';
import { CROWD_GROUP } from '../systems/platformCrowd';
import { setQuality, usePerf } from '../systems/perf';
import { freezeWeather, weather } from '../systems/weather';
import { seasonNow } from '../systems/season';

interface Volume {
  label: string;
  box: THREE.Box3;
  /**
   * Cette surface peut-elle SE DISPUTER un pixel ?
   *
   * Non si elle n'écrit pas la profondeur, non si elle porte déjà un décalage
   * de polygone : dans les deux cas l'auteur a réglé la question, et une sonde
   * qui l'ignore rapporte éternellement les mêmes faux positifs. Voir
   * `__probeFlat` — c'est la seule qui s'en serve.
   */
  fights: boolean;
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
    // LES GENS NE SONT PAS DES OUVRAGES. Cette sonde cherche des fautes de
    // construction - un panneau planté dans une poutre, une borne dans un
    // muret - et un corps humain n'en produit aucune : ses morceaux se
    // recouvrent par nature (le crâne dans la calotte, le pied dans la jambe),
    // et sa boîte englobante est celle de la pose de REPOS, pas de la pose
    // jouée, donc elle ne dit rien de vrai sur l'endroit qu'il occupe. Depuis
    // que le vendeur des commerces se tient DANS la gare - la foule du quai,
    // elle, est rendue en dehors -, ces boîtes-là noyaient tout le rapport.
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return;
    const label = labelOf(mesh);
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
    const fights = !!mat && mat.depthWrite !== false && mat.polygonOffset !== true;

    const im = mesh as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        m.premultiply(im.matrixWorld);
        geoBox.copy(bb).applyMatrix4(m);
        out.push({ label, box: geoBox.clone(), fights });
      }
      return;
    }
    geoBox.copy(bb).applyMatrix4(mesh.matrixWorld);
    out.push({ label, box: geoBox.clone(), fights });
  });
  return out;
}

/**
 * Profondeur d'interpénétration de deux boîtes : le plus petit des trois
 * recouvrements. Deux volumes qui se touchent par une face en partagent un nul
 * ou presque - c'est un contact, pas un choc.
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
 * Les chiffres qui comptent - appels de rendu, triangles, programmes - ne
 * dépendent pas de la carte : on peut donc les relever sous SwiftShader et en
 * tirer un budget valable partout. Le temps par image, lui, n'y veut rien dire.
 *
 * `gl.info` se remet à zéro à chaque `render()`, et le post-traitement en
 * appelle plusieurs par image : lu naïvement, il ne rapporte que la dernière
 * passe plein écran - un appel, un triangle. On coupe donc la remise à zéro
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
export function installStationProbe(
  scene: THREE.Object3D,
  gl: THREE.WebGLRenderer,
  camera: THREE.Camera,
): void {
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
  //
  // Le compteur de phase est REMIS À ZÉRO, et ce n'est pas cosmétique : il
  // était hérité de l'état précédent, si bien qu'un saut vers une gare tombait
  // souvent en fin de dwell. Une seconde plus tard la rame repartait, le quai
  // se remettait à glisser sous la sonde, et une cote relevée était fausse le
  // temps de poser la caméra dessus.
  w.__probeGoto = (i: number, phase: 'dwell' | 'brake' = 'dwell') => {
    const k = ((i % 30) + 30) % 30;
    useStore.setState({ index: k, platformIndex: k, phase, doorSide: DOOR_SIDE[k] });
    runtime.phaseT = 0;
    runtime.platformFade = 1;
    runtime.platformSlide = 0;
  };

  /**
   * Ce que l'œil rencontre RÉELLEMENT le long d'un rayon, dans l'ordre.
   *
   * La sonde de volumes ne voit que la gare ; or ce qui gâche une vue vient
   * souvent d'ailleurs - la nappe de rue qui traverse une trémie, un plan de
   * tronçon qui passe devant un quai. Ici on tire un rayon et on lit la pile
   * des touches, chacune avec sa filiation complète : c'est le seul moyen de
   * nommer un intrus qui n'appartient pas à la gare.
   */
  w.__probeRay = (from: number[], to: number[]) => {
    const o = new THREE.Vector3(from[0], from[1], from[2]);
    const d = new THREE.Vector3(to[0], to[1], to[2]).sub(o).normalize();
    return new THREE.Raycaster(o, d)
      .intersectObject(scene, true)
      .slice(0, 8)
      .map((h) => {
        const chain: string[] = [];
        for (let c: THREE.Object3D | null = h.object; c; c = c.parent) {
          chain.unshift(c.name || `<${c.type}>`);
        }
        return {
          n: labelOf(h.object),
          chain: chain.join('/'),
          d: +h.distance.toFixed(2),
          at: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)],
        };
      });
  };

  /**
   * CE QU'IL Y A SUR CE PIXEL-LÀ.
   *
   * `__probeRay` demande de connaître déjà les deux bouts du rayon ; or quand
   * une capture montre un bloc gris qu'on n'a pas commandé, on ne connaît que
   * SA PLACE À L'ÉCRAN. Trois tours de masquages successifs ont été dépensés à
   * éliminer des candidats un par un — l'auvent, la travée opposée, la dalle —
   * là où une seule question suffisait : « comment s'appelle ce que je vois
   * à cet endroit de l'image ? »
   *
   * Les coordonnées sont celles du repère normalisé de l'écran : x et z de -1
   * (gauche, bas) à +1 (droite, haut), 0 au centre. La couleur est rendue avec
   * le nom, parce qu'un bloc se reconnaît d'abord à sa teinte.
   *
   *   __probePick(0, 0.1)  → ce qui est juste au-dessus du centre de l'écran
   */
  w.__probePick = (ndcX = 0, ndcY = 0) => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    // CE QUI EST ÉTEINT N'EST PAS SUR L'IMAGE. Le raycaster de three ignore
    // `visible` : il a nommé une ferme de toiture escamotée comme si elle
    // bouchait la vue, et l'on a cru le percement raté alors qu'il tenait.
    const shown = (o: THREE.Object3D) => {
      for (let c: THREE.Object3D | null = o; c; c = c.parent) if (!c.visible) return false;
      return true;
    };
    return ray
      .intersectObject(scene, true)
      .filter((h) => shown(h.object))
      .slice(0, 6)
      .map((h) => {
        const chain: string[] = [];
        for (let c: THREE.Object3D | null = h.object; c; c = c.parent) {
          chain.unshift(c.name || `<${c.type}>`);
        }
        const mat = (h.object as THREE.Mesh).material as THREE.Material & {
          color?: THREE.Color;
        };
        // La BOÎTE en repère monde, parce qu'un volume anonyme se reconnaît à
        // ses cotes : « 82 m de large, 3 m de haut, à +5,08 » désigne une
        // pièce du réseau sans ambiguïté, là où « <Mesh> » ne désigne rien.
        const bb = new THREE.Box3().setFromObject(h.object);
        return {
          n: labelOf(h.object),
          chain: chain.join('/'),
          d: +h.distance.toFixed(2),
          at: [+h.point.x.toFixed(2), +h.point.y.toFixed(2), +h.point.z.toFixed(2)],
          color: mat?.color?.getHexString?.() ?? null,
          mat: mat?.type ?? null,
          box: [
            +bb.min.x.toFixed(1), +bb.min.y.toFixed(1), +bb.min.z.toFixed(1),
            +bb.max.x.toFixed(1), +bb.max.y.toFixed(1), +bb.max.z.toFixed(1),
          ],
        };
      });
  };

  /**
   * SE METTRE AU PALIER DU JOUEUR.
   *
   * La gare ne se dessine pas pareil à « ultra » et à « très basse », et c'est
   * voulu — mais ce qui saute doit être ce qu'on REGARDE, jamais ce qu'on
   * parcourt. Juger cela demande de pouvoir changer de palier sans quitter la
   * scène montée : `setQuality` le fait déjà pour l'interface, on l'expose ici
   * pour les scripts de contrôle.
   *
   *   __probeQuality('veryLow')
   */
  w.__probeQuality = (q: string) => {
    setQuality(q as Parameters<typeof setQuality>[0]);
    return usePerf.getState().quality;
  };

  w.__probeName = () => STATIONS[useStore.getState().index].romaji;

  /**
   * Marcher, réellement, pendant `ms` millisecondes.
   *
   * Poser la caméra à une cote choisie ne prouve rien : c'est justement ce que
   * fait le reste de cette sonde, et c'est pour cela qu'elle ne voit pas ce qui
   * ARRÊTE le pas. Il n'y a qu'une façon de vérifier qu'on descend vraiment
   * dans une gare - descendre - et il n'y a qu'une entrée pour cela, celle du
   * joueur. On la pilote donc telle quelle : les mêmes touches, le même regard,
   * la même boucle.
   *
   * `yaw` est un delta de regard en pixels, appliqué d'un coup avant de partir.
   */
  w.__probeWalk = (ms: number, keys: string[] = ['KeyW'], yaw = 0) =>
    new Promise<void>((resolve) => {
      input.lookDX += yaw;
      for (const k of keys) input.keys.add(k);
      setTimeout(() => {
        for (const k of keys) input.keys.delete(k);
        resolve();
      }, ms);
    });

  /**
   * L'itinéraire qui mène du quai au hall, en repère MONDE : le nez de la
   * trémie principale, le fond de son couloir, la zone payante, le portillon
   * large, la zone libre. C'est ce que le pilote suit pour aller voir sur
   * pièces - lu dans les données de la gare, jamais recopié à la main.
   */
  w.__probeInterior = () => {
    const index = useStore.getState().platformIndex;
    const flip = DOOR_SIDE[index];
    const p = placementFor(index, psdGates());
    const net = p.network;
    const point = (x: number, z: number) => [flip * x, flip * z];
    // LES CINQ VUES SE LISENT SUR LE RÉSEAU, et non sur le hall générique :
    // vingt-six gares passent par leur relevé, leur contrôle ne se franchit pas
    // toujours selon z, et leur zone libre n'est pas « plus loin ». Cadrer sur
    // `interior` revenait à photographier un hall qui n'est plus là.
    const paid = net.rooms.find((r) => r.walkable && r.fare === 'paid');
    const free = net.rooms.find((r) => r.walkable && r.fare === 'free');
    const access = p.liveAccesses[0];
    const bays = concourseBays(net);
    const bay = bays[bays.length - 1];
    const mouth = net.mouths.find((m) => m.roomId === free?.id) ?? net.mouths[0];
    const mid = (r: { x0: number; x1: number; z0: number; z1: number }) =>
      [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2] as [number, number];
    const legs: [string, number, number, number, number][] = [];
    /** Se poser en `from`, viser `to` — les deux, sinon on cadre un meuble. */
    const shot = (
      name: string,
      from: [number, number] | null,
      to: [number, number] | null,
    ) => {
      if (from && to) legs.push([name, ...point(...from), ...point(...to)] as never);
    };

    if (access) {
      const s = access.stair;
      shot('01-tremie', [s.x, s.z - 3], [s.x, s.z + 6]);
    }
    if (paid) {
      const [px, pz] = mid(paid.rect);
      shot('02-zone-payante', [px, pz], bay ? [bay.x, bay.z] : [paid.rect.x1, pz]);
    }
    if (bay && paid) {
      // On se recule d'un mètre et demi du côté payant, sur l'axe qu'on franchit.
      const [p0, p1] = bay.cross === 'z'
        ? [paid.rect.z0, paid.rect.z1]
        : [paid.rect.x0, paid.rect.x1];
      const [g0, g1] = bay.cross === 'z'
        ? [bay.rect.z0, bay.rect.z1]
        : [bay.rect.x0, bay.rect.x1];
      const low = (p0 + p1) / 2 < (g0 + g1) / 2;
      const back = low ? g0 - 1.5 : g1 + 1.5;
      const front = low ? g1 + 3 : g0 - 3;
      shot(
        '03-portillon',
        bay.cross === 'z' ? [bay.x, back] : [back, bay.z],
        bay.cross === 'z' ? [bay.x, front] : [front, bay.z],
      );
    }
    if (free) {
      // ON VISE LE LONG DE LA PIÈCE, ET NON SON COIN.
      //
      // Cette vue-ci cadrait `[x1, z1]` — un angle du rectangle —, ce qui
      // revient à regarder un mur en diagonale : la moitié de l'image est un
      // aplat de paroi, et ce qu'on aperçoit de biais derrière se lit de
      // travers. On a cru à une bannière de sortie vide à Yūrakuchō pour cette
      // seule raison. Le long de la plus grande dimension, on a toute la pièce
      // devant soi, ce qui est ce qu'une vue de zone libre doit montrer.
      const r = free.rect;
      const [cx, cz] = mid(r);
      const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
      shot('04-zone-libre', [cx, cz], alongX ? [r.x1, cz] : [cx, r.z1]);
    }
    if (free && mouth) {
      const r = free.rect;
      const to: [number, number] = mouth.side === 'z1' ? [mouth.at, r.z1 + 2]
        : mouth.side === 'z0' ? [mouth.at, r.z0 - 2]
          : mouth.side === 'x1' ? [r.x1 + 2, mouth.at]
            : [r.x0 - 2, mouth.at];
      const from: [number, number] = mouth.side === 'z1' ? [mouth.at, r.z1 - 7]
        : mouth.side === 'z0' ? [mouth.at, r.z0 + 7]
          : mouth.side === 'x1' ? [r.x1 - 7, mouth.at]
            : [r.x0 + 7, mouth.at];
      shot('05-bouches', from, to);
    }
    return { flip, placement: legs };
  };

  /** Où en est le joueur : repère, étage, position de ses pieds. */
  w.__probeWhere = () => ({
    frame: runtime.playerFrame,
    level: runtime.playerLevel,
    x: +runtime.stanceX.toFixed(2),
    y: +runtime.playerY.toFixed(2),
    z: +runtime.stanceZ.toFixed(2),
  });

  /**
   * Où se trouve, en repère MONDE, un ouvrage nommé du décor.
   *
   * Les cotes de gare se lisent dans le repère du quai, mais on ne MARCHE
   * qu'en repère monde (`__probeGo`), et entre les deux il y a le côté
   * d'ouverture, la glissade du quai et la position de la rame. Plutôt que de
   * refaire cette chaîne dans chaque script de contrôle - et de se tromper une
   * fois sur deux -, on demande à la scène où elle a posé la chose.
   *
   *   __probeAnchor('konbini/porte')  → [[x, y, z], …]
   */
  w.__probeAnchor = (name: string) =>
    scene.getObjectsByProperty('name', name).map((o) => {
      const p = o.getWorldPosition(new THREE.Vector3());
      return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
    });

  // Origines des trémies, en repère MONDE. C'est le seul endroit du décor
  // qu'on ne peut pas juger depuis la rame - il faut y poser l'œil - et sa
  // position change d'une gare à l'autre.
  w.__probeStairs = () =>
    scene.getObjectsByProperty('name', 'trémie').map((o) => {
      const p = o.getWorldPosition(new THREE.Vector3());
      return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
    });

  // Se poser EN PLEINE VOIE, quartier choisi : l'état où l'on juge le décor.
  // Le quai est retiré, sinon il masque tout ce qu'on vient regarder.
  //
  // `phaseT` est réglable : la progression du trajet commande la hauteur des
  // murs de tranchée (`opensAtEnd`) et l'élévation de la ville. Pouvoir s'y
  // placer est indispensable pour juger un tronçon qui s'ouvre en fin de
  // course - regarder par la baie à p = 0,2 ne montre que le mur.
  w.__probeCruise = (i: number, phaseT = 8) => {
    const k = ((i % 30) + 30) % 30;
    // platformIndex aussi : c'est LUI qui choisit le tronçon (systems/segmentEnv
    // retient la gare quittée tant que son quai est visible). Sans ça, on
    // demandait Harajuku→Shibuya et on regardait le décor d'un autre tronçon.
    useStore.setState({ index: k, platformIndex: k, phase: 'cruise', doorSide: DOOR_SIDE[k] });
    runtime.phaseT = phaseT;
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
    // Où se tient le joueur, en repère QUAI : c'est le seul repère dans
    // lequel se lisent les cotes de gare (bord, limites de marche, mobilier).
    frame: runtime.playerFrame,
    platX: +runtime.playerPlatX.toFixed(2),
    platZ: +runtime.playerPlatZ.toFixed(2),
  });

  // Heure de Tokyo, en minutes depuis minuit. L'horloge avance ensuite d'une
  // minute par minute réelle : la valeur posée tient le temps d'une capture.
  w.__probeClock = (minutes: number) => {
    runtime.clockMin = ((minutes % 1440) + 1440) % 1440;
  };

  // Abscisse le long de la voie. Deux captures prises à la même distance
  // voient LES MÊMES cellules de ville : c'est la seule façon de comparer deux
  // saisons sur la même image plutôt que sur deux quartiers différents.
  w.__probeDistance = (m: number) => {
    runtime.distance = m;
  };

  // Temps qu'il fait, forcé. Le modèle (systems/weather) le reprendrait à la
  // prochaine image s'il tournait - d'où le gel de l'épisode, qui laisse la
  // valeur posée telle quelle.
  w.__probeWeather = (patch: Partial<typeof weather>) => {
    Object.assign(weather, patch);
    freezeWeather(true);
  };

  // Saison telle que le monde la voit : poids, phénomènes datés, palette de
  // feuillage. Une frondaison qui n'a pas la bonne couleur peut l'être parce
  // que le calendrier se trompe ou parce que le rendu ne la relit pas - les
  // deux se distinguent ici, et nulle part ailleurs.
  w.__probeSeason = () => seasonNow();

  // État des champs de précipitation : visibles ? combien d'instances ? quelles
  // valeurs d'uniformes ? Une pluie qu'on ne voit pas peut l'être pour six
  // raisons, et il faut pouvoir les distinguer sans deviner.
  w.__probeRain = () => {
    const out: Record<string, unknown>[] = [];
    scene.traverse((o) => {
      const kind = o.userData?.rainField;
      if (!kind || !(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      const geo = mesh.geometry as THREE.InstancedBufferGeometry;
      const mat = mesh.material as THREE.ShaderMaterial;
      out.push({
        kind,
        visible: mesh.visible,
        inScene: mesh.parent !== null,
        instances: geo.instanceCount,
        opacity: mat.uniforms.uOpacity?.value,
        cam: (mat.uniforms.uCam?.value as THREE.Vector3)?.toArray().map((v) => +v.toFixed(2)),
        vel: (mat.uniforms.uVel?.value as THREE.Vector3)?.toArray().map((v) => +v.toFixed(2)),
        size: (mat.uniforms.uSize?.value as THREE.Vector2)?.toArray(),
      });
    });
    return { weather: { ...weather }, fields: out };
  };

  /**
   * Ce qui EST DANS LE WAGON sans avoir rien à y faire.
   *
   * La sonde de volumes ne regarde que sous `gare` ; un décor de gare posé au
   * mauvais endroit se retrouve pourtant DANS la rame, et rien ne le dit. Ici
   * on balaie la scène entière et on retient tout maillage visible dont la
   * boîte englobante empiète sur le volume habitable d'une caisse - filiation
   * complète, pour pouvoir nommer l'intrus.
   */
  // Ce qui traîne dans la scène sans nom ni parent nommé : la sonde de la
  // phase 21 a trouvé un plan de 1 × 1 m à l'origine du monde, et il fallait
  // pouvoir remonter à sa source sans deviner.
  w.__probeStrays = () => {
    const out: Record<string, unknown>[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (mesh.name || mesh.parent?.name) return;
      const chain: string[] = [];
      for (let c: THREE.Object3D | null = mesh; c; c = c.parent) chain.unshift(c.name || `<${c.type}>`);
      const mat = mesh.material as THREE.Material & { color?: THREE.Color; map?: unknown };
      out.push({
        chain: chain.join('/'),
        geo: mesh.geometry.type,
        mat: mat?.type,
        visible: mesh.visible,
        pos: mesh.position.toArray(),
        color: mat?.color?.getHexString?.() ?? null,
        map: !!mat?.map,
        siblings: mesh.parent?.children.length ?? 0,
      });
    });
    return out;
  };

  /**
   * DEUX SURFACES DANS LE MÊME PLAN — le z-fighting, cherché et non deviné.
   *
   * Une bande grise qui clignote sur une paroi n'est pas un défaut de matière :
   * ce sont deux faces à la MÊME profondeur, que le tampon de profondeur
   * départage au hasard, d'une image à l'autre et d'un pixel à l'autre. Ça ne
   * se cherche pas à l'œil — le scintillement dépend de l'angle, de la
   * distance et de la précision du tampon, si bien qu'une capture peut très
   * bien ne rien montrer là où le défaut existe.
   *
   * Mais ça se CALCULE. `probeStation` cherche les volumes qui s'entrechoquent
   * et impose pour cela une pénétration d'au moins quatre centimètres ; le
   * z-fighting est l'exact contraire — une pénétration nulle, sur une grande
   * surface. Les deux sondes se partagent donc l'axe : celle-ci ne regarde que
   * l'intervalle où l'autre ne regarde rien.
   *
   * On ne retient que les surfaces PLATES : un objet mince porte ses deux
   * faces à la même profondeur, et c'est lui qui se bat avec la paroi où on
   * l'a posé. Deux pleins qui se touchent par une face, eux, ne montrent
   * chacun que la leur.
   */
  w.__probeFlat = (minArea = 0.25, eps = 0.004, thin = 0.06) => {
    const station = scene.getObjectByName('gare');
    if (!station) return [];
    const flats: Volume[] = [];
    for (const v of collect(station)) {
      // Une surface qui n'écrit pas la profondeur, ou qui porte déjà un
      // décalage de polygone, ne se dispute rien : la flaque de lumière du
      // kiosque est posée à trois millimètres du sol et le dit dans son
      // matériau. La rapporter serait rendre huit faux positifs à chaque
      // passage, et faire perdre à quelqu'un le tour que cette sonde existe
      // pour épargner.
      if (!v.fights) continue;
      const s = v.box.getSize(new THREE.Vector3());
      if (Math.min(s.x, s.y, s.z) > thin) continue;
      flats.push(v);
    }
    const out = new Map<string, Record<string, unknown>>();
    const sa = new THREE.Vector3();
    const sb = new THREE.Vector3();
    const ca = new THREE.Vector3();
    const cb = new THREE.Vector3();
    for (let i = 0; i < flats.length; i++) {
      for (let j = i + 1; j < flats.length; j++) {
        const a = flats[i];
        const b = flats[j];
        if (a.label === b.label) continue;
        a.box.getSize(sa);
        b.box.getSize(sb);
        a.box.getCenter(ca);
        b.box.getCenter(cb);
        const axes: ['x', 'y', 'z'][number][] = ['x', 'y', 'z'];
        for (const k of axes) {
          // Plates toutes deux sur cet axe, et à la même cote : même plan.
          if (sa[k] > thin || sb[k] > thin) continue;
          if (Math.abs(ca[k] - cb[k]) > eps) continue;
          const others = axes.filter((o) => o !== k);
          const laps = others.map((o) =>
            Math.min(a.box.max[o], b.box.max[o]) - Math.max(a.box.min[o], b.box.min[o]));
          if (laps.some((l) => l <= 0)) continue;
          const area = laps[0] * laps[1];
          if (area < minArea) continue;
          const key = [a.label, b.label].sort().join(' ✕ ');
          const cur = out.get(key);
          if (cur && (cur.area as number) >= area) continue;
          out.set(key, {
            pair: key,
            axis: k,
            at: +ca[k].toFixed(3),
            gap: +Math.abs(ca[k] - cb[k]).toFixed(4),
            area: +area.toFixed(2),
          });
        }
      }
    }
    return [...out.values()].sort((x, y) => (y.area as number) - (x.area as number));
  };

  w.__probeIntruders = (halfLen = 10, aisle = false) => {
    const car = aisle
      ? new THREE.Box3(new THREE.Vector3(-0.7, 0.06, -halfLen), new THREE.Vector3(0.7, 1.7, halfLen))
      : new THREE.Box3(new THREE.Vector3(-1.35, 0.05, -halfLen), new THREE.Vector3(1.35, 2.3, halfLen));
    const out: Record<string, unknown>[] = [];
    const bbox = new THREE.Box3();
    const m = new THREE.Matrix4();
    scene.updateWorldMatrix(true, true);
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      // Les corps ne sont pas des ouvrages : leur boîte est celle de la pose de
      // repos, et la foule qui monte est DANS le wagon par construction.
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      // NI LES NUÉES INSTANCIÉES. Une pluie, une neige, une volée de feuilles
      // sont un seul maillage dont la géométrie de BASE est un carré d'un mètre
      // à l'origine du monde : sa boîte englobante ne dit rien de l'endroit où
      // les instances tombent, et elle tombe pile dans le wagon. La sonde de la
      // phase 21 a signalé ce carré sur dix-neuf gares avant qu'on comprenne
      // qu'il ne s'agissait pas d'un ouvrage égaré.
      if ((mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return;
      // La rame elle-même, ses gens et leurs affaires sont chez eux - sauf
      // quand c'est justement L'ALLÉE qu'on inspecte : là, tout est suspect.
      if (!aisle) {
        for (let c: THREE.Object3D | null = mesh; c; c = c.parent) {
          if (c.name && /^(rame|wagon|voyageurs|joueur)$/.test(c.name)) return;
        }
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (!bb) return;
      const chain: string[] = [];
      for (let c: THREE.Object3D | null = mesh; c; c = c.parent) chain.unshift(c.name || `<${c.type}>`);
      const push = (box: THREE.Box3) => {
        if (!box.intersectsBox(car)) return;
        const c = box.getCenter(new THREE.Vector3());
        const s = box.getSize(new THREE.Vector3());
        const mat = mesh.material as THREE.MeshStandardMaterial;
        out.push({
          chain: chain.join('/'),
          at: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
          size: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)],
          color: mat?.color ? `#${mat.color.getHexString()}` : null,
        });
      };
      const im = mesh as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, m);
          m.premultiply(im.matrixWorld);
          push(bbox.copy(bb).applyMatrix4(m));
        }
        return;
      }
      push(bbox.copy(bb).applyMatrix4(mesh.matrixWorld));
    });
    return out;
  };

  /**
   * LES VOLUMES PRATICABLES DE LA GARE COURANTE, EN REPÈRE MONDE.
   *
   * Le relevé les donne dans le repère du quai ; les rendre utilisables demande
   * la bascule d'un demi-tour et le coulissement, que `systems/playerFrame` est
   * seul à connaître. Un script qui les referait aurait une chance sur deux de
   * se tromper de signe — et la liste gelée des lecteurs de `DOOR_SIDE`
   * (`tests/realismMigration`) est là pour que personne n'essaie.
   */
  w.__probeHalls = () => {
    const net = placementFor(useStore.getState().platformIndex, psdGates()).network;
    const at = { x: 0, z: 0 };
    // UNE PIÈCE, ET NON L'ENVELOPPE DE SON VOLUME. Un volume est le groupe de
    // pièces continues : son rectangle est leur BOÎTE ENGLOBANTE, et à Ueno
    // elle fait quatre-vingt-deux mètres de large pour deux couloirs qui n'en
    // occupent pas la moitié. Interrogée sur cette boîte-là, la sonde
    // dénonçait des bâtiments de ville posés dans du vide que la gare ne
    // réclame pas — trois signalements sur quatre étaient de ce genre.
    return shellsOf(net).flatMap((s) => s.rooms
      .filter((r) => r.walkable)
      .map((r) => {
        platformToWorld(r.rect.x0, r.rect.z0, at);
        const a = { x: at.x, z: at.z };
        platformToWorld(r.rect.x1, r.rect.z1, at);
        return {
          id: r.id,
          x0: Math.min(a.x, at.x),
          x1: Math.max(a.x, at.x),
          z0: Math.min(a.z, at.z),
          z1: Math.max(a.z, at.z),
          floorY: r.floorY,
          ceilY: s.ceilY,
        };
      }));
  };

  /**
   * CE QUI ENTRE DANS UN VOLUME QU'ON DONNE.
   *
   * `__probeIntruders` pose la même question, mais sa boîte est celle du wagon
   * et rien d'autre. Depuis qu'on MARCHE dans les gares, la boîte qui compte
   * est celle d'un hall : treize gares portent un plateau praticable au-dessus
   * des voies, et le quai avait déjà des ouvrages à cette hauteur-là — auvent,
   * diffuseurs, bannières, toiture de hub. Les chercher un par un en regardant
   * des captures a coûté trois tours ; les DEMANDER coûte un appel.
   *
   *   __probeIn([-60, 5.08, 19.7], [51, 8.17, 52])
   *
   * Le hall lui-même est exclu de la réponse : ce qu'on cherche est ce qui
   * n'a rien à y faire, et le sol, les parois et le mobilier du hall y sont
   * chez eux. `keep` donne le segment de filiation qui les désigne.
   */
  w.__probeIn = (min: number[], max: number[], keep = 'gare/hall') => {
    const box = new THREE.Box3(
      new THREE.Vector3(min[0], min[1], min[2]),
      new THREE.Vector3(max[0], max[1], max[2]),
    );
    const seen = new Map<string, Record<string, unknown>>();
    const bbox = new THREE.Box3();
    const m = new THREE.Matrix4();
    scene.updateWorldMatrix(true, true);
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      if ((mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return;
      const chain: string[] = [];
      for (let c: THREE.Object3D | null = mesh; c; c = c.parent) {
        // Les groupes du hall portent un nom À CHEMIN — « gare/hall/mobilier »,
        // « gare/hall/portillons » —, d'où le préfixe et non l'égalité.
        if (c.name.startsWith(keep)) return;
        // ET LES GENS NE SONT PAS DES OUVRAGES, ici comme dans `collect`. Le
        // filtre `isSkinnedMesh` plus haut écarte les CORPS ; il n'écarte pas
        // ce qu'ils portent, qui est fait de maillages ordinaires accrochés à
        // des groupes suiveurs. Depuis que la foule descend dans le hall, ces
        // accessoires-là formaient à eux seuls la moitié du rapport : un sac à
        // dos de vingt-trois centimètres, la même bandoulière et le même
        // masque, sur douze gares — pris pour « un objet de décor de ville
        // répété » alors que c'étaient douze voyageurs en train de marcher.
        if (c.name === CROWD_GROUP) return;
        chain.unshift(c.name || `<${c.type}>`);
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (!bb) return;
      // NI LES FONDS. Un dôme de ciel, une nappe de ville, un plan de tronçon
      // englobent tout : leur boîte croise n'importe quel volume sans que rien
      // n'entre nulle part.
      const span = bb.max.clone().sub(bb.min);
      if ([span.x, span.y, span.z].filter((v) => v > 150).length >= 2) return;
      const key = chain.join('/');
      // UNE FILIATION ANONYME NE NOMME RIEN. « <Scene>/<Group>/<Group>/<Mesh> »
      // se répète sur douze gares sans qu'on sache de quoi il s'agit, et l'on
      // ne pousse pas ce qu'on n'a pas nommé. Ce qui distingue un ouvrage,
      // quand son groupe n'a pas de nom, c'est sa GÉOMÉTRIE et sa TEINTE : deux
      // meshes qui partagent type, cotes et couleur sont le même objet répété.
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
        THREE.Material & { color?: THREE.Color };
      const trait = {
        geo: mesh.geometry.type,
        color: mat?.color?.getHexString?.() ?? null,
        size: [+span.x.toFixed(2), +span.y.toFixed(2), +span.z.toFixed(2)],
      };
      const push = (b: THREE.Box3) => {
        if (!b.intersectsBox(box)) return;
        // On garde LA PIRE des instances, et une seule ligne par ouvrage : une
        // rangée de trente diffuseurs est un seul défaut, pas trente.
        const over = Math.min(b.max.y, box.max.y) - Math.max(b.min.y, box.min.y);
        // UN CONTACT N'EST PAS UNE INTRUSION. La sous-face de la dalle de quai
        // EST le plafond du hall souterrain, et la nappe de ballast affleure le
        // sol de onze gares : les deux se touchent par une face, comme prévu.
        if (over <= 0.01) return;
        const cur = seen.get(key);
        if (cur && (cur.over as number) >= over) return;
        seen.set(key, {
          chain: key,
          over: +over.toFixed(3),
          box: [
            +b.min.x.toFixed(1), +b.min.y.toFixed(2), +b.min.z.toFixed(1),
            +b.max.x.toFixed(1), +b.max.y.toFixed(2), +b.max.z.toFixed(1),
          ],
          ...trait,
        });
      };
      const im = mesh as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, m);
          m.premultiply(im.matrixWorld);
          push(bbox.copy(bb).applyMatrix4(m));
        }
        return;
      }
      push(bbox.copy(bb).applyMatrix4(mesh.matrixWorld));
    });
    return [...seen.values()].sort((a, b) => (b.over as number) - (a.over as number));
  };

  // Date civile à Tokyo : c'est elle qui donne la saison (systems/season) et,
  // à travers elle, la couleur des frondaisons, la hauteur du soleil et
  // l'heure à laquelle la nuit tombe.
  w.__probeDate = (month: number, day: number) => {
    const d = runtime.tokyoDate;
    const utc = new Date(Date.UTC(d.year, month - 1, day));
    runtime.tokyoDate = {
      year: d.year,
      month,
      day,
      weekday: utc.getUTCDay(),
    };
  };
}
