// Retour au rendu procédural quand un GLB manque ou ne se lit pas.
//
// `useGLTF` échoue PENDANT le rendu : ni un try/catch ni un état ne le
// rattrapent, il faut une frontière d'erreur React. Elle était écrite deux fois
// à l'identique - une pour les PNJ de la rame, une pour la foule du quai - et
// le vendeur des commerces en aurait fait une troisième. Une seule suffit : ce
// qui change d'un appel à l'autre est le message d'avertissement, et c'est un
// paramètre.

import { Component, type ReactNode } from 'react';

interface Props {
  /** Ce qu'on n'a pas pu charger, pour l'avertissement en console. */
  what: string;
  fallback: ReactNode;
  children: ReactNode;
}

export class ModelErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.warn(`${this.props.what} illisibles, rendu procédural :`, error);
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
