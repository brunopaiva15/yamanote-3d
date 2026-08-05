// L'horizon vrai : les repères de Tokyo à leur place, sous leur relèvement.
//
// C'est le morceau « 1:1 » de la troisième passe sur le décor. Jusqu'ici, les
// repères de three/Landmarks étaient des silhouettes de quartier posées à
// trente-quatre mètres de la voie, qui apparaissaient en fondu à l'approche de
// leur gare et disparaissaient après : de la décoration juste, mais rien ne
// disait que le Skytree est au NORD-EST quand on est à Ueno, ni qu'il passe de
// l'autre côté du wagon entre Nippori et Tabata. Or c'est cela, un repère :
// quelque chose qui ne bouge pas quand on tourne autour.
//
// Ce que ce composant ajoute est donc un système de coordonnées, pas des
// objets. Les positions réelles viennent de data/tokyoGeo (projection EPSG:6677
// depuis des coordonnées publiées), le cap du train de systems/tokyoBearing, et
// chaque repère est posé sur une sphère centrée sur l'œil :
//
//   · à son RELÈVEMENT vrai - l'écart angulaire entre le sens de marche et la
//     direction du repère, calculé à chaque image depuis la pose géographique ;
//   · à sa TAILLE ANGULAIRE vraie - hauteur divisée par distance, ce qui fait
//     du Skytree à quatre kilomètres un objet trois fois plus grand que la tour
//     de Tokyo à cinq, comme dans la vraie vie ;
//   · avec l'ABAISSEMENT DE L'HORIZON pour ce qui est loin : à cent kilomètres,
//     la courbure de la Terre enterre les sept cents premiers mètres du Fuji, et
//     c'est pour cette raison qu'on n'en voit que le cône neigeux.
//
// Le Fuji, justement, n'apparaît que quand l'air le permet - hiver sec, pas de
// couverture -, exactement comme dans la vraie vie où il se compte en jours par
// an depuis le niveau de la rue.
//
// Rendu : l'idiome de la boîte à ciel (three/city/SkyDome). Matériaux OPAQUES,
// test de profondeur désactivé, `renderOrder` entre celui du ciel (−1000) et
// celui du reste (0). Tout ce qui est près - le ruban urbain, les poteaux, le
// wagon - se peint donc par-dessus et masque le pied des repères, ce qui est
// précisément ce qu'on veut : une tour lointaine sort d'entre les immeubles du
// premier plan. Le fondu ne passe pas par l'opacité mais par la COULEUR, tirée
// vers la brume de la scène : c'est ce que fait déjà la silhouette peinte du
// ciel, et c'est ce qui garde le mode Extraordinaire identique au mode WebGL -
// une passe opaque se mélange de la même façon dans les deux moteurs.

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../systems/runtime';
import { dayNightWeights } from '../../systems/daynight';
import { seasonNow } from '../../systems/season';
import { weather } from '../../systems/weather';
import { useStore } from '../../store';
import { CONFIG } from '../../data/config';
import { journeyProgress } from '../../data/segments';
import { GEO_LANDMARKS, GEO_STATIONS, type GeoLandmark } from '../../data/tokyoGeo';
import { loopPose, makePose, sightTo, type Sight } from '../../systems/tokyoBearing';
import { qualityLevel, usePerf, type Quality } from '../../systems/perf';
import { makeSilhouette, type TrimKind } from './skylineKit';

/**
 * Rayon de la sphère de pose (m de scène).
 *
 * Il n'a aucun sens physique - un repère à cinq kilomètres est posé à
 * quatre-vingt-seize mètres - et c'est voulu : seule compte la DIRECTION, et
 * une sphère centrée sur l'œil ne donne pas de parallaxe. La valeur se choisit
 * entre deux contraintes : à l'intérieur du plan lointain de la caméra, et du
 * même ordre que la voûte de ciel (rayon 100) pour que les deux couches
 * réagissent pareil au déplacement du joueur dans le wagon.
 */
