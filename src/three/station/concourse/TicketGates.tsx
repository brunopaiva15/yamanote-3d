import type { GateLineSpec } from '../../../data/stationCirculation';
export function TicketGates({ gates, yFor }: { gates: GateLineSpec[]; yFor: (level: GateLineSpec['level']) => number }) {
  return <>{gates.map((g) => <group key={g.id} position={[g.x, yFor(g.level), g.z]} rotation={[0, g.yaw, 0]}>{Array.from({ length: g.gateCount }, (_, i) => { const x = -g.width / 2 + (i + .5) * g.width / g.gateCount; return <group key={i} position={[x, .55, 0]}><mesh><boxGeometry args={[.34, 1.1, 1.25]} /><meshStandardMaterial color={i === 0 && g.accessibleGate ? '#4d91aa' : '#9aa0a3'} metalness={.45} roughness={.35} /></mesh><mesh position={[0, .25, .7]}><boxGeometry args={[.58, .42, .05]} /><meshBasicMaterial color="#ef6b62" /></mesh></group>; })}</group>)}</>;
}
