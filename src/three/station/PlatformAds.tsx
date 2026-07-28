// Publicité de quai.
//
// Un quai japonais n'est pas une nappe de béton clair : c'est un couloir tapissé
// d'affiches. Caissons lumineux au mur du fond, colonnes habillées de bandeaux
// verticaux, bannières suspendues dans l'axe, panneaux collés sur les portes
// palières. Sans eux, la gare rendait exactement ce que le joueur a signalé —
// blanc et gris d'un bout à l'autre.
//
// Les visuels viennent du pool commun (adPool) : construits une fois pour la
// session, seul leur agencement change d'une gare à l'autre.

import { useMemo } from 'react';
import { PLATFORM_TOP, PSD_X } from '../../data/stationGeometry';
import type { StationLayout } from '../../data/stationLayouts';
import { gantryZs, type StationPlacement } from '../../systems/stationPlacement';
import { adPool, stationAd } from './adPool';

interface Props {
  place: StationPlacement;
  layout: StationLayout;
  /** Murets pleins des portes palières, pour y coller des affiches. */
  segs: { z0: number; z1: number }[];
  station: number;
  /** Palier de qualité : plus il monte, moins on garde de familles d'affiches. */
  detail: number;
}

export function PlatformAds({ place, layout, segs, station, detail }: Props) {
  const p = adPool();
  const backX = place.backX;
  const half = layout.length / 2;
  const midX = PSD_X + layout.depth * 0.55;

  /**
   * Y a-t-il un vrai mur derrière ? Seulement à Harajuku, le quai latéral de la
   * boucle : le caisson s'y encastre. Partout ailleurs on est sur un îlot, et
   * les caissons se dressent sur pieds au milieu, DOS À DOS — c'est la façon
   * dont un îlot japonais se meuble, et ce qui fait qu'on ne voit jamais l'autre
   * bord en enfilade.
   */
  const onWall = place.hasBackWall;

  // --- Bannières suspendues dans l'axe -------------------------------
  // Elles passent à l'aplomb des trémies et des escaliers mécaniques : au droit
  // de l'un d'eux, la bannière traverserait le fléchage de sortie ou la gaine.
  // Et au large des tableaux d'affichage, suspendus à la même hauteur de
  // l'autre côté de l'épine (à ±45 % du quai, voir PlatformSignage).
  const hanging = useMemo(() => {
    if (detail > 1) return [];
    const clear = [
      ...[...place.stairs, ...place.escalators].map((s) => ({ z: s.z, r: s.halfZ + 2.2 })),
      ...[-1, 1].map((d) => ({ z: d * half * 0.45, r: 3.1 })),
      // Plans de la charpente signature : passerelles de Takanawa, poteaux de
      // halle sur l'épine — la bannière passait au travers.
      ...(layout.sigPlan?.keepOut ?? []).map((k) => ({ z: k.z, r: k.r + 1.2 })),
    ];
    const out: { z: number; i: number }[] = [];
    for (let z = -half + 18; z <= half - 18; z += 26) {
      if (clear.some((c) => Math.abs(z - c.z) < c.r)) continue;
      out.push({ z, i: out.length });
    }
    return out;
  }, [half, detail, place.stairs, place.escalators, layout.sigPlan]);

  // --- Caissons du fond de quai --------------------------------------
  const wallAds = useMemo(() => {
    // Tout ce qui monte assez haut pour masquer l'affiche — ou pour la
    // traverser. La liste ne connaissait ni les armoires ni les escaliers
    // mécaniques : le caisson leur rentrait dedans. Ni les potences
    // d'orientation, qui enjambent l'épine à hauteur du caisson : leurs
    // panneaux de sortie lui passaient au travers.
    const blockers = [
      ...place.vending.map((v) => ({ z: v.z, r: v.halfZ + 1.3 })),
      ...place.cabinets.map((c) => ({ z: c.z, r: c.halfZ + 1.3 })),
      ...(place.kiosk ? [{ z: place.kiosk.z, r: place.kiosk.halfZ + 1.6 }] : []),
      ...(place.elevator ? [{ z: place.elevator.z, r: place.elevator.halfZ + 1.6 }] : []),
      ...place.stairs.map((s) => ({ z: s.z, r: s.halfZ + 1.3 })),
      ...place.escalators.map((e) => ({ z: e.z, r: e.halfZ + 1.3 })),
      ...gantryZs(place).map((z) => ({ z, r: 1.3 })),
      // Poteaux de charpente plantés sur l'épine (Shimbashi, Ebisu, Takanawa) :
      // le caisson dos à dos s'y encastrait.
      ...(layout.sigPlan?.posts ?? []).map((s) => ({ z: s.z, r: 1.5 })),
    ];
    const out: { z: number; i: number }[] = [];
    const step = 10.5;
    // Décalé d'un demi-entraxe de pilier : une affiche derrière un poteau ne se
    // lit pas.
    const phase = layout.columnSpacing / 2;
    for (let z = -half + 7 + phase; z <= half - 7; z += step) {
      if (blockers.some((b) => Math.abs(z - b.z) < b.r)) continue;
      out.push({ z, i: out.length });
    }
    return out;
  }, [layout.columnSpacing, layout.sigPlan, half, place]);

  // --- Bandeaux verticaux sur les piliers ----------------------------
  const columnAds = useMemo(
    () => (detail > 1 ? [] : place.columns.map((z, i) => ({ z, i }))),
    [place.columns, detail],
  );

  // --- Affiches collées sur les murets de portes palières ------------
  // Un muret sur deux, et seulement les plus larges : les chutes de trame ne
  // reçoivent rien.
  const psdAds = useMemo(() => {
    if (detail > 2) return [];
    // Sans portes de quai, il n'y a pas d'allège où les coller : elles
    // flotteraient au-dessus du vide, le long du bord.
    if (layout.psd === 'none') return [];
    const out: { z: number; i: number }[] = [];
    segs.forEach((s, k) => {
      if (k % 2 !== 1) return;
      if (s.z1 - s.z0 < 1.7) return;
      out.push({ z: (s.z0 + s.z1) / 2, i: out.length });
    });
    return out;
  }, [segs, detail, layout.psd]);

  return (
    <group name="publicité">
      {/* Caissons lumineux du fond de quai : monture noire, visuel rétroéclairé.
          Calés au-dessus du liseré qui couronne la faïence (1,10 m) et du
          dossier des bancs — rien ne vient mordre l'affiche. */}
      {wallAds.map(({ z, i }) => (
        <group
          name="caisson-mur"
          key={`wa${z}`}
          position={[onWall ? backX - 0.09 : backX - 0.17, PLATFORM_TOP + (onWall ? 1.88 : 2.02), z]}
        >
          <mesh material={p.frame}>
            <boxGeometry args={[0.1, 1.36, 2.16]} />
          </mesh>
          <mesh position={[-0.055, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={stationAd(station, i)}>
            <planeGeometry args={[2.0, 1.2]} />
          </mesh>
          {/* Sans mur derrière : le caisson est un totem à deux faces, planté
              sur l'épine centrale, et il porte donc une affiche de CHAQUE côté —
              celle du bord d'en face n'est pas la nôtre. Deux pieds le tiennent. */}
          {!onWall && (
            <>
              <mesh position={[0.055, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={stationAd(station, i + 9)}>
                <planeGeometry args={[2.0, 1.2]} />
              </mesh>
              {[-1, 1].map((d) => (
                <mesh key={d} position={[0.02, -1.06, d * 0.9]} material={p.frame}>
                  <boxGeometry args={[0.08, 0.76, 0.08]} />
                </mesh>
              ))}
            </>
          )}
        </group>
      ))}

      {/* Colonnes habillées : un bandeau vertical côté voie, et un second côté
          d'en face quand la colonne se dresse au milieu d'un îlot. */}
      {columnAds.map(({ z, i }) => (
        <group name="bandeau-pilier" key={`ca${z}`} position={[backX - 0.71, PLATFORM_TOP + 1.55, z]}>
          <mesh position={[0.015, 0, 0]} material={p.housing}>
            <boxGeometry args={[0.03, 1.18, 0.3]} />
          </mesh>
          <mesh position={[-0.006, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={stationAd(station, i, true)}>
            <planeGeometry args={[0.27, 1.1]} />
          </mesh>
          {!onWall && (
            <mesh
              position={[0.336, 0, 0]}
              rotation={[0, Math.PI / 2, 0]}
              material={stationAd(station, i + 5, true)}
            >
              <planeGeometry args={[0.27, 1.1]} />
            </mesh>
          )}
        </group>
      ))}

      {/* Bannières suspendues, recto-verso : elles ferment la perspective du
          quai comme les nakazuri ferment celle du wagon. Sur un îlot elles
          pendent au-dessus de l'allée du bord d'EN FACE — la seule travée sans
          gouttière ni chemin de câbles : dans l'allée près, leur chant montait
          droit dans les conduites, à toutes les gares. Elles meublent du même
          coup une moitié de quai qui n'avait rien de suspendu. Sur le quai
          latéral d'Harajuku, l'allée près est assez large pour les garder. */}
      {hanging.map(({ z, i }) => (
        <group
          name="bannière"
          key={`ha${z}`}
          position={[onWall ? midX - 1.5 : backX + 1.25, layout.canopyY - 0.62, z]}
        >
          {[-1, 1].map((d) => (
            <mesh key={d} position={[d * 1.0, 0.42, 0]} material={p.frame}>
              <boxGeometry args={[0.04, 0.62, 0.04]} />
            </mesh>
          ))}
          <mesh material={p.frame}>
            <boxGeometry args={[2.3, 0.82, 0.05]} />
          </mesh>
          <mesh position={[0, 0, 0.031]} material={stationAd(station, i + 4)}>
            <planeGeometry args={[2.2, 0.72]} />
          </mesh>
          <mesh position={[0, 0, -0.031]} rotation={[0, Math.PI, 0]} material={stationAd(station, i + 7)}>
            <planeGeometry args={[2.2, 0.72]} />
          </mesh>
        </group>
      ))}

      {/* Portes palières : bandeau publicitaire sur l'allège, sous la partie
          vitrée du muret — c'est la seule surface pleine disponible. */}
      {psdAds.map(({ z, i }) => (
        <mesh
          key={`pa${z}`}
          position={[PSD_X + 0.056, PLATFORM_TOP + 0.37, z]}
          rotation={[0, Math.PI / 2, 0]}
          material={stationAd(station, i + 2)}
        >
          <planeGeometry args={[1.6, 0.5]} />
        </mesh>
      ))}
    </group>
  );
}
