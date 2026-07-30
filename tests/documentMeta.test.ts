// Les métadonnées traduites, et la langue lue dans l'URL.
//
// index.html ne porte que l'anglais - c'est la version servie, celle que lit un
// robot sans JavaScript. Les deux autres langues n'existent que dans
// `src/i18n/strings.ts`, et elles finissent pourtant en titre d'onglet, en
// extrait de résultat de recherche et en carte de partage. Personne ne les
// relit : ce fichier tient les mêmes contraintes de longueur que
// `tests/seo.test.mjs` impose à l'anglais, pour les trois.
//
// `langFromUrl` est l'autre moitié du contrat : index.html déclare
// `hreflang="ja"` pour `?lang=ja`, et cette déclaration n'est vraie que si la
// page ainsi ouverte s'affiche vraiment en japonais.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fixtures/ts-resolve.mjs', import.meta.url);

const { LANGS, STRINGS, langFromUrl } = await import('../src/i18n/strings.ts');

/** Pose une URL courante le temps d'un appel, comme le ferait le navigateur. */
function withLocation<T>(href: string | null, run: () => T): T {
  const globals = globalThis as { location?: unknown };
  const had = 'location' in globals;
  const previous = globals.location;
  if (href === null) delete globals.location;
  else globals.location = { href };
  try {
    return run();
  } finally {
    if (had) globals.location = previous;
    else delete globals.location;
  }
}

test('chaque langue a un titre exploitable par un moteur de recherche', () => {
  for (const lang of LANGS) {
    const { documentTitle } = STRINGS[lang];
    // Les titres japonais sont plus courts en caractères à information égale ;
    // la borne haute reste celle de la troncature de Google.
    assert.ok(
      documentTitle.length >= 20 && documentTitle.length <= 70,
      `titre ${lang} de ${documentTitle.length} caractères : ${documentTitle}`,
    );
    // Le nom du jeu doit y être : c'est la requête par laquelle on revient.
    assert.match(documentTitle, /Yamanote 3D/, `le titre ${lang} ne nomme pas le jeu`);
    assert.ok(documentTitle.includes('山手線'), `le titre ${lang} perd 山手線`);
  }
});

test("chaque langue a une description de la longueur d'un extrait", () => {
  for (const lang of LANGS) {
    const { documentDescription } = STRINGS[lang];
    // Le japonais dit la même chose en deux fois moins de caractères ; la borne
    // haute, elle, est la même pour tous : c'est celle de la troncature.
    const min = lang === 'ja' ? 60 : 120;
    assert.ok(
      documentDescription.length >= min && documentDescription.length <= 170,
      `description ${lang} de ${documentDescription.length} caractères`,
    );
  }
});

test('les locales Open Graph sont distinctes et bien formées', () => {
  const locales = LANGS.map((lang) => STRINGS[lang].ogLocale);
  for (const locale of locales) assert.match(locale, /^[a-z]{2}_[A-Z]{2}$/);
  assert.equal(new Set(locales).size, LANGS.length, 'deux langues partagent une locale');
  // og:locale et l'attribut lang doivent désigner la même langue.
  for (const lang of LANGS) {
    assert.equal(STRINGS[lang].ogLocale.slice(0, 2), STRINGS[lang].htmlLang);
  }
});

test('?lang= impose la langue, et seulement une langue connue', () => {
  for (const lang of LANGS) {
    assert.equal(withLocation(`https://example.org/?lang=${lang}`, langFromUrl), lang);
  }
  // Une valeur qu'on ne sait pas servir : on n'invente pas, on laisse la
  // détection habituelle faire son travail.
  assert.equal(withLocation('https://example.org/?lang=de', langFromUrl), null);
  assert.equal(withLocation('https://example.org/?lang=', langFromUrl), null);
  assert.equal(withLocation('https://example.org/', langFromUrl), null);
  // Hors navigateur (rendu de test, script Node) : rien à lire, rien à casser.
  assert.equal(withLocation(null, langFromUrl), null);
});

test("la langue de l'URL survit aux autres paramètres", () => {
  assert.equal(withLocation('https://example.org/?utm_source=x&lang=ja', langFromUrl), 'ja');
  assert.equal(withLocation('https://example.org/?lang=fr#seat', langFromUrl), 'fr');
});
