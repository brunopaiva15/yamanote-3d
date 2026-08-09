// Page de probe DEV (voir /prop-probe.html) : juxtapose - ou superpose - un
// objet tenu en main PROCÉDURAL et un maillage candidat posé dans
// public/models/raw/ (hors dépôt, comme la maquette de wagon du car-probe).
//
// POURQUOI UNE SONDE À PART. Le car-probe arbitre un wagon : on y entre, on
// recule de trois mètres, on juge une paroi. Un objet tenu en main ne se juge
// pas comme ça. Il est à HUIT CENTIMÈTRES du champ utile et à quatre-vingts du
// nez (`HOLD` fait 0,79 m de long), il occupe un sixième de l'image, et c'est
// le seul maillage du jeu qu'on regarde de si près. Une amélioration qui ne se
// voit pas À CETTE DISTANCE-LÀ n'existe pas : la sonde plante donc la caméra
// exactement là où l'œil du joueur se trouve, même champ (70°), même éclairage
// de wagon, et refuse par construction la vue de trois-quarts à vingt
// centimètres qui flatte n'importe quel maillage.
//
// CE QU'ELLE NE FAIT PAS. Elle ne juge pas une texture au sens du jeu : les
// étiquettes des produits sont des teintes à plat (`tone`, `ink`), pas des
// impressions. Un candidat qui l'emporte grâce à un emballage photoréaliste
// n'a rien prouvé - il aura seulement changé de langue. D'où les styles
// `ghost` et `wire` : c'est la SILHOUETTE qu'on vient chercher.
//
//   /prop-probe.html?id=monaka&file=monaka.glb
//   /prop-probe.html?id=shoyu&mode=over&style=wire
//   R : candidat · P : procédural · S : texture / fantôme / fil de fer
//   T : rotation lente · ESPACE : distance de la main ↔ recul d'examen

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../data/config';
import { runtime } from '../systems/runtime';
import { Scene } from '../three/Scene';
import { Car } from '../three/Car';
import { Vessel } from '../three/HeldItem';
import { productById, type Product } from '../data/products';

type RefStyle = 'texture' | 'ghost' | 'wire';
const STYLES: RefStyle[] = ['texture', 'ghost', 'wire'];

const q = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => {
  const v = parseFloat(q.get(key) ?? '');
  return Number.isFinite(v) ? v : fallback;
};

/**
 * La distance de la main, mesurée sur `HOLD` de three/HeldItem.
 *
 * C'est la seule cote qui compte ici, et elle n'est pas ronde : l'objet est
 * porté à 36 cm sur la droite, 34 sous l'œil et 62 devant, ce qui met son
 * centre à soixante-dix-neuf centimètres. Juger un candidat à un demi-mètre
 * reviendrait à le grandir d'un tiers.
 */
const HAND_DISTANCE = 0.793;
/** Le recul d'examen : deux fois la main, pour voir les deux objets d'un coup. */
const STEP_BACK = 1.6;

/** Écartement des deux objets en vis-à-vis, côte à côte. */
const SPREAD = 0.085;

const REF_DIR = 'models/raw/';

// Heure du monde : pilote le fondu jour / nuit de three/Scene.tsx, et donc la
// lumière qui tombe sur l'objet. ?h=21 pour juger sous les néons seuls.
runtime.clockMin = num('h', CONFIG.clockStart / 60) * 60;

interface Cotes {
  /** Largeur, hauteur, profondeur en centimètres. */
  w: number;
  h: number;
  d: number;
  tris: number;
}

/**
 * La boîte englobante dans le repère du PARENT, et non du monde.
 *
 * `Box3.setFromObject` rend toujours une boîte en coordonnées monde. S'en
 * servir pour écrire une `position` - qui, elle, est locale - revient à
 * retrancher deux fois la place du groupe de placement : le candidat partait
 * au plancher du wagon, hors du cadre, avec l'air de ne pas s'être chargé.
 * Repasser la boîte par l'inverse du parent remet les deux dans la même langue.
 */
function localBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const parent = root.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    box.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
  }
  return box;
}

function cotesOf(root: THREE.Object3D): Cotes {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let tris = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const index = mesh.geometry.getIndex();
    const position = mesh.geometry.getAttribute('position');
    tris += (index ? index.count : (position?.count ?? 0)) / 3;
  });
  return { w: size.x * 100, h: size.y * 100, d: size.z * 100, tris: Math.round(tris) };
}

