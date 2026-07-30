// Cohérence du référencement : index.html, robots.txt, sitemap.xml, le
// manifeste et les images sociales décrivent tous le même site, et rien ne les
// force à rester d'accord - sauf ce fichier.
//
// Ce qui casse en silence sans lui : une URL canonique changée à un endroit et
// pas aux trois autres, une langue ajoutée à `LANGS` sans son alternate, une
// image sociale régénérée à d'autres dimensions que celles annoncées, un
// fichier référencé mais jamais produit. Rien de tout ça ne fait échouer le
// build, et tout se voit six semaines plus tard dans un rapport d'indexation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const HTML = read('index.html');
const ABOUT_HTML = read('about.html');
const ROBOTS = read('public/robots.txt');
const SITEMAP = read('public/sitemap.xml');
const MANIFEST = JSON.parse(read('public/site.webmanifest'));

/** Les langues de l'interface, telles que le jeu les connaît. */
const LANGS = ['en', 'fr', 'ja'];

/** L'URL canonique déclarée par index.html fait foi pour tout le reste. */
const SITE_URL = HTML.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

function metaContent(source, attr, name) {
  const re = new RegExp(`<meta[^>]*\\b${attr}="${name}"[^>]*>`, 'g');
  const tags = source.match(re) ?? [];
  return tags.map((tag) => tag.match(/content="([^"]*)"/s)?.[1] ?? '');
}

/** `<meta ... content="…">` où le contenu peut tenir sur plusieurs lignes. */
function metaBlock(source, attr, name) {
  const re = new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"\\s*/>`, 's');
  const inline = source.match(re)?.[1];
  if (inline !== undefined) return inline;
  const multi = new RegExp(`${attr}="${name}"\\s*content="([^"]*)"`, 's');
  return source.match(multi)?.[1];
}

test('index.html porte une URL canonique absolue et terminée par un /', () => {
  assert.ok(SITE_URL, 'aucune balise <link rel="canonical">');
  assert.match(SITE_URL, /^https:\/\//, 'la canonique doit être absolue et en https');
  assert.ok(SITE_URL.endsWith('/'), 'la canonique doit désigner un répertoire');
});

test('index.html a un titre et une description de longueur exploitable', () => {
  const title = HTML.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title, 'aucun <title>');
  // Google tronque au-delà d'une soixantaine de caractères ; en deçà de vingt
  // il n'y a pas de titre, il y a une étiquette.
  assert.ok(title.length >= 20 && title.length <= 70, `titre de ${title.length} caractères`);

  const description = metaBlock(HTML, 'name', 'description');
  assert.ok(description, 'aucune meta description');
  assert.ok(
    description.length >= 120 && description.length <= 170,
    `description de ${description.length} caractères`,
  );
});

test("index.html laisse l'indexation ouverte", () => {
  const [robots] = metaContent(HTML, 'name', 'robots');
  assert.ok(robots, 'aucune meta robots');
  assert.match(robots, /\bindex\b/);
  assert.doesNotMatch(robots, /\bnoindex\b/);
  assert.match(robots, /max-image-preview:large/);
});

