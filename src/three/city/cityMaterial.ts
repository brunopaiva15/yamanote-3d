// Matériau du ruban urbain : un MeshLambertMaterial instancié, dérivé pour que
// la trame de façade se mesure EN MÈTRES et non en fraction de bâtiment.
//
// Le nuanceur reconstitue, dans le sommet, les dimensions réelles de l'instance
// depuis `instanceMatrix`, puis choisit l'UV selon la face : le long de la voie
// sur les pignons, en profondeur sur les faces qui regardent les rails, à plat
// sur les toitures. Un étage fait donc trois mètres partout, sur une tour de
// cinquante comme sur une échoppe de six - c'est cette constance qui donne une
// TAILLE aux bâtiments, ce qu'aucune silhouette peinte ne peut faire.
//
// Trois échantillons cohabitent, choisis par la géométrie et non par un
// embranchement de données : toiture au-dessus, devanture sous trois mètres,
// façade partout ailleurs.
//
// Le jour et la nuit ne sont plus deux jeux de textures fondus l'un dans
// l'autre : la ville est ÉCLAIRÉE (soleil, hémisphérique, ambiante de
// three/Scene), et la nuit n'ajoute que l'émissif - fenêtres qui s'allument par
// paquets, vitrines, néons.

import * as THREE from 'three';
import {
  FACADE_TILE,
  ROOF_TILE,
  SOCLE_TILE,
  makeFacadeTexture,
  makeRoofTexture,
  makeSocleTexture,
} from '../../textures/city';

export interface CityMaterial {
  material: THREE.MeshLambertMaterial;
  /** 0..1 : proportion de nuit, pilotée chaque frame. */
  night: { value: number };
  /** 0..1 : surfaces mouillées - elles foncent, et elles renvoient. */
  wet: { value: number };
  /** 0..1 : neige posée sur ce qui regarde le ciel. */
  snow: { value: number };
  dispose(): void;
}

