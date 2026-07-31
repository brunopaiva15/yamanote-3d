// Le niveau de correspondance : ce qu'on voit une fois descendu.
//
// Le couloir de la trémie principale ne bute plus sur un mur : il débouche
// ici. Tout ce qui est dessiné l'est aux cotes que `data/stationInterior` a
// posées et que `systems/walkable` fait respecter - une borne de portillon
// dessinée trente centimètres à côté de celle qu'on contourne se verrait au
// premier pas.
//
// CE QUI FAIT UNE GARE ET PAS UN TUNNEL. Un hall de gare japonais se lit à
// quatre choses, et ce sont celles-là qu'on pose :
//
//   • le soubassement de faïence, qui casse le tout-gris à hauteur de main ;
//   • la ligne de portillons, ses bornes basses, ses feux et son 改札 au-dessus ;
//   • le fléchage - vert pour la sortie, jaune pour les quais - suspendu au
//     plafond, à hauteur de lecture et pas plus haut ;
//   • et la lumière : des réglettes continues, très blanches, qui rendent le
//     sol brillant. Un hall souterrain sans plafonniers est une cave.
//
// LE BUDGET. Tout est en boîtes et en plans, sans texture propre : les
// matériaux viennent de la palette de la gare (three/station/materials), les
// affiches du pool publicitaire déjà chargé. Le niveau entier tombe au palier
// de qualité 2, comme le reste du fond de champ - il n'est visible que si l'on
// y est, et si l'on y est, on ne voit plus le quai.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import type { StationInterior, InteriorRect } from '../../data/stationInterior';
import { makeExitSign, makeGateSign } from '../../textures/procedural';
import type { Mats } from './materials';
import { stationAd } from './adPool';

/** Hauteur des bornes de portillon : on voit par-dessus, on ne passe pas. */
const CABINET_H = 0.98;
/** Hauteur du panneau 改札 suspendu au-dessus de la ligne. */
const GATE_SIGN_Y = 2.32;
const GATE_SIGN_H = 0.44;
/** Hauteur du soubassement de faïence. */
const DADO_H = 1.15;
/** Épaisseur des parois du hall. */
const WALL_T = 0.24;
/** Entraxe des réglettes de plafond. */
const LAMP_PITCH = 4.2;
/** Hauteur des caissons publicitaires du hall. */
const AD_H = 1.15;
const AD_W = 1.7;
const AD_Y = 1.35;

function centre(r: InteriorRect): [number, number] {
  return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
}

/**
 * Le hall d'une gare, du débouché du couloir aux bouches de sortie.
 *
 * `it.built` est vérifié par l'appelant : une gare dont le hall est au-dessus
 * du quai le déclare sans le construire, faute de volée montante pour y aller.
 */
