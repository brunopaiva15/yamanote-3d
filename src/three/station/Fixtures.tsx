// Ce qui meuble le hall.
//
// L'implantation vient de `data/stationInterior` - la même liste que la marche
// contourne. Ce fichier ne décide de rien : il reçoit des emprises au sol, un
// sens de façade, et il pose dedans la silhouette qui va avec.
//
// UN MEUBLE SE RECONNAÎT À SA SILHOUETTE. C'est la règle de tout ce chantier :
// une batterie de distributeurs de titres se lit à son bandeau continu et à ses
// écrans inclinés, une consigne à sa trame de portes carrées, un konbini à sa
// devanture vitrée pleine hauteur sous une enseigne allumée. Une boîte avec une
// image collée devant ne ressemble à rien - c'est ce qu'était le kiosque du
// quai, et personne ne le reconnaissait.
//
// REPÈRE LOCAL. Chaque meuble est posé dans un groupe centré sur son emprise et
// tourné selon `facing` : à l'intérieur, on travaille toujours face à soi, la
// façade en +z local, la largeur en x local. Sans cette rotation, chaque famille
// aurait eu à écrire deux fois sa géométrie - une par paroi.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import type { Fixture, FixtureKind, StationInterior } from '../../data/stationInterior';
import type { GalleryBrand } from '../../data/stationInterior';
import { interiorSolids } from '../../data/stationInterior';
import {
  makeAreaMapTexture,
  makeGallerySignTexture,
  makeFareAdjustTexture,
  makeKonbiniInteriorTexture,
  makeLockerTexture,
  makeOfficeTexture,
  makeStampBookTexture,
  makeStampSignTexture,
  makeStampTexture,
  makeTicketFaceTexture,
} from '../../textures/concourse';
import { FOOD_BRANDS, makeVendingHeaderTexture, vendingBrand } from '../../textures/vending';
import type { ConcourseNetwork, ConcourseRoom } from '../../data/stationConcourseBuild';
import type { Mats } from './materials';
import { stationAd } from './adPool';
import { Konbini } from './Konbini';
import { VendingBox } from './VendingBox';
import { TicketMachine } from './TicketMachine';
import { usePickable } from './pickable';

/** Hauteurs de référence, communes à plusieurs familles (m). */
const COUNTER_H = 0.95;

/**
 * Jeux de matériaux et de textures du niveau, construits une fois par gare.
 *
 * Tout ce qui porte une image imprimée passe par un `MeshBasicMaterial` : une
 * façade de distributeur, une enseigne, un plan mural sont des surfaces
 * rétroéclairées ou vernies, et l'éclairage du hall - deux réglettes tous les
 * quatre mètres - les noircirait.
 */
