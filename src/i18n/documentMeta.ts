// Ce que le document raconte de lui-même, tenu à jour avec la langue affichée :
// l'attribut lang, le titre, la description, les balises Open Graph et Twitter,
// l'URL canonique.
//
// Pourquoi côté client alors que le référencement aime le statique ? Parce que
// le site est UNE page servie telle quelle : index.html porte déjà la version
// anglaise complète, celle que lit un robot qui n'exécute rien. Ce module ne
// crée aucune balise - il réécrit celles qui sont déjà là, et seulement quand
// la langue réelle du visiteur diffère de l'anglais par défaut. Un moteur qui
// exécute le JavaScript (Googlebot, Bingbot) voit la page dans la langue
// annoncée par l'alternate qu'il a suivi ; un moteur qui ne l'exécute pas voit
// l'anglais, qui est correct.

import { LANG_PARAM, LANGS, STRINGS, langFromUrl, type Lang } from './strings';

/**
 * URL canonique du site, lue une fois dans le document plutôt que recopiée
 * ici : index.html en est la source unique, et un déploiement ailleurs (racine
 * d'un domaine, autre hébergeur) n'a qu'un fichier à changer. Sans balise
 * canonique - page ouverte depuis un fichier local, test hors navigateur - on
 * se rabat sur l'URL courante, privée de sa requête.
 */
function readSiteUrl(): string {
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const declared = link?.getAttribute('href');
  if (declared) return declared;
  if (typeof location === 'undefined') return '';
  return `${location.origin}${location.pathname}`;
}

const SITE_URL = typeof document === 'undefined' ? '' : readSiteUrl();

/** URL canonique de la page dans une langue donnée. */
export function canonicalFor(lang: Lang | null): string {
  if (!SITE_URL || !lang) return SITE_URL;
  const url = new URL(SITE_URL);
  url.searchParams.set(LANG_PARAM, lang);
  return url.toString();
}

function setMeta(selector: string, content: string): void {
  const tag = document.querySelector(selector);
  if (tag) tag.setAttribute('content', content);
}

/**
 * Répercute la langue sur le document.
 *
 * `pinToUrl` distingue les deux façons dont la langue se décide, et elles ne
 * méritent pas le même traitement d'URL :
 *
 * - détectée (navigateur, préférence mémorisée) : l'URL reste nue. C'est elle
 *   le x-default, celle qui s'adapte au visiteur ; y coller un `?lang=` ferait
 *   diverger la page indexée de sa déclaration ;
 * - choisie explicitement au sélecteur : l'URL prend `?lang=…`, elle devient
 *   partageable telle quelle et sa canonique la désigne elle-même.
 *
 * `replaceState` et non `pushState` : changer de langue n'est pas une
 * navigation, et le bouton Retour ne doit pas avoir à défaire trois essais.
 */
export function applyDocumentLang(lang: Lang, pinToUrl = false): void {
  if (typeof document === 'undefined') return;
  const s = STRINGS[lang];

  document.documentElement.lang = s.htmlLang;
  document.title = s.documentTitle;

  setMeta('meta[name="description"]', s.documentDescription);
  setMeta('meta[property="og:title"]', s.documentTitle);
  setMeta('meta[property="og:description"]', s.documentDescription);
  setMeta('meta[property="og:locale"]', s.ogLocale);
  setMeta('meta[name="twitter:title"]', s.documentTitle);
  setMeta('meta[name="twitter:description"]', s.documentDescription);

  // Les deux autres locales prennent la place laissée par celle qui est
  // devenue courante ; l'ordre des balises alternate n'a pas de sens propre.
  const alternates = document.querySelectorAll('meta[property="og:locale:alternate"]');
  const others = LANGS.filter((l) => l !== lang).map((l) => STRINGS[l].ogLocale);
  alternates.forEach((tag, i) => {
    if (others[i]) tag.setAttribute('content', others[i]);
  });

  if (pinToUrl && typeof history !== 'undefined' && typeof location !== 'undefined') {
    try {
      const url = new URL(location.href);
      url.searchParams.set(LANG_PARAM, lang);
      history.replaceState(history.state, '', url);
    } catch {
      /* URL non manipulable (about:blank, sandbox) : la langue s'applique quand même */
    }
  }

  // La canonique suit l'URL réellement affichée : `?lang=…` si la langue y est
  // épinglée, l'URL nue sinon. og:url la recopie - les deux ne doivent jamais
  // se contredire, un aperçu de partage se fie à og:url.
  const pinned = pinToUrl ? lang : langFromUrl();
  const canonical = canonicalFor(pinned);
  if (canonical) {
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
    setMeta('meta[property="og:url"]', canonical);
  }
}

/**
 * La couleur dont le navigateur teinte ce qui n'est pas la page : la barre
 * d'état d'un téléphone, le liseré autour de l'onglet.
 *
 * `index.html` la déclare sombre, parce que c'est la couleur du menu et celle
 * de la scène 3D. La version sonore, elle, est une paroi de wagon en blanc
 * cassé : la même valeur y posait un bandeau sombre en haut de l'écran, qui ne
 * ressemblait plus à rien - ni à la page, ni au système. Elle suit donc l'écran
 * affiché, et revient à sa valeur d'origine quand on quitte.
 *
 * `null` restaure la valeur déclarée dans le document.
 */
const DECLARED_THEME =
  typeof document === 'undefined'
    ? ''
    : (document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '');

export function applyThemeColor(color: string | null): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute('content', color ?? DECLARED_THEME);
  // `color-scheme` va avec : sur une paroi claire, c'est un document CLAIR, et
  // c'est lui qui décide de la couleur des ascenseurs de défilement et du
  // texte que le système dessine par-dessus (l'heure, la batterie). Déclaré
  // sombre sur fond blanc cassé, l'un et l'autre devenaient illisibles.
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', color === null ? 'dark' : 'light');
}
