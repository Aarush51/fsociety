// Six-digit numeric friend IDs, matching the database rule: exactly six digits
// from 100000 to 999999 (no leading zero).
export const FRIEND_CODE_LENGTH = 6;
export const FRIEND_CODE_PATTERN = /^[1-9][0-9]{5}$/;
export const FRIEND_CODE_HINT = "exactly six digits, from 100000 to 999999";

// Digits only, so a pasted "HM-123456" or "123 456" still works. Over-long
// entries are kept (to a sane length) so they can be rejected instead of being
// silently trimmed down to six digits.
export function normalizeFriendCodeInput(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, FRIEND_CODE_LENGTH + 6);
}

export function isFriendCode(value) {
  return FRIEND_CODE_PATTERN.test(String(value || ""));
}
