// Les distributeurs automatiques du quai.
//
// Ils étaient un bloc rouge de 0,80 × 1,80 × 1,40 avec une affiche collée
// devant : la silhouette d'un caisson publicitaire couché, pas celle d'un
// 自販機. Un vrai distributeur JR, c'est une caisse peinte de 1,14 m de large
// pour 1,83 m de haut et 0,72 m de fond, CREUSÉE de trois niches - et ce sont
// ces creux qui le font reconnaître de loin :
//
//   · la vitrine, encadrement saillant de 7 cm, verre en avant, échantillons au
//     fond : le décalage se lit dès qu'on passe de biais, là où un plan collé
//     sur une boîte reste plat ;
//   · la platine des monnayeurs, à hauteur de main ;
//   · le volet de retrait au ras du sol, dans sa niche de 4,5 cm.
//
// Par-dessus, le bandeau d'enseigne allumé ; en dessous, un socle en retrait
// qui décolle la caisse de la dalle. La vitrine et l'enseigne sont les seules
// pièces propres à la marque : tout le reste s'instancie, la caisse comprise -
// sa peinture est posée par exemplaire (useInstanceColors), pas par matériau.
//
// Quatre machines par quai au plus (data/stationLayouts), soit une dizaine
// d'appels de rendu pour l'ensemble.

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP } from '../../data/stationGeometry';
import type { StationPlacement } from '../../systems/stationPlacement';
import {
  makeVendingGlassTexture,
  makeVendingGlowTexture,
  makeVendingHeaderTexture,
  makeVendingSideTexture,
  vendingBrand,
} from '../../textures/vending';
import { mat, matFacing, matFacingTrack, useInstanceColors, useInstances } from './instancing';
import { VendingPlate, VendingShowcase, VendingTray } from './vendingParts';
import { HEADER, PORT, WINDOW } from './vendingGeometry';
import type { Mats } from './materials';

interface Props {
  place: StationPlacement;
  station: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
  /** Palette de la gare : les organes de la machine y puisent leurs matières. */
  m: Mats;
}

/** Largeur (le long du quai), hauteur, profondeur de la caisse (m). */
const W = 1.14;
const H = 1.83;
const D = 0.72;
/**
 * Recentrage de la caisse dans l'emprise réservée par le placement (±0,42 m
 * autour de v.x) : l'encadrement de la vitrine saille de 7 cm, et sans ce
 * recul de 3 cm il dépassait de ce qu'on contourne en marchant.
 */
const DX = 0.03;
/** Socle en retrait : la caisse ne touche pas la dalle. */
const PLINTH_H = 0.1;



/** Le plan regarde +z (un flanc de machine) ; l'autre flanc est à l'opposé. */
const FACING_Z = new THREE.Quaternion();
const FACING_MINUS_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
/** Rabattu à l'horizontale, face vers le haut : la flaque de lumière au sol. */
const FACING_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

const yOf = (b: { y0: number; y1: number }) => PLATFORM_TOP + (b.y0 + b.y1) / 2;

/**
 * Encadrement d'une niche : quatre tôles autour de l'ouverture, en saillie
 * devant la façade. C'est ce cadre qui donne la profondeur - l'échantillon est
 * au fond, le verre au nu du cadre, et l'écart se voit de trois quarts.
 */
function revealFrame(
  fx: number,
  z: number,
  b: { y0: number; y1: number; w: number; reveal: number },
  t: number,
): THREE.Matrix4[] {
  const x = fx - b.reveal / 2;
  const hz = b.w / 2;
  const h = b.y1 - b.y0;
  return [
    mat(x, PLATFORM_TOP + b.y1 + t / 2, z, b.reveal, t, b.w + 2 * t),
    mat(x, PLATFORM_TOP + b.y0 - t / 2, z, b.reveal, t, b.w + 2 * t),
    mat(x, yOf(b), z - hz - t / 2, b.reveal, h, t),
    mat(x, yOf(b), z + hz + t / 2, b.reveal, h, t),
  ];
}

