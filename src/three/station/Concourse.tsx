// Le niveau de correspondance : ce qu'on voit une fois descendu.
//
// Le couloir de la trémie principale ne bute plus sur un mur : il débouche
// ici. Tout ce qui est dessiné l'est aux cotes que `data/stationInterior` a
// posées et que `systems/walkable` fait respecter - une borne de portillon
// dessinée trente centimètres à côté de celle qu'on contourne se verrait au
// premier pas.
//
// CE QUI FAIT UNE GARE ET PAS UN TUNNEL. Un hall de gare japonais se lit à
// quatre choses, et ce sont celles-là qu'on pose :
//
//   • le soubassement de faïence, qui casse le tout-gris à hauteur de main ;
//   • la ligne de portillons, ses bornes basses, ses feux et son 改札 au-dessus ;
//   • le fléchage - vert pour la sortie, jaune pour les quais - suspendu au
//     plafond, à hauteur de lecture et pas plus haut ;
//   • et la lumière : des réglettes continues, très blanches, qui rendent le
//     sol brillant. Un hall souterrain sans plafonniers est une cave.
//
// LE BUDGET. Tout est en boîtes et en plans, sans texture propre : les
// matériaux viennent de la palette de la gare (three/station/materials), les
// affiches du pool publicitaire déjà chargé. Le niveau entier tombe au palier
// de qualité 2, comme le reste du fond de champ - il n'est visible que si l'on
// y est, et si l'on y est, on ne voit plus le quai.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import {
  EXIT_MOUTH_FIRST,
  EXIT_MOUTH_GOING,
  EXIT_MOUTH_RISE,
  EXIT_MOUTH_STEPS,
  EXIT_MOUTH_Z0,
  HALL_WALL_T,
  type StationInterior,
} from '../../data/stationInterior';
import type { ConcourseNetwork, ConcourseShell } from '../../data/stationConcourseBuild';
import { Frontages } from './interiors/Frontages';
import { Limits } from './interiors/Limits';
import { hallStyle } from './interiors/hallStyle';
import { STAIR_LOWER_HALF_X } from '../../data/stationGeometry';
import { makeExitSign, makeGateSign } from '../../textures/procedural';
import {
  guidePosts,
  mouthExit,
  signageFor,
  type StationSignage,
} from '../../data/stationSignage';
import { makeConcourseGuideTexture, type GuideKind } from '../../textures/concourse';
import { CEILING_MODULE, DADO_MODULE, HALL_MODULE } from '../../textures/stationWall';
import { usePanelBox, useWallBox } from './wallBox';
import type { Mats } from './materials';
import { Barrier } from './Barrier';
import { FareGates } from './FareGates';
import { Fixtures } from './Fixtures';

/** Hauteur du panneau 改札 suspendu au-dessus de la ligne. */
const GATE_SIGN_Y = 2.32;
const GATE_SIGN_H = 0.44;
/** Hauteur libre d'une bouche de sortie : au-dessus, c'est le linteau. */
const EXIT_OPENING_H = 2.15;
/**
 * Épaisseur des parois du hall.
 *
 * Elle vient des données depuis que les voyageurs S'EN VONT par les bouches de
 * sortie : la volée qu'on empile ici est celle qu'ils montent, et son premier
 * nez se mesure depuis le nu du fond (`data/stationInterior`).
 */
const WALL_T = HALL_WALL_T;

/**
 * Le hall d'une gare, du débouché du couloir aux bouches de sortie.
 *
 * `it.built` est vérifié par l'appelant : une gare dont le hall est au-dessus
 * du quai le déclare sans le construire, faute de volée montante pour y aller.
 */
