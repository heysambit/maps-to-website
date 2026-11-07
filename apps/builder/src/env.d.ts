/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare {
  interface Env {
    APP_ENV: string;
    PLACES_LOOKUP_ENABLED: string;
    PLACES_ASSERTION_SECRET: string;
    LOCAL_OPERATOR_TOKEN: string;
    GOOGLE_PLACES_API_KEY?: string;
    UPLOADS_ENABLED: string;
    ACCESS_TEAM_DOMAIN: string;
    OPERATOR_ACCESS_AUD: string;
    REVIEWER_ACCESS_AUD: string;
    OPERATOR_EMAILS: string;
    RELEASES: R2Bucket;
    RELEASE_SERVICE_TOKEN: string;
    ALLOWED_RELEASE_HOSTS: string;
    LIVE_DEPLOY_ENABLED: string;
  }
}
