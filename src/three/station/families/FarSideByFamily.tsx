// Fond de travée par famille de quai (island / sharedIsland / terminusIsland / side).
// Extrait de Station.tsx pour que chaque famille puisse enrichir la coupe.

import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import {
  GAUGE_HALF,
  OPP_DEPTH,
  PLATFORM_TOP,
  PSD_H,
  SLAB_H,
  TRACK_HALF,
} from '../../../data/stationGeometry';
import { layoutFor, type StationLayout } from '../../../data/stationLayouts';
import { placementFor } from '../../../systems/stationPlacement';
import { mat, useInstances } from '../instancing';
import type { Mats } from '../materials';

const YARD_TRACKS = 4;
const YARD_PITCH = 4.6;

/** Point d'entrée : délègue selon config, avec extras terminus. */
export function FarSideByFamily(props: {
  layout: ReturnType<typeof layoutFor>;
  place: ReturnType<typeof placementFor>;
  wallH: number;
  m: Mats;
  detail: number;
  segs: { z0: number; z1: number }[];
  sigRoof: boolean;
}) {
  return (
    <group name={`family-${props.layout.config}`}>
      <FarSide {...props} />
      {props.layout.config === 'terminusIsland' && props.place.farEdgeX !== null && (
        <TerminusExtraTracks
          far={props.place.farEdgeX}
          len={props.layout.length}
          m={props.m}
          detail={props.detail}
        />
      )}
    </group>
  );
}

function TerminusExtraTracks({
  far,
  len,
  m,
  detail,
}: {
  far: number;
  len: number;
  m: Mats;
  detail: number;
}) {
  const base = far + 2 * TRACK_HALF + OPP_DEPTH + 1.2;
  return (
    <group name="voies-terminales">
      {[0, 1].map((k) => {
        const trackX = base + k * YARD_PITCH;
        return (
          <group key={k}>
            <mesh position={[trackX, PLATFORM_TOP - SLAB_H - 0.86, 0]} material={m.liner}>
              <boxGeometry args={[TRACK_HALF * 2, 0.42, len]} />
            </mesh>
            {detail <= 2 &&
              [-1, 1].map((d) => (
                <mesh key={d} position={[trackX + d * GAUGE_HALF, -1.11, 0]} material={m.metal}>
                  <boxGeometry args={[0.08, 0.16, len]} />
                </mesh>
              ))}
          </group>
        );
      })}
    </group>
  );
}

