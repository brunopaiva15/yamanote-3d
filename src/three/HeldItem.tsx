// Ce qu'on tient dans la main.
//
// Une boisson achetée qui n'existerait que dans le HUD ne serait pas une
// boisson : ce serait une ligne d'inventaire. Ce qui fait qu'on l'a vraiment,
// c'est de la VOIR - en bas à droite du champ, un peu de travers, qui monte
// quand on boit et qui balance quand on marche. C'est toute la différence entre
// posséder un objet et en avoir un.
//
// ACCROCHAGE. L'objet suit la caméra sans lui être enfant : on recopie sa pose
// et l'on décale dans son repère. Le passer en enfant de `camera` aurait marché
// aussi, mais R3F reconstruit la caméra à chaque changement de rendu, et un
// objet greffé dessus survit mal à ça.
//
// La carte IC, elle, n'apparaît qu'au moment de valider (`runtime.cardTap`) :
// on ne se promène pas la main tendue, on la sort une seconde devant le
// lecteur. C'est un geste, pas un équipement.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { productById, type Product, type ProductShape } from '../data/products';
import { useStore } from '../store';
import { runtime } from '../systems/runtime';

/**
 * Où l'objet se tient dans le repère de l'œil : à droite, bas, devant.
 *
 * Le champ du jeu est large (70°), et un objet posé à la distance PHYSIQUE du
 * bras - une cinquantaine de centimètres - y occupe un tiers de la hauteur de
 * l'écran. C'est juste, et c'est pourtant trop : la caméra n'a pas la vision
 * périphérique de l'œil, et ce qui n'occupe qu'un coin du champ réel barre ici
 * le milieu de l'image. On l'écarte donc davantage et on le recule - c'est le
 * compromis que fait n'importe quelle vue à la première personne.
 */
const HOLD = new THREE.Vector3(0.36, -0.34, -0.62);
/**
 * `HOLD` place le FOND de l'objet, `DRINK` place son goulot.
 *
 * C'est volontaire, et il fallait le dire : le pivot est le goulot (`mouthY`),
 * si bien qu'une position de repos donnée telle quelle ferait pendre tout
 * l'objet sous elle - une bouteille de vingt-sept centimètres sortait du cadre
 * par le bas. Au repos, on ajoute donc la hauteur du goulot pour que le fond
 * retombe exactement là où on l'a réglé ; à la lèvre, c'est bien le goulot
 * qu'on veut poser, et l'offset disparaît.
 */
/**
 * Position portée aux lèvres.
 *
 * Ce n'est pas « plus haut et plus près » : c'est LA BOUCHE. Comme le pivot de
 * l'objet est son goulot (voir `mouthY`), c'est bien lui qui vient s'y poser,
 * et non son fond.
 *
 * La bouche RÉELLE est douze centimètres sous l'œil et vingt devant : posé là,
 * le goulot tombait sous le bord bas de l'image et le geste se jouait hors
 * champ. On le remonte de quelques centimètres et on l'éloigne d'autant - la
 * caméra n'a pas de menton, et ce qu'on veut montrer est le BASCULEMENT, pas
 * l'anatomie.
 */
const DRINK = new THREE.Vector3(0.06, -0.12, -0.26);
/** La carte présentée au lecteur : main tendue vers l'avant-droite. */
const CARD = new THREE.Vector3(0.34, -0.24, -0.46);

/**
 * Inclinaison de l'objet, au repos et à la lèvre (rad, autour de l'axe X de
 * l'œil).
 *
 * LE SIGNE EST TOUT LE SUJET. Une rotation POSITIVE autour de +X fait basculer
 * le haut de l'objet vers le spectateur (+Y part vers +Z) : c'est le geste de
 * boire, le goulot vient à la bouche et le fond se lève. Une rotation négative
 * fait l'inverse - elle verse le contenu droit devant, loin du visage - et
 * c'est ce qu'on faisait : la bouteille se couchait dans le mauvais sens, on
 * arrosait le quai.
 *
 * 2,0 rad, soit cent quinze degrés : un peu plus que l'horizontale, parce
 * qu'une bouteille à moitié pleine ne se vide pas à plat.
 */
const TILT_REST = 0.14;
const TILT_DRINK = 2.0;