const RS = 96;

/** Rayon terrestre moyen (m) : l'abaissement de l'horizon en dépend. */
const EARTH_R = 6371000;

/**
 * En dessous, un repère n'est plus lointain.
 *
 * Le Scramble Square passe à cent mètres de la voie à Shibuya, la tour de Tokyo
 * à un kilomètre et demi de Hamamatsuchō. À cette distance, une découpe à plat
 * posée sur la sphère de l'horizon serait à la fois énorme et fausse - et c'est
 * de toute façon le domaine de three/Landmarks, qui pose des volumes le long de
 * la voie. La couche géographique s'efface donc en approchant.
 */
const NEAR_HIDE = 1000;
const NEAR_FULL = 2200;

/**
 * Portée de référence de l'air (m), pour une clarté de 1.
 *
 * L'extinction suit une exponentielle en distance - la loi de Beer, celle de la
 * brume de systems/Scene -, et cette échelle-ci est bien plus longue que la
 * portée de la brume de scène : la brume de scène ferme le décor à cinq cents
 * mètres, alors qu'un repère de cinq kilomètres reste parfaitement lisible par
 * temps clair à Tokyo. Les deux ne décrivent pas la même chose : l'une est un
 * mur de fin de décor, l'autre l'épaisseur réelle de l'atmosphère.
 *
 * Calage : par un janvier sec (clarté ≈ 1,3), la portée dépasse cinquante
 * kilomètres - la tour de Tokyo est franche, Yokohama se devine, le Fuji est un
 * fantôme. Par un août moite (clarté ≈ 0,7), elle tombe sous quinze : la tour
 * de Tokyo se voile, tout le reste a disparu.
 */
const AIR_RANGE = 30000;

/** Au-delà, il ne reste rien à peindre qui se distingue du ciel. */
const VEIL_MAX = 0.94;

/** Ton de chaque famille, et les repères qui ont le leur. */
const SHAPE_TONE: Record<GeoLandmark['shape'], string> = {
  tower: '#7f8da0',
  twin: '#818f9f',
  needle: '#8a8f98',
  mountain: '#8496ae',
  bridge: '#9aa3ac',
};
/** Neige de sommet : la seule couleur franche de tout l'horizon. */
const SNOW = new THREE.Color('#eef4fa');

const ID_TONE: Record<string, string> = {
  // La tour de Tokyo est peinte en orange international, obligation de
  // signalisation aérienne - c'est la seule tache chaude de tout l'horizon.
  'tokyo-tower': '#a87a63',
  // Le Skytree est gris-blanc « bleu ciel indigo », très clair de jour.
  skytree: '#9aa2ab',
  rainbow: '#a8b0b8',
};

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Combien de repères, du plus haut au plus modeste, selon le palier. */
function tuning(quality: Quality): number {
  const level = qualityLevel(quality);
  if (quality === 'extraordinary' || level <= 1) return GEO_LANDMARKS.length;
  if (level === 2) return 11;
  if (level === 3) return 7;
  // Aux deux derniers paliers, rien de neuf : c'est la règle de la passe.
  return 0;
}

interface Item {
  lm: GeoLandmark;
  body: THREE.Mesh;
  trim: THREE.Mesh | null;
  trimKind: TrimKind;
  bodyMat: THREE.MeshBasicMaterial;
  trimMat: THREE.MeshBasicMaterial | null;
  /** Ton de plein jour, avant l'heure et avant la brume. */
  tone: THREE.Color;
}

/**
 * Les repères par PRÉSENCE décroissante, et non par hauteur.
 *
 * C'est l'ordre dans lequel on coupe aux paliers modestes, et la hauteur seule
 * s'y trompe : la tour Landmark de Yokohama fait deux cent quatre-vingt-seize
 * mètres mais se tient à vingt-cinq kilomètres, où elle ne se devine que par un
 * hiver exceptionnel, tandis que la tour Cocoon en fait deux cents à trois cents
 * mètres du quai de Shinjuku, où elle occupe un quart du ciel. Ce qui compte est
 * donc le rapport de la hauteur à la distance la plus courte depuis la boucle -
 * amorti par une puissance, parce qu'un repère lointain garde de l'importance
 * quand il est colossal : le Fuji reste dans les sept premiers.
 */