/**
 * Normalise le candidat : à l'échelle du jeu, base au sol, centré.
 *
 * Un export d'IA arrive dans SON unité et dans SON repère - le plus souvent
 * une boîte unitaire centrée sur l'origine, parfois debout, parfois couchée.
 * Rien de tout ça ne se règle dans un modeleur ici : la sonde mesure la boîte
 * englobante et la ramène sur la hauteur du procédural (`?fit`, par défaut la
 * hauteur mesurée de l'objet du jeu), puis pose le bas à y = 0 comme le fait
 * toute géométrie de `Vessel`. `?scale` court-circuite l'ajustement quand on
 * veut justement voir de combien le candidat se trompe de taille.
 *
 * Le recentrage écrit dans `position`, et c'est pour ça que le candidat est
 * monté dans un groupe de placement au lieu de porter lui-même sa position :
 * les deux se seraient écrasés l'un l'autre - l'objet partait au sol, hors du
 * cadre, avec l'air de ne pas s'être chargé.
 */
function normalize(root: THREE.Object3D, targetHeight: number, forced: number): number {
  root.position.set(0, 0, 0);
  root.rotation.set(num('rx', 0), num('ry', 0), num('rz', 0));
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  const size = localBox(root).getSize(new THREE.Vector3());
  // Sans cible utilisable - produit inconnu, procédural masqué - on laisse le
  // candidat à SON échelle. Le ramener à zéro le ferait disparaître en silence,
  // ce qui se lit comme un maillage qui ne charge pas.
  const fitted = targetHeight > 1e-6 && size.y > 1e-6 ? targetHeight / size.y : 1;
  const scale = forced > 0 ? forced : fitted;
  root.scale.setScalar(scale);

  const scaled = localBox(root);
  const centre = scaled.getCenter(new THREE.Vector3());
  root.position.set(-centre.x, -scaled.min.y + num('dy', 0), -centre.z);
  return scale;
}

function applyStyle(
  root: THREE.Object3D,
  style: RefStyle,
  originals: Map<string, THREE.Material | THREE.Material[]>,
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!originals.has(mesh.uuid)) originals.set(mesh.uuid, mesh.material);
    if (style === 'texture') {
      const original = originals.get(mesh.uuid);
      if (original) mesh.material = original;
      return;
    }
    mesh.material = new THREE.MeshStandardMaterial({
      color: '#ff4f9d',
      roughness: 0.9,
      transparent: style === 'ghost',
      opacity: style === 'ghost' ? 0.35 : 1,
      depthWrite: style !== 'ghost',
      wireframe: style === 'wire',
    });
  });
}

/**
 * Le socle tournant.
 *
 * Une silhouette ne se juge pas de face : c'est en tournant qu'on voit qu'un
 * maillage génératif est plat derrière, ou qu'il porte un fond qui n'existe
 * pas. Un tour en vingt secondes - assez lent pour qu'on suive une arête.
 */
function Turntable({ on, children }: { on: boolean; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (group.current && on) group.current.rotation.y += dt * 0.31;
  });
  return <group ref={group}>{children}</group>;
}

/**
 * Mesure les cotes du procédural une fois monté : c'est lui la référence.
 *
 * `token` porte l'état qui change la géométrie (le produit, les gorgées,
 * l'ouverture) et RIEN d'autre. Dépendre des `children` paraissait plus direct
 * et ne l'était pas : l'élément React est recréé à chaque image, la mesure
 * repartait donc à chaque image, et l'état qu'elle repose relançait le rendu -
 * une boucle qui tourne sans qu'on la voie.
 */
