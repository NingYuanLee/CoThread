export type AdminPermissionNode = {
  key: string;
  label: string;
  icon?: string;
  type: string;
  children?: AdminPermissionNode[];
};
export const ADMIN_PERMISSION_TREE: AdminPermissionNode[];
export const ADMIN_PERMISSION_KEYS: string[];
export function expandAdminPermissions(keys: string[]): string[];
export function adminPermissionForRequest(method: string, path: string): string | null | false;
