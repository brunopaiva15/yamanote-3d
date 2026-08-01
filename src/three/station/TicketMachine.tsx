// 券売機 et 精算機 : les machines à titres.
//
// C'ÉTAIT UNE PLANCHE. Une caisse de 1,92 m avec une image de batterie de
// quatre postes collée devant : les écrans, les fentes et les lecteurs étaient
// DESSINÉS. On passait la main dessus sans rien pouvoir faire, et de trois
// quarts la machine était une affiche.
//
// CE QU'UN 券売機 EST VRAIMENT, et ce qu'on remonte ici :
//
//   • un bandeau vert JR en tête, qui dit きっぷうりば ou のりこし精算 - c'est
//     ce qu'on lit du bout du couloir ;
//   • un ÉCRAN TACTILE INCLINÉ à hauteur de poitrine, bleu de nuit, avec ses
//     cases claires. Il s'incline parce qu'on le regarde debout ; posé à plat
//     sur la façade, il refléterait les néons et on ne verrait rien ;
//   • une platine sous l'écran : fente à billets couchée, fente à pièces
//     debout, lecteur sans contact bleu en saillie ;
//   • et en bas la fente de sortie et la sébile de rendu, où tombent le billet
//     et la monnaie.
//
// Tout cela se vise et s'actionne (systems/pick) : la case de l'écran sous le
// réticule est la case qu'on presse, exactement comme un doigt sur la dalle.
// Rien ne s'ouvre devant les yeux - la machine répond sur son propre écran.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { adjustCells, ticketCells, TICKET_COLS, TICKET_ROWS } from '../../data/ticketScreen';
import { STRINGS } from '../../i18n/strings';
import { useStore } from '../../store';
import {
  amountDue,
  machineRevision,
  machineState,
  ticketPage,
} from '../../systems/machines';
import { pick } from '../../systems/pick';
import { makeTicketHeaderTexture, makeTicketScreen } from '../../textures/ticket';
import type { Mats } from './materials';
import { usePickable } from './pickable';

/** Hauteur de la caisse, et de son socle. */
const H = 1.92;
const PLINTH = 0.09;
/** Largeur d'un poste : la place d'un voyageur et de son sac. */
const POST_W = 0.92;
/** Hauteur du bandeau d'enseigne. */
const HEAD_H = 0.26;

export function TicketMachine({
  w,
  d,
  m,
  id,
  adjust,
}: {
  w: number;
  d: number;
  m: Mats;
  /** Identifiant de base : chaque poste en dérive le sien. */
  id: string;
  /** 精算機 plutôt que 券売機 : un seul bouton, et il annonce le complément. */
  adjust: boolean;
}) {
  const posts = Math.max(1, Math.round(w / POST_W));
  const pw = w / posts;

  // Le bandeau prend la FORME de la bande qui le porte : sans quoi la texture
  // s'étire sur toute la batterie et le nom de la machine avec elle.
  const bandW = w - 0.05;
  const header = useMemo(
    () => makeTicketHeaderTexture(adjust, bandW / HEAD_H),
    [adjust, bandW],
  );
  const headerMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: header, toneMapped: false }),
    [header],
  );
  useEffect(
    () => () => {
      headerMat.dispose();
      header.dispose();
    },
    [headerMat, header],
  );

  return (
    <group>
      {/* Socle, caisse, et le joint sombre entre deux postes : c'est lui qui
          fait lire une BATTERIE plutôt qu'un long meuble. */}
      <mesh position={[0, PLINTH / 2, 0]} material={m.frame}>
        <boxGeometry args={[w - 0.06, PLINTH, d - 0.06]} />
      </mesh>
      <mesh position={[0, PLINTH + (H - PLINTH) / 2, 0]} material={m.psd}>
        <boxGeometry args={[w, H - PLINTH, d]} />
      </mesh>
      <mesh position={[0, H + 0.02, 0.02]} material={m.metal}>
        <boxGeometry args={[w + 0.02, 0.05, d + 0.03]} />
      </mesh>
      {/* Bandeau d'enseigne, en tête, sur toute la batterie. */}
      <mesh position={[0, H - HEAD_H / 2 - 0.02, d / 2 + 0.008]} material={headerMat}>
        <planeGeometry args={[bandW, HEAD_H]} />
      </mesh>
      {Array.from({ length: posts - 1 }, (_, k) => (
        <mesh
          key={`joint${k}`}
          position={[-w / 2 + pw * (k + 1), PLINTH + (H - PLINTH) / 2, d / 2 + 0.004]}
          material={m.metal}
        >
          <boxGeometry args={[0.012, H - PLINTH - HEAD_H, 0.008]} />
        </mesh>
      ))}

      {Array.from({ length: posts }, (_, k) => (
        <Post
          key={`post${k}`}
          id={`${id}p${k}`}
          x={-w / 2 + pw * (k + 0.5)}
          w={pw}
          d={d}
          m={m}
          adjust={adjust}
        />
      ))}
    </group>
  );
}

