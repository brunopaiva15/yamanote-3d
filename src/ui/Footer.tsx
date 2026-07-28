// Pied de page : copyright, clause de non-affiliation, lien de soutien.

import { useT } from '../i18n';

export function Footer() {
  const t = useT();

  return (
    <footer className="site-footer">
      <p className="site-footer-copy">
        © 2026{' '}
        <a href="https://vergasta.ch" target="_blank" rel="noopener noreferrer">
          Vergasta Digital
        </a>
      </p>
      <p className="site-footer-disclaimer">{t.footer.disclaimer}</p>
      <p className="site-footer-support">
        <a
          href="https://buymeacoffee.com/vergastadigital"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.footer.support}
        </a>
      </p>
    </footer>
  );
}
