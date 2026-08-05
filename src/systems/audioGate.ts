// Le robinet de RENDU : ce qui ne s'entend pas ne doit pas être calculé.
//
// Un graphe Web Audio ne coûte pas ce qu'on en entend, il coûte ce qui y est
// BRANCHÉ. Un bruit rose passé dans un filtre puis dans un gain à zéro est
// calculé échantillon par échantillon, comme s'il sonnait plein pot ; un
// Panner3D en HRTF convolue deux réponses d'oreille quarante-huit mille fois
// par seconde même quand sa source est muette ; une réverbération à queue de
// 2,6 s fait sa transformée sur du silence sans se plaindre. Le moteur de ce
// jeu en aligne beaucoup : dix-neuf panners, deux convolutions, quinze
// générateurs continus. La plupart ne servent QUE par intermittence - les
// diffuseurs du quai n'ont rien à dire entre deux gares, l'avertisseur des
// baies sonne huit secondes par arrêt, la pluie ne tombe pas tous les jours -
// et pourtant tout cela tournait en permanence, du premier au dernier tour de
// boucle. Sur une machine modeste, c'est exactement ce qui remplit le fil audio
// jusqu'à ce qu'il rate son échéance : le grésillement.
//
// La règle de Web Audio qui rend le remède simple : un nœud qui n'a plus de
// chemin vers la sortie n'est PAS rendu. Débrancher une arête suffit donc à
// éteindre tout ce qui est derrière - sources, filtres, panners, convolutions -
// sans rien détruire ni reconstruire. C'est ce que fait ce module.
//
// Ce qui est délicat n'est pas d'éteindre : c'est de RALLUMER À TEMPS, et de ne
// jamais éteindre trop tôt. Un robinet fermé au mauvais moment ne fait pas un
// grésillement, il fait un silence - une annonce qui ne sort pas -, et ce serait
// pire que le mal. D'où trois précautions, et c'est tout le contenu de la
// classe :
//
//   • on ouvre AVANT de jouer, jamais après : chaque déclencheur du moteur
//     réveille sa ligne au moment où il programme son premier son ;
//   • on ne ferme jamais tant qu'un compte de lecture est ouvert (`acquire` /
//     `release`) : un clip de vingt secondes tient sa ligne ouverte vingt
//     secondes, sans que personne ait à deviner sa durée ;
//   • on ne ferme qu'après la QUEUE (`tail`) : le temps que la dernière rampe
//     descende à zéro et que la réverbération finisse de mourir. Fermer sur un
//     signal encore vivant ferait un clic, ce qui est précisément le défaut
//     qu'on est venu corriger.
//
// Le temps manipulé ici est celui de l'horloge AUDIO (Tone.now()), pas celui du
// document : c'est elle qui décide de ce qui s'entend.

/** Ce qu'un robinet sait faire quand il s'ouvre et quand il se ferme. */
export interface GateWiring {
  /** Rebrancher la ligne. Appelé une seule fois par ouverture. */
  open: () => void;
  /** La débrancher. Appelé une seule fois par fermeture. */
  close: () => void;
}

/**
 * Un robinet de rendu.
 *
 * Il naît OUVERT, parce que le graphe se monte branché : c'est la première
 * image qui débranche ce dont personne n'a besoin (`settle`). Dans ce sens-là,
 * une erreur de câblage se paie en calcul ; dans l'autre, elle se paierait en
 * silence.
 */
export class Gate {
  /** Lectures en cours qui interdisent la fermeture. */
  private refs = 0;
  /** Instant (horloge audio) jusqu'auquel la ligne reste ouverte de toute façon. */
  private until = 0;
  /** Tenue sans échéance : `hold(true)` puis `hold(false)`. */
  private held = false;
  private opened = true;
  /** Interdite par le palier audio : elle se ferme et ne rouvre plus. */
  private disabled = false;

  /** Queue à laisser passer avant de débrancher (s). */
  readonly tail: number;
  private readonly wiring: GateWiring;

