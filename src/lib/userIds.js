// Every HackMate account gets a shareable six-digit ID, generated here in the
// client so it exists for everyone right now — no database column required.
//
// The ID is derived deterministically from the account's UUID, so the same
// person always gets the same ID on every device and in every browser. When the
// database later stores an official profiles.friend_code (the six-digit SQL
// migration), that stored value wins and the derived ID is only the fallback.
//
// IDs are six digits from 100000 to 999999, matching the friend-ID rule the
// rest of the app expects.

const SIX_DIGITS = /^[1-9][0-9]{5}$/;

// FNV-1a over the uuid's hex body → a number in 100000..999999.
export function userIdFromUuid(uuid) {
  const hex = String(uuid || "")
    .replace(/-/g, "")
    .toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return "";

  let hash = 2166136261;
  for (let index = 0; index < hex.length; index += 1) {
    hash ^= hex.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(100000 + (Math.abs(hash) % 900000));
}

// A stored code is only used when it already has the six-digit shape; older
// "HM-XXXXXX" rows fall through to the derived ID so the UI never shows a
// format the rest of the app cannot parse.
export function storedUserId(value) {
  const code = String(value || "").trim();
  return SIX_DIGITS.test(code) ? code : "";
}

export function userIdForUser(user, storedCode) {
  return storedUserId(storedCode) || userIdFromUuid(user?.id) || "";
}

// Display form used on cards: "482913".
export function displayUserId(user, storedCode) {
  return userIdForUser(user, storedCode) || "—";
}