/**
 * Hauteur du BORD par lequel on boit, dans le repère de l'objet.
 *
 * C'est le point qui doit se poser sur la bouche, donc c'est autour de lui que
 * l'objet tourne. Avec le pivot au fond - là où la géométrie commence -, tout
 * l'objet balayait l'écran d'un coin à l'autre à chaque gorgée au lieu de
 * pivoter sur place ; c'est le second défaut du geste, et il ne se voit qu'une
 * fois le sens remis à l'endroit.
 */
function mouthY(shape: ProductShape): number {
  switch (shape) {
    case 'bottle':
      // Le goulot : le corps fait 21 cm, l'épaule et le col montent à 27.
      return 0.27;
    case 'can':
      return 0.122;
    case 'canSlim':
      return 0.104;
    case 'cup':
      return 0.099;
    case 'noodle':
      return 0.114;
    default:
      // Une glace en bâton : on la porte à la bouche par le haut, comme le reste.
      return 0.11;
  }
}

/**
 * Geste figé, pour l'examen.
 *
 * Une gorgée dure sept dixièmes de seconde ; un rendu logiciel en produit deux
 * images. Impossible de juger le mouvement sur une capture sans pouvoir
 * l'arrêter - d'où ce verrou, de la même famille que `__freeCam` : `__sip(t)`
 * pose l'avancement du geste (1 = début, 0,5 = à la lèvre, 0 = redescendu),
 * `__sip(null)` rend la main.
 */
let pinnedSip: number | null = null;
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__sip = (t: number | null) => {
    pinnedSip = t;
  };
}

export function HeldItem() {
  const { camera } = useThree();
  const held = useStore((s) => s.held);
  const pocket = useStore((s) => s.pocket);
  const group = useRef<THREE.Group>(null);
  const cardGroup = useRef<THREE.Group>(null);
  /** Avancement du geste de boire (0 au repos, 1 à la lèvre). */
  const raise = useRef(0);
  /** Nombre de gorgées à la frame précédente : c'est le FRONT qui lance le geste. */
  const lastSips = useRef(-1);
  const swing = useRef(0);

  const product = useMemo(() => (held ? productById(held.productId) : null), [held]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const g = group.current;
    const c = cardGroup.current;

    // Le geste de boire : déclenché par la gorgée qui vient d'être comptée
    // (store), tenu une demi-seconde, puis redescendu.
    if (held) {
      if (lastSips.current >= 0 && held.sips < lastSips.current) raise.current = 1;
      lastSips.current = held.sips;
    } else {
      lastSips.current = -1;
      raise.current = 0;
    }
    raise.current = Math.max(0, raise.current - dt * 1.35);
    // Une courbe en cloche : on monte vite, on tient, on redescend.
    const t = pinnedSip ?? raise.current;
    const lift = Math.sin(Math.min(1, t) * Math.PI) ** 0.7;

    if (g) {
      swing.current += dt;
      const rest = HOLD.clone();
      rest.y += product ? mouthY(product.shape) : 0;
      const target = rest.lerp(DRINK, lift);
      // Le balancement du pas : l'objet vit au bout d'un bras, il n'est pas
      // vissé à l'œil. Très petit - deux centimètres - mais c'est lui qui fait
      // qu'on ne regarde pas une image collée sur l'écran.
      const walk = runtime.playerFrame === 'platform' ? 1 : 0.4;
      target.y += Math.sin(swing.current * 5.2) * 0.008 * walk;
      target.x += Math.cos(swing.current * 2.6) * 0.006 * walk;
      g.position.copy(camera.position);
      g.quaternion.copy(camera.quaternion);
      g.translateX(target.x);
      g.translateY(target.y);
      g.translateZ(target.z);
      // Inclinaison : à peine inclinée dans la main au repos, franchement
      // basculée VERS SOI quand on boit. Le pivot étant le goulot, c'est le
      // fond qui se lève - et c'est ce mouvement-là qu'on reconnaît.
      g.rotateX(TILT_REST + lift * (TILT_DRINK - TILT_REST));
      // Le roulis se défait en portant à la bouche : on redresse le poignet.
      g.rotateZ(0.2 * (1 - lift));
    }

    if (c) {
      const tap = runtime.cardTap;
      c.visible = tap > 0.02;
      if (c.visible) {
        c.position.copy(camera.position);
        c.quaternion.copy(camera.quaternion);
        // La main s'avance et se retire : la carte part de plus loin et vient
        // se poser sur le lecteur.
        const reach = 1 - tap;
        c.translateX(CARD.x - reach * 0.06);
        c.translateY(CARD.y - reach * 0.05);
        c.translateZ(CARD.z + reach * 0.12);
        c.rotateX(-1.15);
        c.rotateZ(0.3);
      }
    }
  });

  return (
    <>
      {/* Le groupe extérieur est la MAIN ; l'objet y est décalé vers le bas de
          la hauteur de son goulot, si bien que l'origine du groupe tombe
          exactement sur le bord par lequel on boit. Tourner le groupe fait donc
          pivoter l'objet autour de sa propre bouche, et non autour de son cul. */}
      <group ref={group} visible={!!product}>
        {product && (
          <group position={[0, -mouthY(product.shape), 0]}>
            <Vessel product={product} held={held} />
          </group>
        )}
      </group>
      {/* La carte IC : toujours montée, mais rendue invisible hors du geste. Un
          objet de six triangles ne mérite pas d'être monté et démonté. */}
      <group ref={cardGroup} visible={false}>
        <IcCard tone={pocket.ticket ? '#e8e2cf' : '#3c9ad6'} paper={!!pocket.ticket} />
      </group>
    </>
  );
}