export function Concourse({
  shell,
  net,
  it,
  m,
  station,
  detail,
}: {
  /** Le volume à envelopper : une ou plusieurs pièces du réseau. */
  shell: ConcourseShell;
  /** Le réseau entier : les LIMITES y vivent (correspondances, chantiers). */
  net: ConcourseNetwork;
  /**
   * L'intérieur générique de la gare, pour son MOBILIER et rien d'autre.
   *
   * Le meuble n'est pas encore du réseau - il y viendra en phase 19 - et le
   * fléchage suspendu doit savoir ce qu'il enjambe. Toute la GÉOMÉTRIE, elle,
   * vient de `shell`.
   */
  it: StationInterior;
  m: Mats;
  station: number;
  /** Palier de qualité : 0 = tout, 3 = le strict nécessaire. */
  detail: number;
}) {
  const gate = shell.gates[0];
  // CE QUI FAIT CE HALL-LÀ : sa couverture, et rien d'autre. Le style vient de
  // l'archétype du volume (`three/station/interiors/hallStyle`) ; `linear`
  // reproduit exactement le hall d'avant, et c'est par lui que passent les
  // trente gares tant qu'aucune n'est branchée sur son relevé.
  const style = hallStyle(shell.kind);
  const width = shell.rect.x1 - shell.rect.x0;
  const z0 = shell.rect.z0;
  const z1 = shell.rect.z1;
  const length = z1 - z0;
  const midX = (shell.rect.x0 + shell.rect.x1) / 2;
  const midZ = (z0 + z1) / 2;
  const height = shell.ceilY - shell.floorY;
  const midY = (shell.ceilY + shell.floorY) / 2;

  // Le bandeau 改札 au-dessus de la ligne : il porte le nom réel de la sortie,
  // et c'est la seule chose du niveau qui change d'une gare à l'autre.
  // TOUT CE QUE CE VOLUME ÉCRIT vient d'ici, et de nulle part ailleurs : le
  // bandeau du contrôle, le nom de chaque bouche, le fléchage suspendu. Cinq
  // endroits allaient chercher leur donnée chacun de son côté, et se
  // contredisaient dès qu'une gare avait plus de deux sorties (phase 18).
  const sign = useMemo(() => signageFor(net, station), [net, station]);
  const gateSign = useMemo(() => makeGateSign(), []);
  const signMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: gateSign.texture, toneMapped: false }),
    [gateSign],
  );
  useEffect(() => {
    const g = sign.gates.find((x) => x.id === gate?.id);
    // Le bandeau porte ce qui CHANGE CE QU'ON PEUT FAIRE au contrôle : carte
    // sans contact seule, sortie seule, horaires. Le hall générique n'en a
    // aucun, et le bandeau reste celui d'avant.
    gateSign.redraw(g?.jp ?? gate.nameJp, g?.en ?? gate.nameEn, g?.notes ?? []);
  }, [gateSign, sign, gate]);
  useEffect(
    () => () => {
      signMat.dispose();
      gateSign.texture.dispose();
    },
    [signMat, gateSign],
  );

  const lamps = useMemo(() => {
    const out: number[] = [];
    for (let z = z0 + style.lampPitch / 2; z < z1; z += style.lampPitch) out.push(z);
    return out;
  }, [z0, z1, style.lampPitch]);

  /**
   * Les poutres du tablier, quand le hall est sous un viaduc.
   *
   * Elles ne sont pas décoratives : ce sont elles qui disent qu'on n'a pas une
   * dalle au-dessus de la tête mais l'ouvrage qui porte les trains. Elles
   * SAUTENT la travée des portillons, dont les joues montent déjà au plafond
   * d'une paroi à l'autre — une poutre qui y tomberait ressortirait au travers
   * d'une borne, comme les pilastres du hall l'ont appris avant elle.
   */
  const beams = useMemo(() => {
    if (style.beamPitch === null) return [];
    const out: number[] = [];
    for (let z = z0 + style.beamPitch / 2; z < z1; z += style.beamPitch) {
      if (z > gate.rect.z0 - 0.6 && z < gate.rect.z1 + 0.6) continue;
      out.push(z);
    }
    return out;
  }, [z0, z1, style.beamPitch, gate]);

  // Sol, plafond et parois s'arrêtent au NU du couloir : le hall commence là où
  // la trémie finit, et rien ne doit repartir en arrière sous ses marches.
  const shellZ = midZ + WALL_T / 2;
  const shellLen = length + WALL_T;

  // Parois, soubassement et plafond aux UV de l'ÉCHELLE RÉELLE. Une paroi de
  // hall fait trente mètres de long : la même image tendue d'un bout à l'autre
  // rendait ses défauts (textures/stationWall) illisibles - une seule coulure
  // large de deux mètres, un seul carreau de faïence par paroi. Voir
  // three/station/wallBox pour pourquoi ce n'est pas `repeat` qui s'en charge.
  const sideGeo = useWallBox(WALL_T, height, shellLen, HALL_MODULE);
  const dadoGeo = useWallBox(0.05, style.dadoH, shellLen, DADO_MODULE);
  const ceilGeo = usePanelBox(width + 2 * WALL_T, 0.12, shellLen, CEILING_MODULE);

  return (
    <group name="gare/hall">
      {/* Sol, plafond, et les deux parois longues. Le volume est clos : sans
          cela, on verrait le ballast par-dessous la dalle du quai. */}
      <mesh position={[midX, shell.floorY - 0.06, shellZ]} material={m.slab}>
        <boxGeometry args={[width + 2 * WALL_T, 0.12, shellLen]} />
      </mesh>
      {/* Le plafond — sauf sur une MEZZANINE, qui est un demi-niveau ouvert sur
          celui d'en dessous : c'est par là qu'on voit le hall avant d'y
          descendre, et le couvrir reviendrait à en faire une pièce. */}
      {style.ceiling && (
        <mesh
          position={[midX, shell.ceilY - 0.06, shellZ]}
          geometry={ceilGeo}
          material={m.hallCeil}
        />
      )}
      {[-1, 1].map((d) => (
        <group key={`side${d}`}>
          {/* LA PAROI, OU L'APPUI. Un pont-concourse enjambe le faisceau et
              c'est tout son sujet : « on voit les voies dessous ». L'enfermer
              entre deux parois pleines lui retirerait exactement ce pour quoi
              il existe. Une mezzanine, de même, s'ouvre sur le niveau du
              dessous. Les deux s'arrêtent donc à hauteur d'appui. */}
          {style.parapet ? (
            <mesh
              position={[
                midX + (d * (width + WALL_T)) / 2,
                shell.floorY + style.parapetH / 2,
                shellZ,
              ]}
              material={m.hall}
            >
              <boxGeometry args={[WALL_T, style.parapetH, shellLen]} />
            </mesh>
          ) : (
            <mesh
              position={[midX + (d * (width + WALL_T)) / 2, midY, shellZ]}
              geometry={sideGeo}
              material={m.hall}
            />
          )}
          {/* Main courante : ce qu'on a sous la main quand la paroi s'arrête. */}
          {style.parapet && (
            <mesh
              position={[
                midX + (d * (width + WALL_T)) / 2,
                shell.floorY + style.parapetH + 0.03,
                shellZ,
              ]}
              material={m.metal}
            >
              <boxGeometry args={[WALL_T + 0.06, 0.06, shellLen]} />
            </mesh>
          )}
          {/* Soubassement de faïence : à hauteur de main, c'est lui qu'on voit.
              Il n'a pas de sens sur un appui, qui EST déjà à cette hauteur. */}
          {!style.parapet && (
            <mesh
              position={[midX + (d * (width - 0.04)) / 2, shell.floorY + style.dadoH / 2, shellZ]}
              geometry={dadoGeo}
              material={m.tile}
            />
          )}
          {/* Plinthe : la ligne d'ombre au pied de la paroi, et la seule chose
              qui distingue un couloir fini d'une boîte enduite jusqu'au sol.
              Elle court d'un seul tenant - un couloir n'a pas de plinthe par
              tronçons - et sort MOINS que le soubassement au-dessus d'elle :
              tout ce qui saille davantage finit dans la vitrine d'un commerce
              ou dans une borne de portillon, à une gare ou à une autre. Rien
              au-dessus du soubassement pour la même raison : la hauteur
              d'épaule d'un hall appartient au mobilier (three/station/Fixtures)
              et à la signalétique, pas à la paroi. */}
          <mesh
            position={[midX + (d * (width - 0.02)) / 2, shell.floorY + 0.07, shellZ]}
            material={m.wallDark}
          >
            <boxGeometry args={[0.04, 0.14, shellLen]} />
          </mesh>
        </group>
      ))}

      {/* Le hall est plus large que le couloir qui arrive de la trémie. Fermer
          les deux retours au droit de l'entrée empêche de voir les voies et le
          décor extérieur par les bandes laissées de part et d'autre. */}
      {[-1, 1].map((d) => {
        const inner = midX + d * STAIR_LOWER_HALF_X;
        const outer = d < 0 ? shell.rect.x0 : shell.rect.x1;
        const panelWidth = Math.abs(outer - inner);
        return (
          <mesh
            key={`entrance${d}`}
            position={[(outer + inner) / 2, midY, z0 + WALL_T / 2]}
            material={m.hall}
          >
            <boxGeometry args={[panelWidth, height, WALL_T]} />
          </mesh>
        );
      })}

      {/* Fond du hall, percé des bouches de sortie. Elles ne se franchissent pas
          encore - la volée qui monte à la rue reste à dessiner - mais le jour
          qui en tombe dit d'où il vient, et le fléchage dit où elles mènent. */}
      <ExitWall shell={shell} m={m} sign={sign} height={height} midY={midY} />

      {/* La ligne de portillons : bornes, battants, lecteurs et feux. Elle
          n'est plus une rangée de boîtes - elle s'ouvre, elle se ferme, et
          `systems/fareGate` la pilote. */}
      <FareGates net={net} m={m} height={height} midY={midY} />

      {/* Le bandeau 改札, suspendu au-dessus de la ligne, face à qui arrive. */}
      <mesh position={[midX, GATE_SIGN_Y + shell.floorY, gate.rect.z0 - 0.12]} material={m.frame}>
        <boxGeometry args={[Math.min(width - 0.4, 3.6) + 0.08, GATE_SIGN_H + 0.08, 0.09]} />
      </mesh>
      <mesh
        position={[midX, GATE_SIGN_Y + shell.floorY, gate.rect.z0 - 0.168]}
        rotation={[0, Math.PI, 0]}
        material={signMat}
      >
        <planeGeometry args={[Math.min(width - 0.4, 3.6), GATE_SIGN_H]} />
      </mesh>

      {/* Les poutres du tablier : un dessous de viaduc n'a pas de plafond, il a
          l'ouvrage qui porte les trains. */}
      {beams.map((z, k) => (
        <mesh
          key={`beam${k}`}
          position={[midX, shell.ceilY - 0.12 - style.beamDrop / 2, z]}
          material={m.wallDark}
        >
          <boxGeometry args={[width + 2 * WALL_T, style.beamDrop, 0.36]} />
        </mesh>
      ))}

      {/* Réglettes de plafond : la lumière du lieu. Continues et très blanches,
          comme dans tout souterrain de gare - c'est ce qui fait briller le sol. */}
      {lamps.map((z, k) => (
        <mesh key={`lamp${k}`} position={[midX, shell.ceilY - 0.14, z]} material={m.lamp}>
          <boxGeometry args={[Math.min(width - 1.2, 2.6), 0.08, 0.34]} />
        </mesh>
      ))}

      {/* Le fléchage suspendu : trois couleurs, et jamais autre chose. */}
      <Guides shell={shell} net={net} m={m} />

      {/* Le mobilier : billetterie, konbini, consignes, distributeurs, tampon.
          L'implantation vient de data/stationInterior - la même liste que la
          marche contourne. */}
      {detail <= 1 && <Fixtures it={it} net={net} m={m} station={station} />}

      {/* Ligne de guidage podotactile, dans l'axe, du couloir aux portillons
          puis des portillons aux sorties : elle traverse par un passage, jamais
          par une borne. */}
      {detail <= 1 && <Guideline shell={shell} m={m} />}

      {/* CE QUI FERME LE MONDE JOUABLE : les correspondances qu'on voit sans
          les prendre, et les palissades de chantier. Rien sur les trente gares
          tant qu'aucune n'est branchée — le hall générique n'en connaît pas. */}
      <Limits shell={shell} net={net} m={m} />

      {/* Les devantures RELEVÉES : ce que le hall vend, et ce qu'on a le droit
          d'en dire. Le mobilier générique porte ses commerces déduits ; celles-ci
          portent ce qui a été lu sur un plan, et se taisent quand rien ne l'a
          été (`interiors/Frontages`). */}
      <Frontages shell={shell} net={net} m={m} />

    </group>
  );
}