function useFixtureKit(station: number) {
  const kit = useMemo(() => {
    const flat = (t: THREE.Texture) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    const ticket = makeTicketFaceTexture();
    const fare = makeFareAdjustTexture();
    const locker = makeLockerTexture();
    const konbiniIn = makeKonbiniInteriorTexture();
    const map = makeAreaMapTexture(station);
    const stamp = makeStampTexture(station);
    const book = makeStampBookTexture(station);
    const stampSign = makeStampSignTexture();
    const office = makeOfficeTexture();
    // Les deux enseignes de galerie : une seule sert par gare, mais laquelle
    // dépend du relevé, et les deux canvas coûtent moins qu'un aller-retour.
    const gallery = {
      ecute: makeGallerySignTexture('ecute', station),
      atre: makeGallerySignTexture('atre', station),
    };
    // Les deux machines à manger : la caisse et la vitrine changent avec
    // l'enseigne, pas la géométrie.
    // `hot` dit si la machine a une moitié chaude : elle décide de la couleur
    // des bandeaux de bouton (rouge あたたか～い / bleu つめた～い), qui est le
    // code visuel auquel on reconnaît un 自販機 avant même d'en lire un mot.
    // Une machine à glaces et une machine à sachets n'en ont jamais.
    const hotOf = (b: (typeof FOOD_BRANDS)[number]) => b.kind !== 'ice' && b.kind !== 'snack';
    // La VITRINE n'est plus ici : elle appartient à la machine, qui la
    // redessine quand son crédit change (three/station/vendingParts). Ne
    // restent que l'enseigne et la peinture, qui, elles, ne bougent jamais.
    const food = FOOD_BRANDS.map((brand) => ({
      brand,
      header: flat(makeVendingHeaderTexture(brand)),
      body: new THREE.MeshStandardMaterial({ color: brand.body, roughness: 0.52, metalness: 0.12 }),
      hot: hotOf(brand),
    }));
    const drinks = [0, 1].map((i) => {
      const brand = vendingBrand(station, i, 2);
      return {
        brand,
        header: flat(makeVendingHeaderTexture(brand)),
        body: new THREE.MeshStandardMaterial({ color: brand.body, roughness: 0.52, metalness: 0.12 }),
        hot: hotOf(brand),
      };
    });
    return {
      textures: [ticket, fare, locker, konbiniIn, map, stamp, book, stampSign,
        office, gallery.ecute, gallery.atre],
      ticket: flat(ticket),
      fare: flat(fare),
      locker: flat(locker),
      konbiniIn: flat(konbiniIn),
      map: flat(map),
      stamp: flat(stamp),
      book: flat(book),
      stampSign: flat(stampSign),
      office: flat(office),
      gallery: { ecute: flat(gallery.ecute), atre: flat(gallery.atre) } as Record<GalleryBrand, THREE.MeshBasicMaterial>,
      food,
      drinks,
    };
  }, [station]);

  useEffect(
    () => () => {
      for (const t of kit.textures) t.dispose();
      for (const m of [kit.ticket, kit.fare, kit.locker, kit.konbiniIn,
        kit.map, kit.stamp, kit.book, kit.stampSign, kit.office,
        kit.gallery.ecute, kit.gallery.atre]) m.dispose();
      for (const set of [...kit.food, ...kit.drinks]) {
        set.header.dispose();
        set.body.dispose();
        set.header.map?.dispose();
      }
    },
    [kit],
  );

  return kit;
}

type Kit = ReturnType<typeof useFixtureKit>;

/** L'altitude du sol sous un meuble : celle de sa pièce, ou celle du hall. */
function floorOf(net: ConcourseNetwork, it: StationInterior, x: number, z: number): number {
  const room = net.rooms.find((r) => r.walkable
    && x >= r.rect.x0 && x <= r.rect.x1 && z >= r.rect.z0 && z <= r.rect.z1);
  return room?.floorY ?? it.floorY;
}

/**
 * SILHOUETTE D'UN MEUBLE, quand le palier n'a plus les moyens de le détailler.
 *
 * Un obstacle du réseau est une COLLISION, et la marche ne connaît pas le
 * palier de qualité : un meuble qu'on efface sans effacer son emprise devient
 * un mur invisible, et c'est le pire défaut qu'une gare puisse avoir (exigence
 * #17 du cahier des charges). Le palier bas ne retire donc pas le mobilier — il
 * en garde le VOLUME, et abandonne ce qui se regarde : les façades, les écrans,
 * les vitrines, les enseignes.
 *
 * Les hauteurs ne sont pas inventées : chacune est celle du composant qui
 * dessine ce meuble au palier plein, relue une par une.
 */
const SHELL_H: Record<FixtureKind, number> = {
  ticket: 1.92,
  fareAdjust: 1.92,
  lockers: 1.85,
  konbini: 0,
  vending: 1.83,
  vendingFood: 1.83,
  stamp: 0.95,
  office: 0,
  bench: 0.44,
  bin: 1.02,
  map: 1.9,
  gallery: 0,
  extinguisher: 0.7,
  aed: 0.7,
  umbrella: 1.0,
  plant: 0.9,
  notice: 1.4,
};

/**
 * Le mobilier réduit à ce qu'il OCCUPE.
 *
 * Les emprises viennent de `interiorSolids`, la même fonction qui alimente les
 * obstacles du réseau : un meuble dessiné ici barre exactement là où il se
 * dessine, palier ou pas.
 */