function FarSide({
  layout,
  place,
  wallH,
  m,
  detail,
  segs,
  sigRoof,
}: {
  layout: ReturnType<typeof layoutFor>;
  place: ReturnType<typeof placementFor>;
  wallH: number;
  m: Mats;
  detail: number;
  segs: { z0: number; z1: number }[];
  /** La charpente signature couvre tout le site : pas d'auvent d'en face. */
  sigRoof: boolean;
}) {
  const len = layout.length;
  const far = place.farEdgeX;

  // Les crochets se déclarent AVANT le retour anticipé d'Harajuku : après, ils
  // ne seraient pas appelés à chaque rendu et React s'en plaindrait.
  const oppBand = useMemo(
    () =>
      far === null
        ? []
        : segs.map((sg) =>
            mat(
              far + 2 * TRACK_HALF + 0.045,
              PLATFORM_TOP + PSD_H - 0.07,
              (sg.z0 + sg.z1) / 2,
              0.12,
              0.1,
              sg.z1 - sg.z0,
            ),
          ),
    [segs, far],
  );
  const oppBandRef = useRef<THREE.InstancedMesh>(null);
  useInstances(oppBandRef, oppBand);

  // Harajuku : le seul quai latéral de la boucle. Un vrai mur, un vrai
  // soubassement carrelé, et rien à voir au-delà.
  if (far === null) {
    const backX = place.backX;
    return (
      <group name="mur-fond">
        <mesh position={[backX, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
          <boxGeometry args={[0.18, wallH, len]} />
        </mesh>
        <Wainscot backX={backX - 0.09} len={len} m={m} />
        <mesh position={[backX - 0.02, PLATFORM_TOP + wallH - 0.6, 0]} material={m.wallDark}>
          <boxGeometry args={[0.2, 0.35, len]} />
        </mesh>
        <mesh position={[backX - 0.03, PLATFORM_TOP + wallH - 0.92, 0]} material={m.accent}>
          <boxGeometry args={[0.08, 0.1, len]} />
        </mesh>
      </group>
    );
  }

  const trackX = far + TRACK_HALF;
  const oppEdge = far + 2 * TRACK_HALF;
  const oppBack = oppEdge + OPP_DEPTH;
  const hasPsd = layout.psd !== 'none';
  // À Ōsaki, la voie d'en face est la voie SECONDAIRE : celle qui n'a pas
  // encore ses portes. C'est précisément là que ça se voit.
  const oppPsd = hasPsd && layout.psd !== 'partial';
  return (
    <group name="travée-opposée">
      {/* Joue de rive du bord d'en face. */}
      <mesh position={[far - 0.03, PLATFORM_TOP - SLAB_H - 0.32, 0]} material={m.wallDark}>
        <boxGeometry args={[0.07, 0.66, len]} />
      </mesh>

      {/* La voie : ballast et deux files de rails. */}
      <mesh position={[trackX, PLATFORM_TOP - SLAB_H - 0.86, 0]} material={m.liner}>
        <boxGeometry args={[TRACK_HALF * 2, 0.42, len]} />
      </mesh>
      {[-1, 1].map((d) => (
        <mesh key={d} position={[trackX + d * GAUGE_HALF, -1.11, 0]} material={m.metal}>
          <boxGeometry args={[0.08, 0.16, len]} />
        </mesh>
      ))}

      {/* Le quai d'en face : dalle, joue, muret de portes, auvent. */}
      <mesh
        position={[(oppEdge + oppBack) / 2, PLATFORM_TOP - SLAB_H / 2, 0]}
        material={m.slab}
      >
        <boxGeometry args={[OPP_DEPTH, SLAB_H, len]} />
      </mesh>
      <mesh position={[oppEdge + 0.03, PLATFORM_TOP - SLAB_H - 0.32, 0]} material={m.wallDark}>
        <boxGeometry args={[0.07, 0.66, len]} />
      </mesh>
      {oppPsd && (
        <>
          <mesh position={[oppEdge + 0.05, PLATFORM_TOP + PSD_H / 2, 0]} material={m.psd}>
            <boxGeometry args={[0.1, PSD_H, len]} />
          </mesh>
          {/* Bandeau interrompu, pour la même raison qu'au bord d'en face. */}
          <instancedMesh
            name="bandeau-psd-opposé"
            ref={oppBandRef}
            args={[undefined, undefined, Math.max(1, oppBand.length)]}
            material={m.accent}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
        </>
      )}
      {/* L'auvent d'en face : on le voit, on n'y marche pas. Il tombe au
          palier le plus léger, où la silhouette du quai suffit - et là où la
          charpente signature couvre le site d'un seul tenant, il n'y en a
          jamais eu. */}
      {detail <= 2 && !sigRoof && (
        <mesh position={[(oppEdge + oppBack) / 2, layout.canopyY + 0.07, 0]} material={m.canopy}>
          <boxGeometry args={[OPP_DEPTH + 0.4, 0.14, len]} />
        </mesh>
      )}

      {/* Faisceau : là où rien ne ferme la travée, des voies encore, jusqu'au
          bord du champ. C'est la perspective dégagée de Nippori et d'Ueno, et
          les huit voies parallèles de Shimbashi - qu'un mur escamotait. */}
      {layout.openFarSide && (
        <group>
          <mesh
            position={[oppBack + (YARD_TRACKS * YARD_PITCH) / 2, PLATFORM_TOP - SLAB_H - 0.86, 0]}
            material={m.liner}
          >
            <boxGeometry args={[YARD_TRACKS * YARD_PITCH, 0.42, len]} />
          </mesh>
          {/* Les rails du faisceau : huit longs prismes qu'on distingue à
              peine au-delà de vingt mètres. Le ballast, lui, reste toujours. */}
          {detail <= 2 &&
            Array.from({ length: YARD_TRACKS }, (_, k) => {
              const x = oppBack + (k + 0.5) * YARD_PITCH;
              return [-1, 1].map((d) => (
                <mesh key={`yr${k}${d}`} position={[x + d * GAUGE_HALF, -1.11, 0]} material={m.metal}>
                  <boxGeometry args={[0.08, 0.16, len]} />
                </mesh>
              ));
            })}
        </group>
      )}

      {/* Ce qui ferme la travée, selon le niveau où court la voie - au fond du
          quai d'en face, ou au bout du faisceau quand il y en a un. */}
      <Closure x={oppBack + (layout.openFarSide ? YARD_TRACKS * YARD_PITCH : 0)} elevation={layout.elevation} wallH={wallH} len={len} m={m} />
    </group>
  );
}

/** La paroi qui ferme la travée : ce qu'on voit tout au fond. */
function Closure({
  x,
  elevation,
  wallH,
  len,
  m,
}: {
  x: number;
  elevation: StationLayout['elevation'];
  wallH: number;
  len: number;
  m: Mats;
}) {
  if (elevation === 'trench') {
    // Tranchée : la paroi de soutènement monte bien au-delà de l'auvent.
    return (
      <group>
        <mesh position={[x, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
          <boxGeometry args={[0.24, wallH, len]} />
        </mesh>
        <Wainscot backX={x - 0.13} len={len} m={m} />
        <mesh position={[x + 0.12, PLATFORM_TOP + wallH + 1.7, 0]} material={m.wallDark}>
          <boxGeometry args={[0.42, 3.4, len]} />
        </mesh>
      </group>
    );
  }
  if (elevation === 'elevated') {
    // Viaduc : garde-corps ajouré, la ville se voit par-dessus.
    return (
      <group>
        <mesh position={[x, PLATFORM_TOP + 0.6, 0]} material={m.wall}>
          <boxGeometry args={[0.18, 1.2, len]} />
        </mesh>
        <mesh position={[x, PLATFORM_TOP + 1.24, 0]} material={m.metal}>
          <boxGeometry args={[0.1, 0.08, len]} />
        </mesh>
        <mesh position={[x, PLATFORM_TOP + 1.9, 0]} material={m.metal}>
          <boxGeometry args={[0.08, 0.06, len]} />
        </mesh>
      </group>
    );
  }
  // Au sol : un mur de fond ordinaire, avec sa faïence.
  return (
    <group>
      <mesh position={[x, PLATFORM_TOP + wallH / 2, 0]} material={m.wall}>
        <boxGeometry args={[0.2, wallH, len]} />
      </mesh>
      <Wainscot backX={x - 0.11} len={len} m={m} />
    </group>
  );
}

/**
 * Soubassement carrelé du mur de fond : un aplat chaud d'un mètre de haut,
 * couronné du liseré uguisu de la ligne. Sans lui le fond du quai est un aplat
 * de béton clair sur toute sa hauteur - le « trop blanc et gris » du décor.
 */
function Wainscot({ backX, len, m }: { backX: number; len: number; m: Mats }) {
  return (
    <group>
      <mesh position={[backX - 0.015, PLATFORM_TOP + 0.52, 0]} material={m.tile}>
        <boxGeometry args={[0.05, 1.04, len]} />
      </mesh>
      {/* Le liseré déborde de cinq millimètres du nu de la faïence : il la
          couronne comme une moulure. À nu commun, sa face avant et celle du
          carrelage étaient dans le même plan sur les deux cent vingt mètres du
          mur de fond - une ligne qui scintillait droit devant soi. */}
      <mesh position={[backX - 0.02, PLATFORM_TOP + 1.07, 0]} material={m.accent}>
        <boxGeometry args={[0.07, 0.07, len]} />
      </mesh>
    </group>
  );
}

