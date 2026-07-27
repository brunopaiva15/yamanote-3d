// Titre « Yamanote 3D », composé comme un ekimeiban (panneau de nom de gare)
// JR East : furigana au-dessus, nom en gros caractères gothiques noirs, et la
// pastille de numérotation JY à gauche. Purement typographique — pas d'image,
// pas d'effet — comme la vraie signalétique.

export function Logo() {
  return (
    <div className="board-name">
      <span className="board-kana" lang="ja" aria-hidden="true">
        やまのて
      </span>
      <div className="board-name-row">
        <span className="board-roundel" aria-hidden="true">
          JY
        </span>
        <h1 className="board-title">YAMANOTE 3D</h1>
      </div>
    </div>
  );
}
