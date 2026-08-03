// Ce que le salon a à dire au joueur en cours de trajet, et rien de plus.
//
// Deux situations, deux seulement, et toutes deux méritent un mot parce qu'elles
// changent ce que le joueur voit sans qu'il l'ait demandé :
//
//  · la rame ATTEND quelqu'un resté à quai. Sans un mot, on regarde des portes
//    ouvertes qui ne se ferment pas et l'on se demande si le jeu a planté. Avec
//    un mot, c'est une situation de ligne parfaitement banale - et c'en est une.
//
//  · la rame est PARTIE sans nous. C'est le moment où notre monde cesse d'être
//    celui du salon : on continue de jouer, on continue de discuter, mais on
//    n'est plus dans le même train. Le taire serait le pire des choix - les
//    autres deviendraient invisibles sans explication.
//
// Le reste du temps, ce composant ne rend rien. Le multijoueur de ce jeu ne doit
// pas s'inviter à l'écran quand tout va bien.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useRoom } from '../systems/net/room';
import { holdRemaining, isDetached } from '../systems/net/hold';
import { rejoinRoomWorld } from '../systems/net/worldSync';

export function RoomNotice() {
  const t = useT();
  const inRoom = useRoom((s) => s.status === 'joined');
  const [attente, setAttente] = useState(0);
  const [detache, setDetache] = useState(false);

  // Sondé deux fois par seconde : ces deux états vivent hors de React (l'un
  // dans le runtime, l'autre dans un module), et les abonner à la boucle
  // d'images ferait re-rendre le HUD soixante fois par seconde pour afficher un
  // compte à rebours au dixième.
  useEffect(() => {
    if (!inRoom) return;
    const id = window.setInterval(() => {
      setAttente(holdRemaining());
      setDetache(isDetached());
    }, 500);
    return () => window.clearInterval(id);
  }, [inRoom]);

  if (!inRoom) return null;

  if (detache) {
    return (
      <div className="room-notice room-notice-detached">
        <span>{t.room.detached}</span>
        <button type="button" className="room-notice-action" onClick={() => rejoinRoomWorld()}>
          {t.room.rejoin}
        </button>
      </div>
    );
  }

  if (attente > 0) {
    return (
      <div className="room-notice">
        <span>{t.room.holding}</span>
        <span className="room-notice-count">{Math.ceil(attente)}&nbsp;s</span>
      </div>
    );
  }

  return null;
}