function Shells({ net, m, floor }: {
  net: ConcourseNetwork;
  m: Mats;
  floor: (x: number, z: number) => number;
}) {
  return (
    <group name="gare/hall/mobilier">
      {net.fixtures.flatMap((f, i) =>
        interiorSolids(f).map((r, k) => {
          // Zéro veut dire « jusqu'au plafond » : un konbini, une galerie et un
          // guichet montent à la sous-face, et c'est ce qui les distingue d'un
          // meuble posé.
          const h = SHELL_H[f.kind] || 2.6;
          const cx = (r.x0 + r.x1) / 2;
          const cz = (r.z0 + r.z1) / 2;
          return (
            <mesh key={`sh${i}.${k}`} position={[cx, floor(cx, cz) + h / 2, cz]} material={m.hall}>
              <boxGeometry args={[r.x1 - r.x0, h, r.z1 - r.z0]} />
            </mesh>
          );
        }))}
    </group>
  );
}

export function Fixtures({
  it,
  net,
  rooms,
  m,
  station,
  detail,
}: {
  it: StationInterior;
  /**
   * Le réseau : c'est LUI qui dit quel mobilier tient debout ici.
   *
   * Le hall générique meuble ses deux parois et l'affaire est entendue. Une
   * gare branchée sur son relevé n'a pas les mêmes parois : `networkFor` ne
   * garde du mobilier générique que ce qui rentre dans ses pièces, à l'écart
   * de ses lignes, de ses vitrines et de ses seuils. Un konbini de 3,40 m de
   * fond ne tient pas dans un pont-concourse, et il disparaît au lieu de
   * ressortir par le mur.
   */
  net: ConcourseNetwork;
  /** Les pièces du VOLUME qu'on dessine : le mobilier des autres n'est pas ici. */
  rooms: readonly ConcourseRoom[];
  m: Mats;
  station: number;
  /**
   * Palier de qualité : 0 = tout, 3 = le strict nécessaire.
   *
   * LE VOLUME RESTE À TOUS LES PALIERS. Voir `Shells` : ce qui s'allège est ce
   * qui se regarde, jamais ce qui barre.
   */
  detail: number;
}) {
  const kit = useFixtureKit(station);
  // LE MOBILIER DE CE VOLUME-LÀ, et non de toute la gare. Il se posait partout
  // dès qu'un volume se dessinait : à Okachimachi, vu du quai, l'occultation ne
  // garde que le demi-niveau, et les distributeurs du hall restaient plantés
  // au-dessus de la rue. Un meuble appartient à la pièce qui le porte.
  const here = useMemo(
    () => ({
      ...net,
      fixtures: net.fixtures.filter((f) => rooms.some(
        (r) => (f.rect.x0 + f.rect.x1) / 2 >= r.rect.x0
          && (f.rect.x0 + f.rect.x1) / 2 <= r.rect.x1
          && (f.rect.z0 + f.rect.z1) / 2 >= r.rect.z0
          && (f.rect.z0 + f.rect.z1) / 2 <= r.rect.z1,
      )),
    }),
    [net, rooms],
  );
  if (detail >= 2) {
    return <Shells net={here} m={m} floor={(x, z) => floorOf(net, it, x, z)} />;
  }
  // La trame porteuse appartient au hall générique : un relevé qui donne ses
  // propres volumes ne la reçoit pas, faute de savoir où sont ses poteaux.
  const pilasters = net.source === 'profile' ? [] : it.pilasters;
  return (
    <group name="gare/hall/mobilier">
      {/* Pilastres : la trame porteuse, engagée dans les deux parois. Elle
          passe avant le mobilier - une devanture l'enjambe, un distributeur
          l'esquive. */}
      {pilasters.map((p, i) => {
        const px = (p.x0 + p.x1) / 2;
        const pz = (p.z0 + p.z1) / 2;
        const h = it.ceilY - it.floorY - 0.12;
        // Le pilastre de la paroi côté fond regarde vers l'axe de la voie : son
        // affiche et ses cornières se retournent avec lui.
        const face = Math.abs(p.x0 - it.paid.x0) < 1e-9 ? 1 : -1;
        return (
          <group
            key={`pil${i}`}
            name="gare/hall/trame"
            position={[px, it.floorY, pz]}
            rotation={[0, face === 1 ? 0 : Math.PI, 0]}
          >
            <mesh position={[0, h / 2, 0]} material={m.hall}>
              <boxGeometry args={[p.x1 - p.x0, h, p.z1 - p.z0]} />
            </mesh>
            {/* Cornières d'angle sur les deux arêtes exposées, et socle : les
                mêmes ouvrages qu'au quai, pour les mêmes raisons. */}
            {[-1, 1].map((d) => (
              <mesh
                key={`guard${d}`}
                position={[(p.x1 - p.x0) / 2 - 0.03, 0.85, (d * (p.z1 - p.z0)) / 2 - d * 0.03]}
                material={m.metal}
              >
                <boxGeometry args={[0.05, 1.6, 0.05]} />
              </mesh>
            ))}
            <mesh position={[0, 0.07, 0]} material={m.wallDark}>
              <boxGeometry args={[p.x1 - p.x0 + 0.04, 0.14, p.z1 - p.z0 + 0.08]} />
            </mesh>
            {/* Une affiche sur deux pilastres : c'est LÀ qu'un caisson se pose
                dans une gare, sur la face d'un poteau, et non en plein mur. Les
                deux caissons flottants du hall ont disparu avec cette trame -
                ils tombaient au droit d'un pilastre une fois sur trois. */}
            {i % 2 === 0 && (
              <mesh
                position={[
                  (p.x1 - p.x0) / 2 + 0.006,
                  1.42,
                  0,
                ]}
                rotation={[0, Math.PI / 2, 0]}
                material={stationAd(station, i + 5, true)}
              >
                <planeGeometry args={[(p.z1 - p.z0) * 0.78, (p.z1 - p.z0) * 1.1]} />
              </mesh>
            )}
          </group>
        );
      })}

      {here.fixtures.map((f, i) => {
        const cx = (f.rect.x0 + f.rect.x1) / 2;
        const cz = (f.rect.z0 + f.rect.z1) / 2;
        // La façade regarde vers le milieu du hall : +1 vers +x, -1 vers -x.
        // Le groupe tourne d'un quart de tour pour que le meuble se décrive
        // toujours face à soi, largeur en x local.
        const yaw = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
        return (
          <group key={`fx${i}`} position={[cx, floorOf(net, it, cx, cz), cz]} rotation={[0, yaw, 0]}>
            {/* `deviceId` est ce par quoi le meuble a un ÉTAT : c'est lui qui
                garde le crédit inséré et qui fait battre le volet de cette
                machine-là quand on y ramasse sa boisson. */}
            <Piece
              f={f}
              kit={kit}
              m={m}
              height={it.ceilY - it.floorY}
              brand={it.brand ?? 'ecute'}
              deviceId={deviceId(f.kind, i)}
              station={station}
            />
          </group>
        );
      })}
    </group>
  );
}