  /**
   * @param tail   queue à laisser passer avant de débrancher (s). Elle doit
   *               couvrir la plus longue rampe de descente de la ligne, et la
   *               réverbération quand la ligne en porte une.
   * @param wiring comment on ouvre et comment on ferme.
   */
  constructor(tail: number, wiring: GateWiring) {
    this.tail = tail;
    this.wiring = wiring;
  }

  /** La ligne est-elle branchée ? */
  get open(): boolean {
    return this.opened;
  }

  /** Nombre de lectures en cours - pour les tests et le débogage. */
  get holds(): number {
    return this.refs;
  }

  /**
   * Ouvre tout de suite, et garantit la ligne branchée pendant `hold` secondes
   * au moins, queue comprise.
   *
   * C'est l'appel de tout déclencheur ponctuel : un carillon, un bip, une paire
   * d'avertisseur. `hold` est la durée du son qu'on vient de programmer - jamais
   * une estimation prudente, la vraie durée : la queue s'ajoute par-dessus.
   */
  wake(now: number, hold = 0): void {
    this.until = Math.max(this.until, now + hold + this.tail);
    this.raise();
  }

  /**
   * Tient la ligne ouverte sans échéance (`true`), ou rend la main (`false`).
   *
   * Pour ce qui dure aussi longtemps qu'un état du monde le veut : la présence
   * d'une gare, une averse, un train qui traverse. À la relâche, la queue court
   * comme d'habitude.
   */
  hold(now: number, on: boolean): void {
    if (on === this.held) {
      if (on) this.raise();
      return;
    }
    this.held = on;
    if (on) this.raise();
    else this.until = Math.max(this.until, now + this.tail);
  }

  /**
   * Une lecture commence. Tant qu'elle n'a pas rendu son jeton, la ligne ne se
   * ferme pas, quelle que soit sa durée - c'est le filet qui rend inutile toute
   * estimation de durée de clip.
   */
  acquire(now: number): void {
    this.refs++;
    this.until = Math.max(this.until, now + this.tail);
    this.raise();
  }

  /** Elle se termine. */
  release(now: number): void {
    if (this.refs > 0) this.refs--;
    this.until = Math.max(this.until, now + this.tail);
  }

  /**
   * Interdit la ligne : le palier audio a décidé qu'elle ne tenait plus sur
   * cette machine (une réverbération, en pratique).
   *
   * Elle ne se ferme PAS dans l'instant : sa queue court d'abord. Trancher une
   * réverbération de deux secondes et demie en pleine décroissance ferait un
   * clic - et un clic au moment précis où l'on descend d'un palier pour que ça
   * cesse de craquer serait une plaisanterie de mauvais goût.
   */
  disable(now: number): void {
    this.disabled = true;
    this.until = Math.min(this.until, now + this.tail);
  }

  /** Le palier remonte : la ligne pourra rouvrir à son prochain réveil. */
  enable(): void {
    this.disabled = false;
  }

  /**
   * À appeler une fois par image : ferme la ligne si plus rien ne la retient.
   * Ne fait jamais rien d'autre - l'ouverture, elle, est immédiate.
   */
  settle(now: number): void {
    if (!this.opened) return;
    if (this.disabled) {
      if (now < this.until) return;
    } else if (this.refs > 0 || this.held || now < this.until) {
      return;
    }
    this.opened = false;
    this.wiring.close();
  }

  /**
   * Rouvre de force et sans condition, pour la durée de la queue.
   *
   * Le filet de sécurité du moteur : si un état observable dit que la ligne
   * DOIT sonner (le souffle d'une sono ouverte, un clip en cours), on la rouvre
   * même si aucun déclencheur ne l'a réveillée. Un robinet qui s'ouvre pour rien
   * coûte du calcul ; un robinet qui reste fermé sur une annonce coûte
   * l'annonce.
   */
  keepOpen(now: number): void {
    this.wake(now, 0);
  }

  private raise(): void {
    if (this.disabled || this.opened) return;
    this.opened = true;
    this.wiring.open();
  }
}
