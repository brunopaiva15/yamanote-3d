// Les pièces d'un distributeur qu'on touche vraiment.
//
// Un 自販機 se manœuvre avec quatre organes, et ce sont quatre OBJETS : la
// vitrine et ses boutons, la fente à monnaie (avec l'avaleur de billets et le
// lecteur sans contact à côté), le levier de rendu, et le volet du 取出口. Ils
// sont ici, et ils sont les mêmes sur le quai et dans le hall - c'est le même
// matériel, il n'y avait aucune raison de l'écrire deux fois.
//
// CE QUI FAIT QU'UNE MACHINE RÉPOND. Chaque organe s'inscrit au registre de
// visée (systems/pick) avec ce qu'il sait faire. Le réticule tire un rayon, le
// touche, et la touche d'action l'actionne. Il n'y a pas d'écran qui s'ouvre :
// ce que la machine a à dire, elle l'écrit sur son afficheur de crédit et sur
// les lampes de ses boutons, exactement comme la vraie.
//
// REPÈRE LOCAL : façade en +z, largeur en x, origine au sol de la machine.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { litSlots, machineRevision, machineState } from '../../systems/machines';
import type { PickAction } from '../../systems/pick';
import { makeCreditDisplay } from '../../textures/ticket';
import { makeVendingDisplay, vendingCols, VENDING_ROWS } from '../../textures/vending';
import type { Mats } from './materials';
import { usePickable } from './pickable';
import { MONEY, PORT, SKIN, WINDOW } from './vendingGeometry';

/**
 * Surface qu'on vise sans la voir : une plaque de visée posée sur un organe
 * trop petit ou trop découpé pour être touché au pixel près.
 *
 * Ce n'est pas une facilité de jeu, c'est la restitution d'un geste : devant
 * une machine, la main trouve la fente sans que l'œil la vise - on la sait là.
 * Le réticule n'a pas cette mémoire, alors on lui donne une cible de la taille
 * d'une main. La plaque ne se voit pas (elle n'écrit ni couleur ni
 * profondeur), mais elle se touche.
 */