/**
 * L'identifiant d'un meuble qui répond.
 *
 * Le préfixe n'est pas décoratif : c'est lui qui dit à quelle famille l'état
 * appartient (systems/machines), et un 券売機 rangé sous le préfixe des
 * distributeurs se serait vu attribuer un rayon de boissons.
 */
function deviceId(kind: FixtureKind, index: number): string {
  if (kind === 'ticket') return `ct${index}`;
  if (kind === 'fareAdjust') return `cadj${index}`;
  if (kind === 'bin') return `cb${index}`;
  return `cf${index}`;
}

/** Largeur (le long de la paroi) et profondeur d'un meuble, en repère local. */
function span(f: Fixture): { w: number; d: number } {
  return { w: f.rect.z1 - f.rect.z0, d: f.rect.x1 - f.rect.x0 };
}

function Piece({
  f,
  kit,
  m,
  height,
  brand,
  deviceId,
  station,
}: {
  f: Fixture;
  kit: Kit;
  m: Mats;
  height: number;
  brand: GalleryBrand;
  deviceId: string;
  station: number;
}) {
  const { w, d } = span(f);
  switch (f.kind) {
    case 'ticket':
      return <TicketMachine w={w} d={d} m={m} id={deviceId} adjust={false} />;
    case 'fareAdjust':
      return <TicketMachine w={w} d={d} m={m} id={deviceId} adjust />;
    case 'lockers':
      return <Lockers w={w} d={d} face={kit.locker} m={m} />;
    case 'konbini':
      return (
        <Konbini
          w={w}
          d={d}
          height={height}
          station={station}
          anchor={{
            cx: (f.rect.x0 + f.rect.x1) / 2,
            cz: (f.rect.z0 + f.rect.z1) / 2,
            facing: f.facing,
          }}
          m={m}
        />
      );
    case 'vending':
      return (
        <VendingBox w={w} d={d} set={kit.drinks[f.slot % kit.drinks.length]} m={m} deviceId={deviceId} />
      );
    case 'vendingFood':
      return (
        <VendingBox w={w} d={d} set={kit.food[f.slot % kit.food.length]} m={m} deviceId={deviceId} />
      );
    case 'stamp':
      return <StampDesk w={w} d={d} kit={kit} m={m} />;
    case 'office':
      return <Office w={w} d={d} height={height} face={kit.office} m={m} />;
    case 'bench':
      return <Bench w={w} d={d} m={m} />;
    case 'bin':
      return <Bins w={w} d={d} m={m} deviceId={deviceId} />;
    case 'map':
      return <WallMap w={w} face={kit.map} m={m} />;
    case 'gallery':
      return <Gallery w={w} d={d} height={height} brand={brand} kit={kit} m={m} />;
    case 'extinguisher':
      return <WallBox w={w} d={d} tone="#b8322c" label m={m} />;
    case 'aed':
      return <WallBox w={w} d={d} tone="#1d6f4a" label m={m} />;
    case 'notice':
      return <Notice w={w} m={m} />;
    case 'umbrella':
      return <UmbrellaStand w={w} d={d} m={m} />;
    case 'plant':
      return <Plant w={w} m={m} />;
    default:
      return null;
  }
}

