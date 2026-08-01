// La ligne de portillons : 改札口.
//
// C'ÉTAIT UNE RANGÉE DE BOÎTES. Des parallélépipèdes de 98 cm avec un liseré
// sur le dessus, et le vide entre eux. On les traversait sans rien présenter,
// rien ne s'ouvrait, rien ne se fermait. Or un 改札 se reconnaît à trois choses,
// et aucune n'était là :
//
//   • le LECTEUR - la platine bleue inclinée sur le nez de la borne, avec son
//     cercle et son 「IC」. C'est le seul point du mobilier de gare japonais
//     qu'on touche tous les jours, et il est toujours au même endroit : à main
//     droite de qui s'engage, à hauteur de hanche ;
//   • les BATTANTS - deux vantaux translucides ambrés escamotés dans les
//     bornes, qui claquent en travers du passage devant celui qui n'a pas
//     validé. Au repos ils sont ouverts : un portillon japonais laisse passer,
//     il ne demande pas la permission ;
//   • le FEU - le chevron vert ou la croix rouge sur le nez de la borne, lisible
//     de dix mètres. C'est lui qui dit quel passage prendre avant même d'y être.
//
// Les trois sont pilotés par `systems/fareGate`, qui est aussi ce que la marche
// interroge : un battant fermé barre réellement le chemin.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { InteriorRect, StationInterior } from '../../data/stationInterior';
import { gateStates, type GateVerdict } from '../../systems/fareGate';
import { STRINGS } from '../../i18n/strings';
import { useStore } from '../../store';
import { makeGateDisplay } from '../../textures/ticket';
import type { Mats } from './materials';
import { usePickable } from './pickable';

/** Hauteur des bornes : on voit par-dessus, on ne passe pas. */
export const CABINET_H = 0.98;
/** Demi-largeur d'une borne (data/stationInterior). */
const CABINET_HALF_X = 0.18;
/** Hauteur des battants, et leur épaisseur. */
const FLAP_H = 0.62;
const FLAP_T = 0.028;
/** Recul des battants depuis les deux abouts de la ligne. */
const FLAP_INSET = 0.42;

function centre(r: InteriorRect): [number, number] {
  return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
}

export function FareGates({
  it,
  m,
  height,
  midY,
}: {
  it: StationInterior;
  m: Mats;
  /** Hauteur libre du hall : les joues de rive montent jusqu'au plafond. */
  height: number;
  midY: number;
}) {
  return (
    <group name="gare/hall/portillons">
      {it.gate.cabinets.map((c, k) => {
        const [cx, cz] = centre(c);
        const w = c.x1 - c.x0;
        const d = c.z1 - c.z0;
        // Une joue de rive - ce qui reste entre la dernière borne et la paroi -
        // monte jusqu'au plafond : ce n'est pas un portillon, c'est un mur.
        const jamb = w > 0.5;
        if (jamb) {
          return (
            <mesh key={`cab${k}`} position={[cx, midY, cz]} material={m.hall}>
              <boxGeometry args={[w, height, d]} />
            </mesh>
          );
        }
        return (
          <group key={`cab${k}`} position={[cx, it.floorY, cz]}>
            {/* Le fût de la borne : tôle claire, arêtes vives. */}
            <mesh position={[0, CABINET_H / 2, 0]} material={m.psd}>
              <boxGeometry args={[w, CABINET_H, d]} />
            </mesh>
            {/* Socle sombre : il décolle la borne du sol, comme tout mobilier
                de gare - et il cache le point de fuite du carrelage. */}
            <mesh position={[0, 0.045, 0]} material={m.frame}>
              <boxGeometry args={[w + 0.02, 0.09, d + 0.02]} />
            </mesh>
            {/* Le chapeau noir mat : c'est le plan sur lequel on pose la main. */}
            <mesh position={[0, CABINET_H + 0.012, 0]} material={m.frame}>
              <boxGeometry args={[w + 0.02, 0.024, d]} />
            </mesh>
            {/* Bandeau jaune au ras du sol sur les deux flancs : le repère de
                file, qu'on suit du pied sans le regarder. */}
            {[-1, 1].map((s) => (
              <mesh
                key={`stripe${s}`}
                position={[(s * (w + 0.004)) / 2, 0.14, 0]}
                material={m.stairNose}
              >
                <boxGeometry args={[0.004, 0.05, d - 0.1]} />
              </mesh>
            ))}
          </group>
        );
      })}

      {it.gate.passages.map((p, i) => (
        <Passage key={`pg${i}`} it={it} m={m} index={i} x={p.x} width={p.width} wide={p.wide} />
      ))}
    </group>
  );
}

/**
 * Un passage : ses deux paires de battants, ses deux lecteurs, ses deux feux.
 *
 * Tout y va par deux parce qu'un portillon est BIDIRECTIONNEL : on entre par
 * l'un et on sort par l'autre, et c'est le même matériel retourné. Le lecteur
 * est à main droite dans chaque sens - donc jamais sur la même borne.
 */
