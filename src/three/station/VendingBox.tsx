// Le distributeur, remonté pièce par pièce.
//
// CE QU'IL ÉTAIT, DANS LE HALL. Une boîte peinte, une plaque noire collée à
// 1,35 m, un bandeau, deux petits parallélépipèdes pour la platine et le volet.
// Six primitives, toutes AU NU de la façade : de trois quarts, la machine
// n'avait aucune épaisseur, et de face elle ressemblait à une armoire
// électrique sur laquelle on aurait scotché une affiche.
//
// CE QU'IL EST. La règle du quai, appliquée pour de bon : la façade est
// CREUSÉE de trois niches, et ce sont les creux qu'on reconnaît de loin - la
// vitrine derrière son encadrement saillant de sept centimètres, la platine des
// monnayeurs en retrait à hauteur de main, le volet du 取出口 au fond de sa
// niche au ras du sol. Sous la vitrine court la rangée de boutons sur son
// bandeau rouge ou bleu, qui est LE code visuel du 自販機 japonais.
//
// Et surtout : tout cela FONCTIONNE. Les organes viennent de `vendingParts`,
// qui les inscrit au registre de visée - on met une pièce dans la fente, la
// lampe des couloirs payables s'allume, on appuie sur un bouton, ça tombe, on
// pousse le volet. Aucun écran ne s'ouvre : la machine dit tout sur sa propre
// platine.

import * as THREE from 'three';

import type { Mats } from './materials';
import { Reveal, VendingPlate, VendingShowcase, VendingTray } from './vendingParts';
import {
  BUTTONS,
  HEADER,
  PORT,
  VEND_H,
  VEND_PLINTH,
  VEND_W,
  WINDOW,
} from './vendingGeometry';

export interface VendingSet {
  header: THREE.Material;
  body: THREE.Material;
  /** Vend-elle du chaud ? Les bandeaux de bouton passent alors au rouge. */
  hot: boolean;
}

export function VendingBox({
  w,
  d,
  set,
  m,
  deviceId,
}: {
  /** Emprise réservée par l'implantation : la caisse s'y recentre. */
  w: number;
  d: number;
  set: VendingSet;
  m: Mats;
  /** Identifiant de l'appareil : c'est par lui que la machine a un état. */
  deviceId: string;
}) {
  const bw = Math.min(w - 0.04, VEND_W);

  return (
    <group>
      {/* Socle en retrait : la caisse ne touche pas la dalle. */}
      <mesh position={[0, VEND_PLINTH / 2, 0]} material={m.frame}>
        <boxGeometry args={[bw - 0.07, VEND_PLINTH, d - 0.06]} />
      </mesh>
      {/* La caisse peinte. */}
      <mesh position={[0, VEND_PLINTH + (VEND_H - VEND_PLINTH) / 2, 0]} material={set.body}>
        <boxGeometry args={[bw, VEND_H - VEND_PLINTH, d]} />
      </mesh>
      {/* Chapeau débordant, plus sombre : l'arête qui détache la machine du
          mur clair derrière elle. */}
      <mesh position={[0, VEND_H + 0.018, 0.012]} material={m.frame}>
        <boxGeometry args={[bw + 0.026, 0.036, d + 0.024]} />
      </mesh>
      {/* Montants de la porte de service, sur les deux rives : sans eux la
          façade est une seule tôle et la caisse n'a plus d'ouvrant. */}
      {[-1, 1].map((s) => (
        <mesh
          key={`jamb${s}`}
          position={[s * (bw / 2 - 0.02), VEND_PLINTH + (VEND_H - VEND_PLINTH) / 2, d / 2 - 0.006]}
          material={m.frame}
        >
          <boxGeometry args={[0.04, VEND_H - VEND_PLINTH - 0.06, 0.018]} />
        </mesh>
      ))}

      {/* --- La vitrine ------------------------------------------------- */}
      <Reveal b={WINDOW} d={d} m={m} />
      <VendingShowcase id={deviceId} d={d} />
      {/* Le verre, au nu de l'encadrement : sept centimètres devant les
          échantillons. C'est ce décalage-là qu'on lit en passant de biais. */}
      <mesh
        position={[0, (WINDOW.y0 + WINDOW.y1) / 2, d / 2 + WINDOW.reveal - 0.004]}
        material={m.glass}
      >
        <planeGeometry args={[WINDOW.w, WINDOW.y1 - WINDOW.y0]} />
      </mesh>

      {/* --- Le bandeau d'enseigne -------------------------------------- */}
      <mesh position={[0, (HEADER.y0 + HEADER.y1) / 2, d / 2 + 0.006]} material={m.frame}>
        <boxGeometry args={[HEADER.w + 0.03, HEADER.y1 - HEADER.y0 + 0.03, 0.014]} />
      </mesh>
      <mesh position={[0, (HEADER.y0 + HEADER.y1) / 2, d / 2 + 0.015]} material={set.header}>
        <planeGeometry args={[HEADER.w, HEADER.y1 - HEADER.y0]} />
      </mesh>

      {/* --- La rangée de boutons --------------------------------------- */}
      <ButtonRow d={d} hot={set.hot} m={m} />

      {/* --- La platine et le volet, qui répondent ---------------------- */}
      <VendingPlate id={deviceId} bw={bw} d={d} m={m} />
      <Reveal b={PORT} d={d} m={m} />
      <VendingTray id={deviceId} d={d} m={m} />
    </group>
  );
}