/**
 * Consignes : la grille de portes, plus une colonne de paiement à un bout.
 *
 * La colonne est plus haute que la grille et porte son écran : c'est elle qu'on
 * cherche, et sans elle la batterie n'est qu'un mur de casiers.
 */
function Lockers({ w, d, face, m }: { w: number; d: number; face: THREE.Material; m: Mats }) {
  const H = 1.85;
  const colW = 0.4;
  const bank = w - colW;
  return (
    <group>
      <mesh position={[-colW / 2, H / 2, 0]} material={m.frame}>
        <boxGeometry args={[bank, H, d]} />
      </mesh>
      <mesh position={[-colW / 2, H / 2, d / 2 + 0.004]} material={face}>
        <planeGeometry args={[bank - 0.02, H - 0.02]} />
      </mesh>
      {/* Borne de paiement : caisson, écran, lecteur IC. */}
      <mesh position={[bank / 2, 0.75, 0]} material={m.psd}>
        <boxGeometry args={[colW, 1.5, d]} />
      </mesh>
      <mesh position={[bank / 2, 1.16, d / 2 + 0.01]} material={m.frame}>
        <boxGeometry args={[colW - 0.1, 0.3, 0.03]} />
      </mesh>
      <mesh position={[bank / 2, 0.86, d / 2 + 0.01]} material={m.accent}>
        <boxGeometry args={[colW - 0.16, 0.12, 0.03]} />
      </mesh>
    </group>
  );
}

/**
 * 駅スタンプ : la table, le tampon, le cahier, et le panneau qui l'annonce.
 *
 * C'est le meuble le plus petit du hall et celui qu'on vient chercher. Il tient
 * en quatre choses : un plateau incliné à hauteur d'écriture, l'empreinte de la
 * gare reproduite dessus en grand, le tampon posé sur son tampon encreur, et le
 * cahier ouvert où l'on essaie avant de tamponner son carnet.
 */