export function makeCityMaterial(): CityMaterial {
  const facade = makeFacadeTexture();
  const roof = makeRoofTexture();
  const socle = makeSocleTexture();

  const night = { value: 0 };
  const wet = { value: 0 };
  const snow = { value: 0 };
  const uniforms = {
    uWet: wet,
    uSnow: snow,
    // La neige de ville n'est jamais blanche : elle prend tout de suite le gris
    // du ciel qui l'éclaire et la suie qui s'y pose.
    uSnowColor: { value: new THREE.Color('#dfe4ea') },
    uFacade: { value: facade },
    uRoof: { value: roof },
    uSocle: { value: socle },
    uFacTile: { value: FACADE_TILE },
    uRoofScale: { value: FACADE_TILE / ROOF_TILE },
    uSocTile: { value: new THREE.Vector2(SOCLE_TILE[0], SOCLE_TILE[1]) },
    uNight: night,
    uWinWarm: { value: new THREE.Color('#ffdca8').multiplyScalar(1.35) },
    uWinCool: { value: new THREE.Color('#d8e6ff').multiplyScalar(1.25) },
    uShopColor: { value: new THREE.Color('#ffc98a').multiplyScalar(1.15) },
    // Rebond de rue : une ville de nuit est éclairée par le bas - lampadaires,
    // vitrines, phares. Sans lui, les six premiers mètres d'une façade sont
    // plus sombres que ses étages, ce qui n'arrive jamais en ville.
    uStreetGlow: { value: new THREE.Color('#ffb877') },
  };

  const material = new THREE.MeshLambertMaterial({ color: '#ffffff', fog: true });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aJitter;
        attribute vec3 aAccent;
        // x = vigueur des enseignes, y = rez-de-chaussée commerçant,
        // z = volume NU (acrotère, édicule, chaussée) : teinte de couverture
        // sur toutes ses faces, ni fenêtres ni vitrine,
        // w = température des fenêtres (0 = néon de bureau, 1 = lampe).
        attribute vec4 aTrim;
        uniform float uFacTile;
        uniform vec2 uSocTile;
        varying vec2 vCityFac;
        varying vec2 vCitySoc;
        varying float vCityUp;
        varying float vCityRoof;
        varying vec3 vCityAccent;
        varying vec4 vCityTrim;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 iScale = vec3(
            length(instanceMatrix[0].xyz),
            length(instanceMatrix[1].xyz),
            length(instanceMatrix[2].xyz));
        #else
          vec3 iScale = vec3(1.0);
        #endif
        vec3 cityLocal = position * iScale;
        vec3 cityN = abs(normal);
        vec2 cityUv;
        if (cityN.y > 0.5) cityUv = vec2(cityLocal.x, cityLocal.z);
        else if (cityN.x > 0.5) cityUv = vec2(cityLocal.z, cityLocal.y);
        else cityUv = vec2(cityLocal.x, cityLocal.y);
        vCityUp = cityLocal.y + iScale.y * 0.5;
        vCityRoof = step(0.5, cityN.y);
        vCityFac = (cityUv + aJitter) / uFacTile;
        vCitySoc = vec2((cityUv.x + aJitter.x) / uSocTile.x, vCityUp / uSocTile.y);
        vCityAccent = aAccent;
        vCityTrim = aTrim;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uFacade;
        uniform sampler2D uRoof;
        uniform sampler2D uSocle;
        uniform float uRoofScale;
        uniform vec2 uSocTile;
        uniform float uNight;
        uniform float uWet;
        uniform float uSnow;
        uniform vec3 uSnowColor;
        uniform vec3 uWinWarm;
        uniform vec3 uWinCool;
        uniform vec3 uShopColor;
        uniform vec3 uStreetGlow;
        varying vec2 vCityFac;
        varying vec2 vCitySoc;
        varying float vCityUp;
        varying float vCityRoof;
        varying vec3 vCityAccent;
        varying vec4 vCityTrim;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 cityFac = texture2D(uFacade, vCityFac);
        vec4 cityRof = texture2D(uRoof, vCityFac * uRoofScale);
        vec4 citySoc = texture2D(uSocle, vCitySoc);
        // Un volume nu se traite partout comme une couverture.
        float cityRoofish = max(vCityRoof, vCityTrim.z);
        // Devanture : les trois premiers mètres des faces verticales.
        float citySocle = (1.0 - cityRoofish) * (1.0 - step(uSocTile.y, vCityUp)) * vCityTrim.y;
        vec3 cityTone = mix(cityFac.rgb, cityRof.rgb, cityRoofish);
        cityTone = mix(cityTone, citySoc.rgb, citySocle);
        // Les palettes de quartier sont claires (elles font la teinte
        // d'ensemble) et la scène est vivement éclairée pour l'intérieur du
        // wagon : sans ce coefficient, toute face au soleil sature en blanc et
        // la ville perd son relief.
        diffuseColor.rgb *= cityTone * 0.72;
        // Bandeau d'enseigne et store : teinte du quartier, pas de la façade.
        float cityAccentMask = citySocle
          * smoothstep(0.20, 0.30, citySoc.a)
          * (1.0 - smoothstep(0.45, 0.56, citySoc.a));
        diffuseColor.rgb = mix(diffuseColor.rgb, vCityAccent, cityAccentMask * 0.62);
        // Une ville de nuit n'est pas une ville de jour moins éclairée : les
        // façades y sont franchement sombres et ce sont les ouvertures qui
        // portent la lumière. Les seules lumières de la scène (soleil rasant,
        // hémisphérique, ambiante) laissaient les murs à mi-gris.
        diffuseColor.rgb *= mix(1.0, 0.46, uNight);
        // Mouillé : une surface humide fonce, parce qu'une pellicule d'eau
        // renvoie en miroir au lieu de diffuser. Ça se voit d'abord sur ce qui
        // regarde le ciel - toiture, chaussée, acrotère -, et à peine sur une
        // façade verticale, où l'eau ne stagne pas.
        diffuseColor.rgb *= 1.0 - 0.34 * uWet * mix(0.25, 1.0, cityRoofish);
        // Neige : elle se pose sur ce qui regarde le ciel, JAMAIS sur un mur.
        // Le nuanceur sait déjà distinguer les deux, il le fait depuis la
        // première tuile de toiture.
        diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, uSnow * cityRoofish * 0.92);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Fenêtres : chaque vitrage porte un tirage stable dans l'alpha de la
        // texture ; le seuil descend avec la nuit, les étages s'allument donc
        // par paquets au fil de la soirée plutôt que tous d'un coup.
        float cityWin = cityFac.a * (1.0 - cityRoofish) * (1.0 - citySocle);
        float cityWinOn = step(0.03, cityWin) * step(1.0 - 0.8 * uNight, cityWin);
        float cityGlass = citySocle
          * smoothstep(0.62, 0.70, citySoc.a)
          * (1.0 - smoothstep(0.84, 0.93, citySoc.a));
        float cityNeon = citySocle * smoothstep(0.93, 1.0, citySoc.a);
        vec3 cityWinCol = mix(uWinCool, uWinWarm, vCityTrim.w);
        vec3 cityEmit = cityWinCol * cityWinOn * uNight;
        cityEmit += uShopColor * cityGlass * (0.10 + 0.85 * uNight) * vCityTrim.x;
        cityEmit += vCityAccent * cityNeon * (0.05 + 1.5 * uNight) * vCityTrim.x;
        // Rebond de rue : décroissance rapide sur les trois ou quatre premiers
        // mètres, sur les seules faces verticales. La portée compte autant que
        // l'intensité - étalée sur six mètres, elle éclairait la façade ENTIÈRE
        // d'un quartier bas, et Nishi-Nippori s'allumait comme en plein jour.
        float cityBounce = exp(-vCityUp * 0.34) * (1.0 - cityRoofish);
        // Une chaussée mouillée RENVOIE : sous la pluie, la nuit, le pied des
        // façades reçoit deux fois plus de lumière de la rue qu'à sec. C'est ce
        // qui fait qu'une ville sous l'averse est plus lumineuse au ras du sol,
        // et non plus sombre.
        cityEmit += uStreetGlow * cityBounce * uNight * (0.26 + 0.3 * uWet);
        totalEmissiveRadiance += cityEmit;`,
      );
  };
  // Une seule variante de programme : la clé de cache doit rester constante.
  material.customProgramCacheKey = () => 'yamanote-city';

  return {
    material,
    night,
    wet,
    snow,
    dispose() {
      material.dispose();
      facade.dispose();
      roof.dispose();
      socle.dispose();
    },
  };
}
