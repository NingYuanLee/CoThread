export function mentionsUser(text, user) {
  const names = [user && user.name, user && user.email, user && user.username].filter((value) => value && String(value).trim());
  return names.some((value) => {
    const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = "(^|[^\\p{L}\\p{N}_@])@" + escaped + "(?=$|[^\\p{L}\\p{N}_@])";
    return new RegExp(pattern, "u").test(String(text || ""));
  });
}
