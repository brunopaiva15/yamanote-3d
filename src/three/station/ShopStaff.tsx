// Le vendeur, derrière sa caisse.
//
// UNE BOUTIQUE VIDE EST UNE BOUTIQUE FERMÉE. Le konbini et le kiosque étaient
// garnis jusqu'au plafond, éclairés, étiquetés - et personne dedans. À l'oeil,
// cela ne se lit pas comme « le vendeur est parti deux minutes » : cela se lit
// comme un décor. C'est le même effet qu'un quai sans voyageurs, et le dépôt a
// déjà tranché la question là-bas.
//
// C'EST UN VOYAGEUR QUI TIENT LA CAISSE. Ce fichier ne dessine pas de corps :
// il passe par le MÊME chemin que les PNJ de la rame et la foule du quai -
// modèles GLB de la librairie (`three/characters/library`) si le pack est
// installé, rendu procédural sinon, et la même frontière d'erreur entre les
// deux. C'était le seul personnage du jeu à avoir sa propre silhouette, et
// cela se voyait : il ne bougeait pas d'un cheveu là où tout le monde respire,
// il n'avait ni le gabarit, ni les matériaux, ni la teinte des autres. Un
// vendeur est une personne de plus dans la gare, pas une famille à part.
//
// CE QUI RESTE PROPRE AU VENDEUR, et c'est peu :
//
//   · son APPARENCE est celle d'un voyageur, retouchée en uniforme - haut bleu
//     NEWDAYS, bas anthracite, chaussures noires, ni sac ni écharpe. Un vendeur
//     tiré comme un voyageur aurait porté un manteau et un sac à dos derrière
//     sa caisse ;
//   · il ne fait qu'UNE chose : il se tient debout, au repos, tourné vers le
//     client. Pas de marche, pas de gestes, pas de chute - toute la mécanique
//     de pose (`characters/pose`) sert à des gens qui bougent, et lui ne bouge
//     pas d'endroit. Le clip d'attente du pack suffit, et c'est lui qui le
//     rend vivant sans qu'on ait rien à écrire.

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { makeAppearance, type Appearance } from '../../systems/appearance';
import { makeFaceTexture } from '../../textures/procedural';
import { MODELS_BASE, useCharacterManifest, type CharacterManifest } from '../characters/manifest';
import { ModelErrorBoundary } from '../characters/ModelErrorBoundary';
import {
  buildTemplates,
  cloneVariant,
  disposeClone,
  pickTemplate,
  type CharacterClone,
} from '../characters/library';

export interface ClerkProps {
  x: number;
  /** Sol sur lequel il se tient : le kiosque a un socle, le konbini non. */
  y?: number;
  z: number;
  /** Vers où il regarde : le client, donc le comptoir. */
  yaw: number;
  seed: number;
}

/** Le bleu NEWDAYS de l'uniforme, et le liseré vert JR du tablier. */
const UNIFORM = '#12539f';
const JR_GREEN = '#0d8a3e';
const TROUSERS = '#2c3238';

/**
 * L'apparence d'un vendeur : celle d'un voyageur, mise en uniforme.
 *
 * On part du tirage ordinaire (`systems/appearance`) - c'est lui qui donne la
 * peau, les cheveux, le gabarit, le genre, et c'est pour cela qu'un vendeur ne
 * détonne pas à côté d'un voyageur. Puis on habille : le tirage des vêtements
 * ne sait pas ce qu'est un uniforme, et laissé tel quel il mettait un manteau
 * d'hiver et un sac à dos derrière une caisse.
 *
 * L'ARCHÉTYPE est forcé, et pas pour la raison qu'on croit. Ce n'est pas une
 * question de goût : c'est la seule façon de choisir des variantes dont le
 * vêtement se TEINT vraiment. Le pack range ses modèles par archétype, et
 * `casual` - le choix naturel pour un employé de commerce - y mêle le fermier
 * (dont aucun matériau ne porte le rôle « haut » : il serait resté en beige),
 * l'ouvrier (gilet jaune de chantier, marqué inteignable) et le punk. Un
 * fermier en salopette derrière une caisse de kiosque est pire qu'un décor
 * vide. Les archétypes habillés de propre - `salaryman`, `officeLady` - n'ont
 * que des tenues sobres, entièrement teintables, et sans accessoire : ce sont
 * eux qui portent l'uniforme sans discuter.
 */
