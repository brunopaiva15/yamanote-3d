// Page de probe DEV : regarde le monde PLATEAU produit par le pipeline, seul,
// hors du wagon et hors du décor procédural.
//
// C'est l'outil qui répond à la question « la géométrie exportée est-elle
// correcte ? » sans que le mur de soutènement du tronçon, l'intérieur de la
// rame ou la brume viennent brouiller le jugement. Il charge exactement les
// mêmes fichiers que le jeu : public/world/plateau/manifest.json, route.json
// et les GLB de chunks, placés par leur `offset`.
//
//   /plateau-probe.html                → vue oblique de tout le tronçon
//   /plateau-probe.html?s=650          → œil du conducteur à l'abscisse 650 m
//   /plateau-probe.html?s=650&eye=1.55 → hauteur d'œil personnalisée
//
// Rendu déterministe : le probe ne s'anime pas, il dessine une image et
// l'annonce (window.__plateauProbeReady) pour permettre une capture fiable.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { sampleRoute, type RouteData, type RouteSample } from '../three/plateau/routeMath.ts';

interface Manifest {
  prototype: { name: string; from: string; to: string; segment: number };
  chunks: { id: string; url: string; offset: [number, number, number]; fileSize: number }[];
  source: { name: string; synthetic?: boolean };
}

const params = new URLSearchParams(location.search);
const hud = document.querySelector('.probe-hud') as HTMLElement | null;
const say = (html: string) => {
  if (hud) hud.innerHTML = html;
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
document.getElementById('root')?.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bcdaee');
scene.fog = new THREE.Fog('#d6e8f2', 60, 900);
scene.add(new THREE.AmbientLight('#e9f1f5', 0.9));
scene.add(new THREE.HemisphereLight('#cfe6f6', '#8d9088', 0.9));
const sun = new THREE.DirectionalLight('#fff6e4', 2.0);
sun.position.set(260, 300, -160);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 4000);

async function main() {
  const base = import.meta.env.BASE_URL;
  const [manifest, route] = await Promise.all([
    fetch(`${base}world/plateau/manifest.json`).then((r) => r.json() as Promise<Manifest>),
    fetch(`${base}world/plateau/route.json`).then((r) => r.json() as Promise<RouteData>),
  ]);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const world = new THREE.Group();
  scene.add(world);

  let triangles = 0;
  let bytes = 0;
  for (const chunk of manifest.chunks) {
    const gltf = await loader.loadAsync(`${base}${chunk.url}`);
    gltf.scene.position.fromArray(chunk.offset);
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const index = mesh.geometry.getIndex();
      triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;
    });
    bytes += chunk.fileSize;
    world.add(gltf.scene);
  }

  // Le tracé lui-même, en rouge : c'est le seul moyen de voir d'un coup d'œil
  // si la ville est bien répartie de part et d'autre de la voie.
  const trace = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      route.points.map((p) => new THREE.Vector3(p.x, p.y + 0.5, p.z)),
    ),
    new THREE.LineBasicMaterial({ color: '#e03a2f' }),
  );
  world.add(trace);

  const at = params.get('s');
  const out: RouteSample = { x: 0, y: 0, z: 0, yaw: 0 };
  if (at !== null) {
    // Vue « œil du conducteur » : la caméra prend exactement la place et le
    // cap que le jeu donne au train à cette abscisse.
    const s = Number(at);
    const eye = Number(params.get('eye') ?? 2.5);
    sampleRoute(route.points, s, out);
    camera.position.set(out.x, out.y + eye, out.z);
    camera.rotation.set(0, out.yaw, 0);
    scene.fog = new THREE.Fog('#d6e8f2', 30, 400);
  } else {
    // Vue d'ensemble oblique : tout le tronçon d'un seul regard.
    const box = new THREE.Box3().setFromObject(world);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    camera.position.set(center.x + span * 0.55, center.y + span * 0.5, center.z + span * 0.75);
    camera.lookAt(center);
    scene.fog = null;
  }

  renderer.render(scene, camera);
  say(
    `<b>${manifest.prototype.from} → ${manifest.prototype.to}</b> (segment ${manifest.prototype.segment})<br>` +
      `${manifest.chunks.length} chunks · ${Math.round(triangles)} triangles · ${(bytes / 1024).toFixed(0)} Ko<br>` +
      `tracé ${route.totalLength.toFixed(1)} m · ${route.points.length} points<br>` +
      `source : ${manifest.source.name}` +
      (at !== null ? `<br>œil à s = ${Number(at).toFixed(0)} m, cap ${((out.yaw * 180) / Math.PI).toFixed(1)}°` : ''),
  );
  (window as unknown as Record<string, unknown>).__plateauProbeReady = true;
}

main().catch((err) => {
  say(`<span class="probe-error">Échec : ${err.message}</span><br>Lancez d'abord <code>npm run world:build:prototype</code>.`);
  console.error(err);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.render(scene, camera);
});
