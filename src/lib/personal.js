import { supabase } from "./supabase";

// Personal reads for the Dashboard and the Huddle.
//
// get_my_rank() and get_my_hackathons() come from
// supabase/migrations/20261028120000_add_friends.sql. Each is scoped to
// (select auth.uid()) and returns nothing about anyone else.
//
// Both are new, so a project that has not applied that SQL yet must not lose its
// Dashboard: a missing function reads as "no rank" / "no hackathons" instead of
// an error banner.

function isMissingFunction(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|does not exist|schema cache/i.test(message)
  );
}

// { points, position, total } or null when the caller has no profile row.
export async function fetchMyRank() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_my_rank");
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  if (!data) return null;
  return {
    points: Number(data.points) || 0,
    position: Number(data.position) || null,
    total: Number(data.total) || 0,
  };
}

// Every hackathon the caller registered for, newest first — including events
// that have left the public listing.
export async function fetchMyHackathons() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_my_hackathons");
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

// An event is past once its end date has gone, whatever the row says.
export function isPastHackathon(hackathon, now = Date.now()) {
  const endsAt = new Date(hackathon?.ends_at || 0).getTime();
  return Number.isFinite(endsAt) && endsAt > 0 ? endsAt < now : false;
}

export function splitMyHackathons(hackathons = [], now = Date.now()) {
  const current = [];
  const past = [];
  hackathons.forEach((hackathon) => {
    (isPastHackathon(hackathon, now) ? past : current).push(hackathon);
  });
  return { current, past };
}
