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

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { makeNewDaysBandTexture } from '../../textures/konbini';
import type { Mats } from './materials';
import { fillUnit, pick, shopPool } from './shopKit';
import { Goods } from './Goods';
import { ShopClerk } from './ShopStaff';

/** Épaisseur des parois de la coque. */
const WALL = 0.12;
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
/** Allée laissée devant les vitrines du fond. */
const BACK_AISLE = 0.68;

export function Konbini({
  w,
  d,
  height,
  station,
  m,
}: {
  w: number;
  d: number;
  height: number;
  station: number;
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
  // Tout se déduit de l'emprise reçue : la coque prend son épaisseur dessus, et
  // les meubles se rangent DANS ce qui reste. Rien n'est écrit en dur qui
  // dépende d'une largeur particulière - une boutique de 6,40 m et une de 8 m
  // se meublent de la même façon, avec moins de portes de vitrine.
  const shell = height - 0.14;
  const glassH = shell - SIGN_H - 0.1;
  /** Demi-largeur intérieure, nu des joues. */
  const hw = w / 2 - WALL;
  /** Nu intérieur du fond, et nu de la devanture. */
  const zb = -d / 2 + WALL;
  const zf = d / 2;

  /** Le bloc de gauche : caisse devant, meuble froid derrière, personnel entre. */
  const leftEnd = -hw + Math.min(2.2, w * 0.28);
  /** La baie d'entrée, à droite, avec un panneau fixe de chaque côté. */
  const doorW = Math.min(1.7, w * 0.22);
  const doorX = hw - doorW / 2 - Math.min(0.6, w * 0.08);
  const doorL = doorX - doorW / 2;

  const coolD = Math.min(0.68, d * 0.2);
  const gondD = Math.min(0.56, d * 0.17);
  const gondZ = zb + coolD + BACK_AISLE + gondD / 2;
  const gondX0 = leftEnd + 0.12;
  const gondX1 = doorL - 0.34;
  /**
   * Le présentoir à magazines : plaqué contre la vitre, jamais en retrait.
   *
   * Il ne prend qu'un TIERS de la devanture, et c'est la seule cote qui compte
   * ici. Sur toute la largeur - ce qu'il faisait d'abord - il masquait la
   * boutique entière depuis le hall : on ne voyait plus ni la gondole, ni le
   * mur de vitrines, ni la caisse, seulement trois étages de couvertures. Un
   * konbini de gare se donne à voir en entier par sa vitre ; le râtelier est
   * un objet DEVANT, pas un rideau.
   */
  const rackD = 0.3;
  const rackZ = zf - 0.08 - rackD / 2;
  const rackX0 = gondX0 + 0.2;
  const rackX1 = Math.min(gondX1 - 0.2, rackX0 + (gondX1 - gondX0) * 0.46);

  // Portes de vitrine réfrigérée : autant qu'il en tient, jamais moins de deux.
  const coolX0 = leftEnd + 0.1;
  const coolX1 = hw - 0.04;
  const doors = Math.max(2, Math.round((coolX1 - coolX0) / 1.05));
  const doorPitch = (coolX1 - coolX0) / doors;

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
              <mesh position={[0, -0.035, zb + coolD - 0.03]} material={p.rail}>
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
        <mesh
          position={[(-hw + leftEnd) / 2, CHILL_H + 0.14, zb + coolD * 1.22]}
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
        x0={-hw + 0.04}
        x1={leftEnd - 0.06}
        z0={zb + coolD + 0.92}
        depth={Math.min(0.72, d * 0.21)}
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

        <SlidingDoors x={doorX} width={doorW} height={glassH} z={zf} m={m} />

        {/* Pile de paniers, à l'entrée : on en prend un en passant, et c'est le
            premier objet de toute boutique japonaise. */}
        <group position={[Math.min(hw - 0.24, doorX + doorW / 2 + 0.3), 0, zf - 0.5]}>
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
        <group name="konbini/bac-glaces" position={[doorX - doorW * 0.42, 0, zf - 0.84]}>
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
      <ShopClerk
        x={(-hw + leftEnd) / 2 - 0.25}
        z={zb + coolD + 0.5}
        yaw={0}
        seed={station * 5 + 1}
      />

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
 * La porte automatique : deux vantaux vitrés qui se rejoignent au milieu.
 *
 * Ils sont dessinés FERMÉS, et c'est un choix. Une porte de konbini passe sa
 * journée fermée - elle ne s'ouvre que sur quelqu'un - et deux vantaux écartés
 * sans personne devant auraient fait un trou noir dans une devanture par
 * ailleurs pleine. Ce qui dit qu'elle s'ouvre, ce n'est pas son ouverture :
 * c'est le rail au-dessus, le détecteur, et le bandeau 自動ドア à hauteur d'œil
 * qu'aucune porte coulissante japonaise n'omet.
 */
function SlidingDoors({
  x,
  width,
  height,
  z,
  m,
}: {
  x: number;
  width: number;
  height: number;
  z: number;
  m: Mats;
}) {
  const p = shopPool();
  const leaf = width / 2;
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
      {[-1, 1].map((s) => (
        <group key={`vantail${s}`} position={[(s * leaf) / 2, 0, -0.06]}>
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
