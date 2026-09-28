// Habillage du film vertical : les textes, l'heure et le carton de fin.
//
// Rendu à part, sur fond transparent, puis posé sur les plans au montage
// (scripts/film/compose.mjs) : on garde ainsi une version sans texte pour qui
// préfère écrire directement dans TikTok, et l'on peut retoucher un mot sans
// retourner une seule image du jeu.
//
// Rien n'est animé par le navigateur : tout se calcule à partir de `t`
// (window.__overlay.set), pour que chaque image soit exactement celle voulue.
//
// Zones sûres de TikTok (sur 1080×1920) : ~200 px en haut pour les onglets,
// ~420 px en bas pour la légende et la musique, ~150 px à droite pour les
// boutons. Les textes vivent donc dans la moitié haute, à gauche.

import { createRoot } from 'react-dom/client';
import { Logo } from '../../ui/Logo';
import { DUSK, TOTAL, durOf, startOf } from './timeline';

// --- Écriture -------------------------------------------------------------

interface Caption {
  id: string;
  /** Lignes ; un mot entre crochets est surligné en vert Yamanote. */
  lines: string[];
  tIn: number;
  tOut: number;
  size?: number;
}

const S = startOf;

const CAPTIONS: Caption[] = [
  { id: 'hook', lines: ['POV :', 'ton trajet du matin', 'à [Tokyo]'], tIn: 0.12, tOut: S('distributeur'), size: 92 },
  { id: 'cafe', lines: ["d'abord,", 'un café chaud ☕'], tIn: S('distributeur') + 0.2, tOut: S('monter') },
  { id: 'monter', lines: ["la porte s'ouvre.", 'on monte.'], tIn: S('monter') + 0.25, tOut: S('assis') },
  { id: 'assis', lines: ['une place assise.', 'la journée peut', 'commencer.'], tIn: S('assis') + 0.3, tOut: S('ecran') },
  { id: 'ecran', lines: ['[30] gares.', 'une boucle.', '[67] minutes.'], tIn: S('ecran') + 0.15, tOut: S('fenetre') },
  { id: 'soir', lines: ['…puis le soir', 'tombe sur [Tokyo]'], tIn: S('fenetre') + 0.3, tOut: S('soir') + 0.5 },
];

/** L'heure affichée dans chaque plan : le fil du « quotidien ». */
function clockAt(t: number): number {
  const at = (name: Parameters<typeof S>[0]) => t >= S(name);
  if (at('soir')) return 19 * 60 + 40;
  if (at('fenetre')) {
    const k = ease(0, durOf('fenetre'), t - S('fenetre'));
    return DUSK.from + (DUSK.to - DUSK.from) * k;
  }
  if (at('ecran')) return 7 * 60 + 46;
  if (at('assis')) return 7 * 60 + 44;
  if (at('monter')) return 7 * 60 + 43;
  if (at('distributeur')) return 7 * 60 + 42;
  return 7 * 60 + 41;
}

const END_AT = S('soir') + 0.5;

// --- Mouvement -------------------------------------------------------------

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
function ease(a: number, b: number, t: number) {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}
/** Arrivée avec un léger dépassement : le mot « tombe » en place. */
function back(x: number) {
  const c = 1.9;
  const y = x - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
}

// --- Rendu -----------------------------------------------------------------

function Words({ line }: { line: string }) {
  return (
    <>
      {line.split(' ').map((w, i) => {
        const hi = w.startsWith('[');
        const text = w.replace(/[[\]]/g, '');
        return (
          <span key={i} className={`w${hi ? ' hi' : ''}`}>
            {text}
          </span>
        );
      })}
    </>
  );
}

