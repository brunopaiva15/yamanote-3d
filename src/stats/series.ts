// Ce que l'histogramme dessine : une série, et le nom qu'on lui donne.
//
// Un fichier pour trois déclarations, parce qu'elles sont partagées entre la
// page et le graphique et qu'un module qui exporte à la fois un composant et
// une constante perd le rafraîchissement à chaud de Vite (oxlint le signale).
// C'est aussi ce qui garde `Chart.tsx` à une seule chose : dessiner.

/** Deux façons de compter les gens, et elles ne disent pas la même chose. */
export type Metric = 'visitors' | 'sessions';

export const METRIC_LABEL: Record<Metric, string> = {
  visitors: 'visiteurs',
  sessions: 'sessions',
};

/** Un créneau de l'axe, ses deux comptes - zéros compris. */
export interface Point {
  date: Date;
  visitors: number;
  sessions: number;
}
