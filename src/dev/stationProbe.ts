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
import { holdTrain } from '../systems/stationCycle';
import { psdGates } from '../three/station/psdLayout';
import { freezeWeather, weather } from '../systems/weather';
import { seasonNow } from '../systems/season';
import { clearing } from '../systems/cityField';
import { expressway, singularity } from '../systems/singularity';

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
    const it = p.interior;
    const stair = p.mainStair;
    const wide = it.gate.passages[it.gate.passages.length - 1];
    const midX = (it.paid.x0 + it.paid.x1) / 2;
    const point = (x: number, z: number) => [flip * x, flip * z];
    // Où l'on se met, et ce qu'on regarde : les deux, sinon on se retrouve le
    // nez sur le meuble qu'on voulait cadrer.
    const legs: [string, number, number, number, number][] = [
      ['01-tremie', ...point(stair.x, stair.z - 3), ...point(stair.x, stair.z + 6)],
      ['02-couloir', ...point(stair.x, stair.z + 8), ...point(midX, it.paid.z1)],
      ['03-zone-payante', ...point(midX, it.paid.z0 + 3), ...point(it.paid.x1, it.paid.z1 - 2)],
      ['04-portillon', ...point(wide.x, it.paid.z1 - 3), ...point(wide.x, it.free.z0 + 4)],
      ['05-zone-libre', ...point(midX, it.free.z0 + 2.5), ...point(it.free.x1, it.free.z0 + 9)],
      ['06-billetterie', ...point(midX, it.free.z0 + 8), ...point(it.free.x0, it.free.z0 + 5)],
      ['07-sorties', ...point(midX, it.free.z1 - 7), ...point(midX, it.free.z1 + 4)],
    ].map((r) => r as [string, number, number, number, number]);
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
  //
  // LE SENS DE MARCHE SE FIXE ICI AUSSI, et il faut le savoir : la boucle en
  // tire un tronçon DIFFÉRENT pour un même index (`segmentAt`). Le sens est
  // pourtant tiré au sort à l'embarquement - une capture demandée à Tabata→
  // Komagome montrait donc la tranchée de Komagome→Sugamo une fois sur deux,
  // sans un mot pour le dire.
  w.__probeCruise = (i: number, phaseT = 8, dir?: 'inner' | 'outer') => {
    const k = ((i % 30) + 30) % 30;
    // platformIndex aussi : c'est LUI qui choisit le tronçon (systems/segmentEnv
    // retient la gare quittée tant que son quai est visible). Sans ça, on
    // demandait Harajuku→Shibuya et on regardait le décor d'un autre tronçon.
    useStore.setState({
      index: k,
      platformIndex: k,
      phase: 'cruise',
      doorSide: DOOR_SIDE[k],
      ...(dir ? { loopDirection: dir } : {}),
    });
    runtime.phaseT = phaseT;
    runtime.platformFade = 0;
    runtime.platformSlide = 0;
  };

  /**
   * Ce que le ruban urbain rend VRAIMENT, famille par famille.
   *
   * Une ville qui ne montre pas ce qu'on croit y avoir mis peut l'être pour
   * trois raisons : le générateur n'en produit pas, le rendu ne les écrit pas,
   * ou le nuanceur ne les distingue pas. Sans mesure, on corrige la mauvaise.
   * D'où ce relevé, pris sur le graphe tel qu'il est rendu : par famille, le
   * nombre d'emplacements, ceux qui sont réellement pourvus (une instance
   * escamotée a une matrice mise à zéro), et la part portant la façade à
   * coursive.
   *
   *   __probeCity()  → [{ famille, emplacements, posées, coursives }, …]
   */
  w.__probeCity = () => {
    const out: Record<string, unknown>[] = [];
    const m = new THREE.Matrix4();
    scene.traverse((o) => {
      const family = o.userData?.cityFamily;
      if (!family) return;
      const im = o as THREE.InstancedMesh;
      let placed = 0;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        // Une instance escamotée a une échelle nulle : sa première colonne l'est.
        if (m.elements[0] !== 0 || m.elements[1] !== 0 || m.elements[2] !== 0) placed++;
      }
      const fac = (im.geometry.attributes.aFacade as THREE.BufferAttribute | undefined)?.array;
      let balcony = 0;
      if (fac) for (let i = 0; i < im.count; i++) if (fac[i] > 0.5) balcony++;
      out.push({ famille: family, emplacements: im.count, posées: placed, coursives: balcony });
    });
    return out;
  };

  /**
   * L'horizon géographique, tel qu'il est POSÉ.
   *
   * Un relèvement se juge en degrés, pas à l'œil : une capture ne dit pas si le
   * Skytree est à quarante-deux degrés sur la droite ou à cinquante-huit, et
   * c'est pourtant la seule chose que cette couche promet. La sonde relit donc
   * la position des découpes dans la scène - et non le calcul qui les a posées -
   * pour en redéduire l'écart au sens de marche, la distance qu'implique leur
   * taille angulaire, et leur hauteur apparente en degrés.
   *
   *   __probeHorizon()  → [{ repère, relèvement, hauteur, visible }, …]
   */
  w.__probeHorizon = () => {
    const out: Record<string, unknown>[] = [];
    scene.traverse((o) => {
      if (!o.name.startsWith('horizon ')) return;
      const mesh = o as THREE.Mesh;
      const az = (Math.atan2(mesh.position.x, -mesh.position.z) * 180) / Math.PI;
      const r = Math.hypot(mesh.position.x, mesh.position.z);
      out.push({
        repère: o.name.slice(8),
        // Positif = à droite du sens de marche, comme dans systems/tokyoBearing.
        relèvement: +az.toFixed(1),
        hauteur: +((Math.atan(mesh.scale.y / r) * 180) / Math.PI).toFixed(2),
        visible: mesh.visible,
        teinte: `#${(mesh.material as THREE.MeshBasicMaterial).color.getHexString()}`,
      });
    });
    return out.sort((a, b) => (a.relèvement as number) - (b.relèvement as number));
  };

  /**
   * Les singularités de la ligne, et le moyen de s'arrêter devant.
   *
   * Elles n'arrivent chacune qu'une fois par tour, au milieu d'un inter-gare
   * précis : les attendre à l'œil demanderait de rouler une heure. Appelée avec
   * une distance, la sonde POSE la rame à tant de mètres en amont de l'ouvrage -
   * l'ancrage, lui, ne bouge pas (il est calé sur la gare quittée, voir
   * systems/singularity), si bien que la trouée reste où elle est et que la
   * ville n'est pas rebâtie.
   *
   * Sur un tronçon longé par le 首都高 il n'y a pas d'ouvrage ponctuel à viser :
   * la distance demandée compte alors depuis le DÉBUT du tablier, ce qui permet
   * de se placer dessous plutôt que de le regarder de loin.
   *
   *   __probeSingularity()      → ce qui est posé, et à quelle distance
   *   __probeSingularity(120)   → s'arrêter cent vingt mètres avant
   */
  w.__probeSingularity = (ahead?: number) => {
    if (ahead !== undefined) {
      if (singularity.kind) runtime.distance = singularity.s - ahead;
      else if (expressway.on) runtime.distance = expressway.s0 + ahead;
    }
    return {
      nature: singularity.kind,
      devant: +(singularity.s - runtime.distance).toFixed(1),
      trame: +((singularity.yaw * 180) / Math.PI).toFixed(1),
      largeur: singularity.w,
      trouée: +clearing.half.toFixed(1),
      autoroute: expressway.on
        ? {
            côté: expressway.side,
            début: +(expressway.s0 - runtime.distance).toFixed(1),
            fin: +(expressway.s1 - runtime.distance).toFixed(1),
          }
        : null,
    };
  };

  // Effacer la rame pour ne juger que le paysage.
  //
  // De l'intérieur, la ville se regarde par une baie : le montant, la banquette
  // et les poignées mangent les trois quarts de l'image, et c'est la condition
  // RÉELLE - on ne juge pas un décor sur une vue qu'aucun voyageur n'a jamais.
  // Mais on n'y voit pas assez pour arbitrer une trame, une couche lointaine ou
  // une ligne de toits. D'où cette bascule, qui n'existe qu'en développement :
  // la caisse disparaît, le regard porte, et le paysage se juge en plein cadre.
  w.__probeBare = (on = true) => {
    const rame = scene.getObjectByName('rame');
    if (rame) rame.visible = !on;
    return !!rame;
  };

  /**
   * Effacer la ville procédurale, comme `__probeBare` efface la rame.
   *
   * Le ruban urbain est opaque et il masque - à juste titre - le pied et
   * souvent le tronc des repères lointains : depuis une baie, on ne voit le
   * Skytree que dans une trouée, et c'est bien ce qui se passe dans le vrai
   * train. Reste qu'un relèvement ne se juge pas sur ce qui n'est pas peint.
   * Cette bascule retire les familles du ruban le temps d'une capture, et ne
   * laisse que le ciel et l'horizon géographique.
   *
   * Elle passe par les CALQUES et non par `visible` : plusieurs familles
   * rétablissent leur visibilité à chaque image - les feux d'obstacle selon
   * l'heure, les poteaux selon la couverture PLATEAU - et reviendraient donc
   * avant la capture. Personne ne touche aux calques ailleurs dans le jeu.
   */
  w.__probeNoCity = (on = true) => {
    let n = 0;
    scene.traverse((o) => {
      if (!o.userData?.cityFamily) return;
      if (on) o.layers.disableAll();
      else o.layers.enable(0);
      n++;
    });
    return n;
  };

  // État courant : de quoi diagnostiquer une capture qui ne montre pas ce
  // qu'on croyait avoir demandé.
  w.__probeState = () => ({
    clockMin: Math.round(runtime.clockMin),
    index: useStore.getState().index,
    phase: useStore.getState().phase,
    // Le sens de marche : il est tiré au sort à l'embarquement, et c'est lui qui
    // décide quel TRONÇON se traverse pour un index donné (data/segments).
    dir: useStore.getState().loopDirection,
    platformFade: +runtime.platformFade.toFixed(2),
    distance: Math.round(runtime.distance),
    // Où porte le regard : l'écart au sens de marche, en degrés, positif vers la
    // droite. Un script qui vise à l'aveugle ne peut pas savoir s'il a tourné.
    regard: +((Math.atan2(runtime.lookX, -runtime.lookZ) * 180) / Math.PI).toFixed(1),
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

  // Retenir la rame là où elle est (voir systems/stationCycle). Nécessaire dès
  // qu'on cadre un OUVRAGE et non un paysage : sous SwiftShader une image coûte
  // une seconde, et vingt-cinq mètres de voie passent entre la pose et la
  // capture.
  w.__probeHold = (on = true) => {
    holdTrain(on);
    return on;
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
