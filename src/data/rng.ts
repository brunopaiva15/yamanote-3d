// Le petit générateur pseudo-aléatoire déterministe du jeu (mulberry32).
//
// Il vivait dans `textures/procedural`, avec les fabriques de textures qui
// s'en servent pour semer un damier ou un visage. C'était sa place d'origine et
// ce n'était plus la bonne : la SIMULATION s'en sert aussi - c'est lui qui
// donne à chaque voyageur ses occupations (systems/paxBehavior) -, et importer
// une fabrique de `CanvasTexture` pour six lignes d'arithmétique faisait de
// three.js une dépendance statique de la simulation des PNJ. Sept cent
// kilo-octets de moteur de rendu pour un générateur de nombres.
//
// `textures/procedural` continue de l'exporter : les composants de rendu qui
// l'y prenaient n'ont pas à savoir qu'il a déménagé.
//
// Déterministe et à état explicite, sans quoi rien de ce qui s'appuie dessus ne
// serait reproductible : une même graine rend toujours la même suite.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
