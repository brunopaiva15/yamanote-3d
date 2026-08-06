// Les masses urbaines : ce qu'il y a entre le dernier immeuble du ruban et
// l'horizon.
//
// Le décor avait un trou, et c'était le plus grand de tous. Le ruban urbain
// s'arrête à quatre cent quarante mètres (three/city/CityRibbon), la silhouette
// peinte de la voûte céleste reprend vers neuf cents, et les repères ponctuels
// de three/city/FarSkyline ne commencent qu'à deux kilomètres. Entre les deux,
// rien : les bandes 1-5, 5-10 et 10-20 km de la bible étaient vides.
//
// Or c'est là que se trouve l'essentiel de ce qu'on voit d'un train à Tokyo. La
// barre de Nishi-Shinjuku est à cinq cents mètres de la voie ; les tours
// d'Azabudai à quatorze cents ; Musashi-Kosugi à huit kilomètres ; Minato Mirai
// à vingt. Aucune n'est un repère isolé qu'on puisse nommer d'une silhouette -
// ce sont des MASSES, et c'est comme masses qu'elles se lisent.
//
// --- CE QU'ON DESSINE, ET POURQUOI SI PEU ---
//
// Une découpe rectangulaire par amas, et rien de plus. Ce n'est pas de la
// paresse : c'est exactement ce que la donnée porte. src/data/sectors donne
// pour chaque amas un barycentre, une dispersion et un percentile de hauteur,
// tous mesurés sur les bâtiments d'OpenStreetMap qui déclarent leur hauteur.
// Il ne donne ni le dessin des toits, ni la largeur de chaque tour. Dessiner
// une ligne de faîte dentelée demanderait d'inventer ces dentelures, et la
// règle 11 de la bible l'interdit. Une masse rectangulaire noyée de brume à
// deux kilomètres est ce que la source permet d'affirmer, ni plus ni moins -
// et c'est déjà beaucoup plus juste qu'un ciel vide.
//
// Les tours nommées, elles, restent à FarSkyline : la tour de Tokyo sort du
// massif de Shiba comme elle en sort dans la vraie vie.
//
// --- LE RENDU ---
//
// L'idiome de FarSkyline : une sphère centrée sur l'œil, un relèvement vrai,
// une taille angulaire vraie, l'abaissement de l'horizon pour ce qui est loin,
// et une passe OPAQUE sans test de profondeur, glissée entre le ciel et le
// décor. Tout ce qui est proche se peint par-dessus, et les masses
// n'apparaissent donc que dans les trouées du ruban - ce qui est précisément la
// façon dont on voit Shinjuku depuis un train à Yoyogi.
//
// Une seule différence, et elle vaut son pesant d'appels de rendu : les
// cinquante et une masses tiennent dans UN maillage instancié. Le rang de
// peinture est alors commun, et les recouvrements se départagent par l'ORDRE
// DES INSTANCES plutôt que par la distance du moment. On les range donc de la
// plus lointaine à la plus proche une fois pour toutes : la distance à la
// boucle n'est pas la distance à l'œil, mais elle en est assez proche pour que
// l'ordre ne se voie jamais.

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { useStore } from '../../store';
import { CONFIG } from '../../data/config';
import { journeyProgress } from '../../data/segments';
import { SECTORS } from '../../data/sectors';
import { loopPose, makePose, sightTo, type Sight } from '../../systems/tokyoBearing';
import { segEnv } from '../../systems/segmentEnv';
import { trackElevation } from '../../systems/terrain';
import { qualityLevel, usePerf, type Quality } from '../../systems/perf';
import { airRange, veilAt, VEIL_MAX } from './airDepth';

/** Rayon de la sphère de pose (m de scène) : celui de FarSkyline et FarRelief. */
const RS = 96;

/** Rayon terrestre moyen (m) : l'abaissement de l'horizon en dépend. */
const EARTH_R = 6371000;

