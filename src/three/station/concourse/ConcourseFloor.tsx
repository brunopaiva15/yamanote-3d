import type { WalkSurface } from '../../../data/stationCirculation';
export function ConcourseFloor({ surface, color }: { surface: WalkSurface; color: string }) {
  return <>{surface.rects.map((r) => <mesh key={`${r.x}:${r.z}`} position={[r.x, surface.y - 0.12, r.z]} receiveShadow><boxGeometry args={[r.halfX * 2, 0.24, r.halfZ * 2]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>)}</>;
}
