-- A1: Additive role/permission tables and mapping of existing staff, with no account resets.
CREATE TABLE "staff_roles" (
  "key" VARCHAR(40) PRIMARY KEY,
  "display_name" VARCHAR(80) NOT NULL
);
CREATE TABLE "staff_role_permissions" (
  "role_key" VARCHAR(40) NOT NULL REFERENCES "staff_roles"("key") ON DELETE RESTRICT,
  "permission_key" VARCHAR(80) NOT NULL,
  CONSTRAINT "staff_role_permissions_pkey" PRIMARY KEY ("role_key", "permission_key")
);
CREATE TABLE "staff_role_assignments" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "role_key" VARCHAR(40) NOT NULL REFERENCES "staff_roles"("key") ON DELETE RESTRICT,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "staff_role_assignments_role_key_idx" ON "staff_role_assignments"("role_key");
INSERT INTO staff_roles (key, display_name) VALUES ('OWNER', 'Owner');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'dashboard.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'catalog.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'inventory.adjust');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'orders.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'customers.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'marketing.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'shipping.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'payments.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'staff.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'settings.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('OWNER', 'activity.view');
INSERT INTO staff_roles (key, display_name) VALUES ('MANAGER', 'Manager');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'dashboard.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'catalog.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'inventory.adjust');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'orders.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'customers.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'marketing.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'shipping.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'payments.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'settings.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('MANAGER', 'activity.view');
INSERT INTO staff_roles (key, display_name) VALUES ('CATALOG_EDITOR', 'Catalog Editor');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('CATALOG_EDITOR', 'dashboard.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('CATALOG_EDITOR', 'catalog.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('CATALOG_EDITOR', 'inventory.adjust');
INSERT INTO staff_roles (key, display_name) VALUES ('SUPPORT', 'Support');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('SUPPORT', 'dashboard.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('SUPPORT', 'orders.manage');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('SUPPORT', 'customers.view');
INSERT INTO staff_roles (key, display_name) VALUES ('ANALYST', 'Analyst');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('ANALYST', 'dashboard.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('ANALYST', 'payments.view');
INSERT INTO staff_role_permissions (role_key, permission_key) VALUES ('ANALYST', 'activity.view');
-- Existing OWNER/ADMIN/STAFF accounts keep existing access and map to a safe default workspace role.
INSERT INTO "staff_role_assignments" ("user_id", "role_key")
SELECT id, CASE role::text WHEN 'OWNER' THEN 'OWNER' WHEN 'ADMIN' THEN 'MANAGER' ELSE 'SUPPORT' END
FROM "users" WHERE role::text IN ('OWNER', 'ADMIN', 'STAFF')
ON CONFLICT ("user_id") DO NOTHING;
ALTER TABLE "users" ADD COLUMN "display_name" VARCHAR(120) NOT NULL DEFAULT '';
