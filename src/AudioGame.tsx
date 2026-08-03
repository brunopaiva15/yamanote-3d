// La version sonore : le même trajet, sans une seule image de trois dimensions.
//
// Ce module est la racine du morceau chargé quand `store.mode` vaut `audio`
// (systems/gameMode). Il ne doit RIEN importer de `@react-three/*` ni de three,
// et c'est sa contrainte principale : une machine qui choisit cette version le
// fait souvent parce qu'elle ne peut pas ouvrir de contexte WebGL, ou parce
// qu'elle ne veut pas en payer le prix. Lui faire télécharger un moteur de
// rendu pour ne rien dessiner serait manquer le sujet. Le morceau construit ne
// contient donc pas une ligne de three.js - c'est vérifié au build.
//
// Il n'y a ni toile, ni voile d'attente, ni chien de garde de rendu : rien
// n'est à attendre. Le graphe audio est déjà construit (systems/startGame,
// appelé par le menu avant d'embarquer), il ne manque que la mesure - et c'est
// systems/audioLoop qui la donne, en requestAnimationFrame.
//
// CE QU'ON VOIT, et pourquoi : l'écran que le voyageur a réellement au-dessus
// de la porte. Le vrai afficheur de l'E235, peint par le même code que les
// dalles de la rame et cadencé par la même rotation, dans une balise `canvas`
// plutôt que sur une texture. Autour de lui, rien qui n'existe dans un train :
// la réglette de porte, l'heure et l'état du HUD, les sous-titres. Une version
// « simplifiée » n'est pas une version où l'on invente une autre interface -
// c'est le même train, avec l'image en moins et le texte en plus.

import { useEffect, useRef } from 'react';
import { CONFIG } from './data/config';
import { applyThemeColor } from './i18n/documentMeta';
import { setListenerPose } from './systems/audioEngine';
import { startAudioLoop, stopAudioLoop } from './systems/audioLoop';
import { Hud } from './ui/Hud';
import { Subtitles } from './ui/Subtitles';
import { AnnouncementLog } from './ui/audio/AnnouncementLog';
import { DoorState } from './ui/audio/DoorState';
import { LineScreen } from './ui/audio/LineScreen';

/**
 * Où se tient l'auditeur, faute de caméra pour le dire.
 *
 * Une place assise au milieu de la voiture, et elle ne bouge jamais : la
 * version sonore n'a pas de corps à déplacer. C'est la pose par défaut du
 * moteur audio, celle sur laquelle tout le mixage a été calé - la distance aux
 * diffuseurs de plafond, ce que les portes laissent passer, le niveau de la
 * 発車メロディ entendue de l'intérieur. Elle est posée explicitement : sans
 * elle, Tone laisserait l'auditeur à l'origine, tourné vers un axe qui n'est
 * pas celui du wagon, et le panoramique de toute la sonorisation serait faux
 * d'un demi-tour.
 */
/**
 * Le haut de la paroi, tel que le dégradé de fond le pose (styles.css,
 * `.app-audio`). Recopié plutôt que lu : une valeur de teinte de barre d'état
 * doit être un littéral au moment où on la pose, et le dégradé n'a pas de
 * couleur unique à interroger.
 */
const AUDIO_THEME_COLOR = '#f0efe9';

function seatListener(): void {
  setListenerPose(0, CONFIG.eyeHeight, 4.2, 0, 0, -1, 0, 1, 0);
}

export default function AudioGame() {
  // La baie entière - dalle et réglette - est ce qu'on met en grand : sur la
  // rame elles ne se séparent pas, et l'état des portes reste utile quand
  // l'afficheur occupe tout l'écran.
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    seatListener();
    startAudioLoop();
    // La barre d'état du téléphone prend la couleur de la paroi : c'est le haut
    // de la même surface, et un bandeau sombre l'y coupait en deux.
    applyThemeColor(AUDIO_THEME_COLOR);
    return () => {
      stopAudioLoop();
      applyThemeColor(null);
    };
  }, []);

  return (
    <>
      <div className="audio-screen">
        {/* La dalle et sa réserve blanche, comme au-dessus d'une porte : sur la
            rame, l'écran n'est pas posé sur la paroi, il y est ENCASTRÉ. */}
        <div className="lcd-mount" ref={mount}>
          <LineScreen />
          <DoorState fullscreenTarget={mount} />
        </div>
        <AnnouncementLog />
      </div>
      {/* Le HUD est celui de l'autre version, à ceci près qu'il se tait sur ce
          qui n'existe pas ici (qualité vidéo, s'asseoir) : l'horloge, la
          vitesse, le temps qu'il fait, le remplissage et la phase sont les
          mêmes valeurs, lues au même endroit. */}
      <Hud />
      <Subtitles />
    </>
  );
}