function Overlay() {
  return (
    <div className="stage">
      <div className="scrim-top" />
      <div className="scrim-end" />
      {CAPTIONS.map((c) => (
        <div key={c.id} className="cap" data-cap={c.id} style={{ fontSize: c.size ?? 80 }}>
          {c.lines.map((l, i) => (
            <div key={i} className="line">
              <Words line={l} />
            </div>
          ))}
          {c.id === 'hook' ? (
            <div className="sign" data-part="sign">
              <div className="sign-top">
                <span className="sign-kanji">渋谷</span>
                <span className="sign-kana">しぶや</span>
              </div>
              <div className="sign-band">
                <span className="sign-code">JY20</span>
                <span className="sign-roman">Shibuya</span>
              </div>
            </div>
          ) : null}
          {c.id === 'cafe' ? (
            <div className="tag" data-part="price">
              ¥140 · carte IC
            </div>
          ) : null}
        </div>
      ))}
      <div className="stamp">
        <span className="stamp-dot" />
        <span className="stamp-time">07:41</span>
      </div>
      <div className="end">
        <div className="end-logo">
          <Logo />
        </div>
        <div className="end-line" data-part="l1">
          gratuit, dans ton navigateur
        </div>
        <div className="end-url" data-part="l2">
          brunopaiva15.github.io/yamanote-3d
        </div>
        <div className="end-note" data-part="l3">
          lien en bio
        </div>
      </div>
    </div>
  );
}

const css = `
html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: transparent; }
body.bg { background: #6d7680; }
.stage { position: relative; width: 1080px; height: 1920px; font-family: 'Inter', 'Noto Sans JP', sans-serif; color: #fff; }
.scrim-top { position: absolute; inset: 0 0 auto 0; height: 900px; background: linear-gradient(180deg, rgba(8,12,18,.42) 0%, rgba(8,12,18,.18) 55%, rgba(8,12,18,0) 100%); }
.scrim-end { position: absolute; inset: 0; background: radial-gradient(120% 70% at 50% 42%, rgba(10,16,24,.30) 0%, rgba(6,10,16,.66) 100%); opacity: 0; }
.cap { position: absolute; left: 76px; top: 250px; width: 860px; font-weight: 900; line-height: 1.08; letter-spacing: -0.02em; }
.line { white-space: nowrap; }
.w { display: inline-block; margin-right: .24em; text-shadow: 0 6px 26px rgba(0,0,0,.45), 0 2px 4px rgba(0,0,0,.55); will-change: transform, opacity; }
.w.hi { color: #10240a; background: #9acd32; padding: 0 .16em .04em; border-radius: .16em; text-shadow: none; box-shadow: 0 6px 24px rgba(0,0,0,.3); }
.sign { margin-top: 44px; width: 430px; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 10px 34px rgba(0,0,0,.35); color: #1b1f22; }
.sign-top { display: flex; align-items: baseline; gap: 18px; padding: 16px 26px 10px; font-family: 'Noto Sans JP', sans-serif; }
.sign-kanji { font-size: 76px; font-weight: 900; letter-spacing: .06em; line-height: 1; }
.sign-kana { font-size: 30px; font-weight: 700; color: #50585e; }
.sign-band { display: flex; align-items: center; gap: 16px; padding: 10px 22px; background: #9acd32; }
.sign-code { font-size: 26px; font-weight: 800; background: #fff; color: #2f4d10; border: 4px solid #2f4d10; border-radius: 10px; padding: 0 10px; line-height: 1.25; }
.sign-roman { font-size: 34px; font-weight: 800; color: #10240a; }
.tag { display: inline-block; margin-top: 30px; font-size: 40px; font-weight: 800; padding: 10px 24px; border-radius: 999px; background: rgba(255,255,255,.94); color: #1b1f22; box-shadow: 0 8px 26px rgba(0,0,0,.3); }
.stamp { position: absolute; right: 70px; top: 176px; display: flex; align-items: center; gap: 14px; padding: 12px 24px 12px 20px; border-radius: 999px; background: rgba(12,16,22,.55); backdrop-filter: blur(6px); font-weight: 800; font-size: 44px; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.stamp-dot { width: 18px; height: 18px; border-radius: 50%; background: #9acd32; box-shadow: 0 0 14px #9acd32; }
.end { position: absolute; left: 0; right: 0; top: 520px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.end-logo { width: 860px; padding: 34px 40px 26px; border-radius: 40px; background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.end-logo .logo { max-width: none; width: 100%; margin: 0; }
.end-line { margin-top: 64px; font-size: 62px; font-weight: 900; letter-spacing: -0.02em; text-shadow: 0 6px 26px rgba(0,0,0,.5); }
.end-url { margin-top: 30px; font-size: 40px; font-weight: 800; padding: 14px 34px; border-radius: 999px; background: #9acd32; color: #10240a; }
.end-note { margin-top: 26px; font-size: 34px; font-weight: 700; opacity: .8; }
`;

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const params = new URLSearchParams(location.search);
if (params.get('bg')) document.body.classList.add('bg');

