declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    RELEASES: R2Bucket;
    LOCAL_OPERATOR_TOKEN: string;
    UPLOADS_ENABLED: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
