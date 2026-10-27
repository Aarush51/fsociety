import { supabase } from "./supabase";

// Registration counts come from a SECURITY DEFINER RPC because participants may
// only select their own rows: get_hackathon_registration_info returns the public
// count plus the caller's own registration, never anyone else's.
export async function fetchRegistrationInfo(hackathonId) {
  if (!supabase || !hackathonId) return null;
  const { data, error } = await supabase.rpc("get_hackathon_registration_info", {
    p_hackathon_id: hackathonId,
  });
  if (error) throw error;
  return data || null;
}

export function registeredCount(info) {
  return Number(info?.registered_count) || 0;
}

// A null capacity means the organizer did not set a room size, so there is no limit.
export function remainingSpots(info) {
  const capacity = Number(info?.capacity);
  if (!capacity) return null;
  return Math.max(capacity - registeredCount(info), 0);
}

export function isFull(info) {
  const remaining = remainingSpots(info);
  return remaining !== null && remaining <= 0;
}

// The live schema still lets a participant insert their own registration row
// (RLS: "Participants can register themselves"). This is the path the
// registration page uses before any team is chosen.
export async function saveRegistration({ hackathonId, userId, paid = false }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("registrations")
    .insert({ hackathon_id: hackathonId, user_id: userId, paid: Boolean(paid) })
    .select("id, paid, created_at")
    .single();
  if (error) throw registrationError(error);
  return data;
}

function registrationError(error) {
  if (!error) return new Error("Your registration could not be saved.");
  if (error.code === "23505") {
    const duplicate = new Error("You are already registered for this hackathon.");
    duplicate.code = "23505";
    return duplicate;
  }
  if (error.code === "42501") {
    return new Error("Your registration could not be saved. Please log in again and retry.");
  }
  return new Error(error.message || "Your registration could not be saved.");
}

// Registration, team creation, invites and the match-pool row all happen inside
// one security-definer function.
export async function registerForHackathon({
  hackathonId,
  size,
  friendCodes = [],
  useMatching = false,
  paid = false,
}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("register_for_hackathon", {
    p_hackathon_id: hackathonId,
    p_size: size,
    p_friend_codes: friendCodes,
    p_use_matching: useMatching,
    p_paid: paid,
  });
  if (error) throw registrationError(error);
  return data;
}

// The caller's own registration, team, members, invites and matching state for
// one hackathon. Returns null when signed out.
export async function fetchMyTeamState(hackathonId) {
  if (!supabase || !hackathonId) return null;
  const { data, error } = await supabase.rpc("get_my_hackathon_team", {
    p_hackathon_id: hackathonId,
  });
  if (error) throw error;
  return data || null;
}

export async function acceptInvite(inviteId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("accept_invite", { p_invite_id: inviteId });
  if (error) throw registrationError(error);
  return data;
}

export async function declineInvite(inviteId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("decline_invite", { p_invite_id: inviteId });
  if (error) throw registrationError(error);
  return data;
}

export async function reduceTeamSize(teamId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("reduce_team_size", { p_team_id: teamId });
  if (error) throw registrationError(error);
  return data;
}
