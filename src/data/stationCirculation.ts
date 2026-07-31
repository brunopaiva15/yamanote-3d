import { layoutFor } from './stationLayouts.ts';
import { platformProfileFor, type LoopDirection } from './platforms.ts';
import { STATIONS } from './stations.ts';

export type StationLevelId = 'platform' | 'lowerConcourse' | 'upperConcourse' | 'mezzanine' | 'bridge' | 'groundHall';
export type AccessKind = 'stairs' | 'escalator' | 'elevator';
export type ConcourseFamily = 'underViaduct' | 'underpass' | 'stationBridge' | 'hubHall' | 'terminusHall' | 'special';
export interface WalkRect { x: number; z: number; halfX: number; halfZ: number }
export interface WalkSurface { id: string; level: StationLevelId; y: number; rects: WalkRect[]; obstacles: WalkRect[] }
export interface AccessSpec {
  id: string; kind: AccessKind; platformX: number; platformZ: number; yaw: number;
  fromLevel: StationLevelId; toLevel: StationLevelId; deltaY: number; width: number;
  direction: 'forward' | 'reverse'; accessible: boolean;
  escalatorDirection?: 'up' | 'down' | 'both';
}
export interface GateLineSpec { id: string; level: StationLevelId; x: number; z: number; yaw: number; width: number; gateCount: number; accessibleGate: boolean; blocksPlayer: boolean }
export interface ExitDoorSpec { id: string; level: StationLevelId; labelJa?: string; labelEn?: string; x: number; z: number; yaw: number; width: number; destinationHint?: string }
export interface ConcourseAmenitySpec {
  kind: 'ticketOffice' | 'toilets' | 'coinLockers' | 'vending' | 'newdays' | 'ecute' | 'atre' | 'information' | 'policeBox' | 'transferCorridor';
  level: StationLevelId; x: number; z: number; yaw: number; width?: number;
}
export interface ConcourseSpec {
  family: ConcourseFamily; baseFamily?: Exclude<ConcourseFamily, 'special'>;
  specialOverride?: string; levels: StationLevelId[]; surfaces: WalkSurface[];
  gates: GateLineSpec[]; exits: ExitDoorSpec[]; amenities: ConcourseAmenitySpec[];
}
export interface StationCirculation { stationCode: string; accesses: AccessSpec[]; concourse: ConcourseSpec }

type Blueprint = { family: ConcourseFamily; level?: StationLevelId; special?: string; mixed?: boolean; large?: boolean };
const B: readonly Blueprint[] = [
  { family: 'hubHall', special: 'tokyo', large: true }, { family: 'underViaduct' },
  { family: 'special', special: 'akihabara', large: true }, { family: 'underViaduct' },
  { family: 'special', special: 'ueno', mixed: true, large: true }, { family: 'underpass' },
  { family: 'stationBridge', special: 'nippori', level: 'bridge', large: true }, { family: 'underViaduct' },
  { family: 'stationBridge', level: 'bridge' }, { family: 'stationBridge', level: 'bridge' },
  { family: 'stationBridge', level: 'bridge' }, { family: 'underViaduct', special: 'otsuka' },
  { family: 'terminusHall', special: 'ikebukuro', large: true }, { family: 'stationBridge', special: 'mejiro', level: 'bridge' },
  { family: 'underViaduct' }, { family: 'underViaduct' }, { family: 'special', special: 'shinjuku', large: true },
  { family: 'special', special: 'yoyogi' }, { family: 'stationBridge', special: 'harajuku', level: 'bridge' },
  { family: 'hubHall', special: 'shibuya', large: true }, { family: 'underViaduct', special: 'ebisu' },
  { family: 'stationBridge', level: 'bridge' }, { family: 'underViaduct', special: 'gotanda' },
  { family: 'terminusHall', special: 'osaki', large: true }, { family: 'hubHall', special: 'shinagawa', large: true },
  { family: 'stationBridge', special: 'takanawaGateway', level: 'mezzanine', large: true },
  { family: 'stationBridge', level: 'bridge' }, { family: 'underViaduct', special: 'hamamatsucho' },
  { family: 'underViaduct', special: 'shimbashi' }, { family: 'underViaduct', special: 'yurakucho' },
];

