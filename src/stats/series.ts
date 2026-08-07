// Ce que l'histogramme dessine.
//
// Un fichier pour deux déclarations, parce qu'elles sont partagées entre la page
// et le graphique et qu'un module qui exporte à la fois un composant et une
// constante perd le rafraîchissement à chaud de Vite (oxlint le signale). C'est
// aussi ce qui garde `Chart.tsx` à une seule chose : dessiner.

/**
 * Le nom de la seule série mesurée.
 *
 * Une session est un onglet ouvert, pas une personne : le module de mesure ne
 * dépose rien sur l'appareil, il ne peut donc pas savoir si quelqu'un revient.
 * Le mot est choisi pour ne pas laisser croire l'inverse - « visiteurs » aurait
 * été plus flatteur et plus faux.
 */
export const SERIE_LABEL = 'sessions';

/** Un créneau de l'axe et son compte - zéros compris. */
export interface Point {
  date: Date;
  sessions: number;
}
