import {
  clearEnvironmentVariable,
  listEnvironmentVariables,
  readEnvironmentVariable,
  setEnvironmentVariable,
} from "./environment-variables.ts";
import type { Db } from "./types.ts";

export { assertMiaowenToken } from "./environment-variables.ts";

export async function listUserSkills(db: Db, userId: string) {
  return listEnvironmentVariables(db, "personal", userId);
}

export async function saveUserSkillSecret(db: Db, userId: string, skillKey: string, token: string) {
  await setEnvironmentVariable(db, "personal", userId, skillKey, token, userId);
}

export async function clearUserSkillSecret(db: Db, userId: string, skillKey: string) {
  await clearEnvironmentVariable(db, "personal", userId, skillKey);
}

export async function readUserSkillSecret(db: Db, userId: string, skillKey: string) {
  return readEnvironmentVariable(db, "personal", userId, skillKey);
}
