import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Attendance and results (organizer tools)
// ---------------------------------------------------------------------------
// Every write goes through a SECURITY DEFINER RPC that checks
// public.is_hackathon_organizer() itself, so a participant cannot mark their own
// attendance or award themselves a place even if they call the endpoint directly.

export const PLACES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const HONOURABLE_MENTION_COUNT = 2;

export const ATTENDANCE_UNAVAILABLE =
  "Attendance and results are not available yet: run supabase/migrations/20261029160000_add_attendance_and_results.sql in Supabase first.";

// PostgREST reports a missing function as 42883 (Postgres) or PGRST202.
function attendanceError(error, fallback) {
  if (!error) return new Error(fallback);
  if (error.code === "42501") {
    return new Error("Only this hackathon's organizer can do that. Sign in as the organization that hosts it.");
  }
  if (error.code === "42883" || error.code === "PGRST202") {
    return new Error(ATTENDANCE_UNAVAILABLE);
  }
  return new Error(error.message || fallback);
}

export function displayFriendCode(row) {
  const code = String(row?.friend_code || "").trim();
  return /^[1-9][0-9]{5}$/.test(code) ? code : "—";
}

// Everyone registered for the hackathon, with the details an organizer needs on
// the day. Only this hackathon's organizer (or an admin) can read it.
export async function loadHackathonRoster(hackathonId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("get_hackathon_roster", {
    p_hackathon_id: hackathonId,
  });
  if (error) throw attendanceError(error, "The roster could not be loaded.");
  return Array.isArray(data) ? data : [];
}

// Saves the whole sheet: everyone in userIds is attended, every other registered
// participant is stored as not attended.
export async function saveHackathonAttendance(hackathonId, userIds = []) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("save_hackathon_attendance", {
    p_hackathon_id: hackathonId,
    p_user_ids: userIds,
  });
  if (error) throw attendanceError(error, "Attendance could not be saved.");
  return data || null;
}

export async function loadHackathonResults(hackathonId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("results")
    .select("user_id, place, honourable_mention, published")
    .eq("hackathon_id", hackathonId)
    .order("place", { ascending: true, nullsFirst: false });
  if (error) throw attendanceError(error, "Results could not be loaded.");
  return Array.isArray(data) ? data : [];
}

// Options for one place or mention: attended participants only, and never
// someone already used in another slot (so duplicates are impossible from the
// UI, not just rejected by the database).
export function availableOptions(attendedPeople = [], currentUserId = "", usedIds = []) {
  const taken = new Set(usedIds.filter(Boolean));
  if (currentUserId) taken.delete(currentUserId);
  return attendedPeople.filter((person) => !taken.has(person.user_id));
}

// Turns the picker state into the payload the RPC expects. Empty slots are left
// out, so clearing a place clears that participant's result.
export function buildResultEntries(places = {}, mentions = []) {
  const entries = [];
  PLACES.forEach((place) => {
    const userId = places[place];
    if (userId) entries.push({ user_id: userId, place, honourable_mention: false });
  });
  mentions.filter(Boolean).forEach((userId) => {
    entries.push({ user_id: userId, place: null, honourable_mention: true });
  });
  return entries;
}

// The same rules the database enforces, checked before the request so the
// organizer gets the answer without a round trip.
export function validateResults({ entries = [], attendedIds = [], publishing = false }) {
  const errors = [];
  const places = entries.filter((entry) => entry.place !== null && entry.place !== undefined);
  const mentions = entries.filter((entry) => entry.honourable_mention);
  const seenUsers = new Set();
  const seenPlaces = new Set();

  entries.forEach((entry) => {
    if (seenUsers.has(entry.user_id)) {
      errors.push("Each participant can only appear once.");
    }
    seenUsers.add(entry.user_id);
    if (entry.place !== null && entry.place !== undefined) {
      if (seenPlaces.has(entry.place)) errors.push(`Place ${entry.place} is used twice.`);
      seenPlaces.add(entry.place);
    }
    if (!attendedIds.includes(entry.user_id)) {
      errors.push("Only attended participants can be placed or mentioned.");
    }
  });

  if (mentions.length > HONOURABLE_MENTION_COUNT) {
    errors.push(`Use at most ${HONOURABLE_MENTION_COUNT} honourable mentions.`);
  }

  if (publishing) {
    if (!places.length) errors.push("Add at least one place before publishing.");
    if (mentions.length !== HONOURABLE_MENTION_COUNT) {
      errors.push(`Publishing needs exactly ${HONOURABLE_MENTION_COUNT} honourable mentions.`);
    }
  }

  const unique = [...new Set(errors)];
  return { valid: unique.length === 0, errors: unique, places, mentions };
}

export async function saveHackathonResults(hackathonId, entries) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("save_hackathon_results", {
    p_hackathon_id: hackathonId,
    p_entries: entries,
  });
  if (error) throw attendanceError(error, "The results could not be saved.");
  return data || null;
}

export async function publishHackathonResults(hackathonId, published) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("publish_hackathon_results", {
    p_hackathon_id: hackathonId,
    p_published: Boolean(published),
  });
  if (error) throw attendanceError(error, "The results could not be published.");
  return data || null;
}

// "X attended, X eligible for certificates" — the copy shown after a save.
export function attendanceSummary(attended) {
  const count = Number(attended) || 0;
  return `${count} attended, ${count} eligible for certificates`;
}
