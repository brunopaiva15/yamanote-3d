// NEWDAYS : le konbini du hall.
//
// CE QU'IL ÉTAIT. Trois parois, une vitre, et derrière la vitre un plan peint
// représentant des gondoles. À deux mètres cela passait ; à un mètre, la
// boutique n'avait aucune profondeur - le « fond du magasin » était à seize
// centimètres de la devanture, et l'on voyait un poster, pas un commerce. Le
// hall entier en souffrait : le konbini est censé être le point le plus
// lumineux et le plus vivant du niveau, et c'était le plus plat.
//
// CE QU'IL EST. Une PIÈCE, garnie jusqu'au fond. On y distingue, de la
// devanture au mur du fond :
//
//   · le meuble à magazines contre la vitre - c'est là qu'il est dans toutes
//     les gares du monde, et c'est ce qu'on voit d'abord en passant ;
//   · la gondole centrale sur son socle rouge, quatre plateaux garnis des DEUX
//     côtés d'articles en volume - briques, paquets, canettes, bouteilles -
//     chaque nez portant son rail d'étiquettes, le tout coiffé d'un fronton
//     aux couleurs de l'enseigne ;
//   · le mur de vitrines réfrigérées, socle sombre, pare-chocs orange et
//     bandeau de famille, qui tient tout le fond ;
//   · le meuble froid OUVERT à onigiri et sandwichs, trois gradins garnis sous
//     leurs tubes, à gauche du fond ;
//   · le bac à glaces vitré, en plein passage ;
//   · le comptoir de caisse près de l'entrée, avec son écran client, son bac à
//     friture, sa machine à café, et l'armoire à cigarettes au mur derrière.
//
// Et au-dessus de tout cela, cinq réglettes nues au plafond, plus le vendeur
// derrière sa caisse : un konbini n'a d'ombre nulle part et n'est jamais vide,
// c'est ce qui le distingue du hall où il se trouve.
//
// LA COULEUR. Un konbini est un lieu CHAUD, et c'est ce qui manquait le plus :
// carrelage de grès terracotta, tôle crème plutôt que blanche, socles rouges,
// pare-chocs et frise orange. En gris et blanc, la boutique la mieux garnie du
// monde ressemble à une pharmacie.
//
// LE BUDGET. Tout ce qui se répète - le millier d'articles en rayon - tient
// dans deux InstancedMesh et deux appels de rendu (`shopKit`). Toutes les
// images sont celles du pool de session, partagées par les trente gares ; seul
// le bandeau d'enseigne appartient à la gare, puisqu'il porte son nom, et il se
// construit et se libère avec la boutique.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { KONBINI_WALL as WALL, konbiniPlan } from '../../data/konbiniPlan';
import { runtime } from '../../systems/runtime';
import { makeNewDaysBandTexture } from '../../textures/konbini';
import type { Mats } from './materials';
import { fillUnit, pick, shopPool } from './shopKit';
import { Goods } from './Goods';
import { ShopClerk } from './ShopStaff';

/** Hauteur du bandeau d'enseigne, au-dessus de la devanture. */
const SIGN_H = 0.62;
/** Plan de travail du comptoir de caisse : la hauteur de toute caisse. */
const COUNTER_H = 0.94;
/** Vitrines réfrigérées : hauteur des portes, puis du bandeau lumineux. */
const COOL_H = 2.02;
const COOL_VALANCE = 0.36;
/** Meuble froid ouvert (onigiri, sandwichs) : plus bas, on y prend à main nue. */
const CHILL_H = 1.6;
/** Gondole centrale : assez basse pour qu'on voie le fond par-dessus. */
const GOND_H = 1.42;
/**
 * Présentoir à magazines, contre la vitre.
 *
 * Volontairement plus BAS que la gondole : c'est le meuble le plus proche du
 * regard depuis le hall, et à un mètre trente-quatre il masquait tout ce qu'il
 * y avait derrière lui. Un râtelier de konbini arrive à la poitrine, pas à
 * l'épaule.
 */
const RACK_H = 1.12;

