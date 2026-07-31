// Tous les matériaux d'une gare, dérivés de sa palette.
//
// Extraits de Station.tsx : les charpentes signature (three/station/signatures)
// en ont besoin des mêmes, et Station importe déjà les signatures - les laisser
// là-bas aurait fermé le cycle.

import * as THREE from 'three';
import type { StationPalette } from '../../data/stationLayouts';

export type StationTextures = {
  floor: THREE.Texture;
  tactile: THREE.Texture;
  ads: THREE.Texture[];
};

export function makeStationMaterials(p: StationPalette, textures: StationTextures) {
  return {
      slab: new THREE.MeshStandardMaterial({
        map: textures.floor,
        color: p.slab,
        roughness: 0.94,
        emissive: p.slab,
        emissiveIntensity: 0.12,
      }),
      tactile: new THREE.MeshStandardMaterial({
        map: textures.tactile,
        color: '#e8c84a',
        roughness: 0.82,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      edge: new THREE.MeshStandardMaterial({
        color: '#f2f2ef',
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      queue: new THREE.MeshBasicMaterial({
        color: '#e8e4d8',
        transparent: true,
        opacity: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        toneMapped: false,
      }),
      rubber: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.95 }),
      psd: new THREE.MeshStandardMaterial({ color: '#d8dad6', roughness: 0.62, metalness: 0.18 }),
      // Joint de rive des vantaux : le caoutchouc sombre du bord de fermeture.
      psdJoint: new THREE.MeshStandardMaterial({ color: '#3a3f45', roughness: 0.78, metalness: 0.12 }),
      glass: new THREE.MeshStandardMaterial({
        color: '#9eb4c4',
        roughness: 0.15,
        metalness: 0.05,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
      accent: new THREE.MeshStandardMaterial({ color: p.accent, roughness: 0.68 }),
      canopy: new THREE.MeshStandardMaterial({
        color: p.canopy,
        roughness: 0.9,
        metalness: 0.15,
        // Sous un auvent, aucune lumière directe n'atteint la sous-face : sans
        // ce rappel, elle vire au noir dès qu'on marche dessous.
        emissive: p.canopy,
        emissiveIntensity: 0.34,
      }),
      beam: new THREE.MeshStandardMaterial({
        color: p.canopy,
        roughness: 0.78,
        metalness: 0.3,
        emissive: p.canopy,
        emissiveIntensity: 0.28,
      }),
      column: new THREE.MeshStandardMaterial({
        color: p.column,
        roughness: 0.72,
        metalness: 0.18,
        emissive: p.column,
        emissiveIntensity: 0.16,
      }),
      wall: new THREE.MeshStandardMaterial({
        color: p.wall,
        roughness: 0.92,
        emissive: p.wall,
        emissiveIntensity: 0.14,
      }),
      wallDark: new THREE.MeshStandardMaterial({ color: p.column, roughness: 0.9 }),
      // Parois et plafond du niveau de correspondance.
      //
      // Ce ne sont PAS celles du quai, et les prendre telles quelles donnait un
      // couloir de brique sombre sous la halle de Tokyo : la palette de quai
      // décrit ce qu'on voit à ciel ouvert - maçonnerie, acier peint, verrières
      // -, alors qu'un souterrain de gare est un volume clos, éclairé
      // artificiellement, et donc PÂLE. Il l'est d'autant plus que la lumière
      // n'y vient que des réglettes : un ton sombre y devient noir en trois
      // mètres. On garde la teinte de la gare, tirée vers le blanc.
      hall: new THREE.MeshStandardMaterial({
        color: new THREE.Color(p.wall).lerp(new THREE.Color('#f4f2ec'), 0.68),
        roughness: 0.92,
        emissive: new THREE.Color(p.wall).lerp(new THREE.Color('#ffffff'), 0.6),
        emissiveIntensity: 0.16,
      }),
      hallCeil: new THREE.MeshStandardMaterial({
        color: new THREE.Color(p.canopy).lerp(new THREE.Color('#e8e8e4'), 0.55),
        roughness: 0.95,
        emissive: new THREE.Color(p.canopy).lerp(new THREE.Color('#ffffff'), 0.5),
        emissiveIntensity: 0.12,
      }),
      // Faïence de soubassement : c'est elle qui casse le tout-gris du fond.
      tile: new THREE.MeshStandardMaterial({
        color: p.tile,
        roughness: 0.42,
        metalness: 0.04,
        emissive: p.tile,
        emissiveIntensity: 0.1,
      }),
      bench: new THREE.MeshStandardMaterial({ color: p.bench ?? '#6a5a48', roughness: 0.88 }),
      metal: new THREE.MeshStandardMaterial({ color: '#7a8088', roughness: 0.45, metalness: 0.55 }),
      frame: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.55, metalness: 0.35 }),
      lamp: new THREE.MeshStandardMaterial({
        color: p.lamp,
        emissive: p.lamp,
        emissiveIntensity: 0.9,
        roughness: 0.4,
      }),
      bin: new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.7, metalness: 0.2 }),
      kiosk: new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.78 }),
      ad: new THREE.MeshBasicMaterial({
        map: textures.ads[0],
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
      liner: new THREE.MeshStandardMaterial({ color: '#3b3f44', roughness: 0.95 }),
      // Volée d'escalier : béton lissé, plus dur et plus sourd que l'enduit des
      // joues qui l'encadrent. Sans cette différence, une trémie n'était qu'un
      // dégradé de gris où l'on ne distinguait aucune marche.
      stair: new THREE.MeshStandardMaterial({
        color: p.column,
        roughness: 0.88,
        emissive: p.column,
        emissiveIntensity: 0.1,
      }),
      // Nez de marche antidérapant : la bande jaune de toute volée JR. Un rappel
      // d'émissif la tient lisible au fond de la trémie, où plus rien n'éclaire.
      stairNose: new THREE.MeshStandardMaterial({
        color: '#e5b02f',
        roughness: 0.72,
        emissive: '#e5b02f',
        emissiveIntensity: 0.35,
      }),
    };

}

export type Mats = ReturnType<typeof makeStationMaterials>;
