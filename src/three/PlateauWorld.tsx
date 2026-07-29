// Monde géoréférencé PLATEAU — prototype, un tronçon à la fois.
//
// Le tronçon couvert est celui de PLATEAU_SEGMENT (systems/plateau.ts), qui
// doit correspondre à celui du monde publié — la validation du build le
// vérifie. Par défaut : Shibuya → Ebisu, en viaduc.
//
// PRINCIPE
// --------
// Les chunks GLB sont des morceaux de ville RÉELLEMENT géoréférencés : leurs
// sommets vivent dans le repère local du tronçon (voir le manifeste), pas
// dans celui du wagon. Le wagon, lui, reste à l'origine comme partout ailleurs
// dans le jeu. On applique donc au groupe qui porte les chunks l'INVERSE de la
// transformation du train sur le tracé :
//
//     trainMatrix.compose(position, rotation, unitaire)
//     worldMatrix.copy(trainMatrix).invert()
//
// Le décor tourne alors autour du wagon dans les courbes, au lieu de défiler en
// ligne droite — ce qui est tout l'intérêt d'avoir des bâtiments géolocalisés.
//
// PROGRESSION
// -----------
// L'abscisse sur le tracé ne vient pas d'une interpolation linéaire en temps :
// elle suit la DISTANCE réellement parcourue par la rame, obtenue avec le
// profil de traction/freinage de systems/trainPhysics — le même qui pilote le
// train. Sans cela, la ville défilerait à vitesse constante pendant que le
// train accélère encore. La distance est normalisée par la longueur totale du
// trajet simulé, de sorte que progression 0 = début du tronçon et
// progression 1 = fin, quelle que soit la durée réelle du parcours.
//
// COÛT
// ----
// Aucune ombre portée (ni projetée ni reçue), aucun matériau transparent,
// frustum culling actif, fenêtre de chunks bornée. Voir
// docs/PLATEAU_PIPELINE.md § Performances.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { cruiseDuration, journeyDuration, phaseBase, segmentAt } from '../data/segments';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';
import { phaseTarget, stepTrain } from '../systems/trainPhysics';
import {
  PLATEAU_SETTINGS,
  plateauCoversSegment,
  plateauEnabled,
  plateauRuntime,
} from '../systems/plateau';
import {
  integrateJourney,
  progressToDistance,
  sameSelection,
  sampleRoute,
  selectChunks,
  type PlateauChunkDefinition,
  type RouteData,
  type RouteSample,
  type SpeedProfile,
} from './plateau/routeMath.ts';

interface Manifest {
  version: number;
  prototype: { segment: number; name: string };
  chunks: PlateauChunkDefinition[];
}

const BASE = import.meta.env.BASE_URL;

/**
 * Profil de vitesse du tronçon : le même intégrateur que le cycle station,
 * injecté dans routeMath (qui reste sans dépendance). `targetAt` reproduit
 * l'enchaînement depart → cruise → brake du trajet inter-gares.
 */
function makeProfile(stationIndex: number): SpeedProfile {
  // Le prototype ne couvre que le sens 内回り (voir systems/plateau).
  const cruise = cruiseDuration(stationIndex, 'inner');
  const departEnd = CONFIG.departTime;
  const cruiseEnd = departEnd + cruise;
  return {
    step: stepTrain,
    targetAt: (t) => {
      if (t < departEnd) return phaseTarget('depart', t);
      if (t < cruiseEnd) return phaseTarget('cruise', t - departEnd);
      return phaseTarget('brake', t - cruiseEnd);
    },
  };
}

/** Distance totale simulée du trajet inter-gares (m), mémorisée par gare. */
const totalDistanceCache = new Map<number, number>();
function journeyTotalDistance(stationIndex: number): number {
  const cached = totalDistanceCache.get(stationIndex);
  if (cached !== undefined) return cached;
  const total = integrateJourney(makeProfile(stationIndex), journeyDuration(stationIndex, 'inner'));
  totalDistanceCache.set(stationIndex, total);
  return total;
}

