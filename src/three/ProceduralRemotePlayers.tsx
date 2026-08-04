// Les autres voyageurs du salon, en rendu procédural.
//
// SOLUTION DE REPLI, exactement comme `ProceduralPassengers` et
// `ProceduralPlatformCrowd` : utilisée quand aucun pack de modèles n'est
// installé dans public/models. Dès qu'un pack est là, les joueurs distants sont
// des modèles GLB comme tout le monde (voir LibraryRemotePlayers) - avoir laissé
// ce rendu-ci être le cas NORMAL était un défaut, et il se voyait au premier
// coup d'œil : une silhouette de polygones bruts au milieu de trente
// personnages riggés.
//
// --- Pourquoi un pool à part ------------------------------------------------
//
// J'avais d'abord prévu de réserver des places dans les pools de PNJ existants,
// sur le modèle de `staff: boolean` qui réserve depuis toujours une place à
// l'agent de quai. Ça ne coûte aucun code de rendu, et c'est tentant.
//
// C'est pourtant le mauvais choix : ça fait entrer des entrées pilotées par le
// RÉSEAU dans deux machines à états de mille quatre cents et deux mille lignes,
// qui réservent des sièges, apparient des conversations, résolvent des
// collisions et distribuent des poignées de tsurikawa. Le rapport entre le
// risque et l'économie est mauvais. Un pool de huit, isolé, ne peut rien casser.
//
// Ce qu'on ne duplique pas, en revanche, c'est le CORPS : `buildPerson` a été
// sorti de la foule du quai vers `characters/proceduralBody` et sert aux deux.
// Écrire un troisième constructeur de silhouette après celui du wagon et celui
// du quai aurait été la vraie faute.
//
// --- Ce que ce composant ne calcule pas -------------------------------------
//
// Rien. Il LIT. La position d'un pair est calculée par `systems/net/pose`
// (conversion de repère, interpolation, fondu) et le composant se contente de
// poser des groupes. C'est la discipline de `paxList` : la logique dans les
// systèmes, le rendu dans three, et jamais l'inverse.

import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { productById } from '../data/products';
import { makeAppearance } from '../systems/appearance';
import { bubbleFor } from '../systems/net/chat';
import { peers } from '../systems/net/peers';
import { peerWorldPose } from '../systems/net/pose';
import { ROOM_CAPACITY } from '../systems/net/protocol';
import { buildPerson } from './characters/proceduralBody';
import { disposeOwned, markOwned } from './characters/library';

/**
 * Hauteur de l'œil au-dessus des pieds, dans le squelette local.
 *
 * Le réseau transmet la position de l'ŒIL - c'est ce que le joueur contrôle -
 * et le corps se pose dessous. La conversion demande la taille du personnage,
 * qui vient de son apparence : d'où le facteur d'échelle appliqué ici et non à
 * l'émission (l'émetteur ne connaît pas la taille que les autres lui donnent).
 */
const EYE_IN_SKELETON = CONFIG.eyeHeight;

/** Assis, l'œil descend à la hauteur d'assise. */
const SEATED_EYE = CONFIG.sitHeight;

/**
 * La boisson achetée, au bout du bras droit.
 *
 * Trois cylindres, pas davantage : ce rendu est le REPLI, celui qu'on voit
 * quand aucun pack de modèles n'est installé, et il n'a ni os ni main - le
 * téléphone du corps procédural est posé de la même façon, au jugé, sous le
 * groupe du bras (`characters/proceduralBody`). Ce qui compte à cette distance
 * est qu'il y ait quelque chose, et que ce quelque chose ait la couleur de
 * l'étiquette.
 */
const DRINK_BODY = new THREE.CylinderGeometry(0.032, 0.034, 0.1, 8);
const DRINK_NECK = new THREE.CylinderGeometry(0.016, 0.028, 0.03, 6);
const DRINK_CAP = new THREE.CylinderGeometry(0.017, 0.017, 0.016, 6);
const DRINK_CAP_MAT = new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.5 });

