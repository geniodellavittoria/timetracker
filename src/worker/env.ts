/**
 * `Cloudflare.Env` (DB, ASSETS) is generated into worker-configuration.d.ts by
 * `wrangler types`, which runs on postinstall. Secrets never appear in
 * wrangler.jsonc, so LEGACY_CLAIM_EMAIL is declared here instead.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      /**
       * If set, only a registration matching this email (case-insensitive)
       * may claim the pre-accounts legacy data (see `routes/auth.ts`).
       * Optional — leave unset to allow whoever registers first to claim it.
       */
      LEGACY_CLAIM_EMAIL?: string;
    }
  }
}

export type AppEnv = Cloudflare.Env;
export type HonoEnv = { Bindings: AppEnv; Variables: { userId: number } };
