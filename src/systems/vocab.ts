// Vocabulaire du wagon (clin d'œil à Shashingo) : regarder un objet affiche
// sa fiche japonaise. Points d'intérêt fixes + sélection par cône de regard.

import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { BENCHES } from './seats';

export interface VocabWord {
  jp: string;
  kana: string;
  romaji: string;
  fr: string;
}

export const VOCAB: Record<string, VocabWord> = {
  tsurikawa: { jp: 'つり革', kana: 'つりかわ', romaji: 'tsurikawa', fr: 'poignée de maintien' },
  door: { jp: 'ドア', kana: 'どあ', romaji: 'doa', fr: 'porte' },
  seat: { jp: '座席', kana: 'ざせき', romaji: 'zaseki', fr: 'siège' },
  priority: { jp: '優先席', kana: 'ゆうせんせき', romaji: 'yūsenseki', fr: 'siège prioritaire' },
  screen: { jp: '案内画面', kana: 'あんないがめん', romaji: 'annai gamen', fr: "écran d'information" },
  ad: { jp: '広告', kana: 'こうこく', romaji: 'kōkoku', fr: 'publicité' },
  window: { jp: '窓', kana: 'まど', romaji: 'mado', fr: 'fenêtre' },
  rack: { jp: '網棚', kana: 'あみだな', romaji: 'amidana', fr: 'porte-bagages' },
  handrail: { jp: '手すり', kana: 'てすり', romaji: 'tesuri', fr: "barre d'appui" },
};

interface Hotspot {
  id: keyof typeof VOCAB;
  pos: THREE.Vector3;
}

function buildHotspots(): Hotspot[] {
  const list: Hotspot[] = [];
  const sides: (1 | -1)[] = [1, -1];
  // Portes.
  for (const s of sides) {
    for (const z of CONFIG.doorCenters) {
      list.push({ id: 'door', pos: new THREE.Vector3(s * 1.38, 1.2, z) });
      list.push({ id: 'screen', pos: new THREE.Vector3(s * 1.34, 2.07, z) });
    }
  }
  // Tsurikawa, le long des deux rails.
  for (const x of [0.45, -0.45]) {
    for (let z = -9; z <= 9; z += 1) {
      list.push({ id: 'tsurikawa', pos: new THREE.Vector3(x, 1.82, z) });
    }
  }
  // Sièges, dossiers et porte-bagages par banquette.
  for (const s of sides) {
    for (const b of BENCHES) {
      const zc = (b.z0 + b.z1) / 2;
      list.push({ id: b.priority ? 'priority' : 'seat', pos: new THREE.Vector3(s * 1.05, 0.65, zc) });
      if (!b.priority) {
        list.push({ id: 'rack', pos: new THREE.Vector3(s * 1.2, 1.8, zc) });
        // Arceaux intermédiaires.
        list.push({ id: 'handrail', pos: new THREE.Vector3(s * 0.9, 1.1, b.z0 + (b.z1 - b.z0) * 0.29) });
      }
      // Fenêtre au-dessus de la banquette.
      list.push({ id: 'window', pos: new THREE.Vector3(s * 1.38, 1.3, zc) });
    }
  }
  // Affiches suspendues.
  for (let i = 0; i < 6; i++) {
    list.push({ id: 'ad', pos: new THREE.Vector3(i % 2 === 0 ? -0.16 : 0.16, 1.77, -8.6 + i * 3.1) });
  }
  return list;
}

const HOTSPOTS = buildHotspots();
const toPoint = new THREE.Vector3();

// Renvoie l'identifiant du mot regardé, ou null. `current` bénéficie d'une
// hystérésis pour éviter le clignotement en bord de cône.
export function lookupVocab(
  camPos: THREE.Vector3,
  dir: THREE.Vector3,
  current: string | null,
): string | null {
  let bestId: string | null = null;
  let bestScore = 0;
  for (const h of HOTSPOTS) {
    toPoint.subVectors(h.pos, camPos);
    const dist = toPoint.length();
    if (dist > 4.5 || dist < 0.3) continue;
    toPoint.normalize();
    const cos = toPoint.dot(dir);
    const threshold = h.id === current ? 0.978 : 0.986;
    if (cos < threshold) continue;
    const score = cos - dist * 0.004;
    if (score > bestScore) {
      bestScore = score;
      bestId = h.id;
    }
  }
  return bestId;
}