function Target({
  act,
  position,
  size,
}: {
  act: PickAction;
  position: [number, number, number];
  size: [number, number];
}) {
  const ref = usePickable<THREE.Mesh>(act);
  return (
    <mesh ref={ref} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

// --- La vitrine ----------------------------------------------------------

/**
 * La vitrine : le rayon réel de la machine, et les lampes de ses boutons.
 *
 * C'est la seule surface du jeu qui soit à la fois du décor et une commande.
 * Elle se redessine quand l'état de la machine bouge - une pièce de plus, et
 * les couloirs qu'on peut désormais payer s'allument. La case visée se lit en
 * coordonnée de texture (systems/pick) : pas un maillage par bouton, la trame
 * suffit, et c'est exactement ce que fait un doigt sur une dalle.
 */
export function VendingShowcase({ id, d }: { id: string; d: number }) {
  const s = machineState(id);
  const cols = s.brand ? vendingCols(s.brand) : 5;
  const display = useMemo(() => makeVendingDisplay(), []);
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

  const drawn = useRef(-1);
  useFrame(() => {
    if (drawn.current === machineRevision.n) return;
    drawn.current = machineRevision.n;
    const cur = machineState(id);
    if (cur.brand) display.redraw(cur.brand, cur.slots, litSlots(cur));
  });

  const ref = usePickable<THREE.Mesh>({ id, kind: 'vendSlot', cols, rows: VENDING_ROWS });
  const y = (WINDOW.y0 + WINDOW.y1) / 2;
  const h = WINDOW.y1 - WINDOW.y0;
  return (
    <group>
      {/* Les échantillons, au FOND de la niche : c'est le plan qu'on vise. */}
      <mesh ref={ref} position={[0, y, d / 2 + SKIN]} material={mat}>
        <planeGeometry args={[WINDOW.w, h]} />
      </mesh>
    </group>
  );
}

// --- La platine des monnayeurs -------------------------------------------

/**
 * La platine, et ses cinq organes.
 *
 * Fente à pièces, avaleur de billets, lecteur sans contact, afficheur de
 * crédit, levier de rendu : c'est très exactement ce qu'on cherche des yeux en
 * tendant la main, et c'est ce qui manquait. Chacun est un objet, chacun se
 * vise, chacun fait une chose.
 */
export function VendingPlate({ id, bw, d, m }: { id: string; bw: number; d: number; m: Mats }) {
  const y0 = MONEY.y0;
  const h = MONEY.y1 - MONEY.y0;
  const z = d / 2;
  const right = bw * 0.26;
  const left = -bw * 0.24;

  // L'afficheur : le seul endroit où cette machine écrit un nombre.
  const credit = useMemo(() => makeCreditDisplay(), []);
  const creditMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: credit.texture, toneMapped: false }),
    [credit],
  );
  useEffect(
    () => () => {
      creditMat.dispose();
      credit.texture.dispose();
    },
    [creditMat, credit],
  );
  const drawn = useRef('');
  useFrame(() => {
    const s = machineState(id);
    const text = s.ic ? 'IC' : String(s.credit);
    const key = `${text}/${s.ic}`;
    if (drawn.current === key) return;
    drawn.current = key;
    credit.redraw(text, s.ic);
  });

  // Le lecteur s'allume quand la carte est armée : c'est ce halo bleu qui dit
  // que la machine attend un bouton et non une pièce.
  const pad = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (pad.current) pad.current.emissiveIntensity = machineState(id).ic ? 1.1 : 0.35;
  });

  return (
    <group>
      {/* La platine, EN RETRAIT de la tôle : c'est un creux, pas une plaque. */}
      <mesh position={[0, y0 + h / 2, z - 0.014]} material={m.frame}>
        <boxGeometry args={[MONEY.w, h, 0.03]} />
      </mesh>

      {/* Afficheur du crédit. */}
      <mesh position={[left, y0 + h * 0.76, z - 0.002]} material={m.frame}>
        <boxGeometry args={[0.16, 0.062, 0.012]} />
      </mesh>
      <mesh position={[left, y0 + h * 0.76, z + 0.005]} material={creditMat}>
        <planeGeometry args={[0.14, 0.05]} />
      </mesh>

      {/* Lecteur sans contact : le carré bleu, sous l'afficheur. */}
      <mesh position={[left, y0 + h * 0.3, z + 0.004]}>
        <boxGeometry args={[0.12, 0.1, 0.016]} />
        <meshStandardMaterial ref={pad} color="#123a78" emissive="#2f86c4" roughness={0.4} />
      </mesh>
      <Target act={{ id, kind: 'icPad' }} position={[left, y0 + h * 0.3, z + 0.02]} size={[0.2, 0.2]} />

      {/* Fente à pièces : verticale, à droite, biseautée. */}
      <mesh position={[right, y0 + h * 0.72, z - 0.001]} rotation={[0, 0, 0.28]}>
        <boxGeometry args={[0.016, 0.062, 0.012]} />
        <meshStandardMaterial color="#08090a" roughness={0.9} />
      </mesh>
      <Target
        act={{ id, kind: 'coinSlot' }}
        position={[right, y0 + h * 0.72, z + 0.02]}
        size={[0.16, 0.16]}
      />

      {/* Avaleur de billets : la fente horizontale et sa gorge claire. */}
      <mesh position={[right, y0 + h * 0.3, z - 0.004]} material={m.metal}>
        <boxGeometry args={[0.14, 0.04, 0.008]} />
      </mesh>
      <mesh position={[right, y0 + h * 0.3, z - 0.001]}>
        <boxGeometry args={[0.11, 0.018, 0.012]} />
        <meshStandardMaterial color="#08090a" roughness={0.9} />
      </mesh>
      <Target
        act={{ id, kind: 'billSlot' }}
        position={[right, y0 + h * 0.3, z + 0.02]}
        size={[0.17, 0.13]}
      />

      {/* Levier de rendu, et la sébile qu'il remplit. */}
      <mesh position={[bw * 0.02, y0 + 0.035, z + 0.006]} material={m.metal}>
        <boxGeometry args={[0.07, 0.024, 0.02]} />
      </mesh>
      <mesh position={[bw * 0.02, y0 - 0.03, z - 0.006]}>
        <boxGeometry args={[0.13, 0.05, 0.024]} />
        <meshStandardMaterial color="#08090a" roughness={0.92} />
      </mesh>
      <Target
        act={{ id, kind: 'lever' }}
        position={[bw * 0.02, y0 + 0.02, z + 0.024]}
        size={[0.16, 0.13]}
      />
    </group>
  );
}

