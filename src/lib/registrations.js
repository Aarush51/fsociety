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

export async function registerForHackathon({ hackathonId, userId, paid = false }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("registrations")
    .insert({ hackathon_id: hackathonId, user_id: userId, paid })
    .select("id, paid, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Keep the code so callers can refresh instead of treating this as an error.
      const duplicate = new Error("You are already registered.");
      duplicate.code = "23505";
      throw duplicate;
    }
    if (error.code === "42501") {
      throw new Error("Your registration could not be saved. Please log in again and retry.");
    }
    throw error;
  }
  return data;
}