function buildDrink(tone: string): THREE.Group {
  const g = new THREE.Group();
  const mat = markOwned(new THREE.MeshStandardMaterial({ color: tone, roughness: 0.4 }));
  const body = new THREE.Mesh(DRINK_BODY, mat);
  body.position.y = 0.05;
  g.add(body);
  const neck = new THREE.Mesh(DRINK_NECK, mat);
  neck.position.y = 0.115;
  g.add(neck);
  const cap = new THREE.Mesh(DRINK_CAP, DRINK_CAP_MAT);
  cap.position.y = 0.138;
  g.add(cap);
  // Au creux de la main, le long de la cuisse : le bras procédural est un
  // cylindre de 50 cm dont l'origine est l'épaule.
  g.position.set(0.01, -0.29, 0.05);
  g.rotation.set(0.2, 0, 0.15);
  return g;
}

interface Vue {
  id: string;
  name: string;
  text: string | null;
}

interface Slot {
  group: THREE.Group;
  /** Identifiant du pair occupant cette place, ou `null`. */
  id: string | null;
  /** Graine d'apparence rendue : un changement force une reconstruction. */
  seed: number;
  /** Corps courant, détenu par cette place et libéré avec elle. */
  body: THREE.Group | null;
  /** Phase du balancement de marche, propre à chacun. */
  bob: number;
  /** La boisson tenue, et le produit qu'elle représente. */
  drink: THREE.Group | null;
  heldId: string;
}

