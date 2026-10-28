export type SelfMentionPart = { text: string; mention: boolean };

export function splitSelfMentions(
  text: string,
  user: { name?: string | null; email?: string | null; username?: string | null } | null,
): SelfMentionPart[];

export function mentionsUser(
  text: string,
  user: { name?: string | null; email?: string | null; username?: string | null },
): boolean;
