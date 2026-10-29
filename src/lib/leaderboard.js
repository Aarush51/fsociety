import { initialsFromName } from "./format";
import { supabase } from "./supabase";

export function mapLeaderboard(data) {
  return (data || []).map((person, index) => ({
    rank: String(index + 1).padStart(2, "0"),
    initials: initialsFromName(person.full_name),
    name: person.full_name,
    school: `${person.institution || person.username}${person.reputation ? ` · ${Number(person.reputation).toFixed(1)} ★` : ""}`,
    points: new Intl.NumberFormat().format(Number(person.coins) || 0),
    score: Number(person.coins) || 0,
    isDemo: Boolean(person.is_demo),
    color: ["lime", "blue", "peach", "lavender"][index % 4],
  }));
}

// ---------------------------------------------------------------------------
// Points leaderboard
// ---------------------------------------------------------------------------
// Ranked by SUM(points_ledger.points). Read through a SECURITY DEFINER RPC that
// returns only a display name, a username and the total, so profiles stay
// owner-only. No coins, no community score.

export async function fetchPointsLeaderboard(limit = 25) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("get_points_leaderboard", { p_limit: limit });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export function mapPointsLeaderboard(data) {
  return (data || []).map((person, index) => ({
    rank: String(person.position ?? index + 1).padStart(2, "0"),
    initials: initialsFromName(person.full_name),
    name: person.full_name,
    school: person.username ? `@${person.username}` : "",
    points: new Intl.NumberFormat().format(Number(person.total_points) || 0),
    score: Number(person.total_points) || 0,
    isDemo: false,
    color: ["lime", "blue", "peach", "lavender"][index % 4],
  }));
}

export function pointsLeaderboardStatusText(people) {
  if (!people.length) {
    return "No points have been awarded yet. Points appear when an organizer publishes results.";
  }
  return `${people.length} ${people.length === 1 ? "builder" : "builders"} ranked by points.`;
}

export function leaderboardStatusText(people) {
  if (!people.length) return "No leaderboard entries yet. Earn coins by building with HackMate.";
  return people.every((person) => person.isDemo)
    ? "Demo leaderboard data. Real member rankings will appear after users join."
    : `${people.length} builders ranked by earned coins.`;
}
