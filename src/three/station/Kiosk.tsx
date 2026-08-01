// NEWDAYS KIOSK : le kiosque du quai.
//
// CE QU'IL ÉTAIT. Une boîte blanche de 2,50 × 4,80, deux comptoirs plats, une
// affiche collée sur un flanc. Personne ne pouvait dire ce que c'était, et il
// était le seul ouvrage du quai qu'on croisait sans le reconnaître - au milieu
// d'une rame dont on compte les rivets.
//
// CE QU'IL EST. Le vrai kiosque de quai japonais se reconnaît sans lire une
// lettre, à cinq choses, et elles y sont toutes :
//
//   · il est OUVERT SUR SES DEUX LONGUEURS. Ce n'est pas une boutique avec une
//     façade : c'est un îlot qu'on sert des deux bords, et le vendeur passe de
//     l'un à l'autre. C'est ce qui décide de toutes ses cotes - deux comptoirs
//     de 0,80 m dos à dos plus 1,30 m de passage font ses trois mètres ;
//   · le comptoir est COUVERT : journaux à plat sur toute une travée, paniers
//     d'onigiri et de pain, présentoirs à hauteur de main. Un comptoir nu est
//     un guichet, pas un point de vente ;
//   · sous le comptoir, du côté du client, le RÂTELIER À MAGAZINES en gradins,
//     qu'on regarde en attendant son train ;
//   · au-dessus, une CLAIE SUSPENDUE garnie jusqu'à l'auvent : c'est elle qui
//     donne au kiosque sa masse, et sans elle il n'était qu'une table ;
//   · et l'ARMOIRE RÉFRIGÉRÉE vitrée à un bout, qui l'éclaire de l'intérieur.
//
// Le tout sous un auvent qui déborde, ceinturé sur ses QUATRE faces d'un
// bandeau d'enseigne allumé - un kiosque se lit d'en face comme de trois
// quarts, et c'est la ceinture, pas la façade, qui le fait lire.
//
// LE BUDGET. Le kiosque est unique par gare : tout y est en géométrie franche.
// Les seules répétitions - les centaines d'articles en claie et sur le
// comptoir - passent par les deux InstancedMesh du `shopKit` (le prisme et le
// révolutionné), deux appels de rendu pour tout le magasin, et les images
// viennent du pool de session. Seul le bandeau, qui porte le nom de la gare, se
// construit et se libère avec le kiosque.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PLATFORM_TOP } from '../../data/stationGeometry';
import type { Placed } from '../../systems/stationPlacement';
import { makeNewDaysBandTexture } from '../../textures/konbini';
import type { Mats } from './materials';
import { fillShelf, fillUnit, pick, shopPool, useShopGlow, type Good } from './shopKit';
import { Goods } from './Goods';
import { ShopClerk } from './ShopStaff';
import { rng } from '../../textures/procedural';

/** Hauteur du comptoir : celle de toute caisse où l'on pose une pièce. */
const COUNTER_H = 0.94;
/** Profondeur d'un comptoir de service, mesurée depuis le nu extérieur. */
const COUNTER_D = 0.8;
/** Sous-face de l'auvent, et hauteur du bandeau d'enseigne qui le ceinture. */
const CANOPY_Y = 2.48;
const SIGN_H = 0.38;
/** Claie suspendue au-dessus du comptoir : entre ces deux cotes. */
const RACK_Y0 = 1.62;
const RACK_Y1 = 2.24;
/** Armoire réfrigérée vitrée, à un bout. */
const COOLER_H = 1.86;

