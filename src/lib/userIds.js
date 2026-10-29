// Friend IDs are assigned and stored by the database. Never derive a client-side
// substitute from a user ID: missing profile data should remain visibly missing.
export function displayUserId(profile) {
  const code = String(profile?.friend_code || "").trim();
  return /^[1-9][0-9]{5}$/.test(code) ? code : "—";
}