createRoot(document.getElementById('root')!).render(<Overlay />);

// --- Pose d'un instant ------------------------------------------------------

function pad(n: number) {
  return String(Math.floor(n)).padStart(2, '0');
}

function set(t: number) {
  // Légendes, mot à mot.
  for (const c of CAPTIONS) {
    const el = document.querySelector<HTMLElement>(`[data-cap="${c.id}"]`);
    if (!el) continue;
    const out = ease(c.tOut - 0.2, c.tOut, t);
    const live = t >= c.tIn - 0.01 && t < c.tOut;
    el.style.display = live ? '' : 'none';
    if (!live) continue;
    el.style.opacity = String(1 - out);
    el.style.transform = `translateY(${-14 * out}px)`;
    const words = el.querySelectorAll<HTMLElement>('.w');
    words.forEach((w, i) => {
      const k = clamp01((t - c.tIn - i * 0.065) / 0.3);
      w.style.opacity = String(clamp01(k * 2.2));
      w.style.transform = `translateY(${(1 - back(k)) * 34}px) scale(${0.94 + 0.06 * back(k)})`;
    });
    const parts = el.querySelectorAll<HTMLElement>('[data-part]');
    parts.forEach((p) => {
      const at = p.dataset.part === 'price' ? S('distributeur') + 3.3 : c.tIn + 0.55;
      const k = clamp01((t - at) / 0.32);
      p.style.opacity = String(clamp01(k * 2));
      p.style.transform = `translateY(${(1 - back(k)) * 30}px)`;
    });
  }

  // L'heure.
  const stamp = document.querySelector<HTMLElement>('.stamp')!;
  const m = clockAt(t);
  stamp.querySelector('.stamp-time')!.textContent = `${pad(m / 60)}:${pad(m % 60)}`;
  const stampIn = ease(0.35, 0.65, t);
  const stampOut = ease(END_AT - 0.1, END_AT + 0.2, t);
  stamp.style.opacity = String(stampIn * (1 - stampOut));
  // Pendant l'accéléré, l'heure grossit un peu : c'est elle qu'on regarde.
  const dusk = ease(S('fenetre'), S('fenetre') + 0.4, t) * (1 - ease(S('soir') - 0.3, S('soir'), t));
  stamp.style.transform = `scale(${1 + 0.18 * dusk})`;
  stamp.style.transformOrigin = 'right center';

  // Voile du haut : lisibilité des légendes, jamais pendant le carton.
  const top = document.querySelector<HTMLElement>('.scrim-top')!;
  top.style.opacity = String(ease(0, 0.2, t) * (1 - ease(END_AT - 0.2, END_AT + 0.2, t)));

  // Carton de fin.
  const endK = ease(END_AT, END_AT + 0.45, t);
  document.querySelector<HTMLElement>('.scrim-end')!.style.opacity = String(endK);
  const end = document.querySelector<HTMLElement>('.end')!;
  end.style.display = t >= END_AT ? '' : 'none';
  const logo = end.querySelector<HTMLElement>('.end-logo')!;
  const kl = clamp01((t - END_AT - 0.1) / 0.45);
  logo.style.opacity = String(clamp01(kl * 2));
  logo.style.transform = `translateY(${(1 - back(kl)) * 60}px) scale(${0.9 + 0.1 * back(kl)}) rotate(${(1 - back(kl)) * -2}deg)`;
  end.querySelectorAll<HTMLElement>('[data-part]').forEach((p, i) => {
    const k = clamp01((t - END_AT - 0.55 - i * 0.22) / 0.35);
    p.style.opacity = String(clamp01(k * 2));
    p.style.transform = `translateY(${(1 - back(k)) * 30}px)`;
  });
}

const win = window as unknown as Record<string, unknown>;
win.__overlay = { set, total: TOTAL };
// Laisser React poser le DOM, puis l'instant demandé dans l'URL.
requestAnimationFrame(() => {
  set(Number(params.get('t') ?? 0));
  win.__overlayReady = true;
});