// --- Le volet du 取出口 --------------------------------------------------

/**
 * La niche de retrait : son fond noir, sa sébile inclinée, et le battant.
 *
 * Le battant se soulève VRAIMENT quand on ramasse (`machineState.flap`), et
 * retombe tout seul derrière la main : c'est un volet à ressort, pas une porte.
 */
export function VendingTray({ id, d, m }: { id: string; d: number; m: Mats }) {
  const flap = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = flap.current;
    if (!g) return;
    const t = machineState(id).flap;
    g.rotation.x = -(Math.sin(Math.min(1, t) * Math.PI) ** 0.6) * 1.15;
  });
  const h = PORT.y1 - PORT.y0;
  return (
    <group>
      <mesh position={[0, (PORT.y0 + PORT.y1) / 2, d / 2 + SKIN]} material={m.frame}>
        <planeGeometry args={[PORT.w, h]} />
      </mesh>
      <group ref={flap} position={[0, PORT.y1 - 0.012, d / 2 + PORT.reveal - 0.01]}>
        <mesh position={[0, -h / 2 + 0.012, 0]}>
          <boxGeometry args={[PORT.w - 0.02, h - 0.02, 0.012]} />
          <meshPhysicalMaterial
            color="#20242a"
            transparent
            opacity={0.82}
            depthWrite={false}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
        {/* La poignée : la barre claire qu'on pousse du dos de la main. */}
        <mesh position={[0, -h + 0.06, 0.009]} material={m.metal}>
          <boxGeometry args={[PORT.w * 0.5, 0.022, 0.012]} />
        </mesh>
      </group>
      {/* La sébile, au fond, légèrement inclinée : c'est ce plan qui retient la
          canette au lieu de la laisser rouler. */}
      <mesh
        position={[0, PORT.y0 + 0.03, d / 2 - 0.06]}
        rotation={[-0.22, 0, 0]}
        material={m.metal}
      >
        <boxGeometry args={[PORT.w - 0.06, 0.012, 0.12]} />
      </mesh>
      <Target
        act={{ id, kind: 'tray' }}
        position={[0, (PORT.y0 + PORT.y1) / 2, d / 2 + PORT.reveal + 0.02]}
        size={[PORT.w, h]}
      />
    </group>
  );
}

// --- Une pièce commune : l'encadrement d'une niche -----------------------

/**
 * Encadrement d'une niche : quatre tôles autour de l'ouverture, en saillie.
 * C'est ce cadre qui donne la profondeur - l'échantillon est au fond, le verre
 * au nu du cadre, et l'écart se voit de trois quarts.
 */
export function Reveal({
  b,
  d,
  m,
  t = 0.035,
}: {
  b: { y0: number; y1: number; w: number; reveal: number };
  d: number;
  m: Mats;
  t?: number;
}) {
  const y = (b.y0 + b.y1) / 2;
  const h = b.y1 - b.y0;
  const z = d / 2 + b.reveal / 2;
  return (
    <group>
      <mesh position={[0, b.y1 + t / 2, z]} material={m.frame}>
        <boxGeometry args={[b.w + 2 * t, t, b.reveal]} />
      </mesh>
      <mesh position={[0, b.y0 - t / 2, z]} material={m.frame}>
        <boxGeometry args={[b.w + 2 * t, t, b.reveal]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (b.w / 2 + t / 2), y, z]} material={m.frame}>
          <boxGeometry args={[t, h, b.reveal]} />
        </mesh>
      ))}
    </group>
  );
}
