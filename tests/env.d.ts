declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {
    ADMIN_TOKEN_SECRET: string;
  }
}
