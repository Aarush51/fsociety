import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Unsaved form drafts, kept in the browser
// ---------------------------------------------------------------------------
// A half-filled form should survive a refresh or an accidentally closed tab.
// Each form uses its own key (with the user id once they are logged in), the
// draft is written to localStorage shortly after typing stops, and restored over
// the form's initial values on the next visit.
//
// Two rules matter more than the rest:
//   * Nothing secret is ever written. Passwords, confirmation fields, OTP and
//     token fields, payment details and file inputs are stripped by key name or
//     by value, so a draft that leaks is not a credential leak.
//   * Storage is optional. A blocked or full localStorage (private windows,
//     disabled site data) must never break a form: every read and write is
//     wrapped, and the form simply works without drafts.

export const FORM_DRAFT_PREFIX = "hackmate.formDraft.";
export const FORM_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const FORM_DRAFT_SAVE_DELAY_MS = 500;

// Word-by-word match after "password", "confirmPassword", "one_time_code" and
// similar spellings have been split into words, so a form can name a field
// anything sensible and still be covered.
const SENSITIVE_KEY_WORDS = new Set([
  "password",
  "passwords",
  "passwd",
  "passcode",
  "passphrase",
  "pwd",
  "otp",
  "token",
  "tokens",
  "secret",
  "confirm",
  "confirmation",
  "cvv",
  "cvc",
  "card",
  "cardnumber",
  "cardholder",
  "creditcard",
  "debitcard",
  "expiry",
  "iban",
  "routing",
  "upi",
  "payment",
  "payments",
  "pin",
]);

const SENSITIVE_KEY_PHRASES = ["one time"];

function draftStorageKey(key) {
  return key ? `${FORM_DRAFT_PREFIX}${key}` : "";
}

// Storage access itself can throw when site data is disabled.
function getStorage() {
  try {
    const storage = window.localStorage;
    return storage && typeof storage.getItem === "function" ? storage : null;
  } catch {
    return null;
  }
}

function keyWords(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveField(key) {
  const words = keyWords(key);
  if (!words.length) return false;
  if (words.some((word) => SENSITIVE_KEY_WORDS.has(word))) return true;
  const padded = ` ${words.join(" ")} `;
  return SENSITIVE_KEY_PHRASES.some((phrase) => padded.includes(` ${phrase} `));
}

// A File/Blob cannot be serialised, and a file the browser no longer has a
// handle on must be picked again anyway.
function isFileValue(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(isFileValue);
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  return (
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.type === "string" &&
    typeof value.slice === "function"
  );
}

// The object that is allowed into storage: no secret keys, no file values.
export function sanitizeDraftValues(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const clean = {};
  Object.keys(values).forEach((key) => {
    if (isSensitiveField(key)) return;
    const value = values[key];
    if (value === undefined || typeof value === "function") return;
    if (isFileValue(value)) return;
    clean[key] = value;
  });
  return clean;
}

// Saved values win; keys the draft never had keep the form's initial value, so
// adding a field to a form does not break an older draft.
export function mergeDraftValues(initialValues, draft) {
  const base =
    initialValues && typeof initialValues === "object" && !Array.isArray(initialValues)
      ? initialValues
      : {};
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return { ...base };
  const merged = { ...base };
  Object.keys(base).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(draft, key)) merged[key] = draft[key];
  });
  return merged;
}

function serialize(values) {
  try {
    return JSON.stringify(values);
  } catch {
    // A value that cannot be serialised is simply not a draft.
    return null;
  }
}

export function removeFormDraft(key) {
  const storageKey = draftStorageKey(key);
  const storage = getStorage();
  if (!storageKey || !storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // Nothing to clean up when storage cannot be reached.
  }
}

// Returns the saved values, or null when there is no usable draft. Expired,
// corrupted and unreadable drafts are removed and treated as absent.
export function readFormDraft(key, now = Date.now()) {
  const storageKey = draftStorageKey(key);
  const storage = getStorage();
  if (!storageKey || !storage) return null;

  let raw = null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  let stored = null;
  try {
    stored = JSON.parse(raw);
  } catch {
    removeFormDraft(key);
    return null;
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    removeFormDraft(key);
    return null;
  }

  const savedAt = Number(stored.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > FORM_DRAFT_MAX_AGE_MS) {
    removeFormDraft(key);
    return null;
  }

  const values = sanitizeDraftValues(stored.values);
  return Object.keys(values).length ? values : null;
}

