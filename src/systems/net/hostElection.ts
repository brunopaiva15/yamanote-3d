// Qui mène la rame.
//
// Un salon a besoin d'une autorité : quelqu'un doit tirer au sort l'écart
// d'arrêt, la voie, l'instant de la mélodie, et le dire aux autres. Le réflexe
// serait de négocier ce rôle - un message « je me propose », un autre
// « d'accord » -, et c'est justement ce qu'il ne faut pas faire. Une
// négociation a des états intermédiaires, donc des courses, donc des moments où
// deux clients se croient tous les deux hôtes et diffusent deux mondes.
//
// Ici, l'élection est une FONCTION. Tout le monde reçoit le même `presenceState()`
// de Supabase, tout le monde applique la même règle, tout le monde obtient le
// même résultat sans avoir échangé un seul message à ce sujet. Il n'y a pas
// d'état à synchroniser parce qu'il n'y a pas d'état du tout.
//
// La règle : le plus ancien arrivé, parmi ceux qui sont encore dans la rame.

/** Ce qu'il faut savoir d'un pair pour l'élire, et rien de plus. */
export interface Member {
  id: string;
  /** Instant d'arrivée, tel que le pair l'a publié dans sa présence. */
  joinedAt: number;
  /**
   * Encore dans LA rame du salon ?
   *
   * Un voyageur qui a laissé la rame partir sans lui continue de jouer, mais
   * son monde a divergé : sa gare n'est plus celle des autres, son horloge de
   * phase non plus. En faire l'hôte téléporterait tout le salon sur son quai.
   */
  attached: boolean;
}

/**
 * Élit l'hôte. Rend son identifiant, ou `null` si le salon est vide.
 *
 * Départage les arrivées simultanées par comparaison lexicographique de
 * l'identifiant. Deux onglets ouverts dans la même milliseconde, c'est rare ;
 * une élection qui hésiterait entre eux à chaque `sync` et ferait clignoter
 * l'autorité, c'est un défaut qu'on ne trouverait jamais. La comparaison des
 * identifiants est arbitraire, mais elle est TOTALE et STABLE, et c'est tout ce
 * qu'on lui demande.
 *
 * Si personne n'est attaché - tout le salon est descendu sur les quais - on
 * n'élit personne : il n'y a plus de rame commune à mener. Le premier qui
 * remonte à bord redevient hôte de lui-même.
 */
export function electHost(members: readonly Member[]): string | null {
  let best: Member | null = null;
  for (const m of members) {
    if (!m.attached) continue;
    if (best === null) {
      best = m;
      continue;
    }
    if (m.joinedAt < best.joinedAt) best = m;
    else if (m.joinedAt === best.joinedAt && m.id < best.id) best = m;
  }
  return best === null ? null : best.id;
}

/**
 * Délai de grâce avant qu'un changement d'élection ne prenne effet (ms).
 *
 * Supabase publie ses `sync` de présence avec un peu de gigue : une arrivée et
 * un départ dans la même seconde peuvent se présenter dans deux ordres
 * différents chez deux clients. Sans ce délai, l'autorité changerait de main
 * deux fois en une seconde, et chaque bascule coûte un battement hors cadence.
 */
export const HOST_GRACE_MS = 1_200;

/**
 * Silence au-delà duquel on considère l'hôte muet (ms).
 *
 * Le battement est à 2 Hz : six secondes, c'est douze battements manqués. Ce
 * n'est plus de la gigue, c'est un onglet mis en veille, un réseau coupé ou une
 * page fermée sans que la présence ait eu le temps de se retirer. On le sort
 * alors de la liste d'élection LOCALE et l'on réélit. S'il revient, il redevient
 * hôte tout seul : la fonction est stable, elle ne garde pas rancune.
 */
export const HOST_SILENCE_MS = 6_000;

/**
 * L'élection retenue, et depuis quand : l'état du délai de grâce.
 */
export interface HostGate {
  id: string | null;
  since: number;
}

/**
 * Faut-il ENTÉRINER cette élection, ou attendre encore ?
 *
 * Sorti en fonction pure après un bogue qui a coûté cher à diagnostiquer : le
 * délai de grâce était appliqué directement dans le code du canal, avec un
 * `return` anticipé quand il fallait attendre. Or ce code ne tournait QUE sur un
 * événement de présence - une arrivée, un départ. À deux dans un salon, plus
 * personne n'arrive ni ne part : la décision différée n'était jamais reprise, le
 * rôle restait « solo » pour toujours, aucun hôte n'était élu, aucun battement
 * n'était publié, et les deux joueurs roulaient dans deux mondes séparés en
 * voyant l'avatar l'un de l'autre.
 *
 * Le même trou rendait la détection d'hôte muet (`HOST_SILENCE_MS`) purement
 * décorative : elle ne pouvait se déclencher qu'à l'occasion d'un événement de
 * présence, c'est-à-dire jamais quand elle sert.
 *
 * Écrit ici, le report devient une valeur qu'on peut éprouver - et l'appelant
 * doit forcément se demander qui la reprendra.
 */
export function gateHost(
  elu: string | null,
  actuel: string | null,
  pending: HostGate | null,
  now: number,
): { settled: boolean; pending: HostGate | null } {
  if (elu === actuel) return { settled: true, pending: null };
  const suite = pending && pending.id === elu ? pending : { id: elu, since: now };
  if (now - suite.since < HOST_GRACE_MS) return { settled: false, pending: suite };
  return { settled: true, pending: null };
}

/**
 * Écarte les pairs muets, puis élit.
 *
 * `lastSeen` porte l'instant du dernier message reçu de chaque pair ; un pair
 * absent de la table n'a jamais rien émis et compte comme frais - il vient
 * peut-être d'arriver, et on ne le condamne pas avant de l'avoir entendu.
 */
export function electHostWithLiveness(
  members: readonly Member[],
  lastSeen: ReadonlyMap<string, number>,
  now: number,
): string | null {
  const alive = members.filter((m) => {
    const seen = lastSeen.get(m.id);
    if (seen === undefined) return true;
    return now - seen < HOST_SILENCE_MS;
  });
  // Tout le monde est muet : plutôt que de n'élire personne - ce qui figerait
  // le salon - on retombe sur la liste complète. Mieux vaut un hôte douteux
  // qu'aucun hôte : s'il est vraiment parti, sa présence finira par se retirer
  // et l'élection suivante sera propre.
  return electHost(alive.length > 0 ? alive : members);
}
