# Les supports publicitaires du wagon — carte de couverture

Taxonomie de référence et état du rendu, support par support. C'est le cadre
que les lots de références viennent remplir : chaque ligne dit ce qui existe
déjà, sous quelle forme, et ce qu'il faudrait voir pour la corriger.

Sur la Yamanote, la signalétique numérique de bord porte un nom propre —
**トレインチャンネル** (Train Channel) de JR East. L'équivalent Tokyo Metro
s'appelle Tokyo Metro Vision. Le jeu ne rend que la première.

---

## 中吊り広告 — nakazuri kōkoku

Affiches suspendues au plafond, en travers de l'allée centrale.

**État : présent, et c'est le support le mieux traité.** `makeNakazuriTexture`
(`src/textures/procedural.ts:2226`) rend une planche de 1024 × 358 avec sa
réserve de suspension, ses perforations, son grain de papier et son voile de
brillance. `src/three/Ads.tsx` la suspend sur un rail avec pinces, recto et
verso distincts, et deux balancements — le roulis dans le plan de l'affiche,
l'accélération d'avant en arrière.

**À vérifier :** la proportion retenue (≈ 2,9:1) et la présence systématique
du bandeau de marque en pied.

---

## まど上広告 — mado-ue kōkoku

Affiches et panneaux au-dessus des fenêtres, sur toute la longueur.

**État : présent, mais dans une forme que les références démentent.** Douze
panneaux (`Ads.tsx:68`, seeds 100–111), chacun une affiche autonome complète,
posés **par paires** en 0,84 × 0,24 m — soit 3,5:1.

Le lot 2 montre autre chose : des panneaux **numériques par trois**, en ~16:9,
dans un caisson blanc continu, une campagne répartie sur les trois avec des
rôles complémentaires. Le lot 1 montre par ailleurs un bandeau **imprimé** très
allongé, vers 5:1. Les deux coexistent dans les rames réelles.

**Décision en attente :** lequel des deux le wagon doit porter, ou les deux.

---

## ドア横広告 — doa-yoko kōkoku

Affiches encadrées de part et d'autre de chaque porte.

**État : absent.** Aucun support n'est posé au droit des portes. Les seules
affiches encadrées du wagon sont celles des **abouts** (`Car.tsx:531-534`,
seeds 200–203) — c'est du 妻面広告, un sixième support absent de la liste, et
lui est bien présent : trois réclames et une affiche de manières « animaux ».

**Références nécessaires :** le format et le cadre, la hauteur de pose par
rapport à la poignée de porte, et si le support est simple ou double.

---

## ステッカー広告 — sutekkā kōkoku

Petits autocollants publicitaires sur les portes et les vitres.

**État : absent.** `makeDoorStickerTexture`
(`src/textures/procedural.ts:366`) existe, mais c'est un autocollant de
**sécurité** — pictogramme ゆびに注意 / Watch your fingers, main et flèches. Il
n'y a aucun autocollant publicitaire dans le wagon.

**Références nécessaires :** taille réelle rapportée au vantail, position
(haut de vitre, bas de porte, montant), et si le fond est opaque ou
translucide sur la vitre.

---

## 車内デジタルサイネージ — トレインチャンネル

Les dalles au-dessus des portes. Sur E235, deux par porte : écran de ligne à
droite, publicité à gauche.

**État : présent, mais avec la grammaire d'un imprimé, et fixe.** L'écran
gauche passe par `drawLeftAd` (`src/three/adScreen.ts:17`), qui délègue
entièrement à `drawAdInto` — la même pile que le nakazuri : accroche, titre
cerné, corps, chiffre, période, mentions ※, bandeau de marque avec case 検索 et
QR. Or aucun des huit panneaux numériques relevés ne porte de case 検索 ni de
QR.

Et surtout : un seed produit **une image**. Un spot réel est une suite de
plans.

**Références nécessaires — c'est le point bloquant :** trois ou quatre vues du
même spot à quelques secondes d'écart. Sans elles, on ignore si un contenu se
déroule ou reste fixe, et c'est cette réponse qui commande toute
l'architecture du moteur.

---

## Récapitulatif

| Support | Rendu | Forme juste ? |
|---|---|---|
| 中吊り広告 | oui | à vérifier |
| まど上広告 | oui | **non** — proportion, groupement, autonomie des panneaux |
| ドア横広告 | **non** | — |
| ステッカー広告 | **non** | — |
| 車内デジタルサイネージ | oui | **non** — grammaire d'imprimé, et fixe |
| 妻面広告 (abouts) | oui | à vérifier |

Trois supports sur six sont à reprendre, deux sont à créer, un seul tient
probablement.

---

## Statut des sources

Le dépôt suit la convention de `docs/STATION_REALISM.md` :

- **Confirmé** — relevé sur photographie. Les dix clichés des deux premiers
  lots, dont le détail est dans `RELEVE.md`.
- **Plausible, non vérifié** — le guide visuel まど上 reçu en troisième envoi.
  C'est un document **généré**, non un relevé : il s'annonce comme tel
  (« Règles de génération 3D / IA »), ses illustrations sont synthétiques, ses
  exemples déclarés fictifs, et il se contredit sur sa dimension principale —
  une zone de 800–950 × 300–380 mm, donc horizontale, assortie de la règle
  « format vertical le plus fréquent » et de six exemples portrait.

  Il ne peut donc pas arbitrer ce que les photographies tranchent. On en
  retient ce qu'elles ne montrent pas, à ce statut : construction (rails haut
  et bas, feuille de support, film PET, pose à plat), épaisseur visible de 2 à
  4 mm, marges de 15 à 30 mm près des montants, remplacement toutes les 2 à 4
  semaines, et les règles de placement — une affiche par travée, hauteur
  constante, alignement sur toute la voiture, aucun empiètement sur les plans
  de ligne et les équipements de sécurité.
