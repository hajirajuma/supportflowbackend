-- Remove subdomain-based tenancy: tenant identification now comes exclusively
-- from the authenticated JWT (organizationId). The `subdomain` and
-- `customDomain` columns were only used for host-header tenant resolution and
-- vanity subdomain management; neither has a remaining legitimate purpose.

-- Drop unique constraints / indexes on organizations.subdomain
DROP INDEX IF EXISTS "organizations_subdomain_key";
DROP INDEX IF EXISTS "organizations_subdomain_idx";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "subdomain";

-- Drop unique constraints / indexes on organizations.customDomain
DROP INDEX IF EXISTS "organizations_customDomain_key";
DROP INDEX IF EXISTS "organizations_customDomain_idx";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "customDomain";