test("chaque langue de l'interface a son alternate, plus un x-default", () => {
  const alternates = new Map(
    [...HTML.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  for (const lang of LANGS) {
    assert.equal(
      alternates.get(lang),
      `${SITE_URL}?lang=${lang}`,
      `alternate manquant ou faux pour « ${lang} »`,
    );
  }
  // Le x-default renvoie l'URL nue : celle qui détecte la langue du visiteur.
  assert.equal(alternates.get('x-default'), SITE_URL);
  assert.equal(alternates.size, LANGS.length + 1, 'un alternate de trop, ou une langue oubliée');
});

test('les balises sociales reprennent le titre, la description et la canonique', () => {
  const title = HTML.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = metaBlock(HTML, 'name', 'description');

  assert.equal(metaContent(HTML, 'property', 'og:url')[0], SITE_URL);
  assert.equal(metaContent(HTML, 'property', 'og:title')[0], title);
  assert.equal(metaBlock(HTML, 'property', 'og:description'), description);
  assert.equal(metaContent(HTML, 'name', 'twitter:title')[0], title);
  assert.equal(metaBlock(HTML, 'name', 'twitter:description'), description);
  assert.equal(metaContent(HTML, 'name', 'twitter:card')[0], 'summary_large_image');

  // og:locale courant + un alternate par autre langue.
  const alternateLocales = metaContent(HTML, 'property', 'og:locale:alternate');
  assert.equal(alternateLocales.length, LANGS.length - 1);
});

test('les fichiers référencés par index.html existent bien dans public/', () => {
  const refs = [...HTML.matchAll(/(?:href|content)="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'plus aucune ressource locale référencée ?');
  for (const ref of new Set(refs)) {
    assert.ok(
      existsSync(join(ROOT, 'public', ref)) || existsSync(join(ROOT, ref)),
      `${ref} est référencé mais absent`,
    );
  }
});

test("l'image sociale fait bien les dimensions annoncées", () => {
  const declaredW = Number(metaContent(HTML, 'property', 'og:image:width')[0]);
  const declaredH = Number(metaContent(HTML, 'property', 'og:image:height')[0]);

  // En-tête PNG : signature de 8 octets, puis le bloc IHDR dont les deux
  // premiers entiers 32 bits gros-boutistes sont la largeur et la hauteur.
  const png = readFileSync(join(ROOT, 'public/og-image.png'));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);

  assert.equal(width, declaredW);
  assert.equal(height, declaredH);
  // Ratio proche de 1,91:1, la fenêtre des grandes cartes de partage.
  assert.ok(Math.abs(width / height - 1.91) < 0.05, `ratio ${(width / height).toFixed(2)}:1`);
});

test('og:image et twitter:image sont des URL absolues sous le site', () => {
  for (const url of [
    metaContent(HTML, 'property', 'og:image')[0],
    metaContent(HTML, 'name', 'twitter:image')[0],
  ]) {
    assert.ok(url?.startsWith(SITE_URL), `${url} devrait vivre sous ${SITE_URL}`);
    const file = url.slice(SITE_URL.length);
    assert.ok(existsSync(join(ROOT, 'public', file)), `public/${file} est absent`);
  }
});

test('les données structurées sont du JSON-LD valide et parlent du même site', () => {
  const raw = HTML.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(raw, 'aucun bloc JSON-LD');
  const data = JSON.parse(raw);
  assert.equal(data['@context'], 'https://schema.org');

  const nodes = data['@graph'];
  assert.ok(Array.isArray(nodes) && nodes.length > 0);

  const game = nodes.find((n) => n['@type'] === 'VideoGame');
  assert.ok(game, 'le graphe ne décrit aucun VideoGame');
  assert.equal(game.url, SITE_URL);
  assert.deepEqual([...game.inLanguage].sort(), [...LANGS].sort());
  assert.equal(game.isAccessibleForFree, true);
  assert.ok(game.image?.startsWith(SITE_URL));

  const site = nodes.find((n) => n['@type'] === 'WebSite');
  assert.ok(site, 'le graphe ne décrit aucun WebSite');
  assert.equal(site.url, SITE_URL);

  // Toute référence `@id` interne au graphe doit y trouver son nœud : c'est ce
  // qui distingue un graphe d'une liste d'objets sans lien entre eux.
  const ids = new Set(nodes.map((n) => n['@id']).filter(Boolean));
  const referenced = JSON.stringify(nodes).match(/"@id":"([^"]+)"/g) ?? [];
  for (const ref of referenced) {
    const id = ref.slice('"@id":"'.length, -1);
    assert.ok(ids.has(id), `@id « ${id} » référencé mais jamais défini`);
  }
});

test('robots.txt ouvre le site et déclare le sitemap', () => {
  assert.match(ROBOTS, /^User-agent: \*$/m);
  assert.match(ROBOTS, /^Allow: \/$/m);
  assert.doesNotMatch(ROBOTS, /^Disallow: \/$/m);
  assert.match(ROBOTS, new RegExp(`^Sitemap: ${SITE_URL}sitemap\\.xml$`, 'm'));
});

test("le sitemap liste l'URL nue et une variante par langue", () => {
  const locs = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), [SITE_URL, ...LANGS.map((l) => `${SITE_URL}?lang=${l}`)].sort());

  // Chaque entrée doit porter le jeu complet d'alternates, x-default compris :
  // une déclaration hreflang unilatérale est ignorée par Google.
  const entries = [...SITEMAP.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.equal(entries.length, LANGS.length + 1);
  for (const entry of entries) {
    const hreflangs = [...entry.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(hreflangs, [...LANGS, 'x-default'].sort());
  }
});

test('le manifeste décrit la même application, avec ses icônes', () => {
  assert.equal(MANIFEST.name, 'Yamanote 3D - 山手線');
  assert.ok(MANIFEST.description?.length >= 110);
  // Chemins relatifs : le build sert aussi bien sous /yamanote-3d/ qu'à la
  // racine d'un domaine (voir `base: './'` dans vite.config.ts).
  assert.equal(MANIFEST.start_url, './');
  assert.equal(MANIFEST.scope, './');

  const sizes = MANIFEST.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'icône 192 manquante');
  assert.ok(sizes.includes('512x512'), 'icône 512 manquante');
  assert.ok(
    MANIFEST.icons.some((i) => i.purpose === 'maskable'),
    'aucune icône maskable : Android rognerait le dessin',
  );
  for (const icon of [...MANIFEST.icons, ...(MANIFEST.screenshots ?? [])]) {
    assert.ok(icon.src.startsWith('./'), `${icon.src} devrait être relatif`);
    assert.ok(existsSync(join(ROOT, 'public', icon.src.slice(2))), `${icon.src} est absent`);
  }
});

test('la présentation détaillée vit sur la page À propos', () => {
  const body = ABOUT_HTML.slice(ABOUT_HTML.indexOf('<body>'));
  // Un seul h1, et il nomme le jeu.
  const h1 = [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].trim());
  assert.equal(h1.length, 1, 'il faut exactement un <h1>');
  assert.match(h1[0], /Yamanote 3D/);

  // Le repli textuel doit peser assez pour être un contenu, pas un slogan.
  const text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  assert.ok(text.length > 800, `repli sans JavaScript trop maigre (${text.length} caractères)`);

  // Les trente gares y sont : c'est le vocabulaire par lequel on cherche ce
  // genre de page (« Shinjuku », « 秋葉原 », « Takanawa Gateway »…).
  for (const jy of ['JY01', 'JY15', 'JY30']) assert.ok(text.includes(jy), `${jy} absent du repli`);
  assert.ok(text.includes('Shinjuku') && text.includes('新宿'));

  assert.match(HTML, /<noscript>/, 'aucun message pour les navigateurs sans JavaScript');
  assert.match(HTML, /about\.html/, 'la page de chargement ne renvoie pas vers la présentation');
});

test("le conteneur React est vide avant le démarrage de l'application", () => {
  const root = HTML.match(/<div id="root">([\s\S]*?)<\/div>/)?.[1];
  assert.equal(root, '', "du contenu HTML s'afficherait brièvement avant React");
  assert.doesNotMatch(HTML, /class="boot/, "l'ancien écran de chargement est encore présent");
});
