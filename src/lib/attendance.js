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

// Teams grouped out of the roster the page already loads. Team names are unique
// inside a hackathon, and get_hackathon_roster() reports each participant's team
// for a hackathon in any status — unlike list_hackathon_teams(), which only
// answers for upcoming/active hackathons.
//
// Members are ordered leader-first then by name, so the representative is the
// leader when they attended, otherwise the first attended member.
export function teamsFromRoster(roster = [], attendedIds = []) {
  const attended = new Set((attendedIds || []).filter(Boolean));
  const byName = new Map();

  (roster || []).forEach((person) => {
    const name = String(person?.team_name || "").trim();
    if (!name) return;
    if (!byName.has(name)) byName.set(name, { name, members: [] });
    byName.get(name).members.push({
      user_id: person.user_id,
      full_name: person.full_name,
      username: person.username,
      role: person.team_role === "leader" ? "leader" : "member",
      attended: attended.has(person.user_id),
    });
  });

  return [...byName.values()]
    .map((team) => {
      const members = [...team.members].sort(
        (a, b) =>
          (a.role === "leader" ? 0 : 1) - (b.role === "leader" ? 0 : 1) ||
          String(a.full_name).localeCompare(String(b.full_name)),
      );
      return {
        name: team.name,
        members,
        representative: members.find((member) => member.attended) || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Teams that can still take a slot: one with an attended member to stand in, and
// not already used by another place or mention (so duplicates are impossible
// from the UI, not just rejected by the database).
export function availableTeams(teams = [], currentName = "", usedNames = []) {
  const taken = new Set((usedNames || []).filter(Boolean));
  if (currentName) taken.delete(currentName);
  return (teams || []).filter((team) => team.representative && !taken.has(team.name));
}

// Turns the picker state into the payload the RPC expects: one entry per ranked
// team, saved under the representative's user_id because that is the only
// identity save_hackathon_results() accepts. Empty slots are left out, so
// clearing a place clears that team's result.
export function buildResultEntries(places = {}, mentions = [], teams = []) {
  const byName = new Map((teams || []).map((team) => [team.name, team]));
  const entries = [];
  PLACES.forEach((place) => {
    const team = byName.get(places[place]);
    if (team?.representative) {
      entries.push({
        user_id: team.representative.user_id,
        place,
        honourable_mention: false,
      });
    }
  });
  mentions.filter(Boolean).forEach((name) => {
    const team = byName.get(name);
    if (team?.representative) {
      entries.push({
        user_id: team.representative.user_id,
        place: null,
        honourable_mention: true,
      });
    }
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
      errors.push("Each team can only appear once.");
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

// Publishing awards points: publish_results marks the result sheet public and
// rebuilds that hackathon's points_ledger rows in one statement, so pressing
// Publish twice can never duplicate points. Unpublishing removes them again.
export const POINTS_UNAVAILABLE =
  "Publishing points is not available yet: run supabase/migrations/20261029180000_add_points_ledger_and_publish_results.sql in Supabase first.";

function pointsError(error, fallback) {
  if (error && (error.code === "42883" || error.code === "PGRST202")) {
    return new Error(POINTS_UNAVAILABLE);
  }
  return attendanceError(error, fallback);
}

export async function publishResults(hackathonId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("publish_results", {
    p_hackathon_id: hackathonId,
  });
  if (error) throw pointsError(error, "The results could not be published.");
  return data || null;
}

export async function unpublishResults(hackathonId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("unpublish_results", {
    p_hackathon_id: hackathonId,
  });
  if (error) throw pointsError(error, "The results could not be unpublished.");
  return data || null;
}

// "X attended, X eligible for certificates" — the copy shown after a save.
export function attendanceSummary(attended) {
  const count = Number(attended) || 0;
  return `${count} attended, ${count} eligible for certificates`;
}
