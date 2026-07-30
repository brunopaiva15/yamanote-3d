/// <reference types="vite/client" />

// Variables d'environnement lues par Vite au build (préfixe VITE_ obligatoire
// pour être exposées au navigateur). Renseignées en local dans un fichier .env
// et en production via les « Variables » du dépôt GitHub (voir .env.example).
interface ImportMetaEnv {
  /** URL du projet Supabase, ex. https://xxxx.supabase.co (facultatif). */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé publique « anon » du projet Supabase - visible côté client par nature. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