export function ProceduralRemotePlayers() {
  const groupe = useRef<THREE.Group>(null);
  const [vues, setVues] = useState<Vue[]>([]);
  const places = useMemo<Slot[]>(
    () =>
      Array.from({ length: ROOM_CAPACITY }, () => ({
        group: new THREE.Group(),
        id: null,
        seed: -1,
        body: null,
        bob: 0,
        drink: null,
        heldId: '',
      })),
    [],
  );

  useFrame((_, rawDt) => {
    const racine = groupe.current;
    if (!racine) return;
    const dt = Math.min(rawDt, 0.05);
    const now = Date.now();

    // Les places se distribuent dans l'ordre stable du roster : sans quoi deux
    // pairs échangeraient leurs corps à chaque changement d'effectif, ce qui se
    // verrait comme deux personnes qui se transforment l'une en l'autre.
    const liste = [...peers.values()].sort((a, b) =>
      a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1),
    );
    const prochaines: Vue[] = places.map(() => ({ id: '', name: '', text: null }));

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const pair = liste[i];

      if (!pair) {
        place.group.visible = false;
        place.id = null;
        continue;
      }

      // Nouveau venu, ou apparence changée : on reconstruit. `disposeOwned`
      // libère les matériaux et géométries que le corps précédent possédait -
      // sans lui, chaque arrivée fuirait quelques mégaoctets de textures de
      // visage. C'est le même motif que la foule du quai.
      if (place.id !== pair.id || place.seed !== pair.avatar) {
        if (place.body) {
          place.group.remove(place.body);
          disposeOwned(place.body);
        }
        const corps = buildPerson(makeAppearance(pair.avatar), pair.avatar);
        place.group.add(corps);
        place.body = corps;
        place.id = pair.id;
        place.seed = pair.avatar;
        place.bob = (pair.avatar % 628) / 100;
        // La boisson appartient au corps : elle est libérée avec lui par le
        // `disposeOwned` ci-dessus, il n'y a rien de plus à ranger ici.
        place.drink = null;
        place.heldId = '';
        if (!racine.children.includes(place.group)) racine.add(place.group);
      }

      const pose = peerWorldPose(pair.id, now);
      if (!pose) {
        place.group.visible = false;
        continue;
      }

      const echelle = makeAppearance(pair.avatar).build.scale;
      // Des pieds, à partir d'un œil : c'est la seule conversion que le rendu
      // fait sur une pose reçue.
      const oeil = pose.seated ? SEATED_EYE : EYE_IN_SKELETON;
      place.group.visible = true;
      place.group.position.set(pose.x, pose.y - oeil, pose.z);
      place.group.rotation.y = pose.yaw;
      place.group.scale.setScalar(echelle);

      // Les bras AU REPOS, le long du corps.
      //
      // Sans cette ligne ils restaient dans la position où la géométrie les
      // construit - écartés, bras tendus - et l'avatar se tenait en croix au
      // milieu du wagon. La foule du quai pose la même valeur quand personne ne
      // fait de geste (`ProceduralPlatformCrowd`) ; l'oublier ici était d'autant
      // plus visible que les voisins, eux, se tenaient normalement.
      const brasD = place.body?.getObjectByName('crowd-arm-r');
      if (brasD) {
        brasD.rotation.x = 0;
        brasD.rotation.z = 0.12;
      }
      const brasG = place.body?.getObjectByName('crowd-arm-l');
      if (brasG) {
        brasG.rotation.x = 0;
        brasG.rotation.z = -0.12;
      }

      // Ce qu'il a acheté au distributeur, au bout du bras droit. Le corps est
      // reconstruit à chaque changement d'occupant, donc la boisson aussi : on
      // ne la bâtit qu'au premier produit vu, et on la retaille quand il change.
      if (pose.held !== place.heldId) {
        place.heldId = pose.held;
        if (place.drink) {
          place.drink.removeFromParent();
          disposeOwned(place.drink);
          place.drink = null;
        }
        const produit = pose.held ? productById(pose.held) : null;
        if (produit && brasD) {
          place.drink = buildDrink(produit.tone);
          brasD.add(place.drink);
        }
      }

      // Le balancement de marche : le seul mouvement qu'on invente, et il est
      // inventé plutôt que transmis parce qu'un booléen coûte un bit là où une
      // phase coûterait un octet à huit hertz, pour un résultat que personne ne
      // saurait distinguer.
      if (pose.moving && !pose.seated) {
        place.bob += dt * 7.5;
        place.group.position.y += Math.sin(place.bob * 2) * 0.016;
      }

      // Le fondu : un pair qui décroche s'estompe au lieu de rester planté là.
      // On l'applique sur l'échelle plutôt que sur l'opacité - rendre
      // transparents une trentaine de matériaux partagés par toutes les places
      // les rendrait transparents pour tout le monde.
      if (pose.fade < 1) place.group.scale.multiplyScalar(pose.fade);
      // Fondu éteint : le corps a disparu, et l'étiquette DOIT suivre. Elle est
      // rendue en HTML par-dessus la scène, donc rien ne la cache toute seule
      // quand le corps s'efface - on obtenait un prénom flottant au-dessus de
      // personne, ce qui est plus déroutant que l'absence qu'il comblait.
      // (Le cas « pas de pose du tout » est déjà traité plus haut par le
      // `continue`, qui laisse l'entrée vide d'origine.)
      if (pose.fade <= 0.02) {
        place.group.visible = false;
        continue;
      }

      prochaines[i] = { id: pair.id, name: pair.name, text: bubbleFor(pair.id, now) };
    }

    setVues((avant) => {
      for (let i = 0; i < prochaines.length; i++) {
        if (
          avant[i]?.id !== prochaines[i].id ||
          avant[i]?.name !== prochaines[i].name ||
          avant[i]?.text !== prochaines[i].text
        ) {
          return prochaines;
        }
      }
      return avant;
    });
  });

  return (
    <group ref={groupe}>
      {places.map((place, i) => (
        <primitive key={i} object={place.group}>
          {vues[i]?.id && (
            <Html
              center
              position={[0, CONFIG.eyeHeight + 0.34, 0]}
              zIndexRange={[14, 10]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="peer-tag">
                <span className="peer-name">{vues[i].name || '—'}</span>
                {vues[i].text && <span className="peer-said">{vues[i].text}</span>}
              </div>
            </Html>
          )}
        </primitive>
      ))}
    </group>
  );
}
