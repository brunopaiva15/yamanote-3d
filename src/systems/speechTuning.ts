/**
 * La voix féminine de l'automate Inner est naturellement très haute dans le
 * modèle Kokoro. Une lecture un demi-ton environ plus bas lui donne le registre
 * posé d'une sono de gare, sans toucher à la voix masculine ni à l'agent au
 * micro. systems/speech corrige la durée de file du même facteur.
 */
const ATOS_INNER_PLAYBACK_RATE = 0.94;

export function speechPlaybackRate(voice?: string): number {
  return voice === 'atos-inner' ? ATOS_INNER_PLAYBACK_RATE : 1;
}
