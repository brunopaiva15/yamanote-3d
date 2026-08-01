// Le vendeur, derrière sa caisse.
//
// UNE BOUTIQUE VIDE EST UNE BOUTIQUE FERMÉE. Le konbini et le kiosque étaient
// garnis jusqu'au plafond, éclairés, étiquetés - et personne dedans. À
// l'oeil, cela ne se lit pas comme « le vendeur est parti deux minutes » :
// cela se lit comme un décor. C'est le même effet qu'un quai sans voyageurs,
// et le dépôt a déjà tranché la question là-bas.
//
// CE QU'IL FAUT, ET RIEN DE PLUS. On ne voit du vendeur que le buste : il est
// derrière un comptoir d'un mètre, à trois mètres au minimum, souvent à
// travers une vitre. Il ne marche pas, il ne parle pas, il n'a pas de squelette
// - c'est une silhouette debout, tournée vers le client, avec l'uniforme qu'on
// reconnaît sans le lire : chemise claire, tablier de marque, casquette.
//
// POURQUOI PAS LA FOULE. Les voyageurs (three/ProceduralPassengers, la
// librairie GLB) sont un système complet - apparence tirée, squelette, clips,
// pose, sacs, actions. Un vendeur immobile n'a besoin d'aucun de ces étages, et
// les emprunter aurait fait dépendre une boutique du chargement d'un pack de
// modèles. On reprend d'eux ce qui compte et qui est déjà écrit : la teinte de
// peau et de cheveux (systems/appearance) et le visage peint
// (textures/procedural), pour qu'un vendeur ne détonne pas à côté d'un
// voyageur.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { makeAppearance } from '../../systems/appearance';
import { makeFaceTexture } from '../../textures/procedural';

/** Cotes du buste, reprises du corps procédural de la foule (three/ProceduralPlatformCrowd). */
const HEAD_Y = 1.34;
const SHOULDER_Y = 1.06;

/** Le tablier NEWDAYS : bleu de la marque, liseré vert JR. */
const APRON = '#12539f';
const SHIRT = '#f2f4f6';
const TROUSERS = '#2c3238';

export function ShopClerk({
  x,
  y = 0,
  z,
  yaw,
  seed,
}: {
  x: number;
  /** Sol sur lequel il se tient : le kiosque a un socle, le konbini non. */
  y?: number;
  z: number;
  /** Vers où il regarde : le client, donc le comptoir. */
  yaw: number;
  seed: number;
}) {
  // L'apparence donne la peau, les cheveux et la carrure ; l'uniforme fait le
  // reste. Un vendeur tiré comme un voyageur aurait porté un manteau.
  const app = useMemo(() => makeAppearance(seed * 977 + 41), [seed]);
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
      {/* Jambes et chaussures : on ne les voit qu'au kiosque, et de biais. */}
      {[-1, 1].map((s) => (
        <group key={`jambe${s}`} position={[s * 0.075, 0, 0]}>
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[b.legR, b.legR * 0.85, 0.56, 8]} />
            <meshStandardMaterial color={TROUSERS} roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.03, 0.03]}>
            <boxGeometry args={[0.085, 0.05, 0.17]} />
            <meshStandardMaterial color="#1c1e22" roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Buste : un tronc de cône, épaules en haut. Trois centimètres de plus
          en bas qu'en haut suffisent à ce qu'on ne voie pas un tuyau. */}
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[b.shoulderR, b.hipR + 0.02, 0.62, 12]} />
        <meshStandardMaterial color={SHIRT} roughness={0.82} />
      </mesh>
      {/* Le tablier, par-dessus : c'est LUI l'uniforme, et il se voit de dos
          comme de face. Bavette haute, liseré vert JR en pied. */}
      <mesh position={[0, 0.68, 0.01]}>
        <cylinderGeometry args={[b.chestR + 0.012, b.hipR + 0.035, 0.5, 12, 1, true]} />
        <meshStandardMaterial color={APRON} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.44, 0.01]}>
        <cylinderGeometry args={[b.hipR + 0.036, b.hipR + 0.038, 0.03, 12, 1, true]} />
        <meshStandardMaterial color="#0d8a3e" roughness={0.85} side={THREE.DoubleSide} />
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
          <meshStandardMaterial color={SHIRT} roughness={0.82} />
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
        {/* Calotte et visière : la casquette est ce qui dit « personnel » en un
            coup d'oeil, même de dos et même à dix mètres. */}
        <mesh position={[0, 0.055, 0]} scale={[1, 0.72, 1]}>
          <sphereGeometry args={[0.118, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={APRON} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.05, 0.1]} rotation={[0.18, 0, 0]}>
          <boxGeometry args={[0.19, 0.014, 0.1]} />
          <meshStandardMaterial color={APRON} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}
