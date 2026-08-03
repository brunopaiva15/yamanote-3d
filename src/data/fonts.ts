// La pile de fontes japonaises du jeu, en un seul endroit.
//
// Elle vivait dans `textures/procedural`, avec les fabriques de textures qui
// s'en servent. Ce n'était plus tenable : les écrans de ligne de l'E235
// (three/lineScreen) l'utilisent pour chacune de leurs deux mille lignes de
// peinture, et ils sont désormais dessinés AUSSI hors de la scène 3D - la
// version sonore du jeu affiche le vrai afficheur de bord dans une simple
// balise `<canvas>`. Importer une fabrique de `CanvasTexture` pour une chaîne
// de caractères y aurait fait entrer three.js tout entier.
//
// L'ordre compte : Hiragino sur macOS et iOS, Yu Gothic sur Windows, Noto en
// dernier recours - ce sont les trois gothiques que les afficheurs japonais
// utilisent réellement, dans cet ordre de préférence.
export const JP_FONT = "'Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif";
