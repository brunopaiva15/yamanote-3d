// Les deux promesses de la page de fréquentation, tenues par lecture du source.
//
//  1. elle est CACHÉE. Pas protégée - c'est écrit dans stats.html et dans le
//     README -, mais cachée : aucun lien du site ne la désigne, elle n'est ni
//     dans le plan du site ni dans les alternates, et elle se déclare
//     `noindex`. Cette propriété-là se perd d'un geste, et le geste est
//     sympathique : ajouter « un petit lien discret dans le pied de page ».
//
//  2. elle est LÉGÈRE. Elle a sa propre entrée pour que lire un histogramme ne
//     télécharge ni three.js, ni le store, ni l'i18n, ni le chargeur de jeu.
//     Un seul import distrait - « juste pour réutiliser useT » - et la page
//     tire la moitié du jeu sans que rien ne le signale.
//
// Le dépôt connaît le procédé : c'est celui de `tests/netSourceGuards.test.ts`
// et de `tests/audioVersion.test.ts`, pour la même raison. On lit les SOURCES
// plutôt que le build, pour que le test échoue à la seconde où l'import de trop
// est écrit, et non le jour d'une mise en ligne.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(resolvePath(ROOT, rel), 'utf8');

const STATS_HTML = read('stats.html');

/** Les modules importés à l'exécution ; les imports de TYPE sont effacés. */
function runtimeImports(rel: string): string[] {
  const source = read(rel);
  const out: string[] = [];
  const avecFrom = /(?:^|\n)\s*(?:import|export)(\s+type)?\s*([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(avecFrom)) {
    if (m[1]) continue;
    out.push(m[3]);
  }
  const nu = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(nu)) out.push(m[1]);
  return out;
}

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveImport(depuis: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolvePath(ROOT, dirname(depuis), spec);
  for (const ext of ['', ...EXTENSIONS]) {
    const candidat = base + ext;
    if (existsSync(candidat) && !candidat.endsWith('/')) {
      return candidat.slice(ROOT.length + 1);
    }
  }
  return null;
}

/** Tout ce que la page atteint, de proche en proche, depuis son entrée. */
function grapheDepuis(racine: string): { fichiers: Set<string>; paquets: Set<string> } {
  const fichiers = new Set<string>();
  const paquets = new Set<string>();
  const pile = [racine];
  while (pile.length > 0) {
    const fichier = pile.pop() as string;
    if (fichiers.has(fichier)) continue;
    fichiers.add(fichier);
    for (const spec of runtimeImports(fichier)) {
      if (!spec.startsWith('.')) {
        // Les feuilles de style ne sont pas des paquets : Vite les injecte.
        if (!spec.endsWith('.css')) paquets.add(spec);
        continue;
      }
      const cible = resolveImport(fichier, spec);
      if (cible) pile.push(cible);
    }
  }
  return { fichiers, paquets };
}

test('la page de fréquentation refuse l’indexation', () => {
  const robots = STATS_HTML.match(/<meta name="robots" content="([^"]*)"/)?.[1];
  assert.ok(robots, 'aucune balise robots');
  assert.match(robots, /\bnoindex\b/);
  assert.doesNotMatch(robots, /(^|[\s,])index\b/, 'la page se déclare indexable');
});

test('aucun lien du site ne mène à la page de fréquentation', () => {
  // Le référencement (index.html, sitemap.xml) ET l'interface (src/) : c'est
  // par l'un ou par l'autre que la page cesserait d'être discrète.
  const suspects = [
    'index.html',
    'about.html',
    'public/sitemap.xml',
    'public/site.webmanifest',
  ];
  for (const fichier of suspects) {
    assert.doesNotMatch(read(fichier), /stats\.html/, `${fichier} désigne la page cachée`);
  }

  const fautes: string[] = [];
  const parcours = (dossier: string) => {
    for (const entree of readdirSync(resolvePath(ROOT, dossier), { withFileTypes: true })) {
      const rel = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) parcours(rel);
      else if (/\.(ts|tsx|css)$/.test(entree.name) && !rel.startsWith('src/stats/')) {
        if (read(rel).includes('stats.html')) fautes.push(rel);
      }
    }
  };
  parcours('src');
  assert.deepEqual(
    fautes,
    [],
    'Un lien vers la page de fréquentation est apparu dans l’interface. C’est ' +
      'la seule chose qui la cachait.\n' + fautes.join('\n'),
  );
});

test('la page cachée ne figure pas non plus dans robots.txt', () => {
  // Contre-intuitif, et c'est pour ça que le test existe : un robots.txt est
  // PUBLIC. Y écrire « Disallow: /stats.html » publierait l'adresse qu'on ne
  // diffuse pas, à l'endroit exact que lit en premier qui cherche ce genre de
  // page. Le `noindex` de la balise fait mieux, et sans l'annoncer.
  assert.doesNotMatch(read('public/robots.txt'), /stats/i);
});

