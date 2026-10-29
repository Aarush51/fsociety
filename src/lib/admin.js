import { ORGANIZATION_FIELDS } from "./organizations";
import { isReviewsUnavailable } from "./reviews";
import { supabase } from "./supabase";

// Admin helpers. Access is enforced by Row Level Security: these calls only see
// every organization when the signed-in user has a row in public.admins.

export const ADMIN_REVIEW_STATUSES = ["pending", "approved", "rejected"];

// Calls public.is_admin(), which is security definer and only granted to
// authenticated users. A missing migration or a non-admin simply returns false,
// so the header and the /admin route can stay quiet instead of breaking.
export async function fetchIsAdmin() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("Could not check admin access.", error);
    return false;
  }
  return data === true;
}

// Every organization, newest first. The page splits this by status itself so it
// can show tab counts and refresh the whole review queue after each decision.
export async function loadOrganizationsForReview() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("organizations")
    .select(ORGANIZATION_FIELDS)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Only admins can read organizations. Check that the admin SQL migration has been run in Supabase.",
      );
    }
    throw error;
  }
  return data || [];
}

// Approve or reject one organization. Rejecting requires a reason, which is
// stored in review_note; approving clears it again.
export async function reviewOrganization(id, { status, reviewNote = null }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!ADMIN_REVIEW_STATUSES.includes(status)) {
    throw new Error("Pick a valid review status.");
  }
  const note = reviewNote === null || reviewNote === undefined ? null : reviewNote.trim();
  if (status === "rejected" && !note) {
    throw new Error("Add a reason before rejecting an organization.");
  }

  const { data, error } = await supabase
    .from("organizations")
    .update({ status, review_note: status === "approved" ? null : note })
    .eq("id", id)
    .select(ORGANIZATION_FIELDS);

  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Your account is not allowed to review organizations. Run the admin SQL migration and check your row in public.admins.",
      );
    }
    if (error.code === "23514") {
      throw new Error(`That review status was rejected by the database: ${error.message}`);
    }
    throw new Error(error.message || "The review could not be saved. Please try again.");
  }
  // RLS silently matches zero rows when the update is not allowed, so an empty
  // result is a permission problem rather than a successful no-op.
  if (!data || !data.length) {
    throw new Error(
      "The review was not saved: the database blocked the update. Only admins can change an organization's status.",
    );
  }
  return data[0];
}

// ---------------------------------------------------------------------------
// Hackathon tiers
// ---------------------------------------------------------------------------
// An organizer only claims a tier. These calls are the only way a tier becomes
// "approved": public.protect_hackathon_tier() rejects an approved_tier written
// by anyone who is not an admin, so an empty result here means it did not happen.

export const TIER_REVIEW_FIELDS =
  "id, slug, title, organizer, city, starts_at, status, claimed_tier, approved_tier, tier_reason, expected_participants, prize_pool, created_at";

// Every hackathon that has claimed a tier, newest first.
export async function loadHackathonsForTierReview() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("hackathons")
    .select(TIER_REVIEW_FIELDS)
    .not("claimed_tier", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Only admins can read hackathons for tier review. Check that the admin SQL migration has been run in Supabase.",
      );
    }
    if (error.code === "42703") {
      throw new Error(
        "Hackathon tiers are not available yet: run supabase/migrations/20261029120000_add_hackathon_tiers.sql in Supabase first.",
      );
    }
    throw error;
  }
  return data || [];
}

// Approve Tier 1/2/3, or pass null to clear the approval.
export async function setHackathonApprovedTier(hackathonId, tier) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const value = tier === null || tier === undefined || tier === "" ? null : Number(tier);
  if (value !== null && ![1, 2, 3].includes(value)) {
    throw new Error("Choose Tier 1, Tier 2, Tier 3, or clear the approval.");
  }

  const { data, error } = await supabase
    .from("hackathons")
    .update({ approved_tier: value })
    .eq("id", hackathonId)
    .select(TIER_REVIEW_FIELDS);

  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Your account is not allowed to approve a tier. Run the hackathon tiers migration and check your row in public.admins.",
      );
    }
    if (error.code === "42703") {
      throw new Error(
        "Hackathon tiers are not available yet: run supabase/migrations/20261029120000_add_hackathon_tiers.sql in Supabase first.",
      );
    }
    if (error.code === "23514") {
      throw new Error(`That tier was rejected by the database: ${error.message}`);
    }
    throw new Error(error.message || "The tier could not be saved. Please try again.");
  }
  if (!data || !data.length) {
    throw new Error(
      "The tier was not saved: the database blocked the update. Only an admin can set an approved tier.",
    );
  }
  return data[0];
}

// Every event review, hidden ones included, newest first. RLS returns an empty
// list for non-admins and the function itself checks public.is_admin().
export async function loadEventReviewsForModeration() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("list_event_reviews_for_admin");
  if (error) {
    if (isReviewsUnavailable(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

// Hide or unhide one event review. Only admins pass Row Level Security and the
// guard trigger, so an empty result means the change did not happen.
export async function setEventReviewHidden(reviewId, hidden) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("event_reviews")
    .update({ hidden: Boolean(hidden) })
    .eq("id", reviewId)
    .select("id, hidden")
    .maybeSingle();
  if (error) {
    if (isReviewsUnavailable(error)) {
      throw new Error(
        "Reviews are not available yet: run the event reviews migration in Supabase first.",
      );
    }
    throw error;
  }
  if (!data) {
    throw new Error(
      "The database blocked the change: only admins can hide or unhide a review.",
    );
  }
  return data;
}
