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
import { makeAppearance, type Appearance } from '../systems/appearance';
import { bubbleFor } from '../systems/net/chat';
import { peers } from '../systems/net/peers';
import { peerWorldPose } from '../systems/net/pose';
import { ROOM_CAPACITY } from '../systems/net/protocol';
import { MODELS_BASE, type CharacterManifest, type LogicalClip } from './characters/manifest';
import {
  buildTemplates,
  cloneVariant,
  disposeClone,
  pickTemplate,
  type CharacterClone,
  type CharacterTemplate,
} from './characters/library';

/** Fondu entre deux clips (s). Même valeur que la foule du quai. */
const FADE = 0.22;

interface Slot {
  /** Support stable dans la scène : le clone y est greffé, et remplacé. */
  holder: THREE.Group;
  clone: CharacterClone;
  /** Le pair que ce corps représente, et sa graine d'apparence. */
  id: string;
  seed: number;
  appearance: Appearance;
  currentKey: LogicalClip | '';
}

function buildBody(templates: CharacterTemplate[], seed: number): {
  clone: CharacterClone;
  appearance: Appearance;
} {
  const appearance = makeAppearance(seed);
  const template = pickTemplate(templates, appearance, seed);
  return { clone: cloneVariant(template, appearance), appearance };
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
          id: '',
          seed: -1,
          appearance: makeAppearance(0),
          currentKey: '' as LogicalClip | '',
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
        s.id = '';
        s.seed = -1;
        s.currentKey = '';
      }
    };
  }, [templates, slots]);

  // Les étiquettes ne changent qu'à l'arrivée de quelqu'un ou à une réplique :
  // React n'est réveillé que là, jamais à soixante hertz.
  const [vues, setVues] = useState<{ id: string; name: string; text: string | null }[]>([]);

  useFrame((_, rawDt) => {
    const racine = wrap.current;
    if (!racine) return;
    const dt = Math.min(rawDt, 0.05);
    const now = Date.now();

    // Ordre stable : sans lui, deux pairs échangeraient leurs corps à chaque
    // changement d'effectif, ce qui se verrait comme deux personnes qui se
    // transforment l'une en l'autre.
    const liste = [...peers.values()].sort(
      (a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1),
    );

    const prochaines: { id: string; name: string; text: string | null }[] = [];

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const pair = liste[i];

      if (!pair) {
        s.holder.visible = false;
        prochaines.push({ id: '', name: '', text: null });
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
        s.id = pair.id;
        s.seed = pair.avatar;
        s.currentKey = '';
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
        prochaines.push({ id: '', name: '', text: null });
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
      // clip assis retombe sur le debout plutôt que de ne rien jouer.
      let key: LogicalClip | '' = '';
      if (pose.seated) key = actions.sitIdle ? 'sitIdle' : actions.standIdle ? 'standIdle' : '';
      else if (pose.moving) key = actions.walk ? 'walk' : actions.standIdle ? 'standIdle' : '';
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
      mixer.update(dt);

      // Des pieds, à partir d'un œil : c'est la seule conversion que le rendu
      // fait sur une pose reçue.
      const oeil = pose.seated ? CONFIG.sitHeight : CONFIG.eyeHeight;
      body.position.set(0, 0, 0);
      s.holder.position.set(pose.x, pose.y - oeil, pose.z);
      s.holder.rotation.y = pose.yaw;
      s.holder.scale.setScalar(echelle * (pose.fade < 1 ? Math.max(0.001, pose.fade) : 1));
      // Fondu presque éteint : le corps a disparu, l'étiquette suit. Même
      // raison que ci-dessus, et c'est le cas le plus courant des deux - c'est
      // par là que passe tout départ.
      if (pose.fade <= 0.02) {
        s.holder.visible = false;
        prochaines.push({ id: '', name: '', text: null });
        continue;
      }

      prochaines.push({ id: pair.id, name: pair.name, text: bubbleFor(pair.id, now) });
    }

    setVues((avant) => {
      if (avant.length !== prochaines.length) return prochaines;
      for (let i = 0; i < avant.length; i++) {
        if (
          avant[i].id !== prochaines[i].id ||
          avant[i].name !== prochaines[i].name ||
          avant[i].text !== prochaines[i].text
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