function Passage({
  it,
  m,
  index,
  x,
  width,
  wide,
}: {
  it: StationInterior;
  m: Mats;
  index: number;
  x: number;
  width: number;
  wide: boolean;
}) {
  const leaves = useRef<(THREE.Group | null)[]>([]);
  const lights = useRef<(THREE.Group | null)[]>([]);
  const half = width / 2;
  const z0 = it.gate.z0 + FLAP_INSET;
  const z1 = it.gate.z1 - FLAP_INSET;

  useFrame(() => {
    const s = gateStates()[index];
    if (!s) return;
    const a = (Math.PI / 2) * s.flap;
    // Quatre vantaux : deux par about, l'un rabattu vers +z, l'autre vers -z.
    // Les angles au repos (battants en travers) sont 0 et π ; l'ouverture les
    // escamote d'un quart de tour dans la borne qui les porte.
    const set = [-a, Math.PI + a, a, Math.PI - a];
    for (let k = 0; k < 4; k++) {
      const g = leaves.current[k];
      if (g) g.rotation.y = set[k];
    }
    for (const g of lights.current) {
      if (!g) continue;
      g.children[0].visible = s.light !== 'deny';
      g.children[1].visible = s.light === 'deny';
    }
  });

  const leafLen = half + 0.012;

  return (
    <group>
      {/* Les battants. Ambre translucide : c'est la matière réelle, et elle a
          une raison d'être - on voit à travers qui arrive en face. */}
      {[
        { hx: x - half, z: z0, k: 0 },
        { hx: x + half, z: z0, k: 1 },
        { hx: x - half, z: z1, k: 2 },
        { hx: x + half, z: z1, k: 3 },
      ].map((f) => (
        <group
          key={`leaf${f.k}`}
          ref={(g) => {
            leaves.current[f.k] = g;
          }}
          position={[f.hx, it.floorY + 0.3, f.z]}
        >
          <mesh position={[leafLen / 2, 0, 0]}>
            <boxGeometry args={[leafLen, FLAP_H, FLAP_T]} />
            <meshPhysicalMaterial
              color="#e0a03a"
              transparent
              opacity={0.66}
              roughness={0.18}
              metalness={0.05}
              emissive="#7a4d08"
              emissiveIntensity={0.18}
            />
          </mesh>
          {/* Le bord d'attaque, plus sombre : c'est ce qu'on voit venir. */}
          <mesh position={[leafLen - 0.012, 0, 0]} material={m.frame}>
            <boxGeometry args={[0.024, FLAP_H, FLAP_T + 0.006]} />
          </mesh>
        </group>
      ))}

      {/* Les lecteurs. Sens +z (vers la sortie) : à main droite, donc côté -x.
          Sens -z (vers les quais) : côté +x. Les cotes sont celles que le
          registre d'appareils vise (systems/devices) - à un centimètre près,
          l'invite apparaîtrait devant un endroit où il n'y a rien. */}
      <Reader
        m={m}
        id={`gt${index}`}
        dir={1}
        x={x - half - CABINET_HALF_X}
        y={it.floorY}
        z={it.gate.z0 + 0.28}
        yaw={0}
      />
      <Reader
        m={m}
        id={`gt${index}`}
        dir={-1}
        x={x + half + CABINET_HALF_X}
        y={it.floorY}
        z={it.gate.z1 - 0.28}
        yaw={Math.PI}
      />

      {/* Les feux, au nez de chaque about, face à qui arrive. */}
      {[
        { z: it.gate.z0 - 0.02, yaw: Math.PI, k: 0 },
        { z: it.gate.z1 + 0.02, yaw: 0, k: 1 },
      ].map((f) => (
        <group
          key={`sig${f.k}`}
          ref={(g) => {
            lights.current[f.k] = g;
          }}
          position={[x, it.floorY + CABINET_H + 0.16, f.z]}
          rotation={[0, f.yaw, 0]}
        >
          <Chevron />
          <Cross />
        </group>
      ))}

      {/* Le passage large porte sa marque au sol : le pictogramme fauteuil,
          réduit ici à sa dalle bleue. C'est ainsi qu'on le repère de loin, bien
          avant de compter les bornes. */}
      {wide && (
        <mesh
          position={[x, it.floorY + 0.009, (it.gate.z0 + it.gate.z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width * 0.7, 0.7]} />
          <meshStandardMaterial color="#1f5fbf" roughness={0.7} />
        </mesh>
      )}
    </group>
  );
}

/**
 * La platine du lecteur : le plan incliné bleu, son cercle, et le 「IC」.
 *
 * L'inclinaison n'est pas décorative - c'est ce qui fait qu'on y pose la carte
 * à plat sans se pencher, et c'est à cette pente qu'on reconnaît un lecteur
 * d'un simple bandeau lumineux.
 */
function Reader({
  m,
  id,
  dir,
  x,
  y,
  z,
  yaw,
}: {
  m: Mats;
  /** Passage auquel ce lecteur appartient. */
  id: string;
  /** Sens de franchissement : +1 vers la sortie, -1 vers les quais. */
  dir: 1 | -1;
  x: number;
  y: number;
  z: number;
  yaw: number;
}) {
  const target = usePickable<THREE.Mesh>({ id, kind: 'gate', dir });
  return (
    <group position={[x, y + CABINET_H + 0.03, z]} rotation={[0, yaw, 0]}>
      {/* La cible de visée : la main sait où est le lecteur sans le regarder,
          le réticule non - on lui donne une surface de la taille d'une paume,
          au-dessus de la platine. */}
      <mesh ref={target} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <GateDisplay index={Number(id.slice(2))} />
      {/* Le caisson qui porte la platine, légèrement surélevé sur la borne. */}
      <mesh position={[0, 0.026, 0]} material={m.frame}>
        <boxGeometry args={[0.3, 0.052, 0.3]} />
      </mesh>
      <group position={[0, 0.062, -0.01]} rotation={[-0.42, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.26, 0.014, 0.22]} />
          <meshStandardMaterial color="#123a78" roughness={0.4} metalness={0.15} />
        </mesh>
        {/* La cible : le disque clair où l'on pose, et son anneau lumineux. */}
        <mesh position={[0, 0.009, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.072, 24]} />
          <meshStandardMaterial
            color="#3c9ad6"
            emissive="#2f86c4"
            emissiveIntensity={0.55}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.0095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.078, 0.088, 24]} />
          <meshStandardMaterial
            color="#eef4f7"
            emissive="#cfe4f2"
            emissiveIntensity={0.4}
            roughness={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

/** Le chevron vert : passage ouvert. Deux barres en V, et rien de plus. */
function Chevron() {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.045, -0.018, 0]} rotation={[0, 0, s * 0.72]}>
          <boxGeometry args={[0.026, 0.11, 0.014]} />
          <meshStandardMaterial
            color="#2fbf5a"
            emissive="#2fbf5a"
            emissiveIntensity={0.95}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** La croix rouge : passage barré. */
function Cross() {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[0, 0, (s * Math.PI) / 4]}>
          <boxGeometry args={[0.026, 0.15, 0.014]} />
          <meshStandardMaterial
            color="#e2352c"
            emissive="#e2352c"
            emissiveIntensity={0.95}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * La petite dalle de la borne : ce que le portillon vient de répondre.
 *
 * C'est le SEUL endroit où le verdict d'un passage s'écrit. Un portillon réel
 * n'ouvre pas de fenêtre devant vos yeux : il allume trois centimètres carrés
 * au-dessus de sa platine - le tarif prélevé, le solde restant, ou le motif du
 * refus - et l'on baisse les yeux dessus une demi-seconde en passant. Vert sur
 * noir quand ça passe, rouge quand ça ne passe pas.
 *
 * Elle reste noire au repos : une dalle allumée en permanence attirerait l'œil
 * pour ne rien dire, ce qui est le contraire de son office.
 */
function GateDisplay({ index }: { index: number }) {
  const lang = useStore((s) => s.lang);
  const display = useMemo(() => makeGateDisplay(), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: display.texture, toneMapped: false }),
    [display],
  );
  useEffect(
    () => () => {
      mat.dispose();
      display.texture.dispose();
    },
    [mat, display],
  );

  const drawn = useRef('');
  useFrame(() => {
    const s = gateStates()[index];
    const v = s?.verdict ?? null;
    const key = v ? JSON.stringify(v) + lang : '';
    if (drawn.current === key) return;
    drawn.current = key;
    const t = STRINGS[lang].devices.gate;
    if (!v) return display.redraw('', '', false);
    if (v.ok) {
      const head = v.entering ? t.entered : t.exited.replace('{n}', String(v.fare));
      const sub = v.balance === null ? '' : t.balance.replace('{n}', String(v.balance));
      return display.redraw(head, sub, false);
    }
    const head =
      v.reason === 'noMedia'
        ? t.noMedia
        : v.reason === 'lowBalance'
          ? t.lowBalance.replace('{n}', String(v.due))
          : t.shortFare.replace('{n}', String(v.due));
    display.redraw(head, '精算機へ', true);
  });

  return (
    <group position={[0, 0.1, 0.16]} rotation={[-0.5, 0, 0]}>
      <mesh material={mat}>
        <planeGeometry args={[0.24, 0.12]} />
      </mesh>
      <mesh position={[0, 0, -0.006]}>
        <boxGeometry args={[0.27, 0.15, 0.012]} />
        <meshStandardMaterial color="#15181b" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Ce qu'affiche une borne, pour les sondes de développement. */
export type { GateVerdict };