export function Concourse({
  it,
  m,
  station,
  detail,
}: {
  it: StationInterior;
  m: Mats;
  station: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
}) {
  const width = it.paid.x1 - it.paid.x0;
  const z0 = it.paid.z0;
  const z1 = it.free.z1;
  const length = z1 - z0;
  const midX = (it.paid.x0 + it.paid.x1) / 2;
  const midZ = (z0 + z1) / 2;
  const height = it.ceilY - it.floorY;
  const midY = (it.ceilY + it.floorY) / 2;

  // Le bandeau 改札 au-dessus de la ligne : il porte le nom réel de la sortie,
  // et c'est la seule chose du niveau qui change d'une gare à l'autre.
  const sign = useMemo(() => makeGateSign(), []);
  const signMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: sign.texture, toneMapped: false }),
    [sign],
  );
  useEffect(() => sign.redraw(it.gate.nameJp, it.gate.nameRomaji), [sign, it.gate]);
  useEffect(
    () => () => {
      signMat.dispose();
      sign.texture.dispose();
    },
    [signMat, sign],
  );

  const lamps = useMemo(() => {
    const out: number[] = [];
    for (let z = z0 + LAMP_PITCH / 2; z < z1; z += LAMP_PITCH) out.push(z);
    return out;
  }, [z0, z1]);

  // Sol, plafond et parois s'arrêtent au NU du couloir : le hall commence là où
  // la trémie finit, et rien ne doit repartir en arrière sous ses marches.
  const shellZ = midZ + WALL_T / 2;
  const shellLen = length + WALL_T;

  return (
    <group name="gare/hall">
      {/* Sol, plafond, et les deux parois longues. Le volume est clos : sans
          cela, on verrait le ballast par-dessous la dalle du quai. */}
      <mesh position={[midX, it.floorY - 0.06, shellZ]} material={m.slab}>
        <boxGeometry args={[width + 2 * WALL_T, 0.12, shellLen]} />
      </mesh>
      <mesh position={[midX, it.ceilY - 0.06, shellZ]} material={m.hallCeil}>
        <boxGeometry args={[width + 2 * WALL_T, 0.12, shellLen]} />
      </mesh>
      {[-1, 1].map((d) => (
        <group key={`side${d}`}>
          <mesh
            position={[midX + (d * (width + WALL_T)) / 2, midY, shellZ]}
            material={m.hall}
          >
            <boxGeometry args={[WALL_T, height, shellLen]} />
          </mesh>
          {/* Soubassement de faïence : à hauteur de main, c'est lui qu'on voit. */}
          <mesh
            position={[midX + (d * (width - 0.04)) / 2, it.floorY + DADO_H / 2, shellZ]}
            material={m.tile}
          >
            <boxGeometry args={[0.05, DADO_H, shellLen]} />
          </mesh>
        </group>
      ))}

      {/* Fond du hall, percé des bouches de sortie. Elles ne se franchissent pas
          encore - la volée qui monte à la rue reste à dessiner - mais le jour
          qui en tombe dit d'où il vient, et le fléchage dit où elles mènent. */}
      <ExitWall it={it} m={m} station={station} width={width} height={height} midX={midX} midY={midY} />

      {/* La ligne de portillons. */}
      {it.gate.cabinets.map((c, k) => {
        const [cx, cz] = centre(c);
        const w = c.x1 - c.x0;
        const d = c.z1 - c.z0;
        // Une joue de rive - ce qui reste entre la dernière borne et la paroi -
        // monte jusqu'au plafond : ce n'est pas un portillon, c'est un mur.
        const jamb = w > 0.5;
        const h = jamb ? height : CABINET_H;
        const y = jamb ? midY : it.floorY + h / 2;
        return (
          <group key={`cab${k}`}>
            <mesh position={[cx, y, cz]} material={jamb ? m.hall : m.psd}>
              <boxGeometry args={[w, h, d]} />
            </mesh>
            {/* Dessus de borne : le noir mat où se pose la carte, et le feu. */}
            {!jamb && (
              <>
                <mesh position={[cx, it.floorY + CABINET_H + 0.01, cz]} material={m.frame}>
                  <boxGeometry args={[w + 0.02, 0.03, d]} />
                </mesh>
                <mesh
                  position={[cx, it.floorY + CABINET_H + 0.04, cz - d / 2 + 0.34]}
                  material={m.accent}
                >
                  <boxGeometry args={[w - 0.06, 0.04, 0.2]} />
                </mesh>
              </>
            )}
          </group>
        );
      })}

      {/* Le bandeau 改札, suspendu au-dessus de la ligne, face à qui arrive. */}
      <mesh position={[midX, GATE_SIGN_Y + it.floorY, it.gate.z0 - 0.12]} material={m.frame}>
        <boxGeometry args={[Math.min(width - 0.4, 3.6) + 0.08, GATE_SIGN_H + 0.08, 0.09]} />
      </mesh>
      <mesh
        position={[midX, GATE_SIGN_Y + it.floorY, it.gate.z0 - 0.168]}
        rotation={[0, Math.PI, 0]}
        material={signMat}
      >
        <planeGeometry args={[Math.min(width - 0.4, 3.6), GATE_SIGN_H]} />
      </mesh>

      {/* Réglettes de plafond : la lumière du lieu. Continues et très blanches,
          comme dans tout souterrain de gare - c'est ce qui fait briller le sol. */}
      {lamps.map((z, k) => (
        <mesh key={`lamp${k}`} position={[midX, it.ceilY - 0.14, z]} material={m.lamp}>
          <boxGeometry args={[Math.min(width - 1.2, 2.6), 0.08, 0.34]} />
        </mesh>
      ))}

      {/* Ligne de guidage podotactile, dans l'axe, du couloir aux portillons
          puis des portillons aux sorties : elle traverse par un passage, jamais
          par une borne. */}
      {detail <= 1 && <Guideline it={it} m={m} />}

      {/* Caissons publicitaires en zone payante : un hall de gare en est
          tapissé, et ce sont eux qui donnent l'échelle des parois nues. */}
      {detail <= 1
        && [0, 1].map((k) => (
          <group key={`ad${k}`}>
            <mesh
              position={[
                it.paid.x0 + (k === 0 ? 0.06 : width - 0.06),
                it.floorY + AD_Y,
                it.paid.z0 + 3.2 + k * 4.1,
              ]}
              material={m.metal}
            >
              <boxGeometry args={[0.08, AD_H + 0.12, AD_W + 0.12]} />
            </mesh>
            <mesh
              position={[
                it.paid.x0 + (k === 0 ? 0.11 : width - 0.11),
                it.floorY + AD_Y,
                it.paid.z0 + 3.2 + k * 4.1,
              ]}
              rotation={[0, k === 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
              material={stationAd(station, k + 9)}
            >
              <planeGeometry args={[AD_W, AD_H]} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

/**
 * Le fond du hall, et les bouches de sortie qui le percent.
 *
 * Une bouche n'est pas encore un passage : la volée qui monte à la rue reste à
 * dessiner. Mais ce n'est pas non plus un mur peint - c'est un percement, avec
 * du jour au fond, et c'est cette lueur qui dit qu'il y a une ville au-dessus.
 */
function ExitWall({
  it,
  m,
  station,
  width,
  height,
  midX,
  midY,
}: {
  it: StationInterior;
  m: Mats;
  station: number;
  width: number;
  height: number;
  midX: number;
  midY: number;
}) {
  // Le panneau jaune de chaque bouche : le MÊME que celui des potences du quai,
  // tiré du même relevé de sorties. Une gare ne fléche pas 八重洲中央口 en haut
  // des marches et autre chose en bas.
  const signs = useMemo(() => it.exits.map((e) => makeExitSign(e.slot)), [it.exits]);
  const signMats = useMemo(
    () => signs.map((s) => new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false })),
    [signs],
  );
  useEffect(() => {
    for (const s of signs) s.redraw(station);
  }, [signs, station]);
  useEffect(
    () => () => {
      for (const mm of signMats) mm.dispose();
      for (const s of signs) s.texture.dispose();
    },
    [signMats, signs],
  );
  const z = it.free.z1 + WALL_T / 2;
  // Le mur se coupe en panneaux entre les bouches, plutôt que percé : deux
  // boîtes valent mieux qu'une géométrie extrudée pour trois trous.
  const cuts = [...it.exits].sort((a, b) => a.x - b.x);
  const panels: { x0: number; x1: number }[] = [];
  let x = it.free.x0;
  for (const exit of cuts) {
    if (exit.x - exit.halfWidth > x) panels.push({ x0: x, x1: exit.x - exit.halfWidth });
    x = exit.x + exit.halfWidth;
  }
  if (x < it.free.x1) panels.push({ x0: x, x1: it.free.x1 });

  return (
    <group>
      {panels.map((p, k) => (
        <mesh key={`panel${k}`} position={[(p.x0 + p.x1) / 2, midY, z]} material={m.hall}>
          <boxGeometry args={[p.x1 - p.x0, height, WALL_T]} />
        </mesh>
      ))}
      {/* Linteau au-dessus des bouches : le percement ne monte pas au plafond. */}
      <mesh position={[midX, it.floorY + 2.55, z]} material={m.hall}>
        <boxGeometry args={[width, height - 2.4, WALL_T]} />
      </mesh>
      {cuts.map((exit, k) => (
        <group key={`exit${k}`}>
          {/* Ce qu'on voit au fond n'est pas un aplat lumineux : c'est une
              VOLÉE, six marches montantes prises à contre-jour, et le jour
              derrière elles. C'est la différence entre une sortie et un néon -
              on lit d'un coup d'œil que ça monte, et vers où. */}
          {Array.from({ length: 6 }, (_, s) => (
            <mesh
              key={`step${s}`}
              position={[
                exit.x,
                it.floorY + 0.09 + s * 0.175,
                z + WALL_T / 2 + 0.18 + s * 0.31,
              ]}
              material={m.stair}
            >
              <boxGeometry args={[exit.halfWidth * 2 - 0.12, 0.18 + s * 0.35, 0.31]} />
            </mesh>
          ))}
          {/* La cage se ferme derrière : sans elle, le percement donnait sur le
              vide et l'on voyait le décor du quai par-dessous la dalle. */}
          {[-1, 1].map((d) => (
            <mesh
              key={`cheek${d}`}
              position={[
                exit.x + d * (exit.halfWidth + 0.06),
                it.floorY + 1.3,
                z + WALL_T / 2 + 1.3,
              ]}
              material={m.hall}
            >
              <boxGeometry args={[0.12, 2.6, 2.6]} />
            </mesh>
          ))}
          <mesh
            position={[exit.x, it.floorY + 1.3, z + WALL_T / 2 + 2.55]}
            material={m.hall}
          >
            <boxGeometry args={[exit.halfWidth * 2 + 0.24, 2.6, 0.12]} />
          </mesh>
          <mesh
            position={[exit.x, it.floorY + 2.62, z + WALL_T / 2 + 1.3]}
            material={m.hallCeil}
          >
            <boxGeometry args={[exit.halfWidth * 2 + 0.24, 0.12, 2.7]} />
          </mesh>
          {/* Le jour qui tombe de la rue, une volée plus haut : il éclaire le
              haut des marches et rien d'autre. */}
          <mesh
            position={[exit.x, it.floorY + 2.42, z + WALL_T / 2 + 2.44]}
            material={m.lamp}
          >
            <boxGeometry args={[exit.halfWidth * 2 - 0.16, 0.5, 0.06]} />
          </mesh>
          {/* Panneau de sortie, au-dessus du percement. */}
          <mesh
            position={[exit.x, it.floorY + 2.52, z - WALL_T / 2 - 0.03]}
            material={m.frame}
          >
            <boxGeometry args={[exit.halfWidth * 2 + 0.06, 0.42, 0.07]} />
          </mesh>
          <mesh
            position={[exit.x, it.floorY + 2.52, z - WALL_T / 2 - 0.071]}
            rotation={[0, Math.PI, 0]}
            material={signMats[k]}
          >
            <planeGeometry args={[exit.halfWidth * 2, 0.36]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * La ligne de guidage podotactile : elle traverse le hall dans l'axe et se
 * coupe à la ligne de portillons, où elle se recale sur un PASSAGE. Une bande
 * qui filerait droit dans une borne serait un contresens - c'est précisément la
 * ligne que suit qui ne voit pas.
 */
function Guideline({ it, m }: { it: StationInterior; m: Mats }) {
  // Le passage large : c'est celui vers lequel la bande mène, comme en vrai.
  const target = it.gate.passages[it.gate.passages.length - 1];
  const midX = (it.paid.x0 + it.paid.x1) / 2;
  const y = it.floorY + 0.008;
  return (
    <group>
      <mesh position={[midX, y, (it.paid.z0 + it.paid.z1) / 2 - 1.2]} material={m.tactile}>
        <boxGeometry args={[0.3, 0.016, it.paid.z1 - it.paid.z0 - 2.4]} />
      </mesh>
      {/* Le raccord latéral vers l'axe du passage. */}
      <mesh
        position={[(midX + target.x) / 2, y, it.paid.z1 - 0.9]}
        material={m.tactile}
      >
        <boxGeometry args={[Math.abs(target.x - midX) + 0.3, 0.016, 0.3]} />
      </mesh>
      <mesh position={[target.x, y, it.paid.z1 - 0.45]} material={m.tactile}>
        <boxGeometry args={[0.3, 0.016, 0.9]} />
      </mesh>
      <mesh
        position={[target.x, y, (it.free.z0 + it.free.z1) / 2]}
        material={m.tactile}
      >
        <boxGeometry args={[0.3, 0.016, it.free.z1 - it.free.z0]} />
      </mesh>
    </group>
  );
}
