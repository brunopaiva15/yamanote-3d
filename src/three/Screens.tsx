// Doubles écrans LCD au-dessus des portes (E235) : écran gauche = prochaine
// station, écran droit = écran de ligne fidèle au vrai afficheur JR East
// (bandeau noir, arc vert avec minutes, liste de stations, correspondances).
// Deux CanvasTexture partagées, redessinées uniquement aux changements.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { STATIONS, TRANSFERS } from '../data/stations';
import { useStore, type Phase } from '../store';
import { runtime } from '../systems/runtime';
import { JP_FONT } from '../textures/procedural';

const YAMANOTE_GREEN = '#80c241';

// Codes trois lettres officiels JR East (grandes gares uniquement).
const THREE_LETTER: Record<string, string> = {
  JY01: 'TYO',
  JY03: 'AKB',
  JY05: 'UEN',
  JY13: 'IKB',
  JY17: 'SJK',
  JY20: 'SBY',
  JY25: 'SGW',
};

// Grandes gares pour le « Bound for … & … ».
const MAJOR_INDICES = [0, 4, 12, 16, 19, 24];

function makeScreen(w: number, h: number): {
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  w: number;
  h: number;
} {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { g, texture, w, h };
}

function fmtClock(clockMin: number): string {
  const total = Math.floor(clockMin) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Secondes restantes avant l'arrivée à la prochaine station.
function secondsToArrival(phase: Phase, phaseT: number): number {
  if (phase === 'cruise') return Math.max(0, CONFIG.cruiseTime - phaseT) + CONFIG.brakeTime;
  if (phase === 'brake') return Math.max(0, CONFIG.brakeTime - phaseT);
  if (phase === 'depart') return Math.max(0, CONFIG.departTime - phaseT) + CONFIG.cruiseTime + CONFIG.brakeTime;
  return 0;
}

function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number, basePx: number, weight = 'bold'): void {
  let px = basePx;
  do {
    g.font = `${weight} ${px}px ${JP_FONT}`;
    if (g.measureText(text).width <= maxWidth) return;
    px -= 2;
  } while (px > 10);
}

// --- Écran gauche : prochaine station ---
function drawLeft(
  s: ReturnType<typeof makeScreen>,
  index: number,
  phase: Phase,
  side: 1 | -1,
  clock: string,
): void {
  const { g, w, h } = s;
  const st = STATIONS[index];
  const arriving = phase === 'brake' || phase === 'dwell';
  g.fillStyle = '#10151a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(0, 0, w, 46);
  g.fillStyle = '#0e1508';
  g.font = `bold 26px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText(arriving ? (phase === 'dwell' ? 'ただいま' : 'まもなく') : 'つぎは', 14, 33);
  g.font = `20px ${JP_FONT}`;
  g.fillText(arriving ? (phase === 'dwell' ? 'Now at' : 'Arriving at') : 'Next', 130, 32);
  g.textAlign = 'right';
  g.font = `bold 24px ${JP_FONT}`;
  g.fillText(clock, w - 14, 33);
  g.fillStyle = YAMANOTE_GREEN;
  g.beginPath();
  g.roundRect(16, 70, 78, 78, 12);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 24px ${JP_FONT}`;
  g.fillText('JY', 55, 100);
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText(st.jy.slice(2), 55, 136);
  g.fillStyle = '#f2f2ee';
  fitText(g, st.kanji, 330, 58);
  g.fillText(st.kanji, 300, 120);
  g.fillStyle = '#b9c2c8';
  fitText(g, st.romaji, 330, 26, '');
  g.fillText(st.romaji, 300, 156);
  g.fillStyle = '#1c242b';
  g.fillRect(0, h - 40, w, 40);
  g.fillStyle = '#e8c33a';
  g.font = `bold 22px ${JP_FONT}`;
  g.fillText(side === 1 ? 'でぐち Exit ▶▶' : '◀◀ でぐち Exit', w / 2, h - 12);
  g.textAlign = 'left';
}

