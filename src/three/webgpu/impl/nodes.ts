// Raccourcis de types pour TSL.
//
// Les typages de three décrivent chaque nœud par sa forme exacte
// (`VarNode<'vec2', JoinNode<'vec2'>>`…), ce qui est précieux quand on écrit
// une bibliothèque de nœuds et franchement encombrant quand on écrit un
// nuanceur. `Node<'vec2'>` est le dénominateur commun : tout nœud vec2 s'y
// range, et toutes les opérations chaînées y restent disponibles.

import type { Node } from 'three/webgpu';

export type F = Node<'float'>;
export type V2 = Node<'vec2'>;
export type V3 = Node<'vec3'>;
export type V4 = Node<'vec4'>;
