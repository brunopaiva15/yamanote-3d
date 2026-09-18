// Choix de version, posé APRÈS le clic sur « Monter à bord ».
//
// Ce n'est plus un sélecteur du menu : on ne demande pas de trancher 3D ou
// sonore avant même d'avoir décidé de monter. Le geste d'embarquer ouvre
// d'abord cette question, avec un exemple de chaque voyage - la vitre et la
// ville d'un côté, l'afficheur et les sous-titres de l'autre - pour que le
// choix se lise plutôt qu'il ne s'explique.
//
// Les dessins sont du SVG inline, comme le logo : rien à télécharger, et
// surtout rien de three.js. Cette carte appartient encore au menu, donc au
// bundle initial ; y faire entrer le moteur de rendu reviendrait à le
// télécharger avant même d'avoir choisi de s'en passer.

import { useEffect, useRef } from 'react';
import type { GameMode } from '../systems/gameMode';
import { useT } from '../i18n';

export function ModePick({
  onPick,
  onBack,
  pending,
}: {
  onPick: (mode: GameMode) => void;
  onBack: () => void;
  pending: GameMode | null;
}) {
  const t = useT();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const loading = pending !== null;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || loading) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onBack]);

  return (
    <div className="mode-pick" role="dialog" aria-modal="true" aria-labelledby="mode-pick-title">
      <button
        type="button"
        className="mode-pick-back"
        onClick={onBack}
        disabled={loading}
      >
        ← {t.start.modePickBack}
      </button>
      <h2 id="mode-pick-title" className="mode-pick-title" tabIndex={-1} ref={titleRef}>
        {t.start.modePickTitle}
      </h2>
      <p className="mode-pick-lead">{t.start.modePickLead}</p>
      <div className="mode-pick-grid">
        <ModeCard
          mode="full"
          title={t.start.modeFull}
          example={t.start.modeFullExample}
          note={t.start.modeFullNote}
          exampleLabel={t.start.modePickExample}
          busy={pending === 'full'}
          locked={loading}
          onPick={onPick}
        />
        <ModeCard
          mode="audio"
          title={t.start.modeAudio}
          example={t.start.modeAudioExample}
          note={t.start.modeAudioNote}
          exampleLabel={t.start.modePickExample}
          busy={pending === 'audio'}
          locked={loading}
          onPick={onPick}
        />
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  title,
  example,
  note,
  exampleLabel,
  busy,
  locked,
  onPick,
}: {
  mode: GameMode;
  title: string;
  example: string;
  note: string;
  exampleLabel: string;
  busy: boolean;
  locked: boolean;
  onPick: (mode: GameMode) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={`mode-card mode-card--${mode}${busy ? ' is-busy' : ''}`}
      onClick={() => onPick(mode)}
      disabled={locked}
      aria-label={`${title}. ${example}`}
    >
      <span className="mode-card-preview" aria-hidden="true">
        {mode === 'full' ? <FullPreview /> : <AudioPreview />}
        <span className="mode-card-badge">{exampleLabel}</span>
      </span>
      <span className="mode-card-body">
        <strong className="mode-card-title">{title}</strong>
        <span className="mode-card-example">{example}</span>
        <span className="mode-card-note">{note}</span>
        {busy ? <span className="mode-card-loading">{t.start.loading}</span> : null}
      </span>
    </button>
  );
}

