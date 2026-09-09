import React from "react";

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="role-badge" data-role={role}>
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