function makeCirculation(index: number, b: Blueprint): StationCirculation {
  const code = STATIONS[index].jy;
  const upper = b.level === 'bridge' || b.level === 'mezzanine';
  const level: StationLevelId = b.level ?? 'lowerConcourse';
  const dy = upper ? 4.2 : -3.7;
  const wide = b.large ? 13 : 8;
  const hallX = 3.2 + wide;
  const z = -18 + (index % 3) * 18;
  const accesses: AccessSpec[] = [{
    id: `${code}-stairs-a`, kind: 'stairs', platformX: 5.2, platformZ: z, yaw: 0,
    fromLevel: 'platform', toLevel: level, deltaY: dy, width: 2.4,
    direction: 'forward', accessible: false,
  }, {
    id: `${code}-lift`, kind: 'elevator', platformX: 6.4, platformZ: z + 8, yaw: 0,
    fromLevel: 'platform', toLevel: level, deltaY: dy, width: 1.8,
    direction: 'forward', accessible: true,
  }];
  const levels: StationLevelId[] = ['platform', level];
  const surfaces: WalkSurface[] = [{ id: `${code}-platform`, level: 'platform', y: -0.06, rects: [], obstacles: [] }, {
    id: `${code}-${level}`, level, y: -0.06 + dy,
    rects: [{ x: hallX, z: z + 13, halfX: wide, halfZ: b.large ? 16 : 11 }],
    obstacles: [{ x: hallX, z: z + 14, halfX: 0.45, halfZ: 0.45 }],
  }];
  if (b.mixed) {
    const upperLevel: StationLevelId = 'upperConcourse';
    levels.push(upperLevel);
    surfaces.push({ id: `${code}-${upperLevel}`, level: upperLevel, y: 4.14, rects: [{ x: 5.2, z: 42, halfX: 14, halfZ: 13 }], obstacles: [] });
    accesses.push({ id: `${code}-stairs-upper`, kind: 'escalator', platformX: 5.2, platformZ: 26, yaw: 0, fromLevel: 'platform', toLevel: upperLevel, deltaY: 4.2, width: 2.2, direction: 'reverse', accessible: false, escalatorDirection: 'both' });
  }
  return {
    stationCode: code,
    accesses,
    concourse: {
      family: b.family,
      ...(b.family === 'special' ? { baseFamily: b.mixed || b.large ? 'hubHall' as const : 'underpass' as const } : {}),
      ...(b.special ? { specialOverride: b.special } : {}), levels, surfaces,
      gates: [{ id: `${code}-gates`, level, x: hallX, z: z + 22, yaw: 0, width: wide * 1.35, gateCount: b.large ? 8 : 5, accessibleGate: true, blocksPlayer: true }],
      exits: [{ id: `${code}-exit-a`, level, labelJa: '出口', labelEn: 'Exit', x: 3.2, z: z + 13, yaw: Math.PI / 2, width: 3.2, destinationHint: 'station forecourt (visual limit)' }],
      amenities: [{ kind: 'ticketOffice', level, x: hallX + wide, z: z + 13, yaw: -Math.PI / 2, width: 3 }, { kind: index % 4 === 0 ? 'newdays' : 'vending', level, x: hallX + wide - 1, z: z + 18, yaw: -Math.PI / 2, width: 2.4 }],
    },
  };
}

export const STATION_CIRCULATION: readonly StationCirculation[] = B.map((blueprint, index) => makeCirculation(index, blueprint));
export function circulationFor(index: number): StationCirculation {
  const i = ((index % STATION_CIRCULATION.length) + STATION_CIRCULATION.length) % STATION_CIRCULATION.length;
  return STATION_CIRCULATION[i];
}
export function stationModelFor(stationIndex: number, direction: LoopDirection) {
  const station = STATIONS[stationIndex];
  return { layout: layoutFor(stationIndex), platform: platformProfileFor(station.jy, direction), circulation: circulationFor(stationIndex) };
}
