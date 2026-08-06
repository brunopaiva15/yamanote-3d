// Aller chercher la donnée dehors, une fois, et savoir quand.
//
// Les quatre imports (voie, relief, eau, secteurs) tapent tous sur un service
// public : Overpass pour OpenStreetMap, les tuiles du 国土地理院 pour le relief.
// Trois règles valent pour les deux :
//
//   · UN CACHE SUR DISQUE. Un import se relance dix fois pendant qu'on le met au
//     point ; retélécharger dix fois vingt mille tuiles serait grossier envers
//     un service gratuit, et lent. Le cache vit dans .cache/geo/, hors dépôt.
//   · DES RÉESSAIS ESPACÉS. Overpass renvoie 429 et 504 quand il est chargé :
//     c'est normal, ce n'est pas une panne, et la bonne réponse est d'attendre.
//   · UNE IDENTITÉ. Un User-Agent qui dit quel projet appelle, comme le
//     demandent les deux services.

import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export const CACHE_DIR = new URL('../../../.cache/geo/', import.meta.url).pathname;

const UA = 'yamanote-3d/geo-import (https://github.com/brunopaiva15/yamanote-3d)';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function cachePath(key, ext) {
  const h = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return join(CACHE_DIR, `${h}.${ext}`);
}

/** Lit le cache s'il existe et n'a pas dépassé `maxAgeDays`. */
function readCache(key, ext, maxAgeDays) {
  const p = cachePath(key, ext);
  if (!existsSync(p)) return null;
  const age = (Date.now() - statSync(p).mtimeMs) / 86400000;
  if (age > maxAgeDays) return null;
  return readFileSync(p);
}

function writeCache(key, ext, buf) {
  const p = cachePath(key, ext);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, buf);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Requête Overpass QL, en JSON. `label` sert aux journaux ; `maxAgeDays` borne
 * la fraîcheur du cache.
 */
export async function overpass(query, { label = 'requête', maxAgeDays = 30, force = false } = {}) {
  const key = `overpass:${query}`;
  if (!force) {
    const hit = readCache(key, 'json', maxAgeDays);
    if (hit) {
      process.stdout.write(`  ${label} : cache\n`);
      return JSON.parse(hit.toString('utf8'));
    }
  }
  let lastErr = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
      });
      if (res.status === 429 || res.status === 504 || res.status === 503) {
        throw new Error(`Overpass ${res.status} (service chargé)`);
      }
      if (!res.ok) throw new Error(`Overpass ${res.status} ${res.statusText}`);
      const text = await res.text();
      const json = JSON.parse(text);
      writeCache(key, 'json', Buffer.from(text, 'utf8'));
      process.stdout.write(`  ${label} : ${json.elements?.length ?? 0} éléments\n`);
      return json;
    } catch (err) {
      lastErr = err;
      const wait = 2000 * 2 ** attempt;
      process.stdout.write(`  ${label} : ${err.message} - nouvel essai dans ${wait / 1000} s\n`);
      await sleep(wait);
    }
  }
  throw new Error(`${label} : Overpass injoignable après six essais. Dernière erreur : ${lastErr}`);
}

/**
 * Une tuile de texte du 国土地理院 (MNT). Renvoie `null` sur 404 : le service
 * répond ainsi pour les tuiles hors couverture, et c'est une information, pas
 * une erreur - le DEM5A ne couvre pas tout, le DEM10B prend le relais.
 */
export async function gsiTile(url, { maxAgeDays = 180, force = false } = {}) {
  const key = `gsi:${url}`;
  if (!force) {
    const hit = readCache(key, 'txt', maxAgeDays);
    if (hit) return hit.length === 0 ? null : hit.toString('utf8');
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404) {
        writeCache(key, 'txt', Buffer.alloc(0));
        return null;
      }
      if (!res.ok) throw new Error(`GSI ${res.status}`);
      const text = await res.text();
      writeCache(key, 'txt', Buffer.from(text, 'utf8'));
      return text;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1000 * 2 ** attempt);
    }
  }
  return null;
}
