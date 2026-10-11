/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GA_ID: string;
  readonly VITE_PLAUSIBLE_DOMAIN: string;
  readonly VITE_ENABLE_ANALYTICS: string;
  readonly VITE_ENABLE_MOCK_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}