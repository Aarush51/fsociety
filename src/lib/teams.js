import { supabase } from "./supabase";

// Team helpers for the schema that is live today:
//   teams          id (uuid), hackathon_id, name, description, max_members
//   team_members   team_id, user_id, role, joined_at
//   RPCs           list_hackathon_teams, create_hackathon_team,
//                  request_to_join_team, get_my_join_requests,
//                  list_team_join_requests, respond_to_join_request
//
// Joining is a request, not an instant add: request_to_join_team() creates a
// pending row that the team leader accepts or declines.
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

function jsonRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.requests)) return data.requests;
  return [];
}

// Creates a pending request for the leader to answer.
export async function requestToJoinTeam(teamId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("request_to_join_team", {
    p_team_id: teamId,
  });
  if (error) throw new Error(error.message || "Your request could not be sent.");
  return data;
}

// Team ids with a request still waiting for the leader's answer.
export function pendingTeamIdsFrom(requests = []) {
  return new Set(
    (Array.isArray(requests) ? requests : [])
      .filter((request) => request?.status === "pending")
      .map((request) => request.team_id)
      .filter(Boolean),
  );
}

// The signed-in user's requests, used to keep join buttons in a pending state.
export async function fetchMyJoinRequests() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_my_join_requests");
  if (error) throw new Error(error.message || "Your join requests could not be loaded.");
  return jsonRows(data);
}

// Pending requests for one team. The RPC itself enforces leader-only access.
export async function fetchTeamJoinRequests(teamId) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_team_join_requests", {
    p_team_id: teamId,
  });
  if (error) throw new Error(error.message || "Join requests could not be loaded.");
  return jsonRows(data);
}

export async function respondToJoinRequest(requestId, accept) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("respond_to_join_request", {
    p_request_id: requestId,
    p_accept: Boolean(accept),
  });
  if (error) throw new Error(error.message || "The request could not be updated.");
  return data;
}

// Resolve the shared team ID against the hackathon's team list, then send the
// request. The database still enforces capacity and membership rules.
export async function requestJoinTeamByCode({ teamCode, teams = [] }) {
  const code = String(teamCode || "").trim();
  if (!code) throw new Error("Enter the team ID you were given.");
  const team = findTeamsByQuery(teams, code)[0];
  if (!team) throw new Error("No team in this hackathon uses that team ID.");
  await requestToJoinTeam(team.id);
  return { teamId: team.id, teamName: team.name };
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