/** Un poste : son écran, sa platine, sa fente de sortie. */
function Post({
  id,
  x,
  w,
  d,
  m,
  adjust,
}: {
  id: string;
  x: number;
  w: number;
  d: number;
  m: Mats;
  adjust: boolean;
}) {
  return (
    <group position={[x, 0, 0]}>
      <Screen id={id} w={w} d={d} adjust={adjust} />

      {/* La platine : billets couchés, pièces debout, lecteur en saillie.
          Trois organes, trois gestes, et c'est tout ce qu'a une vraie machine. */}
      <Slot id={id} kind="billSlot" x={-w * 0.2} y={1.02} d={d} size={[0.13, 0.02]} m={m} />
      <Slot id={id} kind="coinSlot" x={w * 0.22} y={1.03} d={d} size={[0.018, 0.055]} m={m} />
      <IcPad id={id} x={w * 0.02} y={0.92} d={d} />

      {/* Fente de sortie des titres, et sébile de rendu juste dessous : c'est
          là qu'on tend la main sans regarder, une fois l'écran éteint. */}
      <mesh position={[-w * 0.16, 0.74, d / 2 - 0.004]} material={m.metal}>
        <boxGeometry args={[0.16, 0.05, 0.014]} />
      </mesh>
      <mesh position={[-w * 0.16, 0.74, d / 2 + 0.002]}>
        <boxGeometry args={[0.12, 0.016, 0.014]} />
        <meshStandardMaterial color="#08090a" roughness={0.9} />
      </mesh>
      <mesh position={[w * 0.14, 0.7, d / 2 - 0.012]}>
        <boxGeometry args={[0.15, 0.07, 0.03]} />
        <meshStandardMaterial color="#08090a" roughness={0.92} />
      </mesh>
      <Target
        id={id}
        kind="tray"
        position={[-w * 0.02, 0.72, d / 2 + 0.03]}
        size={[w * 0.7, 0.18]}
      />
    </group>
  );
}

/**
 * L'écran tactile, incliné à trente degrés.
 *
 * Il se redessine quand l'état de la machine bouge ET quand la case visée
 * change : c'est ce second point qui fait qu'on sait sur quoi on appuie. Un
 * doigt sent le bouton ; le réticule, lui, ne sent rien - il faut donc que la
 * case s'éclaire, comme elle s'éclaire sous le doigt d'un voyageur.
 */
