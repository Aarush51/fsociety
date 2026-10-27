import { supabase } from "./supabase";

// The caller's own profile row plus their saved skills, read in one step for
// the registration form. get_my_profile() is security definer (auth.uid only)
// and the row select is covered by "Users can read their own profile".
export async function fetchOwnProfile(userId) {
  if (!supabase || !userId) return null;
  const [rowResult, mineResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, full_name, bio, institution")
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("get_my_profile"),
  ]);
  if (rowResult.error) throw rowResult.error;
  if (mineResult.error) throw mineResult.error;
  const row = rowResult.data || {};
  const mine = mineResult.data || {};
  return {
    full_name: row.full_name || mine.full_name || "",
    username: row.username || mine.username || "",
    bio: row.bio || mine.bio || "",
    institution: row.institution || "",
    skills: Array.isArray(mine.skills) ? mine.skills : [],
  };
}

// Saves the basic details collected on the registration page in one call:
// save_my_profile() updates the profile row and syncs the skills tables
// (skills + user_skills) behind the same security-definer function.
export async function saveRegistrationProfile({ fullName, username, bio, skills = [] }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("save_my_profile", {
    p_full_name: String(fullName || "").trim(),
    p_username: String(username || "").trim(),
    p_bio: String(bio || "").trim(),
    p_skills: skills,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already taken. Please pick another one.");
    }
    throw new Error(error.message || "Your details could not be saved.");
  }
}

// Whether skills, interests or hobbies have been filled in on the caller's own
// profile. get_my_profile_extras() is security definer and reads the row for
// auth.uid(), so this adds no access beyond the existing profile policies.
export async function fetchHasParticipantProfileData() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("get_my_profile_extras");
  if (error) throw error;
  return hasParticipantProfileData(data);
}

// The caller's skills/interests/hobbies, used by the matching step.
export async function fetchMyProfileExtras() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_my_profile_extras");
  if (error) throw error;
  return data || null;
}

export function countProfileSkills(extras) {
  const levels = extras?.skill_levels;
  return levels && typeof levels === "object" ? Object.keys(levels).length : 0;
}

export function hasParticipantProfileData(extras) {
  if (!extras) return false;
  const skills =
    extras.skill_levels && typeof extras.skill_levels === "object"
      ? Object.keys(extras.skill_levels)
      : [];
  const interests = Array.isArray(extras.interests) ? extras.interests : [];
  const hobbies = String(extras.hobbies || "").trim();
  return skills.length > 0 || interests.length > 0 || Boolean(hobbies);
}