// --- Écran droit : écran de ligne JR East (arc vert, minutes, stations) ---
function drawRoute(s: ReturnType<typeof makeScreen>, index: number, phase: Phase, countdown: number): void {
  const { g, w, h } = s;
  const next = STATIONS[index];

  // Corps clair.
  g.fillStyle = '#eceae5';
  g.fillRect(0, 0, w, h);

  // ----- Bandeau noir supérieur -----
  const HEADER = 88;
  g.fillStyle = '#111214';
  g.fillRect(0, 0, w, HEADER);
  // « Bound for » : les deux prochaines grandes gares.
  const majors: string[] = [];
  for (let k = 1; k <= 29 && majors.length < 2; k++) {
    const idx = (index + k) % 30;
    if (MAJOR_INDICES.includes(idx)) majors.push(STATIONS[idx].romaji);
  }
  g.fillStyle = '#c9ccd0';
  g.font = `17px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText('Bound for', 12, 24);
  g.fillStyle = '#ffffff';
  fitText(g, `${majors[0] ?? ''}&`, 175, 22);
  g.fillText(`${majors[0] ?? ''}&`, 12, 50);
  fitText(g, majors[1] ?? '', 175, 22);
  g.fillText(majors[1] ?? '', 12, 76);
  // Onglet vert « Next ».
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(196, 0, 64, HEADER);
  g.fillStyle = '#ffffff';
  g.font = `bold 22px ${JP_FONT}`;
  g.textAlign = 'center';
  g.fillText('Next', 228, 28);
  // Tuile noire avec code 3 lettres + pastille JY.
  const code = THREE_LETTER[next.jy];
  g.fillStyle = '#000000';
  g.beginPath();
  g.roundRect(268, 6, 84, HEADER - 12, 8);
  g.fill();
  if (code) {
    g.fillStyle = '#ffffff';
    g.font = `bold 16px ${JP_FONT}`;
    g.fillText(code, 310, 24);
  }
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(282, code ? 30 : 16, 56, 52, 8);
  g.fill();
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(284, code ? 32 : 18, 52, 48, 7);
  g.stroke();
  g.fillStyle = '#111214';
  g.font = `bold 14px ${JP_FONT}`;
  g.fillText('JY', 310, code ? 48 : 34);
  g.font = `bold 22px ${JP_FONT}`;
  g.fillText(next.jy.slice(2), 310, code ? 74 : 62);
  // Grand nom romaji.
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  fitText(g, next.romaji, w - 380 - 130, 54);
  g.fillText(next.romaji, 368, 62);
  // Compte à rebours + numéro de voiture.
  g.textAlign = 'right';
  g.fillStyle = '#ffffff';
  g.font = `bold 26px ${JP_FONT}`;
  const mm = String(Math.floor(countdown / 60)).padStart(2, '0');
  const ss = String(Math.floor(countdown % 60)).padStart(2, '0');
  g.fillText(phase === 'dwell' ? '00:00' : `${mm}:${ss}`, w - 12, 30);
  g.fillStyle = '#8d939a';
  g.font = `15px ${JP_FONT}`;
  g.fillText('Car No 3', w - 12, 54);

  // ----- Courbe verte de la ligne, calée sur l'afficheur réel -----
  // Points de passage (cercles des minutes), k = 0 : prochaine station en
  // bas à droite, k = 4 : la plus lointaine en haut à gauche.
  const CIRCLES: [number, number][] = [
    [476, 279],
    [421, 224],
    [361, 183],
    [294, 150],
    [230, 127],
  ];
  const path: [number, number][] = [
    [-40, 112],
    CIRCLES[4],
    CIRCLES[3],
    CIRCLES[2],
    CIRCLES[1],
    CIRCLES[0],
    [520, 356],
  ];
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = 44;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(path[0][0], path[0][1]);
  // Chaîne de quadratiques passant par les milieux : courbe lisse.
  for (let i = 1; i < path.length - 1; i++) {
    const mxp = (path[i][0] + path[i + 1][0]) / 2;
    const myp = (path[i][1] + path[i + 1][1]) / 2;
    g.quadraticCurveTo(path[i][0], path[i][1], mxp, myp);
  }
  g.lineTo(path[path.length - 1][0], path[path.length - 1][1]);
  g.stroke();
  // Chevron rouge : sens de marche, en bout de courbe.
  g.fillStyle = '#c8362c';
  g.save();
  g.translate(495, 310);
  g.rotate(1.05);
  g.beginPath();
  g.moveTo(-10, -18);
  g.lineTo(22, 0);
  g.lineTo(-10, 18);
  g.lineTo(2, 0);
  g.closePath();
  g.fill();
  g.restore();

  // ----- 5 prochaines stations : cercles des minutes + cascade kanji -----
  // Positions calées sur l'afficheur réel : les rangées ont leur propre
  // ligne de base, légèrement au-dessus de leur cercle.
  const BADGE_X = [564, 516, 441, 357, 274];
  const BASE_Y = [278, 226, 180, 146, 118];
  const atStation = phase === 'dwell';
  for (let k = 4; k >= 0; k--) {
    const stIdx = (index + k) % 30;
    const st = STATIONS[stIdx];
    const [mx, my] = CIRCLES[k];
    // Cercle des minutes (jaune pour la prochaine).
    const minutes = atStation ? k * 2 : k * 2 + Math.max(1, Math.ceil(countdown / 60));
    g.beginPath();
    g.arc(mx, my, k === 0 ? 23 : 19, 0, Math.PI * 2);
    g.fillStyle = k === 0 ? '#e8c033' : '#ffffff';
    g.fill();
    g.fillStyle = '#111214';
    g.font = `bold ${k === 0 ? 25 : 21}px ${JP_FONT}`;
    g.textAlign = 'center';
    g.fillText(String(k === 0 && atStation ? 0 : minutes), mx, my + 7);
    if (k === 4) {
      g.font = `12px ${JP_FONT}`;
      g.fillText('(分)', mx - 40, my + 4);
    }
    // Pastille JY + nom kanji.
    const bx = BADGE_X[k];
    const by = BASE_Y[k];
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(bx, by - 30, 36, 36, 6);
    g.fill();
    g.strokeStyle = YAMANOTE_GREEN;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(bx + 2, by - 28, 32, 32, 5);
    g.stroke();
    g.fillStyle = '#111214';
    g.font = `bold 10px ${JP_FONT}`;
    g.fillText('JY', bx + 18, by - 17);
    g.font = `bold 15px ${JP_FONT}`;
    g.fillText(st.jy.slice(2), bx + 18, by - 1);
    g.textAlign = 'left';
    const name = st.kanji.length === 2 ? `${st.kanji[0]} ${st.kanji[1]}` : st.kanji;
    fitText(g, name, w - (bx + 44) - 6, 26);
    g.fillStyle = '#111214';
    g.fillText(name, bx + 44, by);
  }

  // ----- Panneau des correspondances (gare suivante), en bas à gauche -----
  const tr = TRANSFERS[next.jy];
  if (tr) {
    g.fillStyle = '#111214';
    fitText(g, `${next.kanji}駅`, 120, 20);
    g.fillText(`${next.kanji}駅`, 10, 208);
    g.font = `12px ${JP_FONT}`;
    g.fillStyle = '#3a3d42';
    g.fillText('乗換えのご案内', 10, 226);
    const lines = tr.jp.split('、').slice(0, 8);
    const colors = ['#f15a22', '#00a7e1', '#e21b30', '#009944', '#8f76d6', '#f6aa00', '#00ada9', '#b5b5ac'];
    g.font = `12px ${JP_FONT}`;
    for (let i = 0; i < lines.length; i++) {
      const col = Math.floor(i / 4);
      const row = i % 4;
      const lx = 10 + col * 112;
      const ly = 244 + row * 21;
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.roundRect(lx, ly - 11, 13, 13, 3);
      g.fill();
      g.fillStyle = '#26282c';
      let label = lines[i];
      if (label.length > 7) label = label.slice(0, 6) + '…';
      g.fillText(label, lx + 18, ly);
    }
  }

  // Mention basse.
  g.fillStyle = '#9a9d99';
  g.font = `10px ${JP_FONT}`;
  g.fillText('のりかえ、待ち合わせ時間は含まれません。乗車により多少時間が異なります。', 10, h - 5);
}

// --- Écran droit, variante bandeau info ---
function drawBanner(s: ReturnType<typeof makeScreen>): void {
  const { g, w, h } = s;
  g.fillStyle = '#1c242b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(0, 0, w, 10);
  g.fillRect(0, h - 10, w, 10);
  g.fillStyle = '#f2f2ee';
  g.textAlign = 'center';
  g.font = `bold 42px ${JP_FONT}`;
  g.fillText('優先席付近では', w / 2, h * 0.36);
  g.fillText('マナーモードに設定', w / 2, h * 0.55);
  g.font = `26px ${JP_FONT}`;
  g.fillStyle = '#b9c2c8';
  g.fillText('Please set your phone to silent mode', w / 2, h * 0.76);
  g.textAlign = 'left';
}

export function Screens() {
  const left = useMemo(() => makeScreen(512, 216), []);
  const right = useMemo(() => makeScreen(768, 324), []);
  const lastKey = useRef('');
  const acc = useRef(0);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const { index, phase, doorSide } = useStore.getState();
    const clock = fmtClock(runtime.clockMin);
    const banner = Math.floor(runtime.clockMin * 4) % 4 === 3; // bandeau ~15 s sur 60
    const countdown = Math.round(secondsToArrival(phase, runtime.phaseT));
    const key = `${index}|${phase}|${doorSide}|${clock}|${banner}|${banner ? 0 : countdown}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    drawLeft(left, index, phase, doorSide, clock);
    if (banner) drawBanner(right);
    else drawRoute(right, index, phase, countdown);
    left.texture.needsUpdate = true;
    right.texture.needsUpdate = true;
  });

  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#22262b', roughness: 0.5 }), []);
  const leftMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: left.texture, toneMapped: false }),
    [left.texture],
  );
  const rightMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: right.texture, toneMapped: false }),
    [right.texture],
  );

  const sides: (1 | -1)[] = [1, -1];

  return (
    <group>
      {sides.map((s) =>
        CONFIG.doorCenters.map((z) => (
          <group
            key={`scr${s}-${z}`}
            position={[s * (CONFIG.carHalfWidth - 0.06), 2.07, z]}
            rotation={[0, s === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            {/* Deux écrans SÉPARÉS, chacun dans son boîtier incliné vers
                l'allée, avec un espace entre eux (disposition E235). */}
            {([-1, 1] as const).map((k) => (
              <group key={`half${k}`} position={[k * 0.33, 0, 0]} rotation={[0.3, 0, 0]}>
                <mesh position={[0, 0, -0.014]} material={frameMat}>
                  <boxGeometry args={[0.53, 0.25, 0.035]} />
                </mesh>
                <mesh position={[0, 0, 0.005]} material={k === -1 ? leftMat : rightMat}>
                  <planeGeometry args={[0.47, 0.2]} />
                </mesh>
              </group>
            ))}
          </group>
        )),
      )}
    </group>
  );
}
