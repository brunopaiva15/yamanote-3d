import type { WalkSurface } from '../../../data/stationCirculation';
export function ConcourseWalls({ surface, color }: { surface: WalkSurface; color: string }) {
  return <>{surface.rects.map((r, i) => <group key={i}>{[-1, 1].map((d) => <mesh key={`x${d}`} position={[r.x + d * (r.halfX + .1), surface.y + 1.35, r.z]}><boxGeometry args={[.2, 2.7, r.halfZ * 2]} /><meshStandardMaterial color={color} roughness={.86} /></mesh>)}<mesh position={[r.x, surface.y + 1.35, r.z - r.halfZ]}><boxGeometry args={[r.halfX * 2, 2.7, .2]} /><meshStandardMaterial color={color} /></mesh><mesh position={[r.x, surface.y + 2.75, r.z]}><boxGeometry args={[r.halfX * 2, .16, r.halfZ * 2]} /><meshStandardMaterial color="#777b7d" roughness={.9} /></mesh></group>)}</>;
}
