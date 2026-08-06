// Ce que le salon a à dire au joueur en cours de trajet, et rien de plus.
//
// UNE seule situation le mérite : la rame ATTEND quelqu'un resté à quai. Sans
// un mot, on regarde des portes ouvertes qui ne se ferment pas et l'on se
// demande si le jeu a planté. Avec un mot, c'est une situation de ligne
// parfaitement banale - et c'en est une.
//
// Le message n'est pas le même selon qu'on est celui qu'on attend ou celui qui
// attend. « La rame vous attend » à quelqu'un d'assis dans le wagon lui ferait
// chercher ce qu'il a bien pu faire de travers.
//
// IL Y EN AVAIT DEUX. Le second disait « la rame est partie sans vous » et
// proposait de la rattraper. Il n'a plus lieu d'être : la rame ne part plus
// sans personne (voir systems/net/hold), donc ce message ne peut plus
// s'afficher, donc le bouton n'a plus rien à réparer.
//
// Le reste du temps, ce composant ne rend rien. Le multijoueur de ce jeu ne doit
// pas s'inviter à l'écran quand tout va bien.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useRoom } from '../systems/net/room';
import { holdingAshore, holdingSelf } from '../systems/net/hold';

export function RoomNotice() {
  const t = useT();
  const inRoom = useRoom((s) => s.status === 'joined');
  const [aQuai, setAQuai] = useState(0);
  const [moi, setMoi] = useState(false);

  // Sondé deux fois par seconde : cet état vit hors de React, et l'abonner à la
  // boucle d'images ferait re-rendre le HUD soixante fois par seconde pour un
  // compteur qui bouge une fois par arrêt.
  useEffect(() => {
    if (!inRoom) return;
    const id = window.setInterval(() => {
      setAQuai(holdingAshore());
      setMoi(holdingSelf());
    }, 500);
    return () => window.clearInterval(id);
  }, [inRoom]);

  if (!inRoom || aQuai <= 0) return null;

  // Quand c'est nous qu'on attend, le nombre n'apprend rien : on sait très bien
  // où l'on est. Quand ce sont les autres, il dit combien de temps ça peut
  // durer, et c'est la seule chose qu'on veuille savoir.
  if (moi) {
    return (
      <div className="room-notice">
        <span>{t.room.holding}</span>
      </div>
    );
  }

  return (
    <div className="room-notice">
      <span>{t.room.holdingOthers}</span>
      <span className="room-notice-count">{aQuai}</span>
    </div>
  );
}
