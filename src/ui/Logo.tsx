// Logo « Yamanote 3D ». Tout en SVG inline : pas d'image à charger, net à
// n'importe quelle taille, et les couleurs suivent la charte de la ligne.
//
// Composition, dans l'esprit des jaquettes de jeux japonisants : l'ovale de la
// boucle Yamanote en emblème de fond, le mot-symbole en gros caractères blancs
// cernés d'encre avec son ombre portée, « 3D » sur une plaque inclinée qui
// déborde à droite, et 山手線 juste en dessous, dans le même traitement que le
// mot-symbole. Les couleurs sont réglées pour le panneau blanc du menu.
//
// Les deux textes du mot-symbole sont contraints par textLength : quelle que
// soit la police réellement disponible sur la machine, le logo garde exactement
// la même largeur et le même équilibre.

const WORD = 'YAMANOTE';
const WORD_X = 56;
const WORD_LEN = 336;

// Quelques « gares » posées sur l'ovale de fond.
const LOOP_DOTS: [number, number][] = [
  [120, 58],
  [220, 58],
  [330, 58],
  [440, 58],
  [150, 176],
  [280, 176],
  [410, 176],
];

export function Logo() {
  return (
    // Purement décoratif, et c'est délibéré : le nom du jeu est porté par le
    // <h1> qui accompagne ce logo (voir StartScreen), en texte simple. Il le
    // faut parce que chaque mot du dessin existe ici en DEUX <text> superposés,
    // l'ombre puis les lettres cernées : nommer le logo ici donnerait
    // « YAMANOTE YAMANOTE 3D 山手線 山手線 » à qui extrait le texte du
    // document - lecteur d'écran comme robot d'indexation.
    <svg className="logo" viewBox="0 40 560 175" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logo-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a5db5e" />
          <stop offset="1" stopColor="#5da028" />
        </linearGradient>
      </defs>

      {/* Emblème de fond : la boucle, et ses gares. */}
      <g opacity="0.15">
        <rect
          x="66"
          y="58"
          width="428"
          height="118"
          rx="59"
          fill="none"
          stroke="#80c241"
          strokeWidth="24"
        />
        {LOOP_DOTS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#4d8a1f" />
        ))}
      </g>

      {/* Mot-symbole : ombre portée, puis les lettres cernées d'encre. */}
      <text
        x={WORD_X + 5}
        y={155}
        fontSize="86"
        fontWeight="800"
        fill="#16300a"
        textLength={WORD_LEN}
        lengthAdjust="spacingAndGlyphs"
      >
        {WORD}
      </text>
      <text
        x={WORD_X}
        y={147}
        fontSize="86"
        fontWeight="800"
        fill="#ffffff"
        stroke="#10151a"
        strokeWidth="12"
        strokeLinejoin="round"
        paintOrder="stroke"
        textLength={WORD_LEN}
        lengthAdjust="spacingAndGlyphs"
      >
        {WORD}
      </text>

      {/* Plaque « 3D », inclinée, qui déborde sur la droite du mot. */}
      <g transform="rotate(-6 454 132)">
        <rect x="414" y="104" width="92" height="72" rx="16" fill="#0b0f13" opacity="0.3" />
        <rect
          x="408"
          y="96"
          width="92"
          height="72"
          rx="16"
          fill="url(#logo-green)"
          stroke="#10151a"
          strokeWidth="7"
        />
        <text
          x="454"
          y="150"
          textAnchor="middle"
          fontSize="46"
          fontWeight="800"
          fill="#ffffff"
          stroke="#10151a"
          strokeWidth="6"
          strokeLinejoin="round"
          paintOrder="stroke"
          textLength="58"
          lengthAdjust="spacingAndGlyphs"
        >
          3D
        </text>
      </g>

      {/* 山手線, serré sous le mot-symbole et centré sur lui (l'axe du mot,
          x=224, pas celui du SVG - la plaque 3D déborde à droite). */}
      <text
        x="227"
        y="201"
        textAnchor="middle"
        fontSize="32"
        fontWeight="800"
        fill="#16300a"
        textLength="128"
        lengthAdjust="spacing"
      >
        山手線
      </text>
      <text
        x="224"
        y="197"
        textAnchor="middle"
        fontSize="32"
        fontWeight="800"
        fill="#ffffff"
        stroke="#10151a"
        strokeWidth="6"
        strokeLinejoin="round"
        paintOrder="stroke"
        textLength="128"
        lengthAdjust="spacing"
      >
        山手線
      </text>
    </svg>
  );
}