function StampDesk({ w, d, kit, m }: { w: number; d: number; kit: Kit; m: Mats }) {
  return (
    <group>
      {/* Piètement et plateau. */}
      <mesh position={[0, COUNTER_H / 2, 0]} material={m.bench}>
        <boxGeometry args={[w - 0.16, COUNTER_H, d - 0.14]} />
      </mesh>
      <mesh position={[0, COUNTER_H + 0.02, 0]} material={m.metal}>
        <boxGeometry args={[w - 0.06, 0.04, d - 0.06]} />
      </mesh>
      {/* L'empreinte, reproduite en grand sur le dosseret incliné : c'est elle
          qu'on regarde avant de tamponner, pour savoir ce qu'on va obtenir. */}
      <mesh position={[0, COUNTER_H + 0.34, -d * 0.24]} rotation={[-0.42, 0, 0]} material={kit.stamp}>
        <planeGeometry args={[Math.min(w * 0.52, 0.5), Math.min(w * 0.52, 0.5)]} />
      </mesh>
      {/* Le cahier d'essai, ouvert à plat. */}
      <mesh
        position={[w * 0.2, COUNTER_H + 0.045, d * 0.1]}
        rotation={[-Math.PI / 2, 0, 0.08]}
        material={kit.book}
      >
        <planeGeometry args={[0.34, 0.22]} />
      </mesh>
      {/* Le tampon lui-même, sur son encreur : socle, fût, poignée. */}
      <mesh position={[-w * 0.22, COUNTER_H + 0.06, d * 0.06]} material={m.frame}>
        <boxGeometry args={[0.14, 0.05, 0.14]} />
      </mesh>
      <mesh position={[-w * 0.22, COUNTER_H + 0.13, d * 0.06]} material={m.bench}>
        <cylinderGeometry args={[0.045, 0.05, 0.1, 12]} />
      </mesh>
      <mesh position={[-w * 0.22, COUNTER_H + 0.2, d * 0.06]} material={m.bench}>
        <sphereGeometry args={[0.045, 10, 8]} />
      </mesh>
      {/* Le panneau 駅スタンプ, au-dessus, sur la paroi. */}
      <mesh position={[0, COUNTER_H + 0.86, -d / 2 + 0.04]} material={kit.stampSign}>
        <planeGeometry args={[Math.min(w * 0.9, 0.9), Math.min(w * 0.9, 0.9) / 4]} />
      </mesh>
    </group>
  );
}

