# Licences — monde géographique importé

Généré pour la quatrième passe du paysage. Ne pas inventer de source ici :
chaque couche porte sa provenance dans `src/data/geo/provenance.ts` et dans
les propriétés des GeoJSON sous `data/geo/`.

## 1. OpenStreetMap (ODbL 1.0)

© les contributeurs OpenStreetMap — https://www.openstreetmap.org/copyright

Couches concernées :

- tracé de la 山手線 (relation `5376382`) → `data/geo/yamanote-loop.geojson`
- trait de côte, baie, rivières et canaux → `data/geo/water.geojson`
- secteurs et masses urbaines → `data/geo/sectors.json`
- repères réels à moins de 2 km → `data/geo/near-landmarks.geojson`
- empreintes de bâtiments du corridor (quand le build les a tirées)

Toute œuvre dérivée de ces données reste sous ODbL 1.0.

## 2. 国土地理院 — modèle numérique de terrain

出典：国土地理院ウェブサイト

- tuiles `dem10b` / `dem5a` → profil de voie et champ de hauteurs
- licence : 国土地理院コンテンツ利用規約 (réutilisation libre avec mention)

## 3. Project PLATEAU (国土交通省) — CC BY 4.0

© 国土交通省 Project PLATEAU — https://www.geospatial.jp/ckan/dataset/plateau-tokyo23ku

- CityGML des 23 arrondissements, corridor ±300 m autour de la voie
- les GLB du prototype sous `public/world/plateau/` portent leur propre
  `LICENSE.md` (échantillon synthétique tant que le build n’a pas tourné sur
  les vraies archives)

## 4. Faits semi-statiques datés

Certains objets n’existent que dans une fenêtre civile (Takanawa Gateway
ouverte le 14 mars 2020, Scramble Square en 2019, Miyashita Park reconstruit
en 2020, gare de bois de Harajuku démolie en 2020…). Leur validité est lue
depuis le sélecteur de date du menu (`runtime.tokyoDate`) via
`src/data/geo/provenance.ts`.
