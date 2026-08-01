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
      <p className="site-footer-about">
        <a href="./about.html">{t.footer.about}</a>
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
      <p className="site-footer-producthunt">
        <a
          href="https://www.producthunt.com/products/yamanote-3d?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-yamanote-3d"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            alt="Yamanote 3D - Ride Tokyo&rsquo;s Yamanote Line in a 3D world | Product Hunt"
            width="250"
            height="54"
            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1211399&theme=light&t=1785584654749"
          />
        </a>
      </p>
    </footer>
  );
}
