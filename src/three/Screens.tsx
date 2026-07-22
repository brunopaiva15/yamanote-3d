// Doubles écrans LCD au-dessus des portes (E235) : écran gauche = prochaine
// station, écran droit = schéma de ligne / bandeau info. Deux CanvasTexture
// partagées par tous les écrans, redessinées uniquement aux changements.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { STATIONS } from '../data/stations';
import { useStore, type Phase } from '../store';
import { runtime } from '../systems/runtime';
import { JP_FONT } from '../textures/procedural';

const W = 512;
const H = 216;
const YAMANOTE_GREEN = '#80c241';

function makeScreen(): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, g, texture };
}

function fmtClock(clockMin: number): string {
  const total = Math.floor(clockMin) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function drawLeft(g: CanvasRenderingContext2D, index: number, phase: Phase, side: 1 | -1, clock: string): void {
  const st = STATIONS[index];
  const arriving = phase === 'brake' || phase === 'dwell';
  g.fillStyle = '#10151a';
  g.fillRect(0, 0, W, H);
  // Bandeau vert Yamanote.
  g.fillStyle = YAMANOTE_GREEN;
  g.fillRect(0, 0, W, 46);
  g.fillStyle = '#0e1508';
  g.font = `bold 26px ${JP_FONT}`;
  g.textAlign = 'left';
  g.fillText(arriving ? (phase === 'dwell' ? 'ただいま' : 'まもなく') : 'つぎは', 14, 33);
  g.font = `20px ${JP_FONT}`;
  g.fillText(arriving ? (phase === 'dwell' ? 'Now at' : 'Arriving at') : 'Next', 130, 32);
  g.textAlign = 'right';
  g.font = `bold 24px ${JP_FONT}`;
  g.fillText(clock, W - 14, 33);
  // Pastille JY.
  g.fillStyle = YAMANOTE_GREEN;
  g.beginPath();
  g.roundRect(16, 70, 78, 78, 12);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `bold 24px ${JP_FONT}`;
  g.fillText('JY', 55, 100);
  g.font = `bold 30px ${JP_FONT}`;
  g.fillText(STATIONS[index].jy.slice(2), 55, 136);
  // Nom kanji en gros + romaji.
  g.fillStyle = '#f2f2ee';
  const kanjiSize = st.kanji.length > 5 ? 40 : 58;
  g.font = `bold ${kanjiSize}px ${JP_FONT}`;
  g.fillText(st.kanji, 290, 120);
  g.font = `26px ${JP_FONT}`;
  g.fillStyle = '#b9c2c8';
  g.fillText(st.romaji, 290, 156);
  // Côté de sortie.
  g.fillStyle = '#1c242b';
  g.fillRect(0, H - 40, W, 40);
  g.fillStyle = '#e8c33a';
  g.font = `bold 22px ${JP_FONT}`;
  g.fillText(
    side === 1 ? 'でぐち Exit ▶▶' : '◀◀ でぐち Exit',
    W / 2,
    H - 12,
  );
  g.textAlign = 'left';
}

function drawRight(g: CanvasRenderingContext2D, index: number, phase: Phase, banner: boolean): void {
  g.fillStyle = '#10151a';
  g.fillRect(0, 0, W, H);
  if (banner) {
    // Bandeau info alterné.
    g.fillStyle = '#1c242b';
    g.fillRect(0, 0, W, H);
    g.fillStyle = YAMANOTE_GREEN;
    g.fillRect(0, 0, W, 8);
    g.fillRect(0, H - 8, W, 8);
    g.fillStyle = '#f2f2ee';
    g.textAlign = 'center';
    g.font = `bold 30px ${JP_FONT}`;
    g.fillText('優先席付近では', W / 2, 78);
    g.fillText('マナーモードに設定', W / 2, 120);
    g.font = `20px ${JP_FONT}`;
    g.fillStyle = '#b9c2c8';
    g.fillText('Please set your phone to silent mode', W / 2, 164);
    g.textAlign = 'left';
    return;
  }
  // Schéma de ligne : 5 prochaines stations.
  g.fillStyle = '#f2f2ee';
  g.font = `bold 20px ${JP_FONT}`;
  g.fillText('山手線 Yamanote Line', 14, 30);
  const y = 105;
  g.strokeStyle = YAMANOTE_GREEN;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(30, y);
  g.lineTo(W - 30, y);
  g.stroke();
  const atStation = phase === 'dwell';
  for (let k = 0; k < 5; k++) {
    const stIdx = (index + k) % 30;
    const x = 55 + k * ((W - 110) / 4);
    g.beginPath();
    g.arc(x, y, k === 0 ? 13 : 9, 0, Math.PI * 2);
    g.fillStyle = k === 0 ? '#d0342c' : '#f2f2ee';
    g.fill();
    g.fillStyle = k === 0 ? '#ffd9d6' : '#cfd6da';
    g.font = k === 0 ? `bold 19px ${JP_FONT}` : `17px ${JP_FONT}`;
    g.textAlign = 'center';
    const name = STATIONS[stIdx].kanji;
    g.fillText(name.length > 4 ? name.slice(0, 4) : name, x, y - 28);
    // Temps estimé (2 min par station).
    g.fillStyle = '#8d979e';
    g.font = `15px ${JP_FONT}`;
    const eta = atStation ? k * 2 : k * 2 + 1;
    g.fillText(k === 0 && atStation ? '' : `${eta}分`, x, y + 34);
  }
  g.textAlign = 'left';
}

export function Screens() {
  const left = useMemo(() => makeScreen(), []);
  const right = useMemo(() => makeScreen(), []);
  const lastKey = useRef('');
  const acc = useRef(0);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.4) return;
    acc.current = 0;
    const { index, phase, doorSide } = useStore.getState();
    const clock = fmtClock(runtime.clockMin);
    const banner = Math.floor(runtime.clockMin * 4) % 3 === 2; // alternance ~15 s
    const key = `${index}|${phase}|${doorSide}|${clock}|${banner}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    drawLeft(left.g, index, phase, doorSide, clock);
    drawRight(right.g, index, phase, banner);
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
