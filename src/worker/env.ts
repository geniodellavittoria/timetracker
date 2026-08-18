/**
 * `Cloudflare.Env` (DB, ASSETS) is generated into worker-configuration.d.ts by
 * `wrangler types`, which runs on postinstall. Secrets never appear in
 * wrangler.jsonc, so APP_PASSWORD is declared here instead.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      APP_PASSWORD?: string;
    }
  }
}

export type AppEnv = Cloudflare.Env;
export type HonoEnv = { Bindings: AppEnv };