test('la page de fréquentation ne tire ni le rendu, ni le jeu', () => {
  const { fichiers, paquets } = grapheDepuis('src/stats/main.tsx');

  const interdits: { motif: RegExp; raison: string }[] = [
    { motif: /^three(\/|$)/, raison: 'le moteur de rendu' },
    { motif: /^@react-three/, raison: 'react-three-fiber' },
    { motif: /^tone(\/|$)/, raison: 'le moteur audio' },
    { motif: /^zustand(\/|$)/, raison: 'le magasin d’état du jeu' },
    { motif: /^@supabase/, raison: 'le client réseau, qui doit rester en import dynamique' },
  ];
  const fautesPaquets: string[] = [];
  for (const p of paquets) {
    for (const { motif, raison } of interdits) {
      if (motif.test(p)) fautesPaquets.push(`la page importe ${p} (${raison})`);
    }
  }
  assert.deepEqual(fautesPaquets, [], fautesPaquets.join('\n'));

  const fichiersInterdits = ['src/store.ts', 'src/gameLoader.ts', 'src/App.tsx', 'src/Game.tsx'];
  for (const f of fichiersInterdits) {
    assert.ok(!fichiers.has(f), `la page de fréquentation atteint ${f}`);
  }
});

test('la page de fréquentation ne se compte pas elle-même', () => {
  const { fichiers } = grapheDepuis('src/stats/main.tsx');
  assert.ok(
    !fichiers.has('src/systems/analytics.ts'),
    'consulter les statistiques en fabriquerait',
  );
  // Et l'inverse : le battement doit bien partir de l'entrée du jeu, sans quoi
  // la table reste vide et personne ne s'en aperçoit avant des semaines.
  assert.match(read('src/main.tsx'), /startVisitAnalytics\(\)/);
});

test('le battement de fréquentation reste hors du chemin critique du jeu', () => {
  // `systems/analytics` est importé par l'entrée : tout ce qu'il tire est
  // téléchargé avant le menu. Le client Supabase doit donc y rester en import
  // DYNAMIQUE, comme pour le compteur de visiteurs - c'est le contrat « sans
  // clés, supabase-js n'est jamais téléchargé ».
  const source = read('src/systems/analytics.ts');
  assert.doesNotMatch(
    source,
    /(?:^|\n)\s*import[^\n]*from\s*['"]@supabase/,
    'import statique du client réseau : le menu le téléchargerait pour rien',
  );
  for (const spec of runtimeImports('src/systems/analytics.ts')) {
    assert.ok(!/^three(\/|$)/.test(spec), `le battement importe ${spec}`);
  }
});

test('la page de fréquentation a bien son entrée dans le build', () => {
  // Sans cette ligne, `npm run build` ignore stats.html : la page marche en
  // développement et n'existe pas en ligne. Rien ne le signale.
  assert.match(read('vite.config.ts'), /stats:\s*resolve\([^)]*'stats\.html'\)/);
});

test('le battement ne dépose rien sur l’appareil du visiteur', () => {
  // LA promesse de cette fonctionnalité, et celle qui décide de tout le reste :
  // rien n'est écrit chez le visiteur, donc rien ne permet de le reconnaître
  // d'une visite à l'autre, donc il n'y a pas de consentement à demander et pas
  // de bandeau à afficher. Elle se rompt d'une seule ligne - « juste un
  // identifiant, pour distinguer les nouveaux visiteurs » -, et le jour où
  // quelqu'un l'écrira, il faudra que ce test le lui dise avant la mise en
  // ligne, pas un juriste six mois après.
  //
  // On lit le fichier débarrassé de ses commentaires : ce dépôt EXPLIQUE ses
  // choix, et l'explication ci-dessus nomme forcément les mécanismes interdits.
  const source = read('src/systems/analytics.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const interdits = [
    { motif: /\blocalStorage\b/, quoi: 'localStorage' },
    { motif: /\bsessionStorage\b/, quoi: 'sessionStorage' },
    { motif: /\bdocument\.cookie\b/, quoi: 'un cookie' },
    { motif: /\bindexedDB\b/, quoi: 'IndexedDB' },
    { motif: /\bcaches\b/, quoi: 'le cache' },
  ];
  const fautes = interdits.filter(({ motif }) => motif.test(source)).map(({ quoi }) => quoi);
  assert.deepEqual(
    fautes,
    [],
    'Le battement de fréquentation écrit sur l’appareil du visiteur (' +
      `${fautes.join(', ')}). C’est ce qui fait basculer le site dans le champ ` +
      'du consentement ePrivacy. Si c’est voulu, il faut un bandeau et une ' +
      'politique de confidentialité, pas seulement cette ligne.',
  );

  // Et la conséquence, côté table : pas de colonne d'identifiant persistant.
  assert.doesNotMatch(read('supabase/analytics.sql'), /^\s*visitor\s+uuid/m);
});

test('le SQL de la table est versionné et ne rend que des agrégats', () => {
  const sql = read('supabase/analytics.sql');
  assert.match(sql, /enable row level security/i);
  // La lecture des lignes brutes ne doit être ouverte à personne : la clé
  // publique est dans le code livré, donc entre toutes les mains.
  assert.doesNotMatch(sql, /for select\s+to anon/i);
  assert.match(sql, /grant insert on table public\.visit_pings to anon/i);
  for (const fn of ['visit_buckets', 'visit_totals', 'visit_breakdown']) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(`, 'i'), fn);
  }
  // Le ménage efface des lignes : il ne s'expose pas au public.
  assert.match(sql, /revoke all on function public\.visit_prune\(integer\) from public, anon, authenticated/i);
});