/**
 * Rang de rendu.
 *
 * Juste devant le relief régional (−935), et derrière tous les repères de
 * FarSkyline (−939 pour le Fuji, −909 à −900 pour le reste). Les montagnes du
 * Tanzawa passent donc derrière les masses de la ville, ce qui est vrai ; le
 * Fuji aussi, ce qui est vrai également.
 *
 * La réserve honnête : un repère LOINTAIN de FarSkyline se peint par-dessus une
 * masse PROCHE, parce que les deux couches ont chacune leur échelle de rangs et
 * qu'elles ne se parlent pas. En pratique cela concerne la tour Landmark de
 * Yokohama, à vingt-cinq kilomètres et déjà aux trois quarts noyée : elle laisse
 * un fantôme sur les masses de premier plan qu'elle croise, et personne ne l'a
 * jamais remarqué en jouant. Le jour où cela gênera, les deux couches devront
 * partager une seule échelle de rangs.
 */
const RENDER_ORDER = -934;

/**
 * Ton d'une masse urbaine.
 *
 * Plus chaud et plus clair que le relief (#6f829d) : une ville rend la lumière
 * du ciel sur du béton et du verre, une montagne sur de la forêt. C'est cette
 * différence-là qui fait qu'on distingue, depuis un quai de Shinjuku, la barre
 * du Tanzawa de la barre de bureaux qui est devant.
 */
const TONE = new THREE.Color('#8b93a1');

/** Le fond dans lequel une masse se noie la nuit : la lueur brune de Tokyo. */
const NIGHT_HAZE = new THREE.Color('#4d3b34');

/**
 * En deçà, une masse n'est plus lointaine et s'efface (m).
 *
 * Le cas d'école est Nishi-Shinjuku, dont l'amas est à cinq cents mètres de la
 * voie. Depuis le quai de Shinjuku, il est AU-DESSUS de la tête et occupe vingt
 * degrés de ciel : une découpe plate y serait un mur de carton gris, et de
 * toute façon ce sont les vrais immeubles du ruban qu'on regarde à cette
 * distance. Depuis Yoyogi, à un kilomètre et demi, le même amas est la barre de
 * tours qu'on voit par la vitre de gauche - et c'est là qu'il apparaît.
 *
 * La bascule est plus basse que celle de FarSkyline (2 000 m) parce qu'une
 * masse n'a pas de forme à trahir : un repère plat se dénonce par son contour,
 * une masse est un aplat par nature.
 */
const NEAR_HIDE = 900;
const NEAR_FULL = 1600;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Les masses par PRÉSENCE décroissante : la hauteur rapportée à la distance.
 *
 * C'est l'ordre dans lequel on coupe aux paliers modestes. Nishi-Shinjuku, à
 * cinq cents mètres et cent soixante-quatorze de faîte, passe donc largement
 * devant Minato Mirai, qui est plus haut mais vingt fois plus loin.
 */
const BY_PRESENCE = [...SECTORS].sort((a, b) => b.height / b.distance - a.height / a.distance);

/** Combien de masses par palier de qualité. */
function tuning(quality: Quality): number {
  const level = qualityLevel(quality);
  if (quality === 'extraordinary' || level <= 1) return SECTORS.length;
  if (level === 2) return 32;
  if (level === 3) return 18;
  // Aux deux derniers paliers, rien de neuf : c'est la règle des passes.
  return 0;
}

