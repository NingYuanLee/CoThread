import React from "react";
import { roleIcon, UiIcon } from "./ui-icon";

export function RoleBadge({ role }: { role: string }) {
  const icon = roleIcon(role);
  return (
    <span className="role-badge" data-role={role}>
      {icon ? <UiIcon name={icon} size={11} /> : null}
      {role}
    </span>
  );
}

export function IdentityName({
  role,
  name,
}: {
  role?: string | null;
  name: string;
}) {
  return (
    <>
      {role && (
        <>
          <RoleBadge role={role} />·
        </>
      )}
      {name}
    </>
  );
}
