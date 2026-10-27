import {
  clearEnvironmentVariable,
  listEnvironmentVariables,
  readEnvironmentVariable,
  setEnvironmentVariable,
} from "./environment-variables.js";

export { assertMiaowenToken } from "./environment-variables.js";

export async function listUserSkills(db, userId) {
  return listEnvironmentVariables(db, "personal", userId);
}

export async function saveUserSkillSecret(db, userId, skillKey, token) {
  await setEnvironmentVariable(db, "personal", userId, skillKey, token, userId);
}

export async function clearUserSkillSecret(db, userId, skillKey) {
  await clearEnvironmentVariable(db, "personal", userId, skillKey);
}

export async function readUserSkillSecret(db, userId, skillKey) {
  return readEnvironmentVariable(db, "personal", userId, skillKey);
}
