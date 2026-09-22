export const AGENT_MEMBER: {
  readonly id: string;
  readonly user_number: number;
  readonly name: string;
  readonly avatar: string;
  readonly motto: string;
  readonly identity_tags: readonly string[];
  readonly email: string;
  readonly role: string;
};
export const AGENT_L1_PROFILE: {
  readonly nickname: string;
  readonly title: string;
  readonly avatar: string;
};
export const AGENT_L2_MEMBER: {
  readonly id: string;
  readonly user_number: number;
  readonly name: string;
  readonly nickname: string;
  readonly avatar: string;
  readonly motto: string;
  readonly identity_tags: readonly string[];
  readonly email: string;
  readonly role: string;
};
export const SUMMARY_REQUEST: string;
export function mentionsAgent(text: string): boolean;