/**
 * Le contenant, selon sa forme.
 *
 * Quatre silhouettes suffisent, et ce sont les quatre qu'on distingue au bout
 * du bras : la bouteille PET à son goulot et son bouchon, la canette à son
 * couvercle enfoncé, la petite boîte de café à sa taille, le gobelet à son
 * évasement. Le niveau visible descend avec les gorgées - sur une bouteille,
 * qui est la seule qu'on voie par transparence.
 */
function Vessel({
  product,
  held,
}: {
  product: Product;
  held: { sips: number; maxSips: number; opened: boolean } | null;
}) {
  const fill = held ? Math.max(0, held.sips / Math.max(1, held.maxSips)) : 1;
  const opened = held?.opened ?? false;

  if (product.shape === 'bottle') {
    const H = 0.21;
    return (
      <group>
        {/* Le PET : transparent, et c'est le liquide dedans qu'on voit baisser.
            `depthWrite` doit tomber - une matière transparente qui écrit dans le
            tampon de profondeur masque ce qu'il y a DERRIÈRE elle, et ce qu'il
            y a derrière elle, ici, c'est justement le contenu de la bouteille :
            on ne voyait qu'une coque vide. */}
        <mesh position={[0, H / 2, 0]}>
          <cylinderGeometry args={[0.033, 0.033, H, 16, 1, true]} />
          <meshPhysicalMaterial
            color="#eef4f7"
            transparent
            opacity={0.28}
            depthWrite={false}
            roughness={0.08}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, (H * fill) / 2 + 0.004, 0]}>
          <cylinderGeometry args={[0.0305, 0.0305, Math.max(0.002, H * fill), 14]} />
          <meshStandardMaterial color={product.liquid ?? product.tone} roughness={0.25} />
        </mesh>
        {/* Épaule, goulot, bouchon - et le bouchon disparaît une fois ouverte. */}
        <mesh position={[0, H + 0.018, 0]}>
          <cylinderGeometry args={[0.014, 0.033, 0.036, 14]} />
          <meshStandardMaterial
            color="#eef4f7"
            transparent
            opacity={0.4}
            depthWrite={false}
            roughness={0.1}
          />
        </mesh>
        <mesh position={[0, H + 0.046, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.024, 14]} />
          <meshStandardMaterial
            color="#eef4f7"
            transparent
            opacity={0.45}
            depthWrite={false}
            roughness={0.1}
          />
        </mesh>
        {!opened && (
          <mesh position={[0, H + 0.066, 0]}>
            <cylinderGeometry args={[0.0165, 0.0165, 0.018, 14]} />
            <meshStandardMaterial color={product.tone} roughness={0.5} />
          </mesh>
        )}
        {/* L'étiquette : la seule chose colorée d'une bouteille, et elle en
            fait le tour à mi-hauteur. */}
        <mesh position={[0, H * 0.52, 0]}>
          <cylinderGeometry args={[0.0345, 0.0345, H * 0.46, 16, 1, true]} />
          <meshStandardMaterial color={product.tone} roughness={0.62} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  if (product.shape === 'cup' || product.shape === 'noodle') {
    const H = product.shape === 'noodle' ? 0.11 : 0.095;
    const r = product.shape === 'noodle' ? 0.048 : 0.036;
    return (
      <group>
        <mesh position={[0, H / 2, 0]}>
          <cylinderGeometry args={[r, r * 0.78, H, 16]} />
          <meshStandardMaterial color={product.tone} roughness={0.75} />
        </mesh>
        {/* Le couvercle : opercule tant qu'on n'a pas ouvert. */}
        <mesh position={[0, H + 0.004, 0]}>
          <cylinderGeometry args={[r + 0.003, r + 0.003, 0.008, 16]} />
          <meshStandardMaterial
            color={opened ? '#2b2b2b' : product.ink}
            roughness={opened ? 0.9 : 0.4}
            metalness={opened ? 0 : 0.35}
          />
        </mesh>
      </group>
    );
  }

  if (product.shape === 'ice') {
    return (
      <group>
        <mesh position={[0, 0.055, 0]}>
          <boxGeometry args={[0.052, 0.11, 0.018]} />
          <meshStandardMaterial color={product.tone} roughness={0.7} />
        </mesh>
        {/* Le bâtonnet, qui dépasse en bas. */}
        <mesh position={[0, -0.018, 0]}>
          <boxGeometry args={[0.011, 0.04, 0.004]} />
          <meshStandardMaterial color="#d9c79a" roughness={0.85} />
        </mesh>
      </group>
    );
  }

  // Canettes : la grande de 350, et la petite boîte de café de 190.
  const slim = product.shape === 'canSlim';
  const H = slim ? 0.104 : 0.122;
  const R = slim ? 0.026 : 0.033;
  return (
    <group>
      <mesh position={[0, H / 2, 0]}>
        <cylinderGeometry args={[R, R, H, 18]} />
        <meshStandardMaterial color={product.tone} roughness={0.42} metalness={0.35} />
      </mesh>
      {/* Les deux bagues serties, en haut et en bas : c'est à elles qu'on
          reconnaît une canette et pas un cylindre peint. */}
      {[0.004, H - 0.004].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[R * 0.92, R * 0.92, 0.008, 18]} />
          <meshStandardMaterial color="#c9ccce" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, H + 0.001, 0]}>
        <cylinderGeometry args={[R * 0.9, R * 0.92, 0.004, 18]} />
        <meshStandardMaterial color="#b9bdc0" roughness={0.28} metalness={0.85} />
      </mesh>
      {/* L'anneau : encore là tant qu'on n'a pas ouvert. */}
      {!opened && (
        <mesh position={[0, H + 0.005, R * 0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R * 0.34, 0.0016, 6, 12]} />
          <meshStandardMaterial color="#d8dcdf" roughness={0.25} metalness={0.9} />
        </mesh>
      )}
      {/* Une bande d'encre en ceinture : ce que porte toute canette japonaise. */}
      <mesh position={[0, H * 0.34, 0]}>
        <cylinderGeometry args={[R + 0.0006, R + 0.0006, H * 0.2, 18, 1, true]} />
        <meshStandardMaterial color={product.ink} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * La carte IC - ou le billet magnétique, qui est du carton et non du plastique.
 *
 * Une carte de gare tient en un rectangle de 8,5 × 5,4 cm et une bande de
 * couleur : c'est déjà assez pour qu'on la reconnaisse au coin de l'œil pendant
 * qu'on tend la main. Le billet, lui, est plus petit, crème et rayé de brun -
 * la bande magnétique au dos.
 */
function IcCard({ tone, paper }: { tone: string; paper: boolean }) {
  const w = paper ? 0.057 : 0.085;
  const h = paper ? 0.085 : 0.054;
  return (
    <group>
      <mesh>
        <boxGeometry args={[w, 0.0015, h]} />
        <meshStandardMaterial color={tone} roughness={paper ? 0.9 : 0.42} />
      </mesh>
      <mesh position={[0, 0.001, paper ? h * 0.34 : -h * 0.3]}>
        <boxGeometry args={[w * 0.92, 0.0004, paper ? h * 0.14 : h * 0.22]} />
        <meshStandardMaterial color={paper ? '#5a3418' : '#1d5f8f'} roughness={0.7} />
      </mesh>
    </group>
  );
}
