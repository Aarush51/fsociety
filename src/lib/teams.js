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

// Clear, specific messages for every answer the join RPC can give.
export const JOIN_TEAM_MESSAGES = {
  not_signed_in: "Log in to join a team.",
  invalid_id: "Paste the team ID you were given.",
  unknown_team: "No team with that ID. Check the ID and try again.",
  wrong_hackathon: "That team is in a different hackathon. Use the ID shared for this event.",
  team_full: "That team is full. Ask its leader to free a spot, or make a team of your own.",
  already_in_team: "You’re already on a team for this hackathon.",
  not_registered: "Register for this hackathon before joining a team.",
  hackathon_closed: "This hackathon is no longer open for teams.",
};

function isMissingRpc(error) {
  return (
    error?.code === "PGRST202" ||
    /could not find the function|function .* does not exist/i.test(String(error?.message || ""))
  );
}

// Join by the ID a team leader shared. The database resolves the uuid (or its
// short code), then checks the team belongs to this hackathon, that the caller
// is registered, not already on a team here, and that a spot is still open.
// Older databases without that RPC fall back to the existing join call plus the
// checks this page can do on its own.
export async function joinTeamById({ hackathonId, teamCode, teams = [] }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const code = String(teamCode || "").trim();
  if (!code) throw new Error(JOIN_TEAM_MESSAGES.invalid_id);

  const { data, error } = await supabase.rpc("join_hackathon_team_by_id", {
    p_hackathon_id: hackathonId,
    p_team_code: code,
  });

  if (!error) {
    if (data?.ok) return { teamId: data.team_id, teamName: data.team_name };
    throw new Error(JOIN_TEAM_MESSAGES[data?.error] || "That team could not be joined.");
  }
  if (!isMissingRpc(error)) {
    throw new Error(error.message || "That team could not be joined.");
  }

  console.warn("join_hackathon_team_by_id is missing; run the latest team migration.");
  const team = findTeamsByQuery(teams, code)[0];
  if (!team) throw new Error(JOIN_TEAM_MESSAGES.unknown_team);
  await joinHackathonTeam(team.id);
  return { teamId: team.id, teamName: team.name };
}
