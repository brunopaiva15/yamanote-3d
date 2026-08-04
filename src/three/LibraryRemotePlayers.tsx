// Les joueurs distants, avec les MÊMES modèles que tout le monde.
//
// Ce fichier corrige un défaut rapporté depuis un vrai salon, et qui saute aux
// yeux dès qu'on le voit : « son personnage est moche et ne ressemble pas aux
// personnages ». C'était exact, et c'était de ma main.
//
// La première version rendait les avatars distants avec `buildPerson`, le
// constructeur PROCÉDURAL - celui qui sert de repli quand aucun pack de modèles
// n'est installé. Or dès qu'un pack est là, tous les voyageurs de la rame et du
// quai sont des modèles GLB riggés, animés, avec un vrai visage. Un joueur
// distant se retrouvait donc être la seule silhouette de polygones bruts au
// milieu de trente personnages, bras écartés faute de pose - impossible à
// manquer, et impossible à prendre pour un habitant du même monde.
//
// L'aiguillage est désormais celui de `three/Passengers` : modèles si
// disponibles, procédural sinon. Le repli existe toujours, il n'est simplement
// plus le cas normal.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { productById } from '../data/products';
import { SEAT_EYE_INSET, SEAT_TOP_Y } from '../systems/seats';
import { makeAppearance, type Appearance } from '../systems/appearance';
import { bubbleFor } from '../systems/net/chat';
import { peers } from '../systems/net/peers';
import { peerWorldPose } from '../systems/net/pose';
import { ROOM_CAPACITY } from '../systems/net/protocol';
import { MODELS_BASE, type CharacterManifest, type LogicalClip } from './characters/manifest';
import {
  buildTemplates,
  cloneVariant,
  collectOwnedTints,
  disposeClone,
  pickTemplate,
  tintAway,
  type CharacterClone,
  type CharacterTemplate,
  type OwnedTint,
} from './characters/library';
import { applySitPose, makePoseState, type PoseState } from './characters/pose';
import { attachProps, tintHandBottle, updatePropRig, type PropRig } from './characters/props';

/** Fondu entre deux clips (s). Même valeur que la foule du quai. */
const FADE = 0.22;