const BY_PRESENCE = [...GEO_LANDMARKS].sort((a, b) => presence(b) - presence(a));

function presence(lm: GeoLandmark): number {
  let near = Infinity;
  for (const st of GEO_STATIONS) near = Math.min(near, Math.hypot(lm.x - st.x, lm.z - st.z));
  return lm.height / Math.pow(Math.max(300, near), 0.6);
}

function makeMat(color: THREE.Color): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    // Jamais testé ni écrit en profondeur, et jamais transparent : la couche se
    // glisse ainsi entre le ciel et le décor, dans la passe opaque, et tout ce
    // qui vient après la recouvre franchement.
    depthTest: false,
    depthWrite: false,
    transparent: false,
    fog: false,
    toneMapped: false,
  });
}

export function FarSkyline() {
  const scene = useThree((s) => s.scene);
  const quality = usePerf((s) => s.quality);
  const count = tuning(quality);

  const built = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const items: Item[] = [];
    for (const lm of BY_PRESENCE.slice(0, count)) {
      const s = makeSilhouette(lm.shape);
      geos.push(s.body);
      const tone = new THREE.Color(ID_TONE[lm.id] ?? SHAPE_TONE[lm.shape]);
      const bodyMat = makeMat(tone);
      const body = new THREE.Mesh(s.body, bodyMat);
      body.name = `horizon ${lm.id}`;
      let trim: THREE.Mesh | null = null;
      let trimMat: THREE.MeshBasicMaterial | null = null;
      if (s.trim) {
        geos.push(s.trim);
        trimMat = makeMat(new THREE.Color('#ffffff'));
        trim = new THREE.Mesh(s.trim, trimMat);
      }
      items.push({ lm, body, trim, trimKind: s.trimKind, bodyMat, trimMat, tone });
    }
    return { items, geos };
  }, [count]);

  useEffect(
    () => () => {
      for (const it of built.items) {
        it.bodyMat.dispose();
        it.trimMat?.dispose();
      }
      for (const g of built.geos) g.dispose();
    },
    [built],
  );

  const scratch = useMemo(
    () => ({
      pose: makePose(),
      sight: { azimuth: 0, distance: 0 } as Sight,
      haze: new THREE.Color('#d6e8f2'),
      col: new THREE.Color(),
    }),
    [],
  );

  useFrame(() => {
    if (!built.items.length) return;
    const sc = scratch;
    const { index, phase, loopDirection } = useStore.getState();

    // Où l'on est vraiment sur la boucle, et vers où l'on roule. La progression
    // est celle du trajet en cours, la même que lisent le ciel, les annonces et
    // le quai : une seule source de vérité pour toute la scène.
    const p = journeyProgress(phase, runtime.phaseT, index, loopDirection);
    loopPose(index, p, loopDirection, sc.pose);

    const w = dayNightWeights(runtime.clockMin / 60);
    const night = Math.min(1, w.night + w.golden * 0.4);
    const se = seasonNow();
    // L'épaisseur de l'air : la clarté de la saison, moins ce que le temps lui
    // retire. C'est le même produit qui commande la portée de la brume de scène
    // et le voile du ciel - trois couches, un seul air.
    const air = Math.max(0.15, se.clarity * weather.visibility * (1 - 0.75 * weather.cloud));
    const range = AIR_RANGE * Math.pow(air, 1.8);
    if (scene.fog instanceof THREE.Fog) sc.haze.copy(scene.fog.color);

    for (const it of built.items) {
      sightTo(sc.pose, it.lm.x, it.lm.z, sc.sight);
      const d = sc.sight.distance;

      // L'abaissement de l'horizon : la flèche de l'arc terrestre sur la
      // distance parcourue. Négligeable à cinq kilomètres (deux mètres), elle
      // enterre sept cent quatre-vingts mètres de Fuji à cent kilomètres, et
      // c'est elle qui fait qu'on n'en voit jamais le pied.
      const drop = (d * d) / (2 * EARTH_R);
      const veil = Math.max(
        1 - Math.exp(-d / range),
        1 - smoothstep(NEAR_HIDE, NEAR_FULL, d),
      );
      const show = veil < VEIL_MAX;
      it.body.visible = show;
      if (it.trim) it.trim.visible = false;
      if (!show) continue;

      // Taille angulaire, lue sur la sphère de pose : une hauteur de structure
      // vaut RS × h / d unités de scène.
      const unit = (RS * it.lm.height) / d;
      const az = sc.sight.azimuth;
      const x = RS * Math.sin(az);
      const z = -RS * Math.cos(az);
      const y = -(RS * drop) / d;
      it.body.position.set(x, y, z);
      // La découpe se tourne vers l'œil : sa normale (+z local) doit regarder
      // l'origine, d'où l'angle opposé au relèvement.
      it.body.rotation.y = -az;
      it.body.scale.set(unit, unit, 1);
      // Les repères lointains se peignent avant les proches : sans cet ordre,
      // deux tours qui se chevauchent - le bureau métropolitain et le Park
      // Tower depuis Yoyogi - se départageraient au hasard des matériaux.
      it.body.renderOrder = -900 - Math.min(39, Math.round(d / 2600));

      // Le ton : le jour l'assombrit un peu, la nuit franchement - un repère
      // lointain est une masse noire sur la lueur de la ville -, puis la brume
      // le mange. Pas d'opacité : ce mélange-ci se fait dans la couleur.
      sc.col.copy(it.tone).multiplyScalar(1 - 0.55 * night);
      it.bodyMat.color.copy(sc.col).lerp(sc.haze, veil);

      if (!it.trim || !it.trimMat) continue;
      it.trim.position.copy(it.body.position);
      it.trim.rotation.y = it.body.rotation.y;
      it.trim.scale.copy(it.body.scale);
      it.trim.renderOrder = it.body.renderOrder + 0.5;
      if (it.trimKind === 'snow') {
        // La neige du Fuji : présente d'octobre à juin, absente au cœur de
        // l'été - le sommet est alors de la même roche brune que le reste, et
        // la montagne devient presque invisible dans la moiteur.
        const snow = 1 - se.heat;
        it.trim.visible = snow > 0.05;
        sc.col.copy(it.tone).lerp(SNOW, snow).multiplyScalar(1 - 0.72 * night);
        it.trimMat.color.copy(sc.col).lerp(sc.haze, veil);
      } else {
        // Feux d'obstacle et éclairage de tablier : la nuit seulement, et sans
        // brume - un point lumineux traverse l'air bien mieux qu'une masse
        // sombre, c'est pour cela qu'on met des feux au sommet des tours.
        const lit = night * (1 - 0.6 * veil);
        it.trim.visible = lit > 0.06;
        const base = it.trimKind === 'beacon' ? '#ff3b30' : '#ffe6b8';
        it.trimMat.color.set(base).multiplyScalar(lit);
      }
    }
  });

  if (!built.items.length) return null;
  // Le groupe est posé À HAUTEUR D'ŒIL : c'est de là que part l'horizon, et le
  // pied des repères s'y appuie. Un groupe au niveau du plancher les ferait
  // tous plonger d'un degré.
  return (
    <group position={[0, CONFIG.eyeHeight, 0]}>
      {built.items.map((it) => (
        <group key={it.lm.id}>
          <primitive object={it.body} />
          {it.trim ? <primitive object={it.trim} /> : null}
        </group>
      ))}
    </group>
  );
}