export function DistrictMassif() {
  const scene = useThree((s) => s.scene);
  const quality = usePerf((s) => s.quality);
  const count = tuning(quality);

  const built = useMemo(() => {
    if (!count) return null;
    // De la plus lointaine à la plus proche : c'est l'ordre de peinture.
    const items = BY_PRESENCE.slice(0, count).sort((a, b) => b.distance - a.distance);

    // Un carré unité, ancré sur son ARÊTE BASSE : la mise à l'échelle en y
    // pousse alors le faîte vers le haut sans décoller le pied du sol.
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      // Jamais testé ni écrit en profondeur, et jamais transparent : la couche
      // se glisse entre le ciel et le décor, dans la passe opaque, et tout ce
      // qui vient après la recouvre franchement.
      depthTest: false,
      depthWrite: false,
      transparent: false,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = 'masses urbaines';
    mesh.userData.cityFamily = 'masse urbaine';
    mesh.userData.noShadow = true;
    mesh.renderOrder = RENDER_ORDER;
    mesh.frustumCulled = false;
    return { items, geo, mat, mesh };
  }, [count]);

  useEffect(() => {
    if (!built) return;
    return () => {
      built.geo.dispose();
      built.mat.dispose();
      built.mesh.dispose();
    };
  }, [built]);

  const scratch = useMemo(
    () => ({
      pose: makePose(),
      sight: { azimuth: 0, distance: 0 } as Sight,
      haze: new THREE.Color('#d6e8f2'),
      col: new THREE.Color(),
      mtx: new THREE.Matrix4(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      pos: new THREE.Vector3(),
      rot: new THREE.Quaternion(),
      scl: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  useFrame(() => {
    if (!built) return;
    const sc = scratch;
    const { index, phase, loopDirection } = useStore.getState();
    const p = journeyProgress(phase, runtime.phaseT, index, loopDirection);
    loopPose(index, p, loopDirection, sc.pose);

    // L'altitude de l'œil au-dessus du niveau de la mer, comme FarRelief la
    // compte : la cote du sol sous la voie, plus la hauteur du regard, moins
    // l'enfoncement de la ville sous le rail (sept mètres et demi sur viaduc).
    const eyeAlt = trackElevation() + CONFIG.eyeHeight - segEnv.cityY;
    const range = airRange();
    const w = dayNightWeights(runtime.clockMin / 60);
    const night = Math.min(1, w.night + w.golden * 0.4);
    if (scene.fog instanceof THREE.Fog) sc.haze.copy(scene.fog.color);
    sc.haze.lerp(NIGHT_HAZE, 0.85 * night);

    for (let i = 0; i < built.items.length; i++) {
      const it = built.items[i];
      sightTo(sc.pose, it.x, it.z, sc.sight);
      const d = Math.max(1, sc.sight.distance);
      const veil = Math.max(veilAt(d, range), 1 - smoothstep(NEAR_HIDE, NEAR_FULL, d));
      if (veil >= VEIL_MAX) {
        built.mesh.setMatrixAt(i, sc.hidden);
        continue;
      }

      // Pied et faîte, en angles au-dessus du regard. L'altitude du sol vient
      // du MNT ; sans elle, le plateau de Musashino - trente mètres au-dessus
      // de la plaine - poserait Shinjuku au même niveau qu'Akihabara.
      const drop = (d * d) / (2 * EARTH_R);
      const base = (it.elevation ?? 0) - eyeAlt - drop;
      const yBase = (RS * base) / d;
      const yTop = (RS * (base + it.height)) / d;

      const az = sc.sight.azimuth;
      sc.pos.set(RS * Math.sin(az), yBase, -RS * Math.cos(az));
      // La découpe se tourne vers l'œil : sa normale (+z local) doit regarder
      // l'origine, d'où l'angle opposé au relèvement.
      sc.rot.setFromAxisAngle(sc.axis, -az);
      sc.scl.set((RS * 2 * it.radius) / d, Math.max(0.01, yTop - yBase), 1);
      sc.mtx.compose(sc.pos, sc.rot, sc.scl);
      built.mesh.setMatrixAt(i, sc.mtx);

      // Le jour l'assombrit un peu, la nuit franchement - une masse lointaine
      // est une découpe noire sur la lueur de la ville, même si ses fenêtres
      // sont allumées : à deux kilomètres, elles ne sont plus des fenêtres mais
      // une teinte. Puis la brume la mange. Pas d'opacité : ce mélange-ci se
      // fait dans la couleur, comme pour toutes les couches lointaines.
      sc.col.copy(TONE).multiplyScalar(1 - 0.5 * night).lerp(sc.haze, veil);
      built.mesh.setColorAt(i, sc.col);
    }
    built.mesh.instanceMatrix.needsUpdate = true;
    if (built.mesh.instanceColor) built.mesh.instanceColor.needsUpdate = true;
  });

  if (!built) return null;
  // Comme FarSkyline et FarRelief, le groupe est posé À HAUTEUR D'ŒIL : c'est de
  // là que partent les relèvements, et les cotes se comptent depuis ce plan.
  return (
    <group position={[0, CONFIG.eyeHeight, 0]}>
      <primitive object={built.mesh} />
    </group>
  );
}