/** Un chunk monté. Séparé pour que useGLTF vive dans son propre composant. */
function Chunk({ chunk }: { chunk: PlateauChunkDefinition }) {
  const { scene } = useGLTF(`${BASE}${chunk.url}`);

  // La scène glTF est partagée par le cache de drei : on la clone une seule
  // fois par montage. Sans clone, remonter le même chunk après un aller-retour
  // le déplacerait dans le graphe au lieu de le dupliquer — ici il n'y a
  // qu'un porteur par chunk, mais le clone garde le cache intact et permet de
  // fixer les drapeaux de rendu sans toucher l'original.
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Des milliers de façades ne projettent pas d'ombre : la carte d'ombre
      // du soleil couvre ±18 m autour du wagon (voir Scene.tsx), la ville est
      // entièrement dehors. En activer le rendu coûterait une passe complète
      // pour un résultat invisible.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
    });
    return copy;
  }, [scene]);

  return <primitive object={object} position={chunk.offset} />;
}

export function PlateauWorld() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState<PlateauChunkDefinition[]>([]);

  const enabled = useMemo(() => plateauEnabled(), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const [m, r] = await Promise.all([
        fetch(`${BASE}${PLATEAU_SETTINGS.manifestUrl}`).then((res) => {
          if (!res.ok) throw new Error(`manifest ${res.status}`);
          return res.json() as Promise<Manifest>;
        }),
        fetch(`${BASE}${PLATEAU_SETTINGS.routeUrl}`).then((res) => {
          if (!res.ok) throw new Error(`route ${res.status}`);
          return res.json() as Promise<RouteData>;
        }),
      ]);
      if (cancelled) return;
      setManifest(m);
      setRoute(r);
      // Le premier chunk est décodé pendant que le joueur roule encore sur le
      // tronçon précédent : l'entrée sur le tronçon couvert ne coûte alors aucun
      // à-coup. Les suivants arrivent par la fenêtre glissante, un cran avant
      // d'être visibles.
      preloadPlateau(m.chunks[0]);
    };
    load().catch((err) => {
      if (cancelled) return;
      // Le monde PLATEAU est un supplément : son absence ne doit jamais
      // empêcher le jeu de tourner. Le décor procédural reste en place.
      console.warn('[plateau] monde géoréférencé indisponible, décor procédural conservé :', err);
      setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const worldRef = useRef<THREE.Group>(null);

  // Sonde de développement : `__plateauProbe()` dans la console rapporte l'état
  // du monde géoréférencé et — c'est là son intérêt — la distance du bâtiment
  // le plus proche à l'emprise du wagon. Un volume qui traverse la rame est le
  // défaut le plus visible d'un pipeline de ce genre, et il ne se voit pas dans
  // un manifeste. Jamais montée hors développement.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const probe = () => {
      const group = worldRef.current;
      const result = {
        enabled,
        loaded: Boolean(manifest && route),
        visible: Boolean(group?.visible),
        coverage: plateauRuntime.coverage,
        mountedChunks: plateauRuntime.mounted,
        distance: plateauRuntime.distance,
        totalLength: route?.totalLength ?? null,
        segment: segmentAt(useStore.getState().index, useStore.getState().loopDirection),
        vertices: 0,
        /** Distance latérale minimale d'un sommet à l'axe, dans l'emprise du wagon. */
        nearestToCar: Infinity,
      };
      if (!group?.visible) return result;
      // Les matrices monde des chunks datent du dernier rendu ; à 25 m/s, une
      // image de retard vaut plusieurs dizaines de mètres. On les rafraîchit
      // avant de mesurer, sinon la distance rapportée est celle d'ailleurs.
      group.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const pos = mesh.geometry.getAttribute('position');
        if (!pos) return;
        result.vertices += pos.count;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          // Emprise du wagon : ±10 m en longueur, hauteur de caisse.
          if (Math.abs(v.z) > CONFIG.carHalfLength) continue;
          if (v.y < -1.2 || v.y > CONFIG.carHeight) continue;
          const d = Math.abs(v.x);
          if (d < result.nearestToCar) result.nearestToCar = d;
        }
      });
      return result;
    };
    // Se poser à une fraction donnée du tronçon, sans attendre le trajet réel :
    // c'est ce qui permet de contrôler les quatre coins du tracé en quelques
    // secondes (scripts/plateau/visual-check.mjs).
    const seek = (fraction: number) => {
      const { index } = useStore.getState();
      const total = journeyTotalDistance(index);
      baseDistance.current = runtime.distance - Math.min(1, Math.max(0, fraction)) * total;
      return probe();
    };
    const w = window as unknown as Record<string, unknown>;
    w.__plateauProbe = probe;
    w.__plateauSeek = seek;
    return () => {
      delete w.__plateauProbe;
      delete w.__plateauSeek;
    };
  }, [enabled, manifest, route]);

  // Réserves réutilisées : rien n'est alloué dans useFrame.
  const scratch = useMemo(
    () => ({
      sample: { x: 0, y: 0, z: 0, yaw: 0 } as RouteSample,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      up: new THREE.Vector3(0, 1, 0),
      trainMatrix: new THREE.Matrix4(),
      worldMatrix: new THREE.Matrix4(),
    }),
    [],
  );
  const selection = useRef<PlateauChunkDefinition[]>([]);
  const baseDistance = useRef<number | null>(null);

  useFrame(() => {
    const group = worldRef.current;
    if (!group || !manifest || !route) return;

    const { index, phase, loopDirection } = useStore.getState();
    const segment = segmentAt(index, loopDirection);
    const active =
      plateauCoversSegment(segment, loopDirection) && segment === manifest.prototype.segment;

    if (!active) {
      if (group.visible) {
        group.visible = false;
        plateauRuntime.coverage = 0;
        plateauRuntime.mounted = 0;
        baseDistance.current = null;
        if (selection.current.length > 0) {
          selection.current = [];
          setMounted([]);
        }
      }
      return;
    }

    // Progression : distance réellement parcourue depuis le début du tronçon,
    // rapportée à la distance totale du trajet simulé. L'origine est recalée à
    // l'activation, ce qui gère aussi l'entrée en cours de trajet
    // (randomizeEntry place le joueur n'importe où sur la boucle).
    const total = journeyTotalDistance(index);
    let travelled = baseDistance.current === null ? Number.NaN : runtime.distance - baseDistance.current;
    // Recalage : à l'activation, mais aussi si la distance parcourue sort
    // franchement du tronçon. Cela arrive quand le cycle saute (onglet repris
    // après une longue veille, sonde de développement qui repositionne le
    // train) — sans ce garde-fou, le monde resterait bloqué à une extrémité.
    if (!(travelled > -25 && travelled < total + 25)) {
      const elapsed = Math.min(
        phaseBase(phase, index, 'inner') + runtime.phaseT,
        journeyDuration(index, 'inner'),
      );
      baseDistance.current = runtime.distance - integrateJourney(makeProfile(index), elapsed);
      travelled = runtime.distance - baseDistance.current;
    }
    // À l'arrêt en gare le trajet est terminé par définition : on force la fin
    // du tracé, sans quoi un arrêt d'urgence laisserait la ville en retard.
    const progress = phase === 'dwell' ? 1 : total > 0 ? travelled / total : 0;
    const s = progressToDistance(progress, route.totalLength);
    plateauRuntime.distance = s;

    // Position et cap du train sur le tracé, puis transformation inverse.
    sampleRoute(route.points, s, scratch.sample);
    scratch.position.set(scratch.sample.x, scratch.sample.y, scratch.sample.z);
    scratch.quaternion.setFromAxisAngle(scratch.up, scratch.sample.yaw);
    scratch.trainMatrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    scratch.worldMatrix.copy(scratch.trainMatrix).invert();
    group.matrix.copy(scratch.worldMatrix);
    group.matrixWorldNeedsUpdate = true;
    group.visible = true;
    plateauRuntime.coverage = 1;

    // Fenêtre de chunks : ne change qu'au franchissement d'une limite, donc
    // quelques re-rendus React par tronçon — jamais par frame.
    const next = selectChunks(manifest.chunks, s, {
      ahead: PLATEAU_SETTINGS.chunksAhead,
      behind: PLATEAU_SETTINGS.chunksBehind,
      max: PLATEAU_SETTINGS.maxMountedChunks,
    });
    if (!sameSelection(next, selection.current)) {
      selection.current = next;
      plateauRuntime.mounted = next.length;
      setMounted(next);
    }
  });

  if (!enabled || failed || !manifest || !route) return null;

  return (
    // Groupe extérieur : le tracé porte la cote du RAIL, le décor du jeu place
    // le sol au droit de la voie à -1,1 (systems/segmentEnv). Ce décalage
    // constant met les deux mondes d'accord.
    <group position={[0, PLATEAU_SETTINGS.groundY, 0]}>
      <group ref={worldRef} matrixAutoUpdate={false} visible={false}>
        {mounted.map((chunk) => (
          <Suspense key={chunk.id} fallback={null}>
            <Chunk chunk={chunk} />
          </Suspense>
        ))}
      </group>
    </group>
  );
}

/** Décodage anticipé d'un chunk, sans le monter dans la scène. */
function preloadPlateau(chunk: PlateauChunkDefinition | undefined): void {
  if (!chunk) return;
  useGLTF.preload(`${BASE}${chunk.url}`);
}