/** Vitre de rame, Tokyo au dehors : ce qu'on voit en 3D. */
function FullPreview() {
  return (
    <svg className="mode-card-art" viewBox="0 0 320 176" role="img" fontFamily="inherit">
      <defs>
        <linearGradient id="mode-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8ec8ea" />
          <stop offset="0.55" stopColor="#c5e3f4" />
          <stop offset="1" stopColor="#e7d7b8" />
        </linearGradient>
        <linearGradient id="mode-seat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a6ea3" />
          <stop offset="1" stopColor="#2f4d7a" />
        </linearGradient>
      </defs>
      {/* Paroi du wagon. */}
      <rect width="320" height="176" fill="#2a3138" />
      {/* Vitre. */}
      <rect x="18" y="12" width="284" height="92" rx="3" fill="url(#mode-sky)" />
      {/* Ville. */}
      <rect x="28" y="58" width="22" height="46" fill="#6d7c88" />
      <rect x="52" y="46" width="18" height="58" fill="#55636e" />
      <rect x="72" y="54" width="28" height="50" fill="#7b8893" />
      <rect x="104" y="40" width="16" height="64" fill="#4e5c67" />
      <rect x="124" y="52" width="24" height="52" fill="#68757f" />
      {/* Tokyo Tower. */}
      <polygon points="168,28 174,104 162,104" fill="#c45c3a" />
      <rect x="165" y="48" width="12" height="3" fill="#e8d9a8" />
      <rect x="198" y="50" width="20" height="54" fill="#5b6a75" />
      <rect x="220" y="36" width="14" height="68" fill="#47555f" />
      <rect x="236" y="58" width="32" height="46" fill="#708089" />
      <rect x="270" y="44" width="18" height="60" fill="#54636d" />
      {/* Rame d'en face, verte. */}
      <rect x="30" y="78" width="110" height="22" rx="3" fill="#6cb032" />
      <rect x="38" y="82" width="18" height="12" fill="#cfe8ff" />
      <rect x="62" y="82" width="18" height="12" fill="#cfe8ff" />
      <rect x="86" y="82" width="18" height="12" fill="#cfe8ff" />
      <rect x="110" y="82" width="18" height="12" fill="#cfe8ff" />
      {/* Encadrement de vitre. */}
      <rect
        x="18"
        y="12"
        width="284"
        height="92"
        rx="3"
        fill="none"
        stroke="#14181c"
        strokeWidth="8"
      />
      {/* Tablette sous la vitre. */}
      <rect x="10" y="108" width="300" height="10" fill="#1a1f24" />
      {/* Banquette. */}
      <rect x="8" y="128" width="304" height="40" rx="4" fill="url(#mode-seat)" />
      <rect x="16" y="122" width="52" height="10" rx="2" fill="#eef2f4" />
      <rect x="84" y="122" width="52" height="10" rx="2" fill="#eef2f4" />
      <rect x="184" y="122" width="52" height="10" rx="2" fill="#eef2f4" />
      <rect x="252" y="122" width="52" height="10" rx="2" fill="#eef2f4" />
      {/* Poignées jaunes. */}
      <path d="M70 12 v28" stroke="#e2c14a" strokeWidth="3" />
      <ellipse cx="70" cy="46" rx="9" ry="7" fill="none" stroke="#e2c14a" strokeWidth="3" />
      <path d="M250 12 v28" stroke="#e2c14a" strokeWidth="3" />
      <ellipse cx="250" cy="46" rx="9" ry="7" fill="none" stroke="#e2c14a" strokeWidth="3" />
    </svg>
  );
}

/** Dalle au-dessus de la porte, sous-titres : ce qu'on voit en version sonore. */
function AudioPreview() {
  return (
    <svg className="mode-card-art" viewBox="0 0 320 176" role="img" fontFamily="inherit">
      <defs>
        <linearGradient id="mode-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0efe9" />
          <stop offset="1" stopColor="#d4d3cb" />
        </linearGradient>
      </defs>
      <rect width="320" height="176" fill="url(#mode-wall)" />
      {/* Réserve de la dalle. */}
      <rect x="28" y="14" width="264" height="118" rx="6" fill="#eeece6" stroke="#c9c6bc" />
      {/* Feuillure. */}
      <rect x="44" y="24" width="232" height="86" rx="3" fill="#1b1f24" />
      {/* Écran. */}
      <rect x="50" y="28" width="220" height="74" fill="#e9e9e9" />
      <rect x="50" y="28" width="220" height="16" fill="#191a17" />
      <text x="58" y="40" fontSize="9" fontWeight="700" fill="#54af00">
        山手線
      </text>
      <text x="248" y="40" fontSize="8" fill="#d8d8d0" textAnchor="end">
        12:34
      </text>
      <text x="160" y="64" fontSize="11" fill="#6e7278" textAnchor="middle">
        次は
      </text>
      <text x="160" y="84" fontSize="18" fontWeight="800" fill="#16181a" textAnchor="middle">
        渋谷
      </text>
      <rect x="50" y="94" width="220" height="8" fill="#54af00" />
      {/* Sous-titres, en bas. */}
      <rect x="36" y="142" width="248" height="22" rx="4" fill="#10151a" />
      <text x="160" y="157" fontSize="10" fill="#eef1f2" textAnchor="middle">
        次は、渋谷です。
      </text>
    </svg>
  );
}
