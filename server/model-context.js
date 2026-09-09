// Models only need member names, IDs and roles. Keep UI profile details at the
// browser boundary, including when reading older archived discussions.
function minimalMemberContext(value) {
  if (Array.isArray(value)) return value.map(minimalMemberContext);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["avatar", "author_avatar"].includes(key))
      .map(([key, item]) => [key,
        key === "members" && Array.isArray(item)
          ? item.map(({ id, name, role }) => ({ id, name, role }))
          : minimalMemberContext(item),
      ]),
  );
}

export function modelProject(project) {
  return minimalMemberContext(project);
}

export function modelDiscussion(context) {
  const { contextUsage, events, ...discussion } = context;
  return minimalMemberContext({
    ...discussion,
    // Raw inputs/outputs can embed earlier contexts (including legacy avatars).
    // Return execution status without recursively replaying tool transcripts.
    events: (events || []).map(({ id, message_id, tool, status, created_at, finished_at }) =>
      ({ id, message_id, tool, status, created_at, finished_at })),
  });
}