/**
 * La rangée de boutons, sous la vitrine.
 *
 * Un bouton par couloir, sur son bandeau de couleur : rouge sous ce qui est
 * chaud, bleu sous ce qui est froid. Ce bandeau est LE code visuel du 自販機
 * japonais - c'est lui qu'on lit avant le prix.
 *
 * Ce ne sont pas eux qu'on vise : on vise le COULOIR, dans la vitrine, comme on
 * regarde la boisson avant d'appuyer. Les boutons de la vraie machine sont sous
 * les échantillons, et la vitrine porte les siens - dessinés dans sa texture,
 * qui s'allument avec le crédit. Ceux-ci sont la réglette physique en dessous,
 * celle qui donne l'épaisseur à la façade.
 */
function ButtonRow({ d, hot, m }: { d: number; hot: boolean; m: Mats }) {
  const n = 5;
  const cell = BUTTONS.w / n;
  const y = (BUTTONS.y0 + BUTTONS.y1) / 2;
  return (
    <group>
      <mesh position={[0, y, d / 2 + BUTTONS.reveal / 2]} material={m.frame}>
        <boxGeometry args={[BUTTONS.w + 0.03, BUTTONS.y1 - BUTTONS.y0 + 0.02, BUTTONS.reveal]} />
      </mesh>
      {Array.from({ length: n }, (_, i) => {
        const x = (i - (n - 1) / 2) * cell;
        // Le chaud est toujours à droite sur une machine mixte, et il n'occupe
        // jamais plus de deux couloirs : c'est ce qu'on voit en hiver.
        const warm = hot && i >= n - 2;
        return (
          <group key={i} position={[x, y, d / 2 + BUTTONS.reveal]}>
            <mesh position={[0, 0, 0.003]}>
              <boxGeometry args={[cell - 0.014, 0.05, 0.008]} />
              <meshStandardMaterial
                color={warm ? '#c2352c' : '#1f5fbf'}
                emissive={warm ? '#c2352c' : '#1f5fbf'}
                emissiveIntensity={0.42}
                roughness={0.5}
              />
            </mesh>
            <mesh position={[0, -0.026, 0.006]}>
              <cylinderGeometry args={[0.014, 0.015, 0.01, 12]} />
              <meshStandardMaterial color="#d8dade" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
