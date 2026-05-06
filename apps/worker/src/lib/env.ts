const REQUIRED_ENV = [
  "MASTER_SUPABASE_URL",
  "MASTER_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_MANAGEMENT_API_TOKEN",
  "SUPABASE_ORG_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "WORKER_INTERNAL_TOKEN",
  "HOSTED_SECRETS_KEY",
  "E2B_API_KEY",
  "PUBLIC_SITE_URL",
] as const;

export function validateWorkerEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required hosted worker env: ${missing.join(", ")}`);
  }

  const internalToken = process.env.WORKER_INTERNAL_TOKEN ?? "";
  if (internalToken.length < 32) {
    throw new Error("WORKER_INTERNAL_TOKEN must be set to a high-entropy value");
  }

  getPublicSiteUrl();
}

export function getPublicSiteUrl(): string {
  const value = process.env.PUBLIC_SITE_URL;
  if (!value) throw new Error("PUBLIC_SITE_URL is required");

  try {
    return new URL(value).origin;
  } catch {
    throw new Error("PUBLIC_SITE_URL must be a valid absolute URL");
  }
}