/** Débattement maximal du cou, en lacet comme en tangage (rad). */
const LOOK_MAX = 1.05;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Écart d'angles par le chemin le plus court, dans (-π, π]. */
function angleCourt(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

interface Slot {
  /** Support stable dans la scène : le clone y est greffé, et remplacé. */
  holder: THREE.Group;
  clone: CharacterClone;
  /**
   * Lunettes, masque, sac - et surtout l'objet tenu en main. Le même gréement
   * que les voyageurs de la rame et la foule du quai : un joueur distant n'a
   * aucune raison d'être le seul à ne rien pouvoir tenir.
   */
  props: PropRig;
  /** Poids lissés de l'assise manuelle : ce qui plie les jambes sans clip. */
  pose: PoseState;
  /** Matériaux propres à ce corps, pour pouvoir le griser sans griser la rame. */
  tints: OwnedTint[];
  /** Descente du bassin vers le coussin, lissée : une assise ne se pose pas d'un coup. */
  seatFix: number;
  /** Dernier gris appliqué : on ne repeint que quand il bouge. */
  awayShown: number;
  /** Le pair que ce corps représente, et sa graine d'apparence. */
  id: string;
  seed: number;
  appearance: Appearance;
  currentKey: LogicalClip | '';
  /** Le produit tenu à l'image précédente : un changement retitre la bouteille. */
  heldId: string;
}

function buildBody(templates: CharacterTemplate[], seed: number): {
  clone: CharacterClone;
  appearance: Appearance;
  props: PropRig;
  tints: OwnedTint[];
} {
  const appearance = makeAppearance(seed);
  const template = pickTemplate(templates, appearance, seed);
  const clone = cloneVariant(template, appearance);
  // `bagProp === false` : ce modèle-là porte déjà son sac, on ne lui en met pas
  // un second. Même règle que `LibraryPassengers`.
  const props = attachProps(clone.wrap, appearance, template.variant.bagProp !== false);
  return { clone, appearance, props, tints: collectOwnedTints(clone.wrap) };
}

export function LibraryRemotePlayers({ manifest }: { manifest: CharacterManifest }) {
  const wrap = useRef<THREE.Group>(null);
  const urls = useMemo(() => manifest.variants.map((v) => MODELS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildTemplates(manifest, gltfs), [manifest, gltfs]);
  const walkClipSpeed = manifest.walkClipSpeed ?? CONFIG.walkSpeed;

  // Les places sont STABLES : elles ne dépendent pas des gabarits, parce qu'on
  // ne sait pas encore qui viendra. Les corps, eux, se bâtissent à la volée
  // quand quelqu'un occupe une place.
  const slots = useMemo<Slot[]>(
    () =>
      Array.from({ length: ROOM_CAPACITY }, () => {
        const holder = new THREE.Group();
        holder.visible = false;
        return {
          holder,
          clone: null as unknown as CharacterClone,
          props: null as unknown as PropRig,
          pose: makePoseState(),
          tints: [],
          seatFix: 0,
          awayShown: 0,
          id: '',
          seed: -1,
          appearance: makeAppearance(0),
          currentKey: '' as LogicalClip | '',
          heldId: '',
        };
      }),
    [],
  );

  // Un jeu de gabarits neuf - un autre pack de modèles, un rechargement -
  // périme tous les corps en place : ils ont été clonés depuis les précédents,
  // avec leurs matériaux recolorés. On les libère et l'on invalide les places,
  // que la boucle rebâtira à l'image suivante. Sans ça, on garderait à l'écran
  // des personnages issus d'un pack qui n'existe plus, et leurs textures avec.
  useEffect(() => {
    return () => {
      for (const s of slots) {
        if (!s.clone) continue;
        s.holder.remove(s.clone.wrap);
        disposeClone(s.clone);
        s.clone = null as unknown as CharacterClone;
        s.props = null as unknown as PropRig;
        s.tints = [];
        s.id = '';
        s.seed = -1;
        s.currentKey = '';
        s.heldId = '';
      }
    };
  }, [templates, slots]);

  // Les étiquettes ne changent qu'à l'arrivée de quelqu'un ou à une réplique :
  // React n'est réveillé que là, jamais à soixante hertz.
  const [vues, setVues] = useState<{ id: string; name: string; text: string | null; away: boolean }[]>([]);

  useFrame((_, rawDt) => {
    const racine = wrap.current;
    if (!racine) return;
    const dt = Math.min(rawDt, 0.05);
    // Coefficient de lissage des poses et des descentes d'assise : même
    // constante de temps que les voyageurs de la rame.
    const k = Math.min(1, dt * 8);
    const now = Date.now();

    // Ordre stable : sans lui, deux pairs échangeraient leurs corps à chaque
    // changement d'effectif, ce qui se verrait comme deux personnes qui se
    // transforment l'une en l'autre.
    const liste = [...peers.values()].sort(
      (a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1),
    );

    const prochaines: { id: string; name: string; text: string | null; away: boolean }[] = [];

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const pair = liste[i];

      if (!pair) {
        s.holder.visible = false;
        prochaines.push({ id: '', name: '', text: null, away: false });
        continue;
      }

      // Nouveau venu, ou apparence changée : on refait le corps. `disposeClone`
      // libère ce que le précédent possédait - sans lui, chaque arrivée
      // laisserait derrière elle ses matériaux recolorés.
      if (s.id !== pair.id || s.seed !== pair.avatar) {
        if (s.clone) {
          s.holder.remove(s.clone.wrap);
          disposeClone(s.clone);
        }
        const body = buildBody(templates, pair.avatar);
        s.clone = body.clone;
        s.appearance = body.appearance;
        s.props = body.props;
        s.tints = body.tints;
        s.pose = makePoseState();
        s.seatFix = 0;
        s.awayShown = 0;
        s.id = pair.id;
        s.seed = pair.avatar;
        s.currentKey = '';
        s.heldId = '';
        s.holder.add(body.clone.wrap);
        if (!racine.children.includes(s.holder)) racine.add(s.holder);
      }

      // Pas de pose : il est bien dans le salon, mais pas VISIBLE d'ici - sur un
      // autre quai, détaché dans une autre rame, ou simplement silencieux depuis
      // une seconde. On n'affiche alors pas non plus son étiquette.
      //
      // Ce n'est pas un détail : une étiquette est ancrée au corps, mais elle est
      // rendue en HTML par-dessus la scène, donc rien ne la cache quand le corps
      // s'efface. Laisser le nom là donnait un prénom flottant au milieu du
      // wagon, au-dessus de personne - vu à l'écran, et bien plus déroutant que
      // l'absence qu'il était censé combler.
      const pose = peerWorldPose(pair.id, now);
      if (!pose) {
        s.holder.visible = false;
        prochaines.push({ id: '', name: '', text: null, away: false });
        continue;
      }
      s.holder.visible = true;

      const { wrap: body, mixer, actions } = s.clone;
      // Le corps, VISIBLE. Et ce n'est pas une redondance avec la ligne
      // au-dessus : `cloneVariant` rend un wrap `visible = false`, parce qu'il
      // le mesure hors scène avant toute animation et qu'un corps en pose de
      // repos ne doit pas paraître une image. C'est donc à l'appelant de
      // l'allumer - `LibraryPassengers` et `LibraryPlatformCrowd` le font tous
      // les deux, chacun sur son chemin d'affichage.
      //
      // Ici, on ne le faisait pas. On allumait le SUPPORT, qui n'a jamais
      // contenu que le corps éteint : le camarade n'était jamais dessiné, dans
      // toute installation ayant un pack de modèles - c'est-à-dire celle de
      // tout le monde, le pack étant versionné. Et le défaut se présentait sous
      // son plus mauvais jour : l'étiquette de nom, elle, est du HTML accroché
      // au support, donc parfaitement visible. « Je ne vois pas mon ami, je
      // vois son prénom au-dessus de lui. »
      body.visible = true;
      const echelle = s.appearance.build.scale;

      // Le clip : assis, en marche, ou debout. Un pack qui n'aurait pas de
      // clip assis retombe sur le debout - et c'est alors l'assise MANUELLE qui
      // le plie en position, plus bas.
      //
      // Un absent ne marche pas : sa dernière pose disait peut-être qu'il
      // marchait, mais elle a des secondes et il n'a pas avancé d'un pas depuis.
      // Le laisser piétiner sur place était le plus sûr moyen de ne pas
      // comprendre qu'il était absent.
      let key: LogicalClip | '' = '';
      if (pose.seated) key = actions.sitIdle ? 'sitIdle' : actions.standIdle ? 'standIdle' : '';
      else if (pose.moving && pose.away < 0.5) key = actions.walk ? 'walk' : actions.standIdle ? 'standIdle' : '';
      else key = actions.standIdle ? 'standIdle' : '';

      if (key !== s.currentKey) {
        const suivant = key ? actions[key] : null;
        const precedent = s.currentKey ? actions[s.currentKey] : null;
        if (suivant) {
          suivant.reset().play();
          if (precedent) precedent.crossFadeTo(suivant, FADE, false);
          else suivant.fadeIn(FADE);
        } else if (precedent) {
          precedent.fadeOut(FADE);
        }
        s.currentKey = key;
      }
      // Le clip de marche est cadencé sur la vitesse de marche du jeu : sinon
      // les pieds patinent, ce qui est la première chose qu'on remarque chez un
      // personnage animé.
      if (key === 'walk') mixer.timeScale = CONFIG.walkSpeed / walkClipSpeed;
      else mixer.timeScale = 1;
      // Les os à rotations ADDITIVES repartent de leur pose de repos avant que
      // le mixer ne passe : si le clip actif ne les anime pas, rien ne
      // s'accumule d'une image à l'autre. Même précaution que LibraryPassengers.
      if (s.clone.restHead && s.clone.bones.head) s.clone.bones.head.quaternion.copy(s.clone.restHead);
      if (s.clone.restSpine && s.clone.bones.spine) s.clone.bones.spine.quaternion.copy(s.clone.restSpine);
      mixer.update(dt);

      // --- Le cap du CORPS, qui n'est pas celui du regard -------------------
      //
      // Debout, les deux se confondent : on marche là où l'on regarde. Assis,
      // non - on tourne la tête vers la vitre sans pivoter sur la banquette.
      // Faire porter le regard au corps aurait mis l'assise en travers du
      // coussin, jambes dans le hublot.
      //
      // Le cap d'un assis se déduit de sa place : les banquettes bordent
      // l'allée, on y est tourné vers elle. C'est très exactement la convention
      // des PNJ (systems/passengers : `-side * π/2`), et on la lit sur le signe
      // de x plutôt que sur un numéro de siège qui n'est pas transmis.
      const banquette: 1 | -1 = pose.x >= 0 ? 1 : -1;
      const capCorps = pose.seated ? -banquette * (Math.PI / 2) : pose.yaw;
      // Ce qui reste va dans la tête, borné : personne ne se dévisse le cou.
      if (s.clone.bones.head) {
        s.clone.bones.head.rotation.y += clamp(angleCourt(capCorps, pose.yaw), -LOOK_MAX, LOOK_MAX);
        s.clone.bones.head.rotation.x += clamp(-pose.pitch, -LOOK_MAX, LOOK_MAX);
      }

      // --- L'assise ---------------------------------------------------------
      //
      // Le pack versionné n'a qu'un `Idle_Neutral` : aucun clip assis, aucun
      // clip de marche. Un camarade « assis » restait donc DEBOUT, planté dans
      // la banquette - « on voit que les autres connectés sont juste debout sur
      // les sièges ». Les PNJ de la rame, eux, passent depuis toujours par
      // l'assise manuelle ; il n'y avait qu'à les y rejoindre.
      const manualSit = pose.seated && !actions.sitIdle;
      applySitPose(s.clone, s.pose, k, manualSit, capCorps, echelle);

      // Et le corps descend d'autant que ses hanches doivent se poser sur le
      // coussin : l'assise manuelle plie les jambes mais laisse le bassin à sa
      // hauteur DEBOUT, faute de clip pour l'abaisser.
      const template = s.clone.template;
      const cibleFix = pose.seated
        ? SEAT_TOP_Y + 0.01 - (manualSit ? template.standHipY : (template.sitHipY ?? template.standHipY)) * echelle
        : 0;
      s.seatFix += (cibleFix - s.seatFix) * k;

      // Ce qu'il a acheté au distributeur, dans sa main.
      //
      // L'objet suit l'OS de la main, comme chez les voyageurs de la rame : il
      // pend le long du corps au repos et balance avec le clip de marche, sans
      // qu'aucune pose de bras n'ait à être transmise. La bouteille est teintée
      // de l'étiquette du produit - c'est ce qui la fait reconnaître de loin -
      // et sert de silhouette à tout le rayon : à deux mètres, dans la main de
      // quelqu'un d'autre, une canette et une bouteille se distinguent bien
      // moins que le vert d'un thé et le rouge d'un cidre.
      const product = pose.held ? productById(pose.held) : null;
      if (pose.held !== s.heldId) {
        s.heldId = pose.held;
        if (product) tintHandBottle(s.props, product.tone);
      }
      // Le dernier argument dit que le bras n'est PAS posé : on ne transmet
      // aucune pose de bras, le camarade joue un clip et rien d'autre. Sans
      // lui, la bouteille suivait le poignet - qui pointe vers le sol quand le
      // bras pend - et se présentait bouchon en bas.
      updatePropRig(s.props, s.clone.bones, body, !pose.seated, product ? 'bottle' : null, 1, true);

      // Des pieds, à partir d'un œil : c'est la seule conversion que le rendu
      // fait sur une pose reçue.
      const oeil = pose.seated ? CONFIG.sitHeight : CONFIG.eyeHeight;
      // Et, assis, le bassin recule sous le dossier : la pose transmise est
      // celle de l'ŒIL, qui se tient en avant du dossier (voir SEAT_EYE_INSET).
      // Sans ce retour en arrière, le camarade est perché sur le nez du coussin.
      const assiseX = pose.seated ? pose.x + banquette * SEAT_EYE_INSET : pose.x;
      body.position.set(0, 0, 0);
      s.holder.position.set(assiseX, pose.y - oeil + s.seatFix, pose.z);
      s.holder.rotation.y = capCorps;
      s.holder.scale.setScalar(echelle * (pose.fade < 1 ? Math.max(0.001, pose.fade) : 1));

      // Plus de nouvelles : on le grise sur place plutôt que de l'effacer. Un
      // onglet en arrière-plan n'émet plus - le navigateur suspend son
      // `requestAnimationFrame` - alors que la personne est toujours dans le
      // salon. La faire disparaître annonçait un départ qui n'avait pas eu lieu.
      if (pose.away !== s.awayShown) {
        s.awayShown = pose.away;
        tintAway(s.tints, pose.away);
      }
      // Fondu presque éteint : le corps a disparu, l'étiquette suit. Même
      // raison que ci-dessus, et c'est le cas le plus courant des deux - c'est
      // par là que passe tout départ.
      if (pose.fade <= 0.02) {
        s.holder.visible = false;
        prochaines.push({ id: '', name: '', text: null, away: false });
        continue;
      }

      prochaines.push({ id: pair.id, name: pair.name, text: bubbleFor(pair.id, now), away: pose.away > 0.5 });
    }

    setVues((avant) => {
      if (avant.length !== prochaines.length) return prochaines;
      for (let i = 0; i < avant.length; i++) {
        if (
          avant[i].id !== prochaines[i].id ||
          avant[i].name !== prochaines[i].name ||
          avant[i].text !== prochaines[i].text ||
          avant[i].away !== prochaines[i].away
        ) {
          return prochaines;
        }
      }
      return avant;
    });
  });

  return (
    <group ref={wrap}>
      {slots.map((s, i) => (
        <primitive key={i} object={s.holder}>
          {vues[i]?.id && (
            <Html
              center
              position={[0, CONFIG.eyeHeight + 0.34, 0]}
              zIndexRange={[14, 10]}
              style={{ pointerEvents: 'none' }}
            >
              <div className={vues[i].away ? 'peer-tag peer-away' : 'peer-tag'}>
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
