// Fabrique les images que le référencement et le partage réclament, à partir
// des deux sources versionnées dans `assets/` : la pastille `icon.svg` et la
// bannière `banner-1600x400.png`.
//
//     npm run seo:assets
//
// Sorties (toutes dans `public/`, donc recopiées telles quelles par Vite) :
//
//   favicon.svg            la pastille, servie telle quelle aux navigateurs modernes
//   favicon-32.png         repli matriciel (vieux navigateurs, agrégateurs, flux RSS)
//   apple-touch-icon.png   180×180, opaque : iOS ne gère pas la transparence
//   icon-192.png           manifeste PWA, taille d'accueil Android
//   icon-512.png           manifeste PWA, splash et magasins
//   icon-maskable-512.png  même dessin, marge de 20 % pour le rognage adaptatif
//   og-image.png           1200×630, la carte de partage (Open Graph, Twitter)
//
// Les fichiers produits SONT versionnés : un crawler ou un aperçu de partage
// doit pouvoir les tirer du site déployé sans que personne n'ait relancé le
// script, et un build de production ne doit pas dépendre de sharp.

import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'assets');
const OUT = resolve(ROOT, 'public');

/** Fond d'encre du jeu : même valeur que `--ink-line` dans styles.css. */
const INK = { r: 0x10, g: 0x15, b: 0x1a, alpha: 1 };

const icon = await readFile(resolve(ASSETS, 'icon.svg'));

/** Rend la pastille à une taille donnée. `flatten` pour les cibles opaques. */
function renderIcon(size, { flatten = false, padRatio = 0 } = {}) {
  const inner = Math.round(size * (1 - 2 * padRatio));
  let pipe = sharp(icon, { density: 384 }).resize(inner, inner, { fit: 'contain' });
  if (padRatio > 0) {
    const pad = Math.round((size - inner) / 2);
    pipe = pipe.extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: { r: 0x6c, g: 0xb0, b: 0x32, alpha: 1 },
    });
  }
  return flatten ? pipe.flatten({ background: INK }) : pipe;
}

async function write(name, pipe) {
  const path = resolve(OUT, name);
  const { width, height, size } = await pipe.png({ compressionLevel: 9 }).toFile(path);
  console.log(`${name.padEnd(24)} ${width}×${height}  ${(size / 1024).toFixed(1)} kio`);
}

await mkdir(OUT, { recursive: true });

// Le favicon vectoriel est la source elle-même : rien à rendre.
await copyFile(resolve(ASSETS, 'icon.svg'), resolve(OUT, 'favicon.svg'));
console.log('favicon.svg              (copie de assets/icon.svg)');

await write('favicon-32.png', renderIcon(32));
await write('apple-touch-icon.png', renderIcon(180, { flatten: true }));
await write('icon-192.png', renderIcon(192));
await write('icon-512.png', renderIcon(512));
// « maskable » : Android rogne l'icône à sa guise (cercle, goutte, écusson).
// La zone sûre est le cercle inscrit à 80 % ; on rentre donc le dessin de 20 %
// et on laisse le vert de la ligne remplir les bords sacrifiés.
await write('icon-maskable-512.png', renderIcon(512, { padRatio: 0.1 }));

// --- Carte de partage -------------------------------------------------------
//
// La bannière porte déjà le logo, posé au centre sur un intérieur de rame flou.
// En la recadrant en 1200×630 (`cover`, donc agrandie ×1,575 puis rognée à
// gauche et à droite), le logo retombe centré et à bonne taille, et le flou du
// fond encaisse l'agrandissement sans qu'on le voie. Une carte de partage se
// lit en vignette : pas de texte ajouté, le mot-symbole suffit.
const OG_W = 1200;
const OG_H = 630;
await write(
  'og-image.png',
  sharp(resolve(ASSETS, 'banner-1600x400.png'))
    .resize(OG_W, OG_H, { fit: 'cover', position: 'centre' })
    .flatten({ background: INK }),
);

// Garde-fou : les balises `og:image:width` / `og:image:height` de index.html
// annoncent ces deux nombres aux moteurs de partage, et `tests/seo.test.mjs`
// les relit dans l'en-tête du PNG. Le fichier produit doit les tenir.
const meta = await sharp(resolve(OUT, 'og-image.png')).metadata();
if (meta.width !== OG_W || meta.height !== OG_H) {
  throw new Error(`og-image.png fait ${meta.width}×${meta.height}, attendu ${OG_W}×${OG_H}`);
}
