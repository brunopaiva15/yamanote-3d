// Rame E235 complète : onze voitures bout à bout, voyageur en 3ᵉ.
// Chaque module reprend la coque, les banquettes, les portes, les poignées
// et les pubs ; les écrans LCD partagent les mêmes textures (un seul bus
// d'affichage pour toute la rame).

import { CONFIG, carNumbers, carOffsetZ } from '../data/config';
import { Car } from './Car';
import { Seats } from './Seats';
import { Doors } from './Doors';
import { Handles } from './Handles';
import { Ads } from './Ads';
import { Screens } from './Screens';

export function Train() {
  return (
    <group>
      {carNumbers().map((n) => (
        <group key={`car${n}`} position={[0, 0, carOffsetZ(n)]}>
          <Car carNumber={n} />
          <Seats />
          <Doors />
          <Handles />
          <Ads carNumber={n} />
        </group>
      ))}
      {/* Un seul jeu de textures LCD, posé dans chaque voiture. */}
      <Screens carCount={CONFIG.carCount} />
    </group>
  );
}