function Measured({
  token,
  onMeasure,
  children,
}: {
  token: string;
  onMeasure: (c: Cotes) => void;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    if (group.current) onMeasure(cotesOf(group.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return <group ref={group}>{children}</group>;
}

export function PropProbe() {
  const [candidate, setCandidate] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRef, setShowRef] = useState(q.get('ref') !== '0');
  const [showProc, setShowProc] = useState(q.get('proc') !== '0');
  const [style, setStyle] = useState<RefStyle>((q.get('style') as RefStyle) ?? 'texture');
  const [turning, setTurning] = useState(q.get('turn') === '1');
  const [close, setClose] = useState(q.get('far') !== '1');
  const [procCotes, setProcCotes] = useState<Cotes | null>(null);
  const [refCotes, setRefCotes] = useState<Cotes | null>(null);
  const [scaleUsed, setScaleUsed] = useState(1);
  const originals = useMemo(() => new Map<string, THREE.Material | THREE.Material[]>(), []);

  const over = q.get('mode') === 'over';
  const file = q.get('file') ?? 'prop.glb';
  const productId = q.get('id') ?? 'monaka';
  const product: Product | null = useMemo(() => productById(productId), [productId]);
  const held = useMemo(
    () =>
      product
        ? {
            sips: Math.round(num('sips', product.sips)),
            maxSips: product.sips,
            opened: q.get('opened') === '1',
          }
        : null,
    [product],
  );

  useEffect(() => {
    let cancelled = false;
    new GLTFLoader().load(
      REF_DIR + file,
      (gltf) => {
        if (cancelled) return;
        setCandidate(gltf.scene);
      },
      undefined,
      () => {
        if (!cancelled) setError(`Candidat introuvable : public/${REF_DIR}${file}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  // La normalisation attend les cotes du procédural : c'est sa hauteur qui sert
  // de cible. Les cotes du candidat se relèvent DANS LA FOULÉE - mesurées
  // ailleurs, elles auraient rendu la boîte d'avant la mise à l'échelle.
  useEffect(() => {
    if (!candidate) return;
    const target = num('fit', procCotes ? procCotes.h / 100 : 0);
    setScaleUsed(normalize(candidate, target, num('scale', 0)));
    setRefCotes(cotesOf(candidate));
  }, [candidate, procCotes]);

  useEffect(() => {
    if (candidate) applyStyle(candidate, style, originals);
  }, [candidate, style, originals]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r') setShowRef((v) => !v);
      else if (e.key === 'p') setShowProc((v) => !v);
      else if (e.key === 's') setStyle((v) => STYLES[(STYLES.indexOf(v) + 1) % STYLES.length]);
      else if (e.key === 't') setTurning((v) => !v);
      else if (e.code === 'Space') {
        e.preventDefault();
        setClose((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Les deux objets sont posés dans le wagon, à hauteur de main, de part et
  // d'autre de l'axe du regard. La caméra recule d'autant qu'il faut pour que
  // l'objet occupe la place qu'il occupe VRAIMENT dans le champ.
  const y = CONFIG.eyeHeight - 0.34;
  const distance = close ? HAND_DISTANCE : STEP_BACK;
  const dx = over ? 0 : SPREAD;

  const cm = (c: Cotes | null) => (c ? `${c.w.toFixed(1)} × ${c.h.toFixed(1)} × ${c.d.toFixed(1)} cm` : '…');

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 70, near: 0.02, far: 120, position: [0, y, distance] }}
        shadows
      >
        <Scene />
        {/* La caisse, pour l'éclairage et pour le fond. Les néons du wagon
            viennent de `Scene`, mais un objet de dix centimètres jugé sur fond
            de ciel n'a ni la paroi claire derrière lui ni la moquette dessous -
            c'est-à-dire rien de ce qui décide de sa lisibilité en jeu. ?car=0
            le retire quand on ne veut plus que la silhouette. */}
        {q.get('car') !== '0' && <Car />}
        <Turntable on={turning}>
          {showProc && product && held && (
            <group position={[-dx, y - 0.055, 0]}>
              <Measured token={`${product.id}:${held.sips}:${held.opened}`} onMeasure={setProcCotes}>
                <Vessel product={product} held={held} />
              </Measured>
            </group>
          )}
          {showRef && candidate && (
            <group position={[dx, y - 0.055, 0]}>
              <primitive object={candidate} />
            </group>
          )}
        </Turntable>
        <OrbitControls target={[0, y, 0]} makeDefault />
      </Canvas>
      <div className="probe-hud">
        <b>prop-probe</b> - <kbd>R</kbd> candidat {showRef ? 'on' : 'off'} · <kbd>P</kbd> procédural{' '}
        {showProc ? 'on' : 'off'} · <kbd>S</kbd> style {style} · <kbd>T</kbd> rotation{' '}
        {turning ? 'on' : 'off'} · <kbd>espace</kbd> {close ? 'distance de la main' : 'recul'}
        <br />
        {product ? (
          <>
            <b>{product.jp}</b> ({product.romaji}, forme <code>{product.shape}</code>)
          </>
        ) : (
          <span className="probe-error">produit inconnu : {productId}</span>
        )}
        <br />
        procédural {cm(procCotes)} · {procCotes?.tris ?? '…'} triangles
        <br />
        candidat {cm(refCotes)} · {refCotes?.tris ?? '…'} triangles · échelle ×
        {scaleUsed.toExponential(2)}
        {error && <div className="probe-error">{error}</div>}
      </div>
    </>
  );
}