export function VendingMachines({ place, station, detail, m }: Props) {
  /** Le verre, les décalcomanies de flanc et le chapeau tombent au palier bas. */
  const full = detail <= 2;
  /** La flaque de lumière au sol : le luxe, réservé aux deux meilleurs paliers. */
  const rich = detail <= 1;

  const machines = useMemo(
    () =>
      place.vending.map((v, i) => ({
        z: v.z,
        /** Nu de la façade : c'est de là que tout se mesure. */
        fx: v.x + DX - D / 2,
        cx: v.x + DX,
        brand: vendingBrand(station, i, place.vending.length),
        seed: station * 4099 + i * 271 + 13,
      })),
    [place.vending, station],
  );

  // --- Textures et matériaux ------------------------------------------
  // Les parties communes sont les mêmes sur tout le quai (matériel standard) ;
  // seules la vitrine et l'enseigne sont refaites par machine.
  const tex = useMemo(
    () => ({
      glass: makeVendingGlassTexture(),
      side: makeVendingSideTexture(),
      glow: makeVendingGlowTexture(),
      headers: machines.map((mch) => makeVendingHeaderTexture(mch.brand)),
    }),
    [machines],
  );

  const mats = useMemo(() => {
    // La vitrine et l'enseigne sont RÉTROÉCLAIRÉES : elles ne dépendent pas de
    // la lumière du quai, et restent lisibles la nuit comme sous l'auvent.
    const lit = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, toneMapped: false });
    return {
      // Blanche : la peinture arrive par exemplaire (instanceColor).
      body: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.44, metalness: 0.14 }),
      trim: new THREE.MeshStandardMaterial({ color: '#3a3e43', roughness: 0.52, metalness: 0.26 }),
      cap: new THREE.MeshStandardMaterial({ color: '#2c3035', roughness: 0.66, metalness: 0.18 }),
      glass: new THREE.MeshStandardMaterial({
        map: tex.glass,
        transparent: true,
        depthWrite: false,
        roughness: 0.06,
        metalness: 0.1,
      }),
      side: new THREE.MeshStandardMaterial({ map: tex.side, transparent: true, roughness: 0.6 }),
      glow: new THREE.MeshBasicMaterial({
        map: tex.glow,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      headers: tex.headers.map(lit),
    };
  }, [tex]);

  useLayoutEffect(() => {
    const all = [
      mats.body,
      mats.trim,
      mats.cap,
      mats.glass,
      mats.side,
      mats.glow,
      ...mats.headers,
    ];
    const texs = [tex.glass, tex.side, tex.glow, ...tex.headers];
    return () => {
      for (const x of all) x.dispose();
      for (const t of texs) t.dispose();
    };
  }, [mats, tex]);

  // --- Matrices --------------------------------------------------------
  const bodies = useMemo(
    () => machines.map((v) => mat(v.cx, PLATFORM_TOP + (H + PLINTH_H) / 2, v.z, D, H - PLINTH_H, W)),
    [machines],
  );
  const paints = useMemo(() => machines.map((v) => new THREE.Color(v.brand.body)), [machines]);
  const plinths = useMemo(
    () => machines.map((v) => mat(v.cx, PLATFORM_TOP + PLINTH_H / 2, v.z, D - 0.07, PLINTH_H, W - 0.09)),
    [machines],
  );
  // Chapeau débordant : le bandeau d'enseigne s'arrête dessous, et l'arête
  // sombre en tête détache la machine de l'auvent clair.
  const caps = useMemo(
    () => machines.map((v) => mat(v.cx, PLATFORM_TOP + H + 0.018, v.z, D + 0.024, 0.036, W + 0.026)),
    [machines],
  );

  const trims = useMemo(
    () =>
      machines.flatMap((v) => [
        ...revealFrame(v.fx, v.z, WINDOW, 0.04),
        ...revealFrame(v.fx, v.z, PORT, 0.035),
        // Montants de la porte de service, sur les deux rives de la façade :
        // sans eux la face avant est une seule tôle, et la caisse n'a plus
        // d'ouvrant.
        ...[-1, 1].map((d) =>
          mat(
            v.fx - 0.008,
            PLATFORM_TOP + (H + PLINTH_H) / 2,
            v.z + d * (W / 2 - 0.02),
            0.016,
            H - PLINTH_H - 0.05,
            0.04,
          ),
        ),
      ]),
    [machines],
  );

  // Le verre, lui, est au nu de l'encadrement - 7 cm devant les échantillons.
  const glasses = useMemo(
    () =>
      full
        ? machines.map((v) =>
            matFacingTrack(v.fx - WINDOW.reveal + 0.004, yOf(WINDOW), v.z, WINDOW.w, WINDOW.y1 - WINDOW.y0),
          )
        : [],
    [machines, full],
  );
  const sides = useMemo(
    () =>
      full
        ? machines.flatMap((v) => [
            matFacing(FACING_Z, v.cx, PLATFORM_TOP + (H + PLINTH_H) / 2, v.z + W / 2 + 0.003, D - 0.03, H - PLINTH_H - 0.04),
            matFacing(FACING_MINUS_Z, v.cx, PLATFORM_TOP + (H + PLINTH_H) / 2, v.z - W / 2 - 0.003, D - 0.03, H - PLINTH_H - 0.04),
          ])
        : [],
    [machines, full],
  );
  const glows = useMemo(
    () =>
      rich
        ? machines.map((v) => matFacing(FACING_UP, v.fx - 0.5, PLATFORM_TOP + 0.012, v.z, 1.5, 2.0))
        : [],
    [machines, rich],
  );

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const plinthRef = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);
  const trimRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);
  const sideRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);

  useInstances(bodyRef, bodies);
  useInstanceColors(bodyRef, paints);
  useInstances(plinthRef, plinths);
  useInstances(capRef, caps);
  useInstances(trimRef, trims);
  useInstances(glassRef, glasses);
  useInstances(sideRef, sides);
  useInstances(glowRef, glows);

  const count = (n: number) => Math.max(1, n);

  return (
    <group name="distributeurs">
      <instancedMesh
        name="distributeur-caisse"
        ref={bodyRef}
        args={[undefined, undefined, count(bodies.length)]}
        material={mats.body}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        name="distributeur-socle"
        ref={plinthRef}
        args={[undefined, undefined, count(plinths.length)]}
        material={mats.cap}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        name="distributeur-encadrement"
        ref={trimRef}
        args={[undefined, undefined, count(trims.length)]}
        material={mats.trim}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {full && (
        <instancedMesh
          name="distributeur-chapeau"
          ref={capRef}
          args={[undefined, undefined, count(caps.length)]}
          material={mats.cap}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}

      {/* Ce qui est PROPRE à chaque machine, et ce qu'on touche.
          L'enseigne d'abord - elle seule change avec la marque - puis les
          organes : la vitrine dont les lampes s'allument, la platine des
          monnayeurs, le volet de retrait. Ce sont exactement les mêmes pièces
          que dans le hall (three/station/vendingParts) : c'est le même
          matériel, on l'écrit une fois.

          Le groupe tourne d'un quart de tour parce que ces pièces se décrivent
          face à soi, façade en +z local, et que la façade d'un distributeur de
          quai regarde la voie. */}
      {machines.map((v, i) => (
        <group
          key={`vm${i}`}
          name="distributeur-façade"
          position={[v.cx, PLATFORM_TOP, v.z]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <mesh position={[0, yOf(HEADER) - PLATFORM_TOP, D / 2 + 0.011]} material={mats.headers[i]}>
            <planeGeometry args={[HEADER.w, HEADER.y1 - HEADER.y0]} />
          </mesh>
          <VendingShowcase id={`pv${i}`} d={D} />
          <VendingPlate id={`pv${i}`} bw={W} d={D} m={m} />
          <VendingTray id={`pv${i}`} d={D} m={m} />
        </group>
      ))}

      {full && (
        <>
          <instancedMesh
            name="distributeur-vitre"
            ref={glassRef}
            args={[undefined, undefined, count(glasses.length)]}
            material={mats.glass}
          >
            <planeGeometry args={[1, 1]} />
          </instancedMesh>
          <instancedMesh
            name="distributeur-flanc"
            ref={sideRef}
            args={[undefined, undefined, count(sides.length)]}
            material={mats.side}
          >
            <planeGeometry args={[1, 1]} />
          </instancedMesh>
        </>
      )}

      {rich && (
        <instancedMesh
          name="distributeur-halo"
          ref={glowRef}
          args={[undefined, undefined, count(glows.length)]}
          material={mats.glow}
        >
          <planeGeometry args={[1, 1]} />
        </instancedMesh>
      )}
    </group>
  );
}