export function Kiosk({ k, m, station }: { k: Placed; m: Mats; station: number }) {
  const p = shopPool();
  useShopGlow();

  // Le bandeau porte le nom de la gare : il ne peut pas venir du pool, et il
  // n'a aucune raison de survivre à la gare qui l'a demandé.
  //
  // Il en faut DEUX ÉTATS, et c'est le prix d'une ceinture qui fait le tour :
  // les longs côtés font près de sept mètres, les bouts trois et demi. Le même
  // dessin étiré sur les deux donnait une ligne de prix illisible, écrasée en
  // accordéon sur les faces courtes. Le bout n'affiche donc que le début du
  // bandeau - l'enseigne et le nom de la gare - par une simple découpe de la
  // texture, qui reste la même image.
  const bands = useMemo(() => {
    const t = makeNewDaysBandTexture('kiosk', station);
    const cropped = t.clone();
    cropped.needsUpdate = true;
    cropped.repeat.set(0.42, 1);
    return {
      texture: t,
      long: new THREE.MeshBasicMaterial({ map: t, toneMapped: false }),
      end: new THREE.MeshBasicMaterial({ map: cropped, toneMapped: false }),
    };
  }, [station]);
  useEffect(
    () => () => {
      bands.long.dispose();
      bands.end.map?.dispose();
      bands.end.dispose();
      bands.texture.dispose();
    },
    [bands],
  );

  // Le kiosque est posé sur l'épine : sa longueur suit le quai (z), sa
  // profondeur le traverse (x), et il s'ouvre des deux côtés.
  const hl = k.halfZ;
  const hd = k.halfX;
  /** Nu extérieur du comptoir, et nu intérieur : entre les deux, on sert. */
  const outX = hd - 0.05;
  const inX = outX - COUNTER_D;
  /** Bouts fermés : le comptoir s'arrête avant, il ne touche pas la joue. */
  const z0 = -hl + 0.24;
  const z1 = hl - 0.24;
  /** L'armoire réfrigérée mange le dernier tiers d'un des deux comptoirs. */
  const coolZ0 = z1 - 1.75;

  // --- La marchandise, en volume ------------------------------------
  //
  // Le kiosque est l'ouvrage du quai qu'on longe de plus près - on passe à
  // quarante centimètres de son comptoir - et c'est le seul endroit de la gare
  // où une étagère peinte ne tiendrait pas une seconde.
  const goods = useMemo(() => {
    const out: Good[] = [];
    for (const s of [-1, 1] as const) {
      const runEnd = s === 1 ? coolZ0 - 0.2 : z1 - 0.3;
      // La claie suspendue, deux plateaux, garnie vers l'extérieur.
      out.push(
        ...fillUnit(station * 7 + (s + 2), {
          x0: z0 + 0.3,
          x1: runEnd,
          y0: RACK_Y0,
          y1: RACK_Y1,
          decks: 2,
          z: s * (outX - 0.06),
          face: s,
          depth: 0.2,
          along: 'z',
        }),
      );
      // Les paniers du comptoir, à hauteur de main : ce qu'on prend en passant
      // sans même s'arrêter. Ils occupent la travée que les journaux laissent.
      out.push(
        ...fillShelf(rng(1700 + station * 131 + s * 37), {
          x0: s === 1 ? z0 + 2.6 : z0 + 0.4,
          x1: s === 1 ? runEnd : z0 + 2.4,
          y: COUNTER_H + 0.13,
          z: s * (outX - 0.12),
          face: s,
          clear: 0.26,
          depth: 0.22,
          along: 'z',
        }),
      );
    }
    return out;
  }, [station, z0, z1, coolZ0, outX]);

  return (
    <group name="kiosque" position={[k.x, PLATFORM_TOP, k.z]}>
      {/* La flaque de lumière que le kiosque jette sur la dalle, la nuit
          venue. C'est à elle qu'on le repère du bout du quai, bien avant de
          lire l'enseigne. */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} material={p.glow}>
        <planeGeometry args={[hd * 2 + 5, hl * 2 + 3.4]} />
      </mesh>

      {/* Socle : un kiosque POSE sur le quai, il n'y flotte pas. Le débord de
          quelques centimètres est ce qui le fait lire comme un ouvrage et non
          comme un meuble déposé là. */}
      <mesh position={[0, 0.07, 0]} material={m.wallDark}>
        <boxGeometry args={[hd * 2 + 0.12, 0.14, hl * 2 + 0.12]} />
      </mesh>

      {/* --- Les deux joues fermées, et leur rideau ------------------- */}
      {[-1, 1].map((s) => (
        <group key={`bout${s}`} position={[0, 0, s * (hl - 0.07)]}>
          <mesh position={[0, CANOPY_Y / 2 + 0.07, 0]} material={p.casework}>
            <boxGeometry args={[hd * 2, CANOPY_Y - 0.07, 0.14]} />
          </mesh>
          {/* Le rideau métallique, remonté : il ne sert qu'aux bouts, mais
              c'est lui qui dit que l'ouvrage est un COMMERCE et non un local
              technique. */}
          <mesh position={[0, 1.28, s * 0.075]} material={p.shutter}>
            <planeGeometry args={[hd * 2 - 0.22, 2.1]} />
          </mesh>
          {/* Et l'affiche de saison par-dessus : c'est le bout du kiosque qu'on
              voit de plus loin en marchant le long du quai, et aucune enseigne
              ne laisse deux mètres carrés de tôle nue face au flux. */}
          <mesh
            position={[0, 1.42, s * 0.082]}
            rotation={[0, s > 0 ? 0 : Math.PI, 0]}
            material={pick(p.posters, station, s + 1)}
          >
            <planeGeometry args={[1.15, 1.53]} />
          </mesh>
        </group>
      ))}

      {/* --- Les deux comptoirs, dos à dos ---------------------------- */}
      {[-1, 1].map((s) => {
        const zEnd = s === 1 ? coolZ0 : z1;
        const mid = (z0 + zEnd) / 2;
        const run = zEnd - z0;
        return (
          <group key={`comptoir${s}`}>
            {/* Le meuble bas, et le plateau d'inox qui le couronne en
                débordant : c'est cet ourlet qu'on longe et sur lequel on pose
                sa monnaie. */}
            <mesh position={[s * (inX + COUNTER_D / 2), COUNTER_H / 2 + 0.07, mid]} material={p.casework}>
              <boxGeometry args={[COUNTER_D, COUNTER_H - 0.07, run]} />
            </mesh>
            <mesh position={[s * (inX + COUNTER_D / 2 + 0.03), COUNTER_H + 0.09, mid]} material={m.metal}>
              <boxGeometry args={[COUNTER_D + 0.06, 0.04, run + 0.04]} />
            </mesh>

            {/* L'étalage de journaux, à plat sur une travée entière : avant
                les magazines, avant les boissons, c'est LUI qu'on reconnaît. */}
            {/* L'image dessine QUATRE journaux à la suite : sa longueur doit
                tomber le long du comptoir, pas en travers. Posée dans l'autre
                sens - ce qu'elle était -, les quatre piles se retrouvaient
                écrasées dans les cinquante-huit centimètres de profondeur du
                plateau, et l'étalage n'était plus qu'un gris sale. */}
            <mesh
              position={[s * (inX + COUNTER_D * 0.52), COUNTER_H + 0.135, z0 + (s === 1 ? 1.2 : 3.6)]}
              rotation={[-Math.PI / 2, 0, (s * Math.PI) / 2]}
              material={pick(p.papers, station, s + 1)}
            >
              <planeGeometry args={[2.1, COUNTER_D * 0.72]} />
            </mesh>

            {/* Le râtelier à magazines, en gradins, SOUS le comptoir et du côté
                du client : c'est là qu'il est, et c'est ce qu'on regarde en
                attendant son train.
                Deux blocs de 1,55 m plutôt qu'un long : chaque image de rangée
                dessine six couvertures, et une couverture fait vingt-cinq
                centimètres. Étirée sur trois mètres, la même rangée donnait des
                magazines d'un demi-mètre de large.

                LE GROUPE PORTE L'ORIENTATION, LA COUVERTURE PORTE L'INCLINAISON,
                et l'ordre des deux n'est pas indifférent. Cumulées sur le même
                objet - un quart de tour en y pour regarder le quai, puis une
                inclinaison en z -, les deux rotations ne se composent pas comme
                on l'espère : le z tourne la couverture AUTOUR DE SA PROPRE
                NORMALE, c'est-à-dire dans son plan. Les magazines partaient en
                diagonale au lieu de se coucher en arrière, et l'on aurait dit
                un présentoir renversé. Le remède ne coûte rien : le groupe est
                tourné vers le client, et à l'intérieur la couverture bascule
                autour de SON x - qui est devenu la longueur du râtelier. */}
            {[0, 1].map((b) => (
              <group
                key={`ratelier${b}`}
                position={[s * outX, 0, z0 + 0.95 + b * 1.65]}
                rotation={[0, (s * Math.PI) / 2, 0]}
              >
                {/* Le dos du râtelier : sans lui, on voyait la joue du comptoir
                    entre deux gradins et les couvertures flottaient. */}
                <mesh position={[0, 0.62, 0.015]} material={p.casework}>
                  <boxGeometry args={[1.57, 0.98, 0.03]} />
                </mesh>
                {[0, 1, 2].map((t) => (
                  <group key={`grad${t}`} position={[0, 0.3 + t * 0.32, 0]}>
                    <mesh position={[0, -0.02, 0.11]} material={p.lip}>
                      <boxGeometry args={[1.55, 0.03, 0.22]} />
                    </mesh>
                    <mesh
                      position={[0, 0.14, 0.07]}
                      rotation={[-0.34, 0, 0]}
                      material={pick(p.magazines, station, t + b)}
                    >
                      <planeGeometry args={[1.55, 0.3]} />
                    </mesh>
                    {/* La barre de retenue, devant : c'est elle qui empêche les
                        magazines de glisser d'un gradin incliné, et c'est aussi
                        elle qui le fait lire comme un râtelier. */}
                    <mesh position={[0, 0.05, 0.215]} material={p.chrome}>
                      <boxGeometry args={[1.55, 0.014, 0.014]} />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}
            {/* Un carton de prix collé sur la joue du comptoir, plus loin : la
                travée sans râtelier n'est pas une surface blanche nue. */}
            <mesh
              position={[s * (outX + 0.012), 0.66, z0 + 4.3]}
              rotation={[0, (s * Math.PI) / 2, 0]}
              material={pick(p.pops, station, s + 3)}
            >
              <planeGeometry args={[0.72, 0.36]} />
            </mesh>

            {/* La claie suspendue : deux plateaux entre le comptoir et
                l'auvent. C'est elle qui donne sa masse au kiosque. */}
            <mesh position={[s * (outX - 0.13), RACK_Y1 + 0.12, mid]} material={p.casework}>
              <boxGeometry args={[0.28, 0.06, run]} />
            </mesh>
            {[RACK_Y0, (RACK_Y0 + RACK_Y1) / 2].map((y, t) => (
              <mesh key={`claie${t}`} position={[s * (outX - 0.13), y - 0.015, mid]} material={p.lip}>
                <boxGeometry args={[0.28, 0.03, run - 0.04]} />
              </mesh>
            ))}
            {/* Suspentes de la claie, aux deux bouts. */}
            {[-1, 1].map((e) => (
              <mesh
                key={`susp${e}`}
                position={[s * (outX - 0.02), (RACK_Y0 + CANOPY_Y) / 2, mid + (e * run) / 2 - e * 0.06]}
                material={m.metal}
              >
                <boxGeometry args={[0.04, CANOPY_Y - RACK_Y0, 0.04]} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* --- L'armoire réfrigérée, à un bout du comptoir de droite ----- */}
      <group position={[inX + COUNTER_D / 2, 0, (coolZ0 + z1) / 2]}>
        <mesh position={[0, COOLER_H / 2 + 0.07, 0]} material={p.casework}>
          <boxGeometry args={[COUNTER_D, COOLER_H, z1 - coolZ0]} />
        </mesh>
        {[0, 1].map((i) => (
          <mesh
            key={`porte${i}`}
            position={[
              COUNTER_D / 2 + 0.004,
              COOLER_H / 2 + 0.07,
              (i - 0.5) * (z1 - coolZ0) * 0.5,
            ]}
            rotation={[0, Math.PI / 2, 0]}
            material={pick(p.coolers, station, i)}
          >
            <planeGeometry args={[(z1 - coolZ0) * 0.46, COOLER_H - 0.14]} />
          </mesh>
        ))}
        {/* Bandeau lumineux de l'armoire : c'est ce qui fait qu'un bout du
            kiosque est plus clair que l'autre, de jour comme de nuit. */}
        <mesh position={[COUNTER_D / 2 + 0.006, COOLER_H + 0.16, 0]} rotation={[0, Math.PI / 2, 0]} material={p.lit}>
          <planeGeometry args={[z1 - coolZ0 - 0.08, 0.14]} />
        </mesh>
      </group>

      {/* --- L'épine centrale, entre les deux comptoirs ----------------
          Un kiosque ouvert des deux bords n'est pas pour autant TRANSPARENT :
          entre les deux comptoirs court une épine de rangement à hauteur de
          poitrine, où l'on prend les cartouches, les cartes et les sacs. Sans
          elle, on voyait le quai d'en face par-dessus le comptoir, à travers la
          boutique - et le kiosque n'était plus qu'un auvent sur quatre pieds.
          Elle s'interrompt sur un mètre quarante au droit de la caisse : c'est
          par là que le vendeur passe d'un bord à l'autre. */}
      {[
        { a: z0, b: -0.7 },
        { a: 0.7, b: z1 },
      ].map((seg, i) => (
        <mesh key={`epine${i}`} position={[0, 1.38, (seg.a + seg.b) / 2]} material={p.casework}>
          <boxGeometry args={[0.16, 0.68, seg.b - seg.a]} />
        </mesh>
      ))}

      {/* --- Le poste de caisse, dans le passage --------------------- */}
      <group position={[-0.36, 0, 0]}>
        <mesh position={[0, 0.52, 0]} material={p.casework}>
          <boxGeometry args={[0.42, 0.9, 0.62]} />
        </mesh>
        <mesh position={[0, 1.03, 0]} material={m.frame}>
          <boxGeometry args={[0.32, 0.16, 0.4]} />
        </mesh>
        <mesh position={[-0.02, 1.2, 0.02]} material={m.frame}>
          <boxGeometry args={[0.03, 0.2, 0.28]} />
        </mesh>
        <mesh position={[-0.04, 1.2, 0.02]} rotation={[0, -Math.PI / 2, 0]} material={p.screen}>
          <planeGeometry args={[0.25, 0.17]} />
        </mesh>
      </group>

      {/* Cartons de réserve, empilés au fond du passage : un kiosque a toujours
          sa livraison du matin encore posée derrière le vendeur. */}
      <group position={[-0.35, 0.07, z1 - 0.75]}>
        {[0, 1, 2].map((k2) => (
          <mesh key={`carton${k2}`} position={[(k2 % 2) * 0.05 - 0.025, 0.16 + k2 * 0.3, k2 * 0.05]}>
            <boxGeometry args={[0.44, 0.3, 0.4]} />
            <meshStandardMaterial color="#c8a878" roughness={0.92} />
          </mesh>
        ))}
      </group>

      {/* La marchandise des claies et des comptoirs : briques et paquets d'un
          côté, canettes, bouteilles et pots de l'autre, deux appels de rendu
          pour tout le magasin. */}
      <Goods goods={goods} name="kiosque/marchandise" />

      {/* --- L'auvent, et la ceinture d'enseigne ----------------------
          L'auvent est ÉPAIS, et son épaisseur EST le bandeau : sur une dalle
          de douze centimètres surmontée d'une enseigne posée en équilibre,
          l'ensemble se lisait comme deux ouvrages superposés séparés par un
          jour noir. Un caisson d'enseigne de kiosque n'est pas posé sur son
          auvent, il en est la rive. */}
      <mesh position={[0, CANOPY_Y + SIGN_H / 2 + 0.04, 0]} material={m.canopy}>
        <boxGeometry args={[hd * 2 + 0.66, SIGN_H + 0.08, hl * 2 + 0.44]} />
      </mesh>
      {/* Réglettes sous l'auvent, au-dessus de chaque comptoir : un kiosque est
          toujours plus clair que le quai autour, et c'est ce qui attire l'œil
          au milieu d'un îlot. */}
      {[-1, 1].map((s) => (
        <mesh key={`reglette${s}`} position={[s * (outX - 0.42), CANOPY_Y - 0.03, 0]} material={p.lit}>
          <boxGeometry args={[0.18, 0.06, hl * 2 - 0.5]} />
        </mesh>
      ))}
      {/* Le bandeau, sur les QUATRE faces : un kiosque d'îlot se voit d'en face
          comme par le bout, et le bout est même ce qu'on voit de plus loin en
          marchant le long du quai. */}
      {[
        { yaw: Math.PI / 2, x: hd + 0.34, z: 0, len: hl * 2 + 0.44, end: false },
        { yaw: -Math.PI / 2, x: -hd - 0.34, z: 0, len: hl * 2 + 0.44, end: false },
        { yaw: 0, x: 0, z: hl + 0.23, len: hd * 2 + 0.66, end: true },
        { yaw: Math.PI, x: 0, z: -hl - 0.23, len: hd * 2 + 0.66, end: true },
      ].map((f, i) => (
        <mesh
          key={`bandeau${i}`}
          position={[f.x, CANOPY_Y + SIGN_H / 2 + 0.04, f.z]}
          rotation={[0, f.yaw, 0]}
          material={f.end ? bands.end : bands.long}
        >
          <planeGeometry args={[f.len - 0.02, SIGN_H]} />
        </mesh>
      ))}

      {/* Le vendeur, dans le passage, tourné vers le comptoir de gauche - celui
          où est la caisse. Une boutique garnie jusqu'au plafond mais vide se
          lit comme un décor, pas comme un commerce fermé deux minutes. */}
      <ShopClerk x={0.26} y={0.14} z={0.42} yaw={-Math.PI / 2} seed={station * 5 + 3} />

      {/* Les cartes de prix suspendues sous le nez de l'auvent. Sans elles, une
          boutique paraît fermée toutes lumières allumées - c'est le détail le
          plus japonais du lot, et le moins cher à poser. */}
      {[-1, 1].map((s) =>
        [-0.62, -0.1, 0.42].map((f, i) => (
          <mesh
            key={`pop${s}${i}`}
            position={[s * (hd + 0.24), CANOPY_Y - 0.2, f * hl]}
            rotation={[0, (s * Math.PI) / 2, 0]}
            material={pick(p.pops, station, i + (s > 0 ? 0 : 2))}
          >
            <planeGeometry args={[0.52, 0.26]} />
          </mesh>
        )),
      )}
    </group>
  );
}
