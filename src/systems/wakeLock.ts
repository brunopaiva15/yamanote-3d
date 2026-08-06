// L'écran qui ne doit pas s'éteindre tant qu'on est à bord.
//
// Le défaut, tel qu'il se vit : sur iPhone, le verrouillage automatique tombe
// au bout de trente secondes par défaut. Or cette expérience se regarde et
// s'écoute sans qu'on la TOUCHE - on est assis dans la rame, la ville défile,
// les annonces se succèdent - et le système, lui, ne voit qu'un téléphone posé
// sur lequel personne n'appuie. Il éteint. C'est exactement l'inverse de ce
// qu'on est venu chercher : l'immersion s'arrête sur un écran noir, et il faut
// déverrouiller pour reprendre.
//
// Sur la version SONORE, la conséquence est pire encore qu'une image perdue :
// iOS suspend le contexte audio quand l'écran se verrouille (voir le filet de
// `watchContextState` dans systems/audioEngine, écrit pour ce cas précis). La
// ligne ne se contente pas de disparaître, elle se TAIT. Le verrou d'écran vaut
// donc pour les deux versions, et pas seulement pour celle qui a des images.
//
// Le remède standard est l'API Screen Wake Lock : `navigator.wakeLock`, servie
// par Safari iOS depuis 16.4, par Chrome et par Firefox. Elle demande au
// système de ne pas éteindre l'écran tant qu'on tient le jeton. Ce n'est pas un
// plein écran déguisé et ça n'empêche personne de verrouiller à la main : c'est
// uniquement la minuterie d'inactivité qu'on met en suspens.
//
// CE QUI REND CE MODULE MOINS TRIVIAL QU'IL N'Y PARAÎT, et pourquoi il existe
// plutôt qu'un `navigator.wakeLock.request('screen')` posé dans un effet :
//
//   • le jeton est REPRIS par le système dès que la page passe en arrière-plan
//     - onglet changé, application quittée, écran verrouillé à la main. Il ne
//     revient jamais tout seul. Sans redemande au retour, le verrou ne tient
//     que jusqu'au premier coup d'œil à une notification, et l'écran s'éteint
//     à la reprise comme s'il n'avait jamais existé ;
//   • la demande est ASYNCHRONE, et l'état qui la commande peut changer
//     pendant qu'elle est en vol. Deux demandes concurrentes laissent un jeton
//     orphelin qui tient l'écran allumé après le retour au menu ; une
//     libération demandée trop tôt s'applique à un jeton pas encore né et ne
//     libère rien. D'où la file : une opération à la fois, dans l'ordre, et
//     c'est le dernier voeu exprimé qui gagne ;
//   • une demande en arrière-plan est REFUSÉE par le navigateur. On ne la fait
//     donc pas, plutôt que d'attraper l'exception une fois sur deux ;
//   • et tout refus est avalé : un navigateur sans l'API, un iframe sans la
//     permission, une politique d'entreprise n'ont rien à dire au joueur. Il
//     n'y a rien à réparer de son côté, et l'écran qui s'éteint reste un écran
//     qu'on rallume.
//
// La mécanique est séparée du navigateur (`WakeLockHost`) parce que c'est la
// seule façon de la mettre sous test : ce qui est délicat ici est un ordre
// d'opérations, pas un appel d'API.

/** Le jeton rendu par le navigateur, réduit à ce que ce module lui demande. */
export interface ScreenLock {
  release: () => Promise<void>;
  /** Le système peut le reprendre sans nous prévenir autrement. */
  addEventListener: (type: 'release', listener: () => void) => void;
}

/** Ce que ce module attend d'un navigateur - le vrai, ou celui des tests. */
export interface WakeLockHost {
  /** L'API existe-t-elle ici ? */
  supported: () => boolean;
  /** La page est-elle au premier plan ? Une demande faite masquée est refusée. */
  visible: () => boolean;
  /** Demande un verrou d'écran. Rejette si le navigateur refuse. */
  request: () => Promise<ScreenLock>;
}

/**
 * Le verrou d'écran de la page, tenu tant qu'on est à bord.
 *
 * Trois verbes seulement : `wake` (on embarque), `sleep` (on redescend),
 * `refresh` (on revient sur la page - le système a peut-être repris le jeton).
 * Tous sont idempotents et peuvent s'appeler dans n'importe quel ordre : c'est
 * la file interne qui garantit qu'il n'y a jamais deux jetons, ni un jeton
 * survivant à la demande de le rendre.
 */
export class ScreenAwake {
  private readonly host: WakeLockHost;
  private lock: ScreenLock | null = null;
  /** Le dernier voeu exprimé : veut-on l'écran allumé ? */
  private wanted = false;
  /** File d'opérations : une à la fois, dans l'ordre d'expression des voeux. */
  private queue: Promise<void> = Promise.resolve();

  constructor(host: WakeLockHost) {
    this.host = host;
  }

  /** Tient-on un jeton en ce moment ? Pour les tests et le débogage. */
  get held(): boolean {
    return this.lock !== null;
  }

  /** On embarque : l'écran reste allumé. */
  wake(): Promise<void> {
    this.wanted = true;
    return this.settle();
  }

  /** On redescend : le système reprend la main sur sa minuterie. */
  sleep(): Promise<void> {
    this.wanted = false;
    return this.settle();
  }

  /**
   * La page redevient visible : on redemande le jeton si on l'a perdu.
   *
   * C'est l'appel qui fait toute la différence entre un verrou qui tient une
   * heure et un verrou qui tient jusqu'à la première notification.
   */
  refresh(): Promise<void> {
    return this.settle();
  }

  private settle(): Promise<void> {
    // `.then(step, step)` : l'échec d'une opération précédente ne doit pas
    // bloquer la file - ce serait un écran définitivement sans verrou.
    const next = this.queue.then(
      () => this.step(),
      () => this.step(),
    );
    this.queue = next;
    return next;
  }

  private async step(): Promise<void> {
    if (this.wanted) {
      if (this.lock) return;
      if (!this.host.supported() || !this.host.visible()) return;
      try {
        const lock = await this.host.request();
        // Reprise par le système : on note la perte pour pouvoir redemander au
        // retour. Le jeton repris n'est plus rendable, et le rendre lèverait.
        lock.addEventListener('release', () => {
          if (this.lock === lock) this.lock = null;
        });
        this.lock = lock;
      } catch {
        /* refus silencieux (API absente, iframe, politique navigateur…) */
      }
      return;
    }
    const lock = this.lock;
    if (!lock) return;
    // Oublié AVANT d'être rendu : si un `wake` arrive pendant la restitution,
    // il trouvera la place libre et redemandera, au lieu de croire tenir un
    // jeton en train de disparaître.
    this.lock = null;
    try {
      await lock.release();
    } catch {
      /* déjà repris par le système */
    }
  }
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<ScreenLock> };
}

function wakeLockApi(): WakeLockNavigator['wakeLock'] {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & WakeLockNavigator).wakeLock;
}

/** Le vrai navigateur. */
export const browserWakeLock: WakeLockHost = {
  supported: () => wakeLockApi() !== undefined,
  visible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
  request: () => {
    const api = wakeLockApi();
    if (!api) return Promise.reject(new Error('wakeLock indisponible'));
    return api.request('screen');
  },
};

/**
 * Le verrou de CETTE page.
 *
 * Un seul, partagé : le navigateur n'en compte qu'un par document, et deux
 * détenteurs qui s'ignorent finiraient par se le reprendre l'un à l'autre.
 */
export const screenAwake = new ScreenAwake(browserWakeLock);