function clerkAppearance(seed: number): Appearance {
  const base = makeAppearance(seed * 977 + 41);
  return {
    ...base,
    archetype: base.feminine ? 'officeLady' : 'salaryman',
    top: { ...base.top, type: 'tshirt', color: UNIFORM },
    bottom: { ...base.bottom, type: 'trousers', color: TROUSERS },
    shoes: '#1c1e22',
    bag: 'none',
    scarf: false,
    hat: 'cap',
  };
}

export function ShopClerk(props: ClerkProps) {
  const manifest = useCharacterManifest();
  if (manifest === undefined) return null; // vérification du manifest en cours
  if (manifest === null) return <ProceduralClerk {...props} />;
  return (
    <ModelErrorBoundary what="Modèles de personnel de commerce" fallback={<ProceduralClerk {...props} />}>
      <Suspense fallback={null}>
        <LibraryClerk manifest={manifest} {...props} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

/**
 * Le vendeur en modèle de librairie : un voyageur de plus, immobile.
 *
 * Il n'y a ici NI boucle de slots, NI reconstruction, NI budget d'images -
 * tout ce qui fait la complexité de `LibraryPassengers` et de
 * `LibraryPlatformCrowd` vient de ce que leurs personnages changent
 * d'identité en cours de route. Le vendeur, lui, appartient à sa gare : il
 * naît avec la boutique et meurt avec elle.
 */
function LibraryClerk({
  manifest,
  x,
  y = 0,
  z,
  yaw,
  seed,
}: ClerkProps & { manifest: CharacterManifest }) {
  const urls = useMemo(() => manifest.variants.map((v) => MODELS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildTemplates(manifest, gltfs), [manifest, gltfs]);
  const app = useMemo(() => clerkAppearance(seed), [seed]);

  // Le corps NAÎT ET MEURT DANS L'EFFET, et non dans un useMemo libéré par un
  // effet séparé. La nuance a l'air scolastique ; elle ne l'est pas.
  //
  // Le vendeur est le premier personnage du jeu à se DÉMONTER : les PNJ de la
  // rame et la foule du quai se montent au démarrage et ne s'en vont plus,
  // alors qu'une boutique disparaît à chaque changement de gare. Il lui faut
  // donc libérer son clone - trente visites laisseraient trente jeux de
  // matériaux teintés derrière elles. Or React monte, démonte et remonte
  // chaque composant en mode strict : un corps construit dans un useMemo et
  // détruit dans le nettoyage d'un effet se retrouvait détruit ET conservé -
  // le useMemo ne rejoue pas au remontage, et l'on gardait la référence d'un
  // corps déjà retiré de la scène. Le vendeur était invisible.
  //
  // Quand la même main crée et détruit, les deux passages s'annulent
  // proprement : construire, poser, détruire, reconstruire.
  const [clone, setClone] = useState<CharacterClone | null>(null);
  useEffect(() => {
    const c = cloneVariant(pickTemplate(templates, app, seed), app);
    // `cloneVariant` livre son corps masqué : la foule le rallume par image,
    // selon l'état de son PNJ. Le vendeur n'a pas d'état - il est là.
    c.wrap.visible = true;
    const idle = c.actions.standIdle ?? c.actions.sitIdle;
    if (idle) {
      idle.reset().play();
      // Décalé dans le cycle : deux vendeurs de deux gares voisines ne
      // respirent pas à la même seconde, et l'on visite trente gares.
      idle.time = ((seed * 0.37) % 1) * (idle.getClip().duration || 1);
    }
    setClone(c);
    return () => {
      setClone(null);
      disposeClone(c);
    };
  }, [templates, app, seed]);

  useFrame((_, dt) => clone?.mixer.update(Math.min(dt, 0.05)));

  if (!clone) return null;
  return (
    <group name="vendeur" position={[x, y, z]} rotation={[0, yaw, 0]} scale={app.build.scale}>
      <primitive object={clone.wrap} />
    </group>
  );
}

/** Cotes du buste, reprises du corps procédural de la foule (three/ProceduralPlatformCrowd). */
const HEAD_Y = 1.34;
const SHOULDER_Y = 1.06;

/**
 * Le vendeur sans pack de modèles : le même repli que la foule du quai.
 *
 * Il n'a pas à être meilleur que les voyageurs qui l'entourent - dans ce mode,
 * ils sont procéduraux aussi - mais il a de quoi être RECONNU pour ce qu'il
 * est, et c'est le seul endroit où on peut le lui donner : le tablier et la
 * casquette de service, que les modèles de librairie ne portent pas et qu'on
 * ne peut pas leur ajouter sans les traverser.
 */
function ProceduralClerk({ x, y = 0, z, yaw, seed }: ClerkProps) {
  const app = useMemo(() => clerkAppearance(seed), [seed]);
  const face = useMemo(() => {
    const t = makeFaceTexture(app, seed);
    // Le canvas du visage ne porte QUE les traits - sourcils, yeux, bouche,
    // lunettes, masque - sur un fond vide : la peau, c'est la sphère du crâne
    // derrière. Sans transparence, ce fond vide devient un carré noir collé au
    // milieu de la figure.
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: true });
  }, [app, seed]);
  useEffect(
    () => () => {
      face.map?.dispose();
      face.dispose();
    },
    [face],
  );

  const b = app.build;
  return (
    <group name="vendeur" position={[x, y, z]} rotation={[0, yaw, 0]} scale={b.scale}>
      {[-1, 1].map((s) => (
        <group key={`jambe${s}`} position={[s * 0.075, 0, 0]}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[b.legR, b.legR * 0.85, 0.56, 8]} />
            <meshStandardMaterial color={TROUSERS} roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.03, 0.03]}>
            <boxGeometry args={[0.085, 0.05, 0.17]} />
            <meshStandardMaterial color={app.shoes} roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Buste : un tronc de cône, épaules en haut. Trois centimètres de plus
          en bas qu'en haut suffisent à ce qu'on ne voie pas un tuyau. */}
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[b.shoulderR, b.hipR + 0.02, 0.62, 12]} />
        <meshStandardMaterial color="#f2f4f6" roughness={0.82} />
      </mesh>
      {/* Le tablier, par-dessus : bavette haute, liseré vert JR en pied. */}
      <mesh position={[0, 0.68, 0.01]}>
        <cylinderGeometry args={[b.chestR + 0.012, b.hipR + 0.035, 0.5, 12, 1, true]} />
        <meshStandardMaterial color={UNIFORM} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.44, 0.01]}>
        <cylinderGeometry args={[b.hipR + 0.036, b.hipR + 0.038, 0.03, 12, 1, true]} />
        <meshStandardMaterial color={JR_GREEN} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* Bras, légèrement en avant : un vendeur au comptoir a les mains devant
          lui, pas le long du corps. */}
      {[-1, 1].map((s) => (
        <mesh
          key={`bras${s}`}
          position={[s * (b.shoulderR + 0.03), SHOULDER_Y - 0.16, 0.07]}
          rotation={[-0.42, 0, s * 0.14]}
        >
          <cylinderGeometry args={[0.036, 0.031, 0.5, 7]} />
          <meshStandardMaterial color="#f2f4f6" roughness={0.82} />
        </mesh>
      ))}

      {/* Cou, tête, visage, cheveux - et la casquette de service par-dessus. */}
      <mesh position={[0, SHOULDER_Y + 0.14, 0]}>
        <cylinderGeometry args={[0.043, 0.047, 0.15, 8]} />
        <meshStandardMaterial color={app.skin} roughness={0.7} />
      </mesh>
      <group position={[0, HEAD_Y, 0]}>
        <mesh scale={[0.88, 1, 0.94]}>
          <sphereGeometry args={[0.105, 14, 12]} />
          <meshStandardMaterial color={app.skin} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.02, 0.093]} material={face}>
          <planeGeometry args={[0.17, 0.17]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} scale={[0.95, 0.85, 0.95]}>
          <sphereGeometry args={[0.11, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={app.hair.color} roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.055, 0]} scale={[1, 0.72, 1]}>
          <sphereGeometry args={[0.118, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={UNIFORM} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.05, 0.1]} rotation={[0.18, 0, 0]} geometry={VISOR}>
          <meshStandardMaterial color={UNIFORM} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

/** Visière de la casquette : la même pour tous les vendeurs, donc partagée. */
const VISOR = new RoundedBoxGeometry(0.19, 0.016, 0.1, 2, 0.006);