function Screen({ id, w, d, adjust }: { id: string; w: number; d: number; adjust: boolean }) {
  const lang = useStore((s) => s.lang);
  const screen = useMemo(() => makeTicketScreen(), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }),
    [screen],
  );
  useEffect(
    () => () => {
      mat.dispose();
      screen.texture.dispose();
    },
    [mat, screen],
  );

  const ref = usePickable<THREE.Mesh>({
    id,
    kind: 'screen',
    cols: TICKET_COLS,
    rows: TICKET_ROWS,
  });

  const drawn = useRef('');
  useFrame(() => {
    const s = machineState(id);
    const page = adjust ? 'fares' : ticketPage(id);
    const due = adjust ? amountDue() : 0;
    const cells = adjust ? adjustCells(due) : ticketCells(ticketPage(id));
    const hover = pick.hit?.act.id === id && pick.hit.act.kind === 'screen' ? pick.hit.cell : -1;
    const t = STRINGS[lang].devices;
    const status = s.notice
      ? t.notice[s.notice.key].replace('{n}', String(s.notice.amount ?? 0))
      : s.stage === 'busy'
        ? '…'
        : adjust && due <= 0
          ? t.notice.nothingDue
          : s.credit > 0
            ? `¥${s.credit}`
            : t.notice.idle;
    const key = `${machineRevision.n}/${hover}/${status}/${page}/${due}`;
    if (drawn.current === key) return;
    drawn.current = key;
    screen.redraw(cells, hover, status, page);
  });

  const sw = Math.min(w - 0.14, 0.7);
  // L'inclinaison n'est pas décorative : elle doit RENDRE L'ÉCRAN LISIBLE pour
  // quelqu'un debout à un mètre. À vingt-neuf degrés, la dalle était vue de si
  // près de son plan que les quatre rangées de boutons se tassaient en une
  // bande de trois pixels - l'écran paraissait vide. Dix-huit degrés, c'est
  // l'angle de regard réel d'un œil à 1,53 m sur une dalle à 1,36 m, et c'est
  // aussi celui des vraies machines.
  return (
    <group position={[0, 1.36, d / 2 - 0.03]} rotation={[-0.32, 0, 0]}>
      {/* Le cadre du bloc écran : une tôle noire qui déborde de deux
          centimètres, comme sur toute dalle encastrée. */}
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[sw + 0.04, sw * 0.78 + 0.04, 0.02]} />
        <meshStandardMaterial color="#15181b" roughness={0.55} />
      </mesh>
      <mesh ref={ref} position={[0, 0, 0.002]} material={mat}>
        <planeGeometry args={[sw, sw * 0.78]} />
      </mesh>
    </group>
  );
}

/** Une fente : le trou noir, sa gorge claire, et sa cible de visée. */
function Slot({
  id,
  kind,
  x,
  y,
  d,
  size,
  m,
}: {
  id: string;
  kind: 'coinSlot' | 'billSlot';
  x: number;
  y: number;
  d: number;
  size: [number, number];
  m: Mats;
}) {
  return (
    <group position={[x, y, 0]}>
      <mesh position={[0, 0, d / 2 - 0.004]} material={m.metal}>
        <boxGeometry args={[size[0] + 0.03, size[1] + 0.022, 0.01]} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.002]}>
        <boxGeometry args={[size[0], size[1], 0.012]} />
        <meshStandardMaterial color="#08090a" roughness={0.9} />
      </mesh>
      <Target id={id} kind={kind} position={[0, 0, d / 2 + 0.03]} size={[0.16, 0.14]} />
    </group>
  );
}

/** Le lecteur sans contact : la cible bleue, toujours en saillie. */
function IcPad({ id, x, y, d }: { id: string; x: number; y: number; d: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.emissiveIntensity = machineState(id).ic ? 1.1 : 0.4;
  });
  return (
    <group position={[x, y, d / 2 + 0.012]}>
      <mesh>
        <boxGeometry args={[0.13, 0.1, 0.024]} />
        <meshStandardMaterial ref={mat} color="#123a78" emissive="#2f86c4" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.014]} rotation={[0, 0, 0]}>
        <circleGeometry args={[0.032, 20]} />
        <meshStandardMaterial
          color="#8fd0f4"
          emissive="#4f9fd0"
          emissiveIntensity={0.7}
          roughness={0.35}
        />
      </mesh>
      <Target id={id} kind="icPad" position={[0, 0, 0.03]} size={[0.2, 0.18]} />
    </group>
  );
}

/**
 * Une cible de visée : la surface qu'on touche sans la voir.
 *
 * Ce n'est pas une facilité de jeu, c'est la restitution d'un geste : devant
 * une machine, la main trouve la fente sans que l'œil la vise - on la sait là.
 * Le réticule n'a pas cette mémoire, alors on lui donne une cible de la taille
 * d'une paume. Elle n'écrit ni couleur ni profondeur : elle ne se voit pas.
 */
function Target({
  id,
  kind,
  position,
  size,
}: {
  id: string;
  kind: 'coinSlot' | 'billSlot' | 'icPad' | 'tray';
  position: [number, number, number];
  size: [number, number];
}) {
  const ref = usePickable<THREE.Mesh>({ id, kind });
  return (
    <mesh ref={ref} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}
