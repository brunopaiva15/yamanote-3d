// Est-ce que la toile est VIVANTE ?
//
// Sur téléphone, il arrive - pas toujours, et c'est bien le problème - que le
// navigateur refuse purement et simplement le contexte WebGL au moment où l'on
// monte à bord : mémoire déjà prise par les autres onglets, processus graphique
// occupé, contexte de trop. `new THREE.WebGLRenderer()` lève alors « Error
// creating WebGL context. »
//
// Cette exception-là était PERDUE. react-three-fiber crée le renderer dans une
// fonction `async` qu'il n'attend pas : le rejet part en promesse non gérée, la
// scène n'est jamais rendue, la boucle d'images ne démarre pas - et comme le
// HUD est posé À CÔTÉ de la toile et non dedans, il s'affiche parfaitement, sur
// l'état que `prepareGame` venait de préparer. Le joueur voit sa gare, sa
// température, son taux de remplissage, un fond noir, et plus rien ne bouge.
// Jamais. Le seul remède était de recharger la page à la main.
//
// Ce module porte la question à voix haute. Le refus est signalé au lieu d'être
// avalé, la toile est REMONTÉE une ou deux fois sur une toile neuve (un canvas
// à qui l'on a déjà refusé un contexte n'en obtiendra plus : il faut en changer)
// et, si le navigateur s'entête, on le dit au joueur avec un bouton plutôt que
// de le laisser devant un écran noir.

import { create } from 'zustand';

/** Combien de fois on remonte la toile avant de rendre les armes. */
export const MAX_RENDER_ATTEMPTS = 3;

/**
 * Délai avant de retenter (ms).
 *
 * Un refus est presque toujours passager : c'est de la place qui manque à cet
 * instant précis. Laisser respirer le processus graphique - et le ramasse-
 * miettes récupérer la scène de la tentative avortée - vaut mieux que de
 * redemander dans la foulée.
 */
export const RETRY_DELAY = 700;

/**
 * Au-delà de ce délai sans la moindre image, on considère que la toile est
 * morte même si personne n'a rien signalé (ms).
 *
 * Le refus de contexte est le cas connu, mais ce n'est pas le seul qui laisse
 * un écran noir sous un HUD intact : une toile mesurée à zéro, un pilote qui
 * rend la main sans lever d'exception… Le filet est là pour eux.
 */
export const RENDER_WATCHDOG = 20000;

export type RenderStatus =
  /** La toile dessine, ou n'a pas encore eu le temps de prouver le contraire. */
  | 'ok'
  /** Le contexte a été refusé : on remonte une toile neuve. */
  | 'retrying'
  /** Le navigateur s'entête : à ce stade, seul le joueur peut décider. */
  | 'failed';

interface RenderHealthState {
  status: RenderStatus;
  /**
   * La toile courante a-t-elle dessiné au moins une image ?
   *
   * C'est ce drapeau, et lui seul, qui désarme le chien de garde. Le compte des
   * tentatives ne suffirait pas : il retombe à un dès la première image, sans
   * que rien ne dise à la minuterie déjà lancée qu'elle n'a plus lieu d'être -
   * elle finissait par sonner sur une toile en parfait état de marche, et le jeu
   * se remontait tout seul toutes les vingt secondes.
   */
  alive: boolean;
  /**
   * Numéro de la toile courante. Il entre dans la `key` du <Canvas> : le faire
   * avancer jette l'ancienne toile et en crée une neuve, ce qui est la seule
   * façon de redemander un contexte à un navigateur qui vient d'en refuser un.
   */
  generation: number;
  /** Nombre de tentatives déjà consommées, la première comprise. */
  attempts: number;
  /** Ce que le navigateur a répondu, quand il a daigné le dire. */
  reason: string | null;
}

export const useRenderHealth = create<RenderHealthState>(() => ({
  status: 'ok',
  alive: false,
  generation: 0,
  attempts: 1,
  reason: null,
}));

/**
 * Une image vient d'être dessinée : la toile est vivante, quoi qu'on ait cru.
 *
 * Appelée à CHAQUE image (three/RenderBootSignal) : elle doit donc ne rien
 * faire du tout dans le cas courant, sous peine de faire re-rendre React
 * soixante fois par seconde.
 */
export function markRenderAlive(): void {
  const { alive, status, attempts, reason } = useRenderHealth.getState();
  if (alive && status === 'ok' && attempts === 1 && reason === null) return;
  useRenderHealth.setState({ alive: true, status: 'ok', attempts: 1, reason: null });
}

/**
 * La toile n'a pas pu démarrer.
 *
 * Tant qu'il reste des tentatives, on ne dit rien au joueur : on remonte. Le
 * message n'arrive qu'une fois qu'on n'a plus rien à essayer - un avertissement
 * suivi d'une reprise réussie n'aurait fait qu'inquiéter pour rien.
 */
export function reportRenderFailure(reason?: string | null): void {
  const { status, attempts } = useRenderHealth.getState();
  // Un même échec peut être signalé deux fois (l'exception ET le chien de
  // garde) : la première tranche, la seconde ne doit pas consommer une
  // tentative de plus.
  if (status !== 'ok') return;
  const next = attempts + 1;
  useRenderHealth.setState({
    status: next > MAX_RENDER_ATTEMPTS ? 'failed' : 'retrying',
    alive: false,
    attempts: next,
    reason: reason ?? null,
  });
}

/** Remonter une toile neuve, après un refus ou à la demande du joueur. */
export function remountRenderer(): void {
  useRenderHealth.setState((s) => ({
    status: 'ok',
    alive: false,
    generation: s.generation + 1,
    reason: s.reason,
    attempts: s.attempts,
  }));
}

/** Le joueur redemande explicitement : le compteur de tentatives repart. */
export function retryRenderer(): void {
  useRenderHealth.setState((s) => ({
    status: 'ok',
    alive: false,
    generation: s.generation + 1,
    attempts: 1,
    reason: null,
  }));
}

/**
 * Attributs de contexte de la n-ième tentative.
 *
 * On redemande MOINS à chaque fois. Le multi-échantillonnage et la préférence
 * pour la carte rapide sont exactement ce qu'un navigateur à court de mémoire
 * refuse en premier ; une toile sans antialiasing reste une toile, et le joueur
 * préfère de loin des bords un peu durs à un écran noir.
 */
export function contextAttemptOptions(attempt: number): {
  antialias: boolean;
  powerPreference: WebGLPowerPreference;
} {
  return attempt <= 1
    ? { antialias: true, powerPreference: 'high-performance' }
    : { antialias: false, powerPreference: 'default' };
}