/** みどりの窓口 : banque vitrée, bandeau vert, et la file devant. */
function Office({
  w,
  d,
  height,
  face,
  m,
}: {
  w: number;
  d: number;
  height: number;
  face: THREE.Material;
  m: Mats;
}) {
  const shell = height - 0.14;
  return (
    <group>
      {/* Le guichet est une pièce fermée, pas une façade posée devant le
          couloir : fond et retours latéraux rejoignent tous le plafond. */}
      <mesh position={[0, shell / 2, -d / 2 + 0.08]} material={m.hall}>
        <boxGeometry args={[w, shell, 0.16]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`side${s}`} position={[s * (w - 0.16) / 2, shell / 2, 0]} material={m.hall}>
          <boxGeometry args={[0.16, shell, d]} />
        </mesh>
      ))}
      <mesh position={[0, shell / 2, d / 2 - 0.06]} material={face}>
        <planeGeometry args={[w - 0.1, shell - 0.12]} />
      </mesh>
      {/* Tablette de guichet, en saillie : on y pose son billet. */}
      <mesh position={[0, 1.02, d / 2 + 0.06]} material={m.metal}>
        <boxGeometry args={[w - 0.4, 0.05, 0.28]} />
      </mesh>
      {/* Poteaux de file d'attente, devant. */}
      {[-1, 1].map((s) => (
        <mesh key={`post${s}`} position={[s * w * 0.3, 0.5, d / 2 + 0.7]} material={m.metal}>
          <cylinderGeometry args={[0.04, 0.05, 1, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Banc adossé : assise lattée, dossier, deux piétements. */
function Bench({ w, d, m }: { w: number; d: number; m: Mats }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={`leg${s}`} position={[(s * (w - 0.34)) / 2, 0.21, 0]} material={m.metal}>
          <boxGeometry args={[0.07, 0.42, d - 0.14]} />
        </mesh>
      ))}
      <mesh position={[0, 0.44, 0.02]} material={m.bench}>
        <boxGeometry args={[w - 0.1, 0.06, d - 0.12]} />
      </mesh>
      <mesh position={[0, 0.72, -d / 2 + 0.08]} material={m.bench}>
        <boxGeometry args={[w - 0.1, 0.3, 0.06]} />
      </mesh>
    </group>
  );
}

/** Batterie de tri : trois bacs, trois couvercles de couleur, un cadre. */
function Bins({ w, d, m, deviceId }: { w: number; d: number; m: Mats; deviceId: string }) {
  const target = usePickable<THREE.Mesh>({ id: deviceId, kind: 'bin' });
  const tones = ['#2f7a44', '#1f5fbf', '#c8332b'];
  const bw = (w - 0.12) / 3;
  return (
    <group>
      {/* La fente : c'est par là qu'on jette, et c'est elle qu'on vise. */}
      <mesh ref={target} position={[0, 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {tones.map((tone, i) => (
        <group key={tone} position={[(i - 1) * bw, 0, 0]}>
          <mesh position={[0, 0.42, 0]} material={m.bin}>
            <boxGeometry args={[bw - 0.05, 0.84, d - 0.08]} />
          </mesh>
          {/* Le couvercle coloré, et sa fente : c'est le tri qu'on lit. */}
          <mesh position={[0, 0.88, 0]}>
            <boxGeometry args={[bw - 0.02, 0.08, d - 0.05]} />
            <meshStandardMaterial color={tone} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.93, 0]} material={m.frame}>
            <boxGeometry args={[bw - 0.22, 0.03, d * 0.4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** 周辺案内図 : le plan de quartier, dans son cadre, éclairé par le dessus. */
function WallMap({ w, face, m }: { w: number; face: THREE.Material; m: Mats }) {
  const h = w * 0.7;
  return (
    <group position={[0, 1.05 + h / 2, 0]}>
      <mesh material={m.frame}>
        <boxGeometry args={[w, h + 0.06, 0.08]} />
      </mesh>
      <mesh position={[0, 0, 0.05]} material={face}>
        <planeGeometry args={[w - 0.06, h]} />
      </mesh>
      {/* Réglette d'éclairage sur le chapeau du cadre. */}
      <mesh position={[0, h / 2 + 0.09, 0.1]} rotation={[0.6, 0, 0]} material={m.lamp}>
        <boxGeometry args={[w - 0.2, 0.05, 0.1]} />
      </mesh>
    </group>
  );
}

/**
 * La galerie commerciale : ecute, atré.
 *
 * Ce n'est pas un konbini plus long. Une galerie s'ouvre par des BAIES - trois
 * travées vitrées séparées par des trumeaux - au lieu d'une seule devanture, et
 * son bandeau est bas, large et sombre (ou crème), écrit en bas-de-casse fine.
 * C'est le seul commerce du hall qui ait une architecture plutôt qu'une façade.
 */
function Gallery({
  w,
  d,
  height,
  brand,
  kit,
  m,
}: {
  w: number;
  d: number;
  height: number;
  brand: GalleryBrand;
  kit: Kit;
  m: Mats;
}) {
  const shell = height - 0.14;
  const SIGN_H = 0.5;
  const glassH = shell - SIGN_H - 0.12;
  const bays = 3;
  const bayW = (w - 0.4) / bays;
  return (
    <group>
      <mesh position={[0, shell / 2, -d / 2 + 0.06]} material={m.hall}>
        <boxGeometry args={[w, shell, 0.12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`side${s}`} position={[(s * (w - 0.12)) / 2, shell / 2, 0]} material={m.hall}>
          <boxGeometry args={[0.12, shell, d]} />
        </mesh>
      ))}
      {Array.from({ length: bays }, (_, i) => {
        const x = (i - (bays - 1) / 2) * (bayW + 0.14);
        return (
          <group key={`bay${i}`} position={[x, 0, 0]}>
            {/* L'intérieur, peint, puis la baie vitrée devant. */}
            <mesh position={[0, glassH / 2 + 0.12, -d / 2 + 0.16]} material={kit.konbiniIn}>
              <planeGeometry args={[bayW - 0.1, glassH - 0.24]} />
            </mesh>
            <mesh position={[0, glassH / 2 + 0.12, d / 2 - 0.03]} material={m.glass}>
              <planeGeometry args={[bayW, glassH]} />
            </mesh>
            {/* Trumeau entre deux baies. */}
            <mesh position={[bayW / 2 + 0.07, shell / 2, d / 2 - 0.05]} material={m.hall}>
              <boxGeometry args={[0.14, shell, 0.1]} />
            </mesh>
          </group>
        );
      })}
      {/* Bandeau d'enseigne, bas et large. */}
      <mesh position={[0, shell - SIGN_H / 2 - 0.06, d / 2 - 0.06]} material={m.frame}>
        <boxGeometry args={[w - 0.14, SIGN_H + 0.06, 0.1]} />
      </mesh>
      <mesh position={[0, shell - SIGN_H / 2 - 0.06, d / 2 - 0.005]} material={kit.gallery[brand]}>
        <planeGeometry args={[w - 0.22, SIGN_H]} />
      </mesh>
    </group>
  );
}

/**
 * Coffret mural : extincteur (rouge) ou défibrillateur (vert).
 *
 * Les deux ont la même silhouette et ce n'est pas une économie : ce sont les
 * mêmes armoires normalisées, et seule la couleur les distingue - c'est
 * exactement ce qui permet de les repérer sans lire, y compris en courant.
 */
function WallBox({
  w,
  d,
  tone,
  label,
  m,
}: {
  w: number;
  d: number;
  tone: string;
  label: boolean;
  m: Mats;
}) {
  const h = w * 1.15;
  return (
    <group position={[0, 1.25, 0]}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={tone} roughness={0.5} metalness={0.1} />
      </mesh>
      {/* Vitre du coffret, et la croix ou la bouteille qu'on devine derrière. */}
      <mesh position={[0, 0.03, d / 2 + 0.004]} material={m.glass}>
        <planeGeometry args={[w * 0.72, h * 0.62]} />
      </mesh>
      {label && (
        <mesh position={[0, -h / 2 + 0.09, d / 2 + 0.005]} material={m.lamp}>
          <boxGeometry args={[w * 0.8, 0.09, 0.01]} />
        </mesh>
      )}
    </group>
  );
}

/** Panneau d'affichage de service : horaires, travaux, objets trouvés. */
function Notice({ w, m }: { w: number; m: Mats }) {
  return (
    <group position={[0, 1.5, 0]}>
      <mesh material={m.frame}>
        <boxGeometry args={[w, w * 0.62, 0.07]} />
      </mesh>
      <mesh position={[0, 0, 0.045]} material={m.kiosk}>
        <planeGeometry args={[w - 0.08, w * 0.62 - 0.08]} />
      </mesh>
      {/* Trois feuilles punaisées : c'est le désordre qui fait le panneau. */}
      {[[-0.26, 0.08], [0.02, -0.04], [0.28, 0.06]].map(([dx, dy], i) => (
        <mesh key={i} position={[dx * w, dy * w, 0.05]} rotation={[0, 0, (i - 1) * 0.03]} material={m.psd}>
          <planeGeometry args={[w * 0.24, w * 0.32]} />
        </mesh>
      ))}
    </group>
  );
}

/** Porte-parapluies : la grille à fentes des jours de pluie. */
function UmbrellaStand({ w, d, m }: { w: number; d: number; m: Mats }) {
  return (
    <group>
      <mesh position={[0, 0.28, 0]} material={m.metal}>
        <boxGeometry args={[w, 0.56, d]} />
      </mesh>
      {/* Les fentes : cinq traits sombres, et l'objet se lit. */}
      {[-2, -1, 0, 1, 2].map((k) => (
        <mesh key={k} position={[(k * w) / 6, 0.42, d / 2 + 0.004]} material={m.frame}>
          <boxGeometry args={[w * 0.09, 0.22, 0.01]} />
        </mesh>
      ))}
    </group>
  );
}

/** Bac à plante : le seul vert d'un hall souterrain, et il est artificiel. */
function Plant({ w, m }: { w: number; m: Mats }) {
  return (
    <group>
      <mesh position={[0, 0.24, 0]} material={m.wallDark}>
        <cylinderGeometry args={[w * 0.42, w * 0.36, 0.48, 12]} />
      </mesh>
      {/* Le feuillage : trois masses décalées et APLATIES, jamais deux boules
          empilées - deux sphères sur un pot font un bonhomme de neige, pas un
          arbuste. Ce qui fait lire une plante, c'est l'irrégularité. */}
      {[
        { x: -0.22, y: 0.52, r: 0.34, flat: 0.72, tone: '#3c6b3a' },
        { x: 0.2, y: 0.62, r: 0.3, flat: 0.8, tone: '#487a42' },
        { x: -0.04, y: 0.84, r: 0.26, flat: 0.86, tone: '#568c4a' },
      ].map((leaf, i) => (
        <mesh
          key={i}
          position={[leaf.x * w, leaf.y, (i - 1) * w * 0.12]}
          scale={[1, leaf.flat, 1]}
        >
          <sphereGeometry args={[w * leaf.r, 9, 7]} />
          <meshStandardMaterial color={leaf.tone} roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}
