/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_MOYASAR_PUBLISHABLE_KEY?: string
  readonly VITE_MOYASAR_WEBHOOK_FUNCTION_NAME?: string
  readonly VITE_ENABLE_AUTH_RATE_LIMIT?: string
  readonly VITE_AUTH_RATE_LIMIT_FUNCTION_NAME?: string
  readonly VITE_DEFAULT_VAT_RATE_PERCENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
