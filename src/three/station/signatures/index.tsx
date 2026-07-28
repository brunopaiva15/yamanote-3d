// Ce qui ne se paramètre pas : le caractère propre de certaines gares.
//
// Le gabarit décrit très bien une gare ordinaire de la boucle. Il ne dira
// jamais la toiture pliée de Takanawa Gateway, le viaduc de la Chūō–Sōbu qui
// enjambe Akihabara, la halle rivetée d'Ueno ni le faisceau de Nippori. Ces
// gares-là reçoivent donc une charpente à elles, posée par-dessus le gabarit.
//
// Les quatorze gares qui déclarent une signature dans les données l'ont
// désormais toutes. Le dispatch reste explicite et tolérant : une clé ajoutée
// aux données sans son module ne rend rien et retombe proprement sur le
// gabarit, au lieu d'hériter en silence de la dernière branche écrite.

import type { SignatureKey } from '../../../data/stationLayouts';
import type { SigProps } from './kit';
import { Akihabara } from './akihabara';
import { Ebisu } from './ebisu';
import { Gotanda } from './gotanda';
import { Hamamatsucho } from './hamamatsucho';
import { Harajuku } from './harajuku';
import { Nippori } from './nippori';
import { Otsuka } from './otsuka';
import { Shimbashi } from './shimbashi';
import { Shibuya } from './shibuya';
import { Shinjuku } from './shinjuku';
import { TakanawaGateway } from './takanawaGateway';
import { Tokyo } from './tokyo';
import { Ueno } from './ueno';
import { Yurakucho } from './yurakucho';

const DRAWN: Partial<Record<SignatureKey, (p: SigProps) => React.ReactElement>> = {
  tokyo: Tokyo,
  akihabara: Akihabara,
  ueno: Ueno,
  nippori: Nippori,
  otsuka: Otsuka,
  shinjuku: Shinjuku,
  harajuku: Harajuku,
  shibuya: Shibuya,
  ebisu: Ebisu,
  gotanda: Gotanda,
  takanawaGateway: TakanawaGateway,
  hamamatsucho: Hamamatsucho,
  shimbashi: Shimbashi,
  yurakucho: Yurakucho,
};

export function Signature(props: SigProps) {
  const key = props.layout.signature;
  if (!key) return null;
  const Drawn = DRAWN[key];
  if (!Drawn) return null;
  // Nommée pour la sonde de gare : une charpente qui traverse le mobilier
  // doit se lire « charpente ✕ … » et non « (sans nom) ✕ … ».
  return (
    <group name={`charpente-${key}`}>
      <Drawn {...props} />
    </group>
  );
}
