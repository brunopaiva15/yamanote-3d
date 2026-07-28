// Ce qui ne se paramètre pas : le caractère propre de certaines gares.
//
// Le gabarit décrit très bien une gare ordinaire de la boucle. Il ne dira
// jamais la toiture pliée de Takanawa Gateway, le viaduc de la Chūō–Sōbu qui
// enjambe Akihabara, la halle rivetée d'Ueno ni le faisceau de Nippori. Ces
// gares-là reçoivent donc une charpente à elles, posée par-dessus le gabarit.
//
// Quatorze gares déclarent une signature dans les données ; celles qui ne sont
// pas encore dessinées ne rendent rien et retombent proprement sur le gabarit.
// Sans ce dispatch explicite, une nouvelle clé héritait en silence de la
// charpente de la dernière branche écrite.

import type { SignatureKey } from '../../../data/stationLayouts';
import type { SigProps } from './kit';
import { Akihabara } from './akihabara';
import { Harajuku } from './harajuku';
import { Nippori } from './nippori';
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
  shinjuku: Shinjuku,
  harajuku: Harajuku,
  shibuya: Shibuya,
  takanawaGateway: TakanawaGateway,
  yurakucho: Yurakucho,
};

export function Signature(props: SigProps) {
  const key = props.layout.signature;
  if (!key) return null;
  const Drawn = DRAWN[key];
  return Drawn ? <Drawn {...props} /> : null;
}
