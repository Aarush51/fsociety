import { supabase } from "./supabase";

// Team helpers for the schema that is live today:
//   teams          id (uuid), hackathon_id, name, description, max_members
//   team_members   team_id, user_id, role, joined_at
//   RPCs           list_hackathon_teams (public), create_hackathon_team,
//                  join_hackathon_team (signed in)
//
// Every team already has a unique ID: its uuid. A short human code is derived
// from the same uuid, so the code is stable and can be shared to find the team.

export function teamSize(team) {
  return Number(team?.size ?? team?.max_members) || 0;
}

export function memberCount(team) {
  if (Array.isArray(team?.members)) return team.members.length;
  return Number(team?.member_count) || 0;
}

export function openSpots(team) {
  return Math.max(teamSize(team) - memberCount(team), 0);
}

export function teamCodeFrom(uuid) {
  const hex = String(uuid || "")
    .replace(/-/g, "")
    .toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(hex)) return "";
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

// True when a typed value points at this team: full uuid, uuid without hyphens,
// the short code, or the short code without its hyphen.
export function teamMatchesQuery(team, query) {
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return false;
  const uuid = String(team?.id || "").toLowerCase();
  const compactUuid = uuid.replace(/-/g, "");
  const compactQuery = raw.replace(/-/g, "");
  return (
    raw === uuid ||
    compactQuery === compactUuid ||
    compactQuery === compactUuid.slice(0, 8) ||
    raw === teamCodeFrom(team?.id).toLowerCase()
  );
}

export async function listHackathonTeams(hackathonId) {
  if (!supabase || !hackathonId) return [];
  const { data, error } = await supabase.rpc("list_hackathon_teams", {
    p_hackathon_id: hackathonId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export function myTeamFrom(teams, userId) {
  if (!userId) return null;
  return teams.find((team) => (team.members || []).some((member) => member.id === userId)) || null;
}

export function findTeamsByQuery(teams, query) {
  return teams.filter((team) => teamMatchesQuery(team, query));
}

export async function createHackathonTeam({ hackathonId, name, description = "", size = 4 }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("create_hackathon_team", {
    p_hackathon_id: hackathonId,
    p_name: name.trim(),
    p_description: description.trim() || null,
    p_max_members: Number(size),
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("A team with that name already exists in this hackathon. Try another name.");
    }
    throw new Error(error.message || "Your team could not be created.");
  }
  return data; // the new team's uuid — its unique team ID
}

export async function joinHackathonTeam(teamId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("join_hackathon_team", { p_team_id: teamId });
  if (error) throw new Error(error.message || "You could not join that team.");
}

function isMissingRpc(error) {
  return (
    error?.code === "PGRST202" ||
    /could not find the function|function .* does not exist/i.test(String(error?.message || ""))
  );
}

// Join by the ID a team leader shared. join_team_by_code() resolves the uuid or
// its short code inside the database and enforces the hackathon, registration,
// suspension, membership and capacity rules, so its message is shown verbatim.
// Older databases without that RPC fall back to the existing join call plus the
// checks this page can do on its own.
export async function joinTeamById({ hackathonId, teamCode, teams = [] }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const code = String(teamCode || "").trim();
  if (!code) throw new Error("Enter the team ID you were given.");

  const { data, error } = await supabase.rpc("join_team_by_code", {
    p_hackathon_id: hackathonId,
    p_team_code: code,
  });

  if (!error) {
    return { teamId: data?.id || "", teamName: data?.name || "", team: data || null };
  }
  if (!isMissingRpc(error)) {
    throw new Error(error.message || "That team could not be joined.");
  }

  console.warn("join_team_by_code is missing; run the latest team migration.");
  const team = findTeamsByQuery(teams, code)[0];
  if (!team) throw new Error("No team in this hackathon uses that team ID.");
  await joinHackathonTeam(team.id);
  return { teamId: team.id, teamName: team.name, team: null };
}

// Skill and interest matches from the database. Each row is only a team id,
// name, member count, spots left, the skills the team lacks that the caller has,
// and shared interests — never a member identity.
export async function suggestTeams(hackathonId) {
  if (!supabase || !hackathonId) return [];
  const { data, error } = await supabase.rpc("suggest_teams", {
    p_hackathon_id: hackathonId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