/**
 * Le fond du hall, et les bouches de sortie qui le percent.
 *
 * Une bouche n'est pas encore un passage : la volée qui monte à la rue reste à
 * dessiner. Mais ce n'est pas non plus un mur peint - c'est un percement, avec
 * du jour au fond, et c'est cette lueur qui dit qu'il y a une ville au-dessus.
 * Ce que la marche refuse, la limite de zone le DIT : la même maille rouge que
 * dans les baies de porte palière par lesquelles on ne peut pas monter.
 */
function ExitWall({
  shell,
  m,
  sign,
  height,
  midY,
}: {
  shell: ConcourseShell;
  m: Mats;
  /** La signalétique de la gare : source unique des noms (phase 18). */
  sign: StationSignage;
  height: number;
  midY: number;
}) {
  const mouths = shell.mouths;
  // Le mur se coupe DANS L'ORDRE DE LA PAROI, et les panneaux avec lui : les
  // textures étaient construites dans l'ordre du réseau et posées dans l'ordre
  // des percements, ce qui suffit à intervertir deux noms dès qu'une gare perce
  // ses bouches dans un autre ordre que celui de son relevé.
  const cuts = useMemo(() => [...mouths].sort((a, b) => a.at - b.at), [mouths]);
  // Le panneau jaune de chaque bouche : le MÊME que celui des potences du quai,
  // parce qu'il vient de la MÊME SOURCE (`data/stationSignage`). Une gare ne
  // fléche pas 八重洲中央口 en haut des marches et autre chose en bas.
  const signs = useMemo(() => cuts.map((e) => makeExitSign(e.slot)), [cuts]);
  const signMats = useMemo(
    () => signs.map((s) => new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false })),
    [signs],
  );
  useEffect(() => {
    signs.forEach((s, k) => s.redraw(mouthExit(sign, cuts[k].id)));
  }, [signs, cuts, sign]);
  useEffect(
    () => () => {
      for (const mm of signMats) mm.dispose();
      for (const s of signs) s.texture.dispose();
    },
    [signMats, signs],
  );
  const z = shell.rect.z1 + WALL_T / 2;
  // Le mur se coupe en panneaux entre les bouches, plutôt que percé : deux
  // boîtes valent mieux qu'une géométrie extrudée pour trois trous.
  //
  // `at` est l'abscisse de la bouche LE LONG DE SA PAROI. Tant que la paroi est
  // celle du fond - c'est le cas des trente gares tant qu'aucune n'est branchée
  // sur son relevé - c'est exactement l'ancien `x`.
  const panels: { x0: number; x1: number }[] = [];
  let x = shell.rect.x0;
  for (const exit of cuts) {
    if (exit.at - exit.halfWidth > x) panels.push({ x0: x, x1: exit.at - exit.halfWidth });
    x = exit.at + exit.halfWidth;
  }
  if (x < shell.rect.x1) panels.push({ x0: x, x1: shell.rect.x1 });

  return (
    <group>
      {panels.map((p, k) => (
        <mesh key={`panel${k}`} position={[(p.x0 + p.x1) / 2, midY, z]} material={m.hall}>
          <boxGeometry args={[p.x1 - p.x0, height, WALL_T]} />
        </mesh>
      ))}
      {cuts.map((exit, k) => (
        <group key={`exit${k}`}>
          {/* Linteau : le percement ne monte pas au plafond. Un par bouche, à
              l'exacte largeur de la sienne - une bande courant tout du long
              recouvrait les panneaux pleins dans leur propre plan, et les deux
              faces se disputaient le tampon de profondeur. */}
          <mesh
            position={[
              exit.at,
              shell.floorY + (EXIT_OPENING_H + height) / 2,
              z,
            ]}
            material={m.hall}
          >
            <boxGeometry args={[exit.halfWidth * 2, height - EXIT_OPENING_H, WALL_T]} />
          </mesh>
          {/* Ce qu'on voit au fond n'est pas un aplat lumineux : c'est une
              VOLÉE, six marches montantes prises à contre-jour, et le jour
              derrière elles. C'est la différence entre une sortie et un néon -
              on lit d'un coup d'œil que ça monte, et vers où. */}
          {Array.from({ length: EXIT_MOUTH_STEPS }, (_, s) => {
            // Le dessus de la marche : c'est LUI la cote partagée, puisque
            // c'est dessus qu'on met le pied. La boîte se déduit - elle
            // descend jusqu'au sol du hall, comme une marche maçonnée.
            const top = EXIT_MOUTH_FIRST + s * EXIT_MOUTH_RISE;
            return (
              <mesh
                key={`step${s}`}
                position={[
                  exit.at,
                  shell.floorY + top / 2,
                  z - WALL_T / 2 + EXIT_MOUTH_Z0 + EXIT_MOUTH_GOING * (s + 0.5),
                ]}
                material={m.stair}
              >
                <boxGeometry args={[exit.halfWidth * 2 - 0.12, top, EXIT_MOUTH_GOING]} />
              </mesh>
            );
          })}
          {/* La cage se ferme derrière : sans elle, le percement donnait sur le
              vide et l'on voyait le décor du quai par-dessous la dalle. */}
          {[-1, 1].map((d) => (
            <mesh
              key={`cheek${d}`}
              position={[
                exit.at + d * (exit.halfWidth + 0.06),
                shell.floorY + 1.3,
                z + WALL_T / 2 + 1.3,
              ]}
              material={m.hall}
            >
              <boxGeometry args={[0.12, 2.6, 2.6]} />
            </mesh>
          ))}
          <mesh
            position={[exit.at, shell.floorY + 1.3, z + WALL_T / 2 + 2.55]}
            material={m.hall}
          >
            <boxGeometry args={[exit.halfWidth * 2 + 0.24, 2.6, 0.12]} />
          </mesh>
          <mesh
            position={[exit.at, shell.floorY + 2.62, z + WALL_T / 2 + 1.3]}
            material={m.hallCeil}
          >
            <boxGeometry args={[exit.halfWidth * 2 + 0.24, 0.12, 2.7]} />
          </mesh>
          {/* Le jour qui tombe de la rue, une volée plus haut : il éclaire le
              haut des marches et rien d'autre. */}
          <mesh
            position={[exit.at, shell.floorY + 2.42, z + WALL_T / 2 + 2.44]}
            material={m.lamp}
          >
            <boxGeometry args={[exit.halfWidth * 2 - 0.16, 0.5, 0.06]} />
          </mesh>
          {/* Panneau de sortie, au-dessus du percement. */}
          <mesh
            position={[exit.at, shell.floorY + 2.52, z - WALL_T / 2 - 0.03]}
            material={m.frame}
          >
            <boxGeometry args={[exit.halfWidth * 2 + 0.06, 0.42, 0.07]} />
          </mesh>
          <mesh
            position={[exit.at, shell.floorY + 2.52, z - WALL_T / 2 - 0.071]}
            rotation={[0, Math.PI, 0]}
            material={signMats[k]}
          >
            <planeGeometry args={[exit.halfWidth * 2, 0.36]} />
          </mesh>
          {/* La volée qui monte à la rue se VOIT mais ne se monte pas encore :
              `systems/walkable` arrête la marche au nu du fond, et rien ne le
              disait - on butait dans un mur invisible en plein milieu d'un
              percement grand ouvert. La limite de zone se dresse donc dans la
              bouche, exactement comme dans une baie de porte palière par
              laquelle on ne peut pas monter : maille rouge, halo au point de
              contact, invisible tant qu'on n'y va pas. */}
          <Barrier
            x={exit.at}
            y={shell.floorY + EXIT_OPENING_H / 2}
            z={z - WALL_T / 2}
            width={exit.halfWidth * 2}
            height={EXIT_OPENING_H}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * La ligne de guidage podotactile : elle traverse le hall dans l'axe et se
 * coupe à la ligne de portillons, où elle se recale sur un PASSAGE. Une bande
 * qui filerait droit dans une borne serait un contresens - c'est précisément la
 * ligne que suit qui ne voit pas.
 */
function Guideline({ shell, m }: { shell: ConcourseShell; m: Mats }) {
  const gate = shell.gates[0];
  const paid = shell.rooms.find((r) => r.fare === 'paid');
  const free = shell.rooms.find((r) => r.fare === 'free');
  if (!gate || !paid || !free) return null;
  // Le passage large : c'est celui vers lequel la bande mène, comme en vrai.
  const target = gate.passages[gate.passages.length - 1];
  const midX = (shell.rect.x0 + shell.rect.x1) / 2;
  const y = shell.floorY + 0.008;
  return (
    <group>
      <mesh position={[midX, y, (paid.rect.z0 + paid.rect.z1) / 2 - 1.2]} material={m.tactile}>
        <boxGeometry args={[0.3, 0.016, paid.rect.z1 - paid.rect.z0 - 2.4]} />
      </mesh>
      {/* Le raccord latéral vers l'axe du passage. */}
      <mesh
        position={[(midX + target.at) / 2, y, paid.rect.z1 - 0.9]}
        material={m.tactile}
      >
        <boxGeometry args={[Math.abs(target.at - midX) + 0.3, 0.016, 0.3]} />
      </mesh>
      <mesh position={[target.at, y, paid.rect.z1 - 0.45]} material={m.tactile}>
        <boxGeometry args={[0.3, 0.016, 0.9]} />
      </mesh>
      <mesh
        position={[target.at, y, (free.rect.z0 + free.rect.z1) / 2]}
        material={m.tactile}
      >
        <boxGeometry args={[0.3, 0.016, free.rect.z1 - free.rect.z0]} />
      </mesh>
    </group>
  );
}

/**
 * Le fléchage suspendu du hall.
 *
 * Trois couleurs, et jamais autre chose : le jaune mène dehors, le blanc mène
 * aux trains, le bleu mène aux installations. Un voyageur qui ne lit pas un mot
 * de japonais s'oriente sur la couleur seule, et c'est tout le service que rend
 * cette signalétique.
 *
 * Quatre panneaux, et leur POSITION est le message : celui qui accueille en bas
 * des marches dit la sortie, celui du milieu dit les installations, celui qui
 * suit les portillons dit les quais - à l'envers, pour qui arrive de la rue -
 * et le dernier redit la sortie, tout droit, au moment où l'on voit les bouches.
 * Un panneau de plus serait du bruit ; c'est déjà ce qu'on reproche aux gares
 * réelles.
 */
/**
 * La flèche de chaque annonce. Elle ne s'invente pas : les installations sont
 * SUR LE CÔTÉ, tout le reste est droit devant, et une flèche qui ment coûte
 * plus cher que pas de flèche du tout.
 */
const GUIDE_ARROW: Record<GuideKind, -1 | 0 | 1> = {
  exit: 0,
  platform: 0,
  gates: 0,
  facility: 1,
};

function Guides({ shell, net, m }: { shell: ConcourseShell; net: ConcourseNetwork; m: Mats }) {
  // OÙ LES PANNEAUX SE POSENT N'EST PLUS ÉCRIT ICI. Quatre cotes en dur sur
  // `paid.rect.z` et `free.rect.z` supposaient un hall qui se traverse selon z
  // et qui a exactement deux pièces : un pont-concourse, qu'on traverse selon
  // x, recevait son fléchage EN TRAVERS de sa propre circulation.
  // `data/stationSignage` le tire du volume ; le hall générique y retrouve ses
  // quatre panneaux aux mêmes cotes, et un test le tient sur les trente gares.
  const posts = useMemo(() => guidePosts(shell), [shell]);
  // Bas du panneau à 2,10 m : on passe dessous sans se baisser, et il reste
  // sous la dalle de plafond, qui est basse dans un souterrain.
  const y = shell.floorY + 2.32;

  /**
   * Le passage réellement libre à une abscisse donnée.
   *
   * Un panneau se suspend AU-DESSUS DE LA CIRCULATION, et la circulation n'est
   * pas le milieu du hall : elle est ce qui reste entre les meubles. Un konbini
   * fait 3,20 m de fond et monte jusqu'au plafond - centré bêtement, le panneau
   * lui rentrait dedans. On lit donc l'implantation, la même que la marche
   * contourne.
   *
   * Le mobilier ne se range que le long d'un hall qui va selon z (`facing` est
   * une orientation en x) : un volume traversé selon x prend donc sa largeur
   * pleine, ce qui est juste tant qu'aucun meuble ne s'y pose.
   */
  const aisleAt = (along: 'x' | 'z', at: number) => {
    if (along === 'x') {
      return { mid: (shell.rect.z0 + shell.rect.z1) / 2, width: shell.rect.z1 - shell.rect.z0 };
    }
    let x0 = shell.rect.x0;
    let x1 = shell.rect.x1;
    for (const f of net.fixtures) {
      if (f.rect.z1 < at - 0.7 || f.rect.z0 > at + 0.7) continue;
      if (f.facing === 1) x0 = Math.max(x0, f.rect.x1);
      else x1 = Math.min(x1, f.rect.x0);
    }
    return { mid: (x0 + x1) / 2, width: x1 - x0 };
  };

  // Un matériau par ANNONCE PRÉSENTE, et pas un de plus : une gare qui ne dit
  // pas « installations » n'a pas à en cuire la texture.
  const signs = useMemo(() => {
    const out = new Map<GuideKind, THREE.MeshBasicMaterial>();
    for (const p of posts) {
      if (out.has(p.kind)) continue;
      out.set(
        p.kind,
        new THREE.MeshBasicMaterial({
          map: makeConcourseGuideTexture(p.kind, GUIDE_ARROW[p.kind]),
          toneMapped: false,
        }),
      );
    }
    return out;
  }, [posts]);
  useEffect(
    () => () => {
      for (const mat of signs.values()) {
        mat.map?.dispose();
        mat.dispose();
      }
    },
    [signs],
  );

  return (
    <group name="gare/hall/fléchage">
      {posts.map((post, k) => {
        const face = signs.get(post.kind);
        const aisle = aisleAt(post.along, post.at);
        const w = Math.min(aisle.width - 0.5, 2.9);
        const h = w / 4;
        const along = post.along;
        const forward = post.forward;
        // Les tiges vont du DESSUS DU CAISSON, cadre compris, à la sous-face de
        // la dalle - ni plus, ni moins. Calculées à mi-hauteur du panneau, elles
        // s'arrêtaient un quart de caisson trop haut et repartaient d'autant à
        // travers le plafond : le panneau semblait flotter sous deux poteaux
        // qui ne le touchaient pas.
        const rodBottom = h / 2 + 0.04;
        const rodH = Math.max(0.06, shell.ceilY - 0.12 - y - rodBottom);
        return (
        <group
          key={`guide${k}`}
          position={
            along === 'z' ? [aisle.mid, y, post.at] : [post.at, y, aisle.mid]
          }
        >
          {/* Caisson : deux faces possibles, mais une seule imprimée - on ne
              lit un panneau que du côté où l'on vient. */}
          <mesh material={m.frame}>
            <boxGeometry
              args={
                along === 'z' ? [w + 0.08, h + 0.08, 0.09] : [0.09, h + 0.08, w + 0.08]
              }
            />
          </mesh>
          <mesh
            position={
              along === 'z'
                ? [0, 0, forward ? -0.048 : 0.048]
                : [forward ? -0.048 : 0.048, 0, 0]
            }
            rotation={[
              0,
              along === 'z'
                ? (forward ? Math.PI : 0)
                : (forward ? -Math.PI / 2 : Math.PI / 2),
              0,
            ]}
            material={face}
          >
            <planeGeometry args={[w, h]} />
          </mesh>
          {/* Tiges de suspension : du dessus du caisson jusqu'à la dalle. */}
          {[-1, 1].map((s) => (
            <mesh
              key={`rod${s}`}
              position={
                along === 'z'
                  ? [(s * w) / 2.6, rodBottom + rodH / 2, 0]
                  : [0, rodBottom + rodH / 2, (s * w) / 2.6]
              }
              material={m.metal}
            >
              <boxGeometry args={[0.04, rodH, 0.04]} />
            </mesh>
          ))}
        </group>
        );
      })}
    </group>
  );
}