export function writeFormDraft(key, values, now = Date.now()) {
  const storageKey = draftStorageKey(key);
  const storage = getStorage();
  if (!storageKey || !storage) return false;

  const clean = sanitizeDraftValues(values);
  if (!Object.keys(clean).length) {
    removeFormDraft(key);
    return false;
  }

  const payload = serialize({ savedAt: now, values: clean });
  if (!payload) return false;

  try {
    storage.setItem(storageKey, payload);
    return true;
  } catch {
    // Full or blocked storage: the form keeps working, the draft is skipped.
    return false;
  }
}

// Used on logout so one account's drafts never greet the next person.
export function clearAllFormDrafts() {
  const storage = getStorage();
  if (!storage) return;
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name && name.startsWith(FORM_DRAFT_PREFIX)) keys.push(name);
    }
    keys.forEach((name) => storage.removeItem(name));
  } catch {
    // Best effort: a store that cannot be read has nothing to clear.
  }
}

/**
 * useFormDraft(key, initialValues, { enabled }) →
 *   [values, setValues, clearDraft, draftRestored]
 *
 * `key` is unique per form and includes the user id once someone is logged in.
 * `values` always contains every key of `initialValues`; a saved draft is merged
 * over them, so a field added later keeps working. Changes are saved about
 * 500 ms after typing stops.
 *
 * `enabled` delays restoring until the form's real starting values are known
 * (a form that loads from the server passes false until the load finishes).
 *
 * `setValues` takes an object or an updater, like a normal state setter.
 * `clearDraft(resetValues?)` deletes the saved draft, hides the restore note
 * and resets the form to `resetValues` (defaulting to `initialValues`).
 * `draftRestored` says whether a draft was applied, so the page can show the
 * "We restored your unsaved draft" note.
 */
export default function useFormDraft(key, initialValues = {}, options = {}) {
  const { enabled = true } = options;
  const storageKey = draftStorageKey(key);

  const initialRef = useRef(initialValues);
  initialRef.current = initialValues;

  const [state, setState] = useState(() => {
    const draft = enabled ? readFormDraft(key) : null;
    return {
      values: mergeDraftValues(initialValues, draft),
      restored: Boolean(draft),
    };
  });

  // Nothing typed by the person using the form is ever overwritten by a late
  // load or by the draft being read again.
  const dirtyRef = useRef(false);
  const hydratedRef = useRef("");

  // Restore once, when the key is known and the form is ready for its values.
  useEffect(() => {
    if (!enabled || !storageKey || hydratedRef.current === storageKey) return;
    hydratedRef.current = storageKey;
    if (dirtyRef.current) return;

    const draft = readFormDraft(key);
    setState((current) => {
      const nextValues = mergeDraftValues(initialRef.current, draft);
      const nextRestored = Boolean(draft);
      if (
        nextRestored === current.restored &&
        serialize(nextValues) === serialize(current.values)
      ) {
        return current;
      }
      return { values: nextValues, restored: nextRestored };
    });
  }, [enabled, key, storageKey]);

  // Debounced save. Rows that match the untouched form are not drafts, so an
  // empty form leaves nothing behind, and a submit-cleared form stays clean.
  useEffect(() => {
    if (!enabled || !storageKey || !hydratedRef.current || !dirtyRef.current) return undefined;
    const timer = setTimeout(() => {
      const clean = sanitizeDraftValues(state.values);
      const base = sanitizeDraftValues(initialRef.current);
      const stored = readFormDraft(key);
      if (serialize(clean) === serialize(base)) {
        if (stored) removeFormDraft(key);
        return;
      }
      if (stored && serialize(stored) === serialize(clean)) return;
      writeFormDraft(key, clean);
    }, FORM_DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.values, enabled, key, storageKey]);

  const setValues = useCallback((update) => {
    dirtyRef.current = true;
    setState((current) => {
      const next = typeof update === "function" ? update(current.values) : update;
      if (!next || typeof next !== "object" || Array.isArray(next)) return current;
      return { ...current, values: next };
    });
  }, []);

  const clearDraft = useCallback(
    (resetValues) => {
      removeFormDraft(key);
      dirtyRef.current = false;
      hydratedRef.current = storageKey;
      const reset =
        resetValues && typeof resetValues === "object" && !Array.isArray(resetValues)
          ? resetValues
          : { ...initialRef.current };
      setState({ values: reset, restored: false });
    },
    [key, storageKey],
  );

  return [state.values, setValues, clearDraft, state.restored];
}