export function Konbini({
  w,
  d,
  height,
  station,
  anchor,
  m,
}: {
  w: number;
  d: number;
  height: number;
  station: number;
  /**
   * Où la boutique est posée dans le repère du QUAI, et de quel côté elle
   * regarde. Elle n'en a besoin que pour une chose - savoir où se trouve sa
   * porte quand le joueur s'en approche - mais sans cela, la porte ne peut pas
   * s'ouvrir : rien d'autre dans le repère local ne dit où l'on est.
   */
  anchor?: { cx: number; cz: number; facing: -1 | 1 };
  m: Mats;
}) {
  const p = shopPool();

  // Le bandeau porte le nom de la gare : il ne peut pas venir du pool, et il
  // n'a aucune raison de survivre à la gare qui l'a demandé.
  const band = useMemo(() => {
    const t = makeNewDaysBandTexture('shop', station);
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  }, [station]);
  useEffect(
    () => () => {
      band.map?.dispose();
      band.dispose();
    },
    [band],
  );

  // --- Le gabarit de la boutique ------------------------------------
  //
  // Il ne se calcule PAS ici : il vient de `data/konbiniPlan`, que lit aussi
  // l'implantation du hall pour en tirer les obstacles de marche. Depuis qu'on
  // entre dans la boutique, ses cotes intérieures ne regardent plus le seul
  // rendu - une gondole dessinée à un endroit et contournée à un autre se voit
  // au premier pas, et c'est la règle du chantier depuis le début.
  const shell = height - 0.14;
  const glassH = shell - SIGN_H - 0.1;
  const {
    hw,
    zb,
    zf,
    leftEnd,
    doorW,
    doorX,
    doorL,
    coolD,
    gondD,
    gondZ,
    gondX0,
    gondX1,
    rackD,
    rackZ,
    rackX0,
    rackX1,
    coolX0,
    coolX1,
    doors,
    doorPitch,
    counter,
    chest,
    baskets,
    clerk,
  } = useMemo(() => konbiniPlan(w, d), [w, d]);

  /** L'axe de la baie, rabattu une fois pour toutes dans le repère du quai. */
  const sensor = useMemo(
    () =>
      anchor
        ? anchor.facing === 1
          ? { x: anchor.cx + zf, z: anchor.cz - doorX }
          : { x: anchor.cx - zf, z: anchor.cz + doorX }
        : null,
    [anchor, zf, doorX],
  );

  // --- La marchandise, en volume ------------------------------------
  //
  // Deux fronts de gondole, quatre plateaux chacun. C'est le seul endroit de la
  // boutique où l'on a le nez sur le rayon (la vitre est à un mètre) et donc le
  // seul qui mérite des boîtes plutôt qu'une image.
  const goods = useMemo(() => {
    const shelf = { x0: gondX0 + 0.06, x1: gondX1 - 0.06, y0: 0.24, y1: GOND_H - 0.04, decks: 4 };
    return [
      ...fillUnit(station * 3 + 1, { ...shelf, z: gondZ + gondD / 2, face: 1, depth: gondD * 0.44 }),
      ...fillUnit(station * 3 + 2, { ...shelf, z: gondZ - gondD / 2, face: -1, depth: gondD * 0.44 }),
      // Le meuble froid ouvert est garni pour de vrai lui aussi : c'est le
      // rayon qu'on longe le plus près en entrant, et une image plaquée au
      // fond d'un meuble à trois gradins ne tient pas à un mètre.
      ...fillUnit(station * 3 + 5, {
        x0: -hw + 0.16,
        x1: leftEnd - 0.16,
        y0: 0.44,
        y1: CHILL_H - 0.12,
        decks: 3,
        z: zb + coolD - 0.04,
        face: 1,
        depth: coolD * 0.55,
      }),
    ];
  }, [station, gondX0, gondX1, gondZ, gondD, hw, leftEnd, zb, coolD]);

  return (
    <group name="konbini">
      {/* --- La coque : fond, joues, sol, plafond ---------------------- */}
      <mesh position={[0, shell / 2, zb - WALL / 2]} material={m.hall}>
        <boxGeometry args={[w, shell, WALL]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`joue${s}`} position={[(s * (w - WALL)) / 2, shell / 2, 0]} material={m.hall}>
          <boxGeometry args={[WALL, shell, d]} />
        </mesh>
      ))}
      {/* Le sol change au seuil, et c'est le changement qui FAIT le seuil : du
          béton du hall on passe à un vinyle clair, sans quoi la boutique n'est
          qu'un renfoncement. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={p.floor}>
        <planeGeometry args={[2 * hw, d - WALL]} />
      </mesh>
      <mesh position={[0, shell - 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} material={p.ceiling}>
        <planeGeometry args={[2 * hw, d - WALL]} />
      </mesh>
      {/* Cinq luminaires : un konbini est éclairé À PLAT, sans ombre portée
          nulle part, et c'est cette lumière-là qu'on voit du bout du hall bien
          avant de lire l'enseigne. Le tube est NU dans sa réglette - c'est ce
          qu'on voit au plafond de tous les konbini du monde - et la réglette
          elle-même se voit : un simple trait lumineux collé sous la dalle
          n'avait ni épaisseur ni ombre, et le plafond restait un aplat. */}
      {Array.from({ length: 5 }, (_, i) => {
        const lx = -hw + ((i + 0.5) * 2 * hw) / 5;
        return (
          <group key={`neon${i}`} position={[lx, shell - 0.1, (zb + zf) / 2 - 0.1]}>
            <mesh position={[0, 0.05, 0]} material={p.casework}>
              <boxGeometry args={[0.3, 0.09, d - 0.5]} />
            </mesh>
            <mesh material={p.lit}>
              <boxGeometry args={[0.19, 0.05, d - 0.56]} />
            </mesh>
          </group>
        );
      })}
      {/* Les parois, vues du dedans : de la tôle crème, et non le béton pâle du
          hall. Une boutique chaude bordée de murs gris se refroidissait par les
          bords - et ce sont justement les bords qu'on voit à travers la vitrine
          quand on passe de trois quarts. Le fond compte autant : au-dessus des
          vitrines, il reste soixante centimètres de mur en plein champ. */}
      {[-1, 1].map((s) => (
        <mesh
          key={`doublage${s}`}
          position={[s * (hw - 0.008), (shell - 0.2) / 2, 0]}
          rotation={[0, (-s * Math.PI) / 2, 0]}
          material={p.casework}
        >
          <planeGeometry args={[d - WALL, shell - 0.2]} />
        </mesh>
      ))}
      <mesh position={[0, (shell - 0.2) / 2, zb + 0.008]} material={p.casework}>
        <planeGeometry args={[2 * hw, shell - 0.2]} />
      </mesh>
      {/* Le filet orange en haut des parois : la frise que porte tout konbini,
          juste sous le nu haut de la vitrine. Elle ne sert à rien qu'à
          réchauffer le blanc, et c'est exactement ce qui manquait. Posée plus
          haut - sous le plafond, où elle serait en vrai -, elle disparaissait
          derrière le caisson d'enseigne et ne servait plus à personne. */}
      <mesh position={[0, glassH - 0.16, zb + 0.02]} material={p.bumper}>
        <boxGeometry args={[2 * hw, 0.12, 0.03]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`frise${s}`} position={[s * (hw - 0.02), glassH - 0.16, 0]} material={p.bumper}>
          <boxGeometry args={[0.03, 0.12, d - WALL]} />
        </mesh>
      ))}

      {/* --- Le mur de vitrines réfrigérées ----------------------------
          Trois choses font un meuble réfrigéré japonais, et aucune n'est la
          porte : le SOCLE sombre sur lequel il pose, le PARE-CHOCS orange qui
          court à hauteur de chariot, et le BANDEAU de famille qui le coiffe.
          Sans eux, une batterie de portes vitrées n'est qu'un mur de verre. */}
      <group name="konbini/vitrines">
        <mesh position={[(coolX0 + coolX1) / 2, 0.06, zb + coolD / 2]} material={p.plinth}>
          <boxGeometry args={[coolX1 - coolX0, 0.12, coolD + 0.03]} />
        </mesh>
        <mesh
          position={[(coolX0 + coolX1) / 2, (COOL_H + COOL_VALANCE) / 2 + 0.06, zb + coolD / 2]}
          material={p.casework}
        >
          <boxGeometry args={[coolX1 - coolX0, COOL_H + COOL_VALANCE, coolD]} />
        </mesh>
        {Array.from({ length: doors }, (_, i) => (
          <group key={`porte${i}`} position={[coolX0 + (i + 0.5) * doorPitch, 0, 0]}>
            <mesh position={[0, COOL_H / 2 + 0.14, zb + coolD + 0.004]} material={pick(p.coolers, station, i)}>
              <planeGeometry args={[doorPitch - 0.06, COOL_H - 0.14]} />
            </mesh>
            {/* Le montant qui sépare deux portes, et sa poignée verticale. */}
            <mesh position={[doorPitch / 2, COOL_H / 2 + 0.14, zb + coolD + 0.02]} material={p.chrome}>
              <boxGeometry args={[0.05, COOL_H - 0.1, 0.05]} />
            </mesh>
          </group>
        ))}
        <mesh
          position={[(coolX0 + coolX1) / 2, 0.14, zb + coolD + 0.02]}
          material={p.bumper}
        >
          <boxGeometry args={[coolX1 - coolX0, 0.16, 0.05]} />
        </mesh>
        <mesh
          position={[(coolX0 + coolX1) / 2, COOL_H + COOL_VALANCE / 2 + 0.06, zb + coolD + 0.008]}
          material={p.bands.drinks}
        >
          <planeGeometry args={[coolX1 - coolX0 - 0.04, COOL_VALANCE - 0.04]} />
        </mesh>
      </group>

      {/* --- Le meuble froid ouvert : onigiri, sandwichs, bentō --------
          Ouvert veut dire qu'on y PREND À MAIN NUE : il n'a pas de porte, il a
          trois gradins garnis, un tube sous chaque casquette, un pare-chocs et
          son bandeau. C'est le rayon qu'on longe le plus près en entrant, et
          c'est celui qui souffrait le plus d'être une image collée au fond. */}
      <group name="konbini/meuble-froid">
        <mesh position={[(-hw + leftEnd) / 2, 0.06, zb + coolD / 2]} material={p.plinth}>
          <boxGeometry args={[leftEnd + hw - 0.06, 0.12, coolD + 0.03]} />
        </mesh>
        {/* Caisson : joues et fond, mais pas de face - c'est ce creux qui fait
            le meuble ouvert. */}
        <mesh position={[(-hw + leftEnd) / 2, CHILL_H / 2 + 0.06, zb + 0.05]} material={pick(p.chilled, station, 1)}>
          <boxGeometry args={[leftEnd + hw - 0.06, CHILL_H, 0.1]} />
        </mesh>
        {[-1, 1].map((s) => {
          const cx = (-hw + leftEnd) / 2 + (s * (leftEnd + hw - 0.06)) / 2;
          return (
            <mesh key={`joue${s}`} position={[cx, CHILL_H / 2 + 0.06, zb + coolD / 2]} material={p.casework}>
              <boxGeometry args={[0.07, CHILL_H, coolD]} />
            </mesh>
          );
        })}
        {/* Les trois gradins, chacun avec son rail de prix et son tube. */}
        {[0, 1, 2].map((k) => {
          const y = 0.44 + (k * (CHILL_H - 0.56)) / 3;
          return (
            <group key={`gradin${k}`} position={[(-hw + leftEnd) / 2, y, 0]}>
              <mesh position={[0, -0.02, zb + coolD / 2]} material={p.lip}>
                <boxGeometry args={[leftEnd + hw - 0.14, 0.03, coolD - 0.06]} />
              </mesh>
              {/* Le rail se pose DEVANT le nez du gradin, jamais à son nu : à
                  la même cote que la face qu'il habille, les deux surfaces se
                  disputaient le tampon de profondeur. */}
              <mesh position={[0, -0.035, zb + coolD - 0.015]} material={p.rail}>
                <planeGeometry args={[leftEnd + hw - 0.14, 0.05]} />
              </mesh>
              <mesh position={[0, 0.24, zb + coolD - 0.1]} material={p.lit}>
                <boxGeometry args={[leftEnd + hw - 0.24, 0.025, 0.04]} />
              </mesh>
            </group>
          );
        })}
        <mesh position={[(-hw + leftEnd) / 2, 0.2, zb + coolD + 0.01]} material={p.bumper}>
          <boxGeometry args={[leftEnd + hw - 0.06, 0.24, 0.06]} />
        </mesh>
        <mesh position={[(-hw + leftEnd) / 2, CHILL_H + 0.14, zb + coolD * 0.6]} material={p.casework}>
          <boxGeometry args={[leftEnd + hw - 0.06, 0.28, coolD * 1.24]} />
        </mesh>
        {/* Le bandeau avance de deux centimètres sur le nu de la casquette. Il
            était EXACTEMENT dessus, et c'est le grésillement qu'on voyait
            courir en travers de 「おにぎり・お弁当」 dès qu'on bougeait la tête :
            deux surfaces à la même cote, et le tampon de profondeur tranche au
            hasard, pixel par pixel. */}
        <mesh
          position={[(-hw + leftEnd) / 2, CHILL_H + 0.14, zb + coolD * 1.22 + 0.02]}
          material={p.bands.chilled}
        >
          <planeGeometry args={[leftEnd + hw - 0.12, 0.24]} />
        </mesh>
      </group>

      {/* --- La gondole centrale, garnie des deux côtés ----------------
          Une gondole de konbini n'est pas une étagère : c'est un SOCLE ROUGE
          laqué qui l'ancre au sol, des plateaux crème dont chaque nez porte son
          rail de prix, des montants chromés aux deux bouts, et par-dessus le
          tout un FRONTON aux couleurs de l'enseigne. Sans le socle elle
          flottait ; sans le fronton, elle appartenait à un entrepôt. */}
      <group name="konbini/gondole">
        <mesh position={[(gondX0 + gondX1) / 2, 0.08, gondZ]} material={p.plinth}>
          <boxGeometry args={[gondX1 - gondX0, 0.16, gondD * 0.92]} />
        </mesh>
        <mesh position={[(gondX0 + gondX1) / 2, GOND_H / 2 + 0.16, gondZ]} material={p.casework}>
          <boxGeometry args={[gondX1 - gondX0, GOND_H - 0.32, 0.05]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh
            key={`montant${s}`}
            position={[(gondX0 + gondX1) / 2 + (s * (gondX1 - gondX0)) / 2, GOND_H / 2 + 0.16, gondZ]}
            material={p.chrome}
          >
            <boxGeometry args={[0.04, GOND_H - 0.2, gondD * 0.9]} />
          </mesh>
        ))}
        {[0, 1, 2, 3].map((k) => {
          const y = 0.24 + (k * (GOND_H - 0.28)) / 4;
          return (
            <group key={`plateau${k}`} position={[(gondX0 + gondX1) / 2, y, gondZ]}>
              <mesh position={[0, -0.012, 0]} material={p.lip}>
                <boxGeometry args={[gondX1 - gondX0 - 0.02, 0.024, gondD]} />
              </mesh>
              {/* Le rail d'étiquettes, sur les deux nez : c'est LUI qui fait
                  d'une planche un rayon, et il coûte un plan. */}
              {[-1, 1].map((s) => (
                <mesh
                  key={`rail${s}`}
                  position={[0, -0.031, (s * gondD) / 2 + s * 0.002]}
                  rotation={[0, s > 0 ? 0 : Math.PI, 0]}
                  material={p.rail}
                >
                  <planeGeometry args={[gondX1 - gondX0 - 0.02, 0.045]} />
                </mesh>
              ))}
            </group>
          );
        })}
        {/* Le fronton : légèrement incliné vers l'avant, comme une casquette. */}
        <mesh position={[(gondX0 + gondX1) / 2, GOND_H + 0.18, gondZ]} material={p.casework}>
          <boxGeometry args={[gondX1 - gondX0 + 0.06, 0.26, gondD * 0.72]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh
            key={`fronton${s}`}
            position={[(gondX0 + gondX1) / 2, GOND_H + 0.18, (s * gondD * 0.72) / 2 + gondZ + s * 0.004]}
            rotation={[0, s > 0 ? 0 : Math.PI, 0]}
            material={p.gondolaHeader}
          >
            <planeGeometry args={[gondX1 - gondX0 + 0.02, 0.22]} />
          </mesh>
        ))}
        <Goods goods={goods} name="konbini/marchandise" />
      </group>

      {/* --- Le présentoir à magazines, contre la vitre ---------------- */}
      <group name="konbini/magazines" position={[(rackX0 + rackX1) / 2, 0, rackZ]}>
        <mesh position={[0, RACK_H / 2, -rackD / 2 + 0.03]} material={p.casework}>
          <boxGeometry args={[rackX1 - rackX0, RACK_H, 0.06]} />
        </mesh>
        {/* Quatre étages inclinés : un râtelier présente ses couvertures en
            arrière, jamais d'aplomb - c'est ce qui les rend lisibles debout. */}
        {[0, 1, 2].map((k) => (
          <group key={`etage${k}`} position={[0, 0.26 + k * 0.31, 0]}>
            <mesh position={[0, -0.02, 0]} material={p.lip}>
              <boxGeometry args={[rackX1 - rackX0 - 0.04, 0.03, rackD]} />
            </mesh>
            <mesh
              position={[0, 0.14, rackD * 0.08]}
              rotation={[-0.34, 0, 0]}
              material={pick(p.magazines, station, k)}
            >
              <planeGeometry args={[rackX1 - rackX0 - 0.08, 0.29]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* --- Le comptoir de caisse -------------------------------------
          Il n'est pas adossé au meuble froid : il faut TENIR DEBOUT derrière,
          et se retourner pour attraper un sachet. Quatre-vingt-dix centimètres
          d'arrière-caisse - à cinquante, le vendeur était pris en sandwich
          entre deux meubles. */}
      <Checkout
        x0={counter.x0}
        x1={counter.x1}
        z0={counter.z0}
        depth={counter.depth}
        wallX={-hw}
        station={station}
        m={m}
      />

      {/* --- La devanture ---------------------------------------------- */}
      <group name="konbini/devanture">
        {/* Allège : le socle d'aluminium sur lequel la vitre pose. Elle
            s'interrompt à la baie comme la traverse haute - au droit d'une
            porte, il n'y a pas d'allège, il y a un seuil au ras du sol, sur
            lequel on ne trébuche pas. */}
        {[
          { a: -w / 2 + 0.08, b: doorX - doorW / 2 - 0.05 },
          { a: doorX + doorW / 2 + 0.05, b: w / 2 - 0.08 },
        ].map((seg, i) => (
          <mesh
            key={`allege${i}`}
            position={[(seg.a + seg.b) / 2, 0.06, zf - 0.05]}
            material={m.metal}
          >
            <boxGeometry args={[Math.max(0.02, seg.b - seg.a), 0.12, 0.1]} />
          </mesh>
        ))}
        <mesh position={[doorX, 0.012, zf - 0.05]} material={m.metal}>
          <boxGeometry args={[doorW + 0.1, 0.024, 0.12]} />
        </mesh>
        {/* Traverse haute, sous le bandeau - INTERROMPUE au droit de la baie :
            au-dessus d'une porte coulissante, ce n'est pas la traverse de la
            devanture qui court, c'est le caisson d'entraînement des vantaux.
            D'un seul tenant, elle traversait ce caisson de dix centimètres. */}
        {[
          { a: -w / 2 + 0.08, b: doorX - doorW / 2 - 0.05 },
          { a: doorX + doorW / 2 + 0.05, b: w / 2 - 0.08 },
        ].map((seg, i) => (
          <mesh
            key={`traverse${i}`}
            position={[(seg.a + seg.b) / 2, glassH + 0.05, zf - 0.05]}
            material={m.metal}
          >
            <boxGeometry args={[Math.max(0.02, seg.b - seg.a), 0.1, 0.1]} />
          </mesh>
        ))}
        {/* Les panneaux fixes, et leurs meneaux. La vitre est PLEINE HAUTEUR :
            c'est elle qui fait la boutique, et un allège maçonné l'aurait
            transformée en guichet. */}
        <mesh position={[(-hw + doorL) / 2, glassH / 2 + 0.1, zf - 0.02]} material={m.glass}>
          <planeGeometry args={[doorL + hw, glassH - 0.08]} />
        </mesh>
        <mesh
          position={[(doorX + doorW / 2 + hw) / 2, glassH / 2 + 0.1, zf - 0.02]}
          material={m.glass}
        >
          <planeGeometry args={[Math.max(0.05, hw - doorX - doorW / 2), glassH - 0.08]} />
        </mesh>
        {[0.34, 0.68].map((f, i) => (
          <mesh
            key={`meneau${i}`}
            position={[-hw + (doorL + hw) * f, glassH / 2 + 0.1, zf - 0.03]}
            material={m.metal}
          >
            <boxGeometry args={[0.06, glassH - 0.06, 0.07]} />
          </mesh>
        ))}
        {/* Affiches de saison, collées de l'intérieur sur le tiers haut : une
            devanture de konbini n'est jamais du verre nu. */}
        {[0, 1, 2].map((k) => (
          <mesh
            key={`affiche${k}`}
            position={[
              -hw + (doorL + hw) * (0.13 + k * 0.3),
              glassH * (k === 1 ? 0.79 : 0.74),
              zf - 0.06,
            ]}
            material={pick(p.posters, station, k)}
          >
            <planeGeometry args={[0.36, 0.48]} />
          </mesh>
        ))}

        <SlidingDoors x={doorX} width={doorW} height={glassH} z={zf} sensor={sensor} m={m} />

        {/* Pile de paniers, à l'entrée : on en prend un en passant, et c'est le
            premier objet de toute boutique japonaise. */}
        <group position={[baskets.x, 0, baskets.z]}>
          {[0, 1, 2, 3, 4].map((k) => (
            <group
              key={`panier${k}`}
              position={[0, 0.05 + k * 0.1, 0]}
              rotation={[0, (k % 2 ? 1 : -1) * 0.03, 0]}
            >
              {/* Un panier emboîté ne dépasse que de son BORD : la pile est une
                  suite de lignes, pas un bloc. Le corps est en retrait sous un
                  bord plus large et plus sombre - sans ce redan, cinq paniers
                  fondaient en un pavé bleu. */}
              <mesh position={[0, -0.02, 0]}>
                <boxGeometry args={[0.33, 0.06, 0.23]} />
                <meshStandardMaterial color="#3f6fb8" roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.02, 0]}>
                <boxGeometry args={[0.37, 0.03, 0.27]} />
                <meshStandardMaterial color="#2a4f88" roughness={0.55} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Le bac à glaces, en plein passage : un coffre bas à couvercles
            vitrés coulissants, joue orange, plinthe sombre. C'est le meuble le
            plus reconnaissable d'un konbini après le mur de vitrines, et le
            seul qu'on regarde par le DESSUS - il occupe le milieu du sol, que
            personne ne laisse vide. */}
        {/* Il se pose DEVANT la gondole, jamais à son droit : un mètre trente
            de coffre planté dans un rayon ne se voit sur aucune capture prise
            de face, et la sonde de gare le trouve du premier coup. */}
        <group name="konbini/bac-glaces" position={[chest.x, 0, chest.z]}>
          <mesh position={[0, 0.05, 0]} material={p.plinth}>
            <boxGeometry args={[1.24, 0.1, 0.7]} />
          </mesh>
          <mesh position={[0, 0.44, 0]} material={p.bumper}>
            <boxGeometry args={[1.3, 0.7, 0.76]} />
          </mesh>
          <mesh position={[0, 0.52, 0]} material={p.casework}>
            <boxGeometry args={[1.18, 0.22, 0.78]} />
          </mesh>
          <mesh position={[0, 0.82, 0]} material={p.chrome}>
            <boxGeometry args={[1.32, 0.06, 0.78]} />
          </mesh>
          {/* Les deux couvercles vitrés, et le froid bleuté qu'on voit dessous. */}
          {[-1, 1].map((s) => (
            <mesh key={`couvercle${s}`} position={[s * 0.31, 0.86, 0]} material={m.glass}>
              <boxGeometry args={[0.58, 0.03, 0.66]} />
            </mesh>
          ))}
          <mesh position={[0, 0.78, 0]}>
            <boxGeometry args={[1.2, 0.02, 0.68]} />
            <meshBasicMaterial color="#bfe4f2" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.44, 0.385]} material={p.bands.ice}>
            <planeGeometry args={[1.1, 0.3]} />
          </mesh>
        </group>

        {/* Paillasson d'entrée, en dedans du seuil. */}
        <mesh position={[doorX, 0.014, zf - 0.42]} rotation={[-Math.PI / 2, 0, 0]} material={m.rubber}>
          <planeGeometry args={[doorW + 0.2, 0.66]} />
        </mesh>

        {/* Bandeau d'enseigne. Sa face avance de quelques millimètres devant son
            cadre : posée sur son nu exact, elle partageait son tampon de
            profondeur et clignotait. */}
        <mesh position={[0, shell - SIGN_H / 2 - 0.06, zf - 0.1]} material={m.frame}>
          <boxGeometry args={[w - 0.14, SIGN_H + 0.08, 0.12]} />
        </mesh>
        <mesh position={[0, shell - SIGN_H / 2 - 0.06, zf - 0.034]} material={band}>
          <planeGeometry args={[w - 0.2, SIGN_H]} />
        </mesh>
      </group>
      {/* Le vendeur, derrière sa caisse, tourné vers le client. */}
      <ShopClerk x={clerk.x} z={clerk.z} yaw={0} seed={station * 5 + 1} />

      {/* La flaque de lumière que la boutique jette sur le sol du hall. Sous
          terre, elle ne varie pas : rien de ce qui l'entoure ne varie. */}
      <mesh
        position={[0, 0.03, zf + 1.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={p.glowSteady}
      >
        <planeGeometry args={[w + 2.4, 4.4]} />
      </mesh>
    </group>
  );
}

/**
 * Le comptoir de caisse : le seul meuble de la boutique qu'on regarde de face.
 *
 * Il ne se résume pas à une caisse. Ce qui fait reconnaître un comptoir de
 * konbini, c'est l'ENCOMBREMENT du plan de travail - le terminal, l'écran
 * tourné vers le client, le bac à friture chauffant, la machine à café, les
 * cartons de promotion collés sur la joue - et l'armoire à cigarettes derrière,
 * qu'on ne remarque jamais mais dont l'absence se voit.
 */
function Checkout({
  x0,
  x1,
  z0,
  depth,
  wallX,
  station,
  m,
}: {
  x0: number;
  x1: number;
  z0: number;
  depth: number;
  wallX: number;
  station: number;
  m: Mats;
}) {
  const p = shopPool();
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  const cz = z0 + depth / 2;
  const front = cz + depth / 2;
  return (
    <group name="konbini/caisse">
      <mesh position={[cx, COUNTER_H / 2, cz]} material={p.casework}>
        <boxGeometry args={[len, COUNTER_H, depth]} />
      </mesh>
      <mesh position={[cx, COUNTER_H + 0.02, cz]} material={p.lip}>
        <boxGeometry args={[len + 0.06, 0.04, depth + 0.06]} />
      </mesh>
      {/* Joue de comptoir habillée d'une promotion : c'est la surface qu'un
          client regarde pendant qu'il attend, et aucune enseigne ne la laisse
          nue. */}
      <mesh position={[cx, COUNTER_H * 0.55, front + 0.035]} material={pick(p.pops, station, 1)}>
        <planeGeometry args={[Math.min(len * 0.5, 0.9), 0.42]} />
      </mesh>

      {/* Terminal et écran client : l'écran regarde le CLIENT, pas le vendeur. */}
      <mesh position={[cx - len * 0.24, COUNTER_H + 0.14, cz]} material={m.frame}>
        <boxGeometry args={[0.34, 0.2, 0.36]} />
      </mesh>
      <mesh position={[cx - len * 0.24, COUNTER_H + 0.28, cz + 0.02]} material={m.frame}>
        <boxGeometry args={[0.24, 0.18, 0.03]} />
      </mesh>
      <mesh
        position={[cx - len * 0.24, COUNTER_H + 0.28, cz + 0.038]}
        material={p.screen}
      >
        <planeGeometry args={[0.21, 0.15]} />
      </mesh>

      {/* Bac à friture chauffant : la vitrine tiède du comptoir, et son plafond
          de lampes orange. */}
      <mesh position={[cx + len * 0.18, COUNTER_H + 0.19, cz]} material={p.casework}>
        <boxGeometry args={[0.46, 0.34, depth * 0.62]} />
      </mesh>
      <mesh position={[cx + len * 0.18, COUNTER_H + 0.19, cz + depth * 0.31 + 0.004]} material={m.glass}>
        <planeGeometry args={[0.42, 0.28]} />
      </mesh>
      <mesh position={[cx + len * 0.18, COUNTER_H + 0.34, cz]}>
        <boxGeometry args={[0.4, 0.03, depth * 0.5]} />
        <meshBasicMaterial color="#f2a13a" toneMapped={false} />
      </mesh>

      {/* Machine à café, au bout du comptoir. */}
      <mesh position={[cx + len * 0.38, COUNTER_H + 0.24, cz - 0.04]} material={p.casework}>
        <boxGeometry args={[0.3, 0.44, depth * 0.55]} />
      </mesh>
      <mesh position={[cx + len * 0.38, COUNTER_H + 0.3, cz + depth * 0.28]} material={m.frame}>
        <boxGeometry args={[0.22, 0.2, 0.06]} />
      </mesh>

      {/* L'armoire à cigarettes, au mur derrière la caisse : dos au client,
          au-dessus de la tête du vendeur, comme partout. */}
      <mesh position={[wallX + 0.03, 1.68, cz - 0.1]} rotation={[0, Math.PI / 2, 0]} material={p.tobacco}>
        <planeGeometry args={[Math.min(1.5, depth + 0.9), 0.86]} />
      </mesh>
      <mesh position={[wallX + 0.015, 1.68, cz - 0.1]} material={m.frame}>
        <boxGeometry args={[0.03, 0.94, Math.min(1.58, depth + 0.98)]} />
      </mesh>
    </group>
  );
}

/**
 * Rayon du détecteur, et le jeu qui l'empêche de battre.
 *
 * Une porte automatique n'a pas UN seuil mais deux : elle s'ouvre plus près
 * qu'elle ne se referme. Sans cette hystérésis, quelqu'un qui s'arrête pile à
 * la limite fait battre les vantaux jusqu'à ce qu'il s'en aille - c'est le
 * défaut le plus reconnaissable d'une porte mal réglée, et le plus agaçant.
 */
const DOOR_OPEN_R = 1.9;
const DOOR_SHUT_R = 2.5;
/** Temps d'ouverture d'une porte de commerce : à peu près une seconde. */
const DOOR_SPEED = 3.4;

/**
 * La porte automatique : deux vantaux vitrés qui s'écartent quand on approche.
 *
 * ELLE S'OUVRE PARCE QU'ON VIENT, et c'est tout ce qui la définit. Le rail, le
 * détecteur et le bandeau 自動ドア disaient qu'elle était automatique ; ils ne
 * le prouvaient pas, et une porte de konbini qui reste close pendant qu'on la
 * traverse est pire qu'une porte peinte.
 *
 * LE DÉTECTEUR TRAVAILLE EN REPÈRE DE QUAI, et pas dans celui de la boutique :
 * c'est le seul repère où la position du joueur se lise sans reconstruire la
 * chaîne de transformations qui mène jusqu'ici (`runtime.playerPlatX/Z`, posés
 * par `systems/playerFrame`). L'axe de la baie y est donc rabattu une fois, à
 * la construction, exactement comme `data/stationInterior` rabat les emprises.
 *
 * `level` compte autant que la distance : à l'aplomb de la boutique, il y a
 * aussi la dalle du quai deux étages plus haut, et rien dans les coordonnées ne
 * dit sur laquelle des deux on marche. Une porte qui s'ouvre parce que
 * quelqu'un passe SUR le quai n'aurait aucun sens.
 */
function SlidingDoors({
  x,
  width,
  height,
  z,
  sensor,
  m,
}: {
  x: number;
  width: number;
  height: number;
  z: number;
  /** Axe de la baie, en repère QUAI. Null : la boutique n'est pas située. */
  sensor: { x: number; z: number } | null;
  m: Mats;
}) {
  const p = shopPool();
  const leaf = width / 2;
  const leaves = useRef<(THREE.Group | null)[]>([null, null]);
  const open = useRef(0);
  const wanted = useRef(false);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (sensor) {
      const dx = runtime.playerPlatX - sensor.x;
      const dz = runtime.playerPlatZ - sensor.z;
      const r = Math.hypot(dx, dz);
      const near = runtime.playerLevel === 'concourse';
      wanted.current = near && (wanted.current ? r < DOOR_SHUT_R : r < DOOR_OPEN_R);
    }
    const target = wanted.current ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, dt * DOOR_SPEED);
    // Le vantail s'efface DERRIÈRE le panneau fixe voisin : il ne disparaît pas
    // dans le mur, il glisse le long de la vitrine, et l'on voit son montant de
    // rive passer derrière le verre.
    for (const [i, g] of leaves.current.entries()) {
      if (g) g.position.x = ((i === 0 ? -1 : 1) * leaf) / 2 - (i === 0 ? 1 : -1) * open.current * leaf * 0.94;
    }
  });

  return (
    <group name="konbini/porte" position={[x, 0, z]}>
      {/* Rail d'entraînement et son capot. Il tient SOUS le nu haut de la
          devanture, et non par-dessus : posé au linteau, il montait dans le
          caisson d'enseigne et le traversait de dix centimètres. Les vantaux
          disparaissent dans son capot, comme il se doit. */}
      <mesh position={[0, height - 0.08, -0.06]} material={m.metal}>
        <boxGeometry args={[width + 0.3, 0.14, 0.16]} />
      </mesh>
      {/* Le détecteur, en saillie sous le capot : le petit boîtier noir qu'on
          cherche des yeux quand la porte ne s'ouvre pas. */}
      <mesh position={[0, height - 0.2, 0.02]} material={m.frame}>
        <boxGeometry args={[0.16, 0.07, 0.06]} />
      </mesh>
      {/* Montants dormants de la baie. */}
      {[-1, 1].map((s) => (
        <mesh key={`jambage${s}`} position={[(s * width) / 2, height / 2, -0.03]} material={m.metal}>
          <boxGeometry args={[0.07, height, 0.09]} />
        </mesh>
      ))}
      {[-1, 1].map((s, i) => (
        <group
          key={`vantail${s}`}
          name="konbini/porte/vantail"
          ref={(g) => {
            leaves.current[i] = g;
          }}
          position={[(s * leaf) / 2, 0, -0.06]}
        >
          <mesh position={[0, height / 2, 0]} material={m.glass}>
            <planeGeometry args={[leaf - 0.03, height - 0.1]} />
          </mesh>
          {/* Traverse basse et montant de rive : un vantail vitré n'est jamais
              une plaque de verre nue, il a un cadre, et c'est le cadre qui le
              rend visible quand il est fermé. */}
          <mesh position={[0, 0.08, 0.006]} material={m.metal}>
            <boxGeometry args={[leaf - 0.03, 0.16, 0.05]} />
          </mesh>
          <mesh position={[(-s * (leaf - 0.03)) / 2, height / 2, 0.006]} material={m.metal}>
            <boxGeometry args={[0.05, height - 0.1, 0.05]} />
          </mesh>
          <mesh position={[0, 1.42, 0.012]} material={p.autoDoor}>
            <planeGeometry args={[leaf - 0.1, (leaf - 0.1) / 4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
