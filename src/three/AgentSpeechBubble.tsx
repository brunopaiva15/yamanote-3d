// La bulle de l'agent de quai, accrochée à sa tête.
//
// Même habillage que celle des voyageurs (three/PaxSpeechBubble), mais une
// source différente : lui ne discute pas, il donne une consigne, et il la
// donne sans qu'on lui ait rien demandé — d'où la variante « aside », plus
// discrète, du même style.

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import { platformAgentSpeech } from '../systems/platformAgent';

export function AgentSpeechBubble() {
  const group = useRef<THREE.Group>(null);
  const [view, setView] = useState({ text: '', revision: -1 });

  useFrame(() => {
    const g = group.current;
    if (g && platformAgentSpeech.active) {
      g.position.set(platformAgentSpeech.x, platformAgentSpeech.y + 0.26, platformAgentSpeech.z);
    }
    if (platformAgentSpeech.revision !== view.revision) {
      setView({
        text: platformAgentSpeech.active ? platformAgentSpeech.text : '',
        revision: platformAgentSpeech.revision,
      });
    }
  });

  return (
    <group ref={group}>
      {view.text.length > 0 && (
        <Html center zIndexRange={[14, 10]} style={{ pointerEvents: 'none' }}>
          <div key={view.revision} className="pax-bubble pax-bubble-staff">
            {view.text}
          </div>
        </Html>
      )}
    </group>
  );
}
