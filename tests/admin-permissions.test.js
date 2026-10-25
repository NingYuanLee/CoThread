import { test } from "node:test";
import assert from "node:assert/strict";
import { expandAdminPermissions, adminPermissionForRequest } from "../shared/admin-permissions.js";

test("functions imply page and menu but read permissions never grant write access", () => {
  assert.deepEqual(expandAdminPermissions(["tasks.update"]), ["work", "tasks", "tasks.update"]);
  assert.deepEqual(expandAdminPermissions(["projects"]), ["work", "projects"]);
  assert.deepEqual(expandAdminPermissions(["organization"]), ["organization"]);
  assert.deepEqual(expandAdminPermissions(["unknown"]), []);
  assert.deepEqual(expandAdminPermissions(["roles.assign"]), [
    "organization",
    "accounts",
    "roles.assign",
  ]);
});

test("admin request permissions fail closed and separate read and action access", () => {
  assert.equal(adminPermissionForRequest("GET", "/access"), null);
  assert.equal(adminPermissionForRequest("GET", "/my/projects"), null);
  assert.equal(adminPermissionForRequest("GET", "/my/iterations"), null);
  assert.equal(adminPermissionForRequest("GET", "/my/tasks"), null);
  assert.equal(adminPermissionForRequest("GET", "/my/tasks/example"), null);
  assert.equal(adminPermissionForRequest("GET", "/my/projects/example/members/user/avatar"), null);
  assert.equal(adminPermissionForRequest("GET", "/my/projects/example/image"), null);
  assert.equal(adminPermissionForRequest("GET", "/projects/example/image"), null);
  assert.equal(adminPermissionForRequest("POST", "/my/projects"), false);
  assert.equal(adminPermissionForRequest("PATCH", "/my/tasks/example"), false);
  assert.equal(adminPermissionForRequest("GET", "/projects"), "projects");
  assert.equal(adminPermissionForRequest("POST", "/projects"), "projects.create");
  assert.equal(adminPermissionForRequest("PATCH", "/projects/example/archive"), "projects.archive");
  assert.equal(adminPermissionForRequest("PATCH", "/projects/example/restore"), "projects.restore");
  assert.equal(adminPermissionForRequest("GET", "/tasks/example"), "tasks");
  assert.equal(adminPermissionForRequest("PUT", "/accounts/example/roles"), "roles.assign");
  assert.equal(adminPermissionForRequest("GET", "/role-members"), "roles.assign");
  assert.equal(adminPermissionForRequest("GET", "/accounts/example/role-options"), "roles.assign");
  assert.equal(adminPermissionForRequest("POST", "/accounts/example/role-options"), false);
  assert.equal(adminPermissionForRequest("GET", "/accounts/example/avatar"), "accounts");
  assert.equal(adminPermissionForRequest("GET", "/account-changes"), "account-changes");
  assert.equal(adminPermissionForRequest("GET", "/account-logins"), "account-logins");
  assert.equal(adminPermissionForRequest("POST", "/account-changes"), false);
  assert.deepEqual(expandAdminPermissions(["account-changes.view-all"]), [
    "organization",
    "account-changes",
    "account-changes.view-all",
  ]);
  assert.deepEqual(expandAdminPermissions(["account-logins.view-all"]), [
    "organization",
    "account-logins",
    "account-logins.view-all",
  ]);
  assert.equal(adminPermissionForRequest("POST", "/plugins/skills"), "plugins.create");
  assert.equal(adminPermissionForRequest("PATCH", "/plugins/skills/example"), "plugins.update");
  assert.equal(adminPermissionForRequest("DELETE", "/plugins/skills/example"), "plugins.archive");
  assert.equal(adminPermissionForRequest("GET", "/model-settings"), "model-settings");
  assert.equal(adminPermissionForRequest("PUT", "/model-settings"), "model-settings.update");
  assert.equal(adminPermissionForRequest("POST", "/model-settings"), false);
  assert.deepEqual(expandAdminPermissions(["model-settings.update"]), [
    "platform",
    "model-settings",
    "model-settings.update",
  ]);
  assert.equal(adminPermissionForRequest("PUT", "/roles/example"), false);
  assert.equal(adminPermissionForRequest("POST", "/access"), false);
  assert.equal(adminPermissionForRequest("GET", "/unregistered"), false);
  assert.equal(adminPermissionForRequest("GET", "/orgs"), "orgs");
  assert.equal(adminPermissionForRequest("GET", "/orgs/example"), "orgs");
  assert.equal(adminPermissionForRequest("POST", "/orgs"), "orgs.update");
  assert.equal(adminPermissionForRequest("PATCH", "/orgs/example"), "orgs.update");
  assert.equal(adminPermissionForRequest("POST", "/orgs/example/archive"), "orgs.update");
  assert.equal(adminPermissionForRequest("PUT", "/orgs/example/members"), "orgs.assign");
  assert.equal(adminPermissionForRequest("POST", "/projects/example/org-links"), "orgs.link");
  assert.equal(adminPermissionForRequest("GET", "/orgs/example/members"), false);
  assert.equal(adminPermissionForRequest("DELETE", "/orgs/example"), false);
  assert.deepEqual(expandAdminPermissions(["orgs"]), ["work", "orgs"]);
  assert.deepEqual(expandAdminPermissions(["orgs.update"]), ["work", "orgs", "orgs.update"]);
  assert.deepEqual(expandAdminPermissions(["orgs.link"]), ["work", "orgs", "orgs.link"]);
});
