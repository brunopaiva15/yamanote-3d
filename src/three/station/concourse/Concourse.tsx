import { circulationFor } from '../../../data/stationCirculation';
import { layoutFor } from '../../../data/stationLayouts';
import { ConcourseAmenities } from './ConcourseAmenities';
import { ConcourseFloor } from './ConcourseFloor';
import { ConcourseLighting } from './ConcourseLighting';
import { ConcourseSigns } from './ConcourseSigns';
import { ConcourseWalls } from './ConcourseWalls';
import { ExitDoors } from './ExitDoors';
import { TicketGates } from './TicketGates';

export function Concourse({ station }: { station: number }) {
  const c = circulationFor(station); const palette = layoutFor(station).palette;
  const yFor = (level: (typeof c.concourse.levels)[number]) => c.concourse.surfaces.find((s) => s.level === level)?.y ?? -.06;
  return <group name={`concourse-${c.concourse.family}`}>
    {c.concourse.surfaces.filter((s) => s.level !== 'platform').map((s) => <group key={s.id}><ConcourseFloor surface={s} color={palette.slab} /><ConcourseWalls surface={s} color={palette.wall} />{s.rects.map((r, i) => <group key={i}><ConcourseLighting y={s.y} z={r.z} width={r.halfX} /><ConcourseSigns y={s.y} z={r.z - r.halfZ * .35} />{[-.55, 0, .55].map((d) => <mesh key={d} position={[r.x + d * r.halfX, s.y + 1.35, r.z]}><boxGeometry args={[.5, 2.7, .5]} /><meshStandardMaterial color={palette.column} /></mesh>)}</group>)}</group>)}
    {c.accesses.filter((a) => a.kind !== 'elevator').map((a) => { const len = 8; const end = a.direction === 'reverse' ? -len : len; const angle = Math.atan2(a.deltaY, len); return <mesh key={a.id} position={[a.platformX, -.06 + a.deltaY / 2, a.platformZ + end / 2]} rotation={[a.direction === 'reverse' ? angle : -angle, 0, 0]}><boxGeometry args={[a.width, .18, Math.hypot(len, a.deltaY)]} /><meshStandardMaterial color={palette.slab} roughness={.9} /></mesh>; })}
    <TicketGates gates={c.concourse.gates} yFor={yFor} /><ExitDoors exits={c.concourse.exits} yFor={yFor} /><ConcourseAmenities items={c.concourse.amenities} yFor={yFor} />
  </group>;
}
