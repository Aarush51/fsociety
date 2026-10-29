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

// ---------------------------------------------------------------------------
// Hackathon review
// ---------------------------------------------------------------------------

// Every column the review view shows, including the optional ones the organizer
// filled in under "More details". Admins can read all of them.
export const HACKATHON_REVIEW_FIELDS = [
  "id",
  "slug",
  "title",
  "description",
  "category",
  "organizer",
  "location",
  "prize",
  "registration_deadline",
  "starts_at",
  "ends_at",
  "status",
  "created_by",
  "created_at",
  "updated_at",
  "approval_status",
  "organization_id",
  "venue_name",
  "address",
  "city",
  "maps_url",
  "capacity",
  "price",
  "banner_url",
  "theme_tags",
  "rules",
  "prize_details",
  "team_size_max",
  "claimed_tier",
  "claimed_tier_reason",
  "expected_participants",
  "prize_pool",
  "tier",
  "tier_note",
  "reviewed_by",
  "reviewed_at",
  "review_note",
].join(", ");

// Every hackathon, newest first. RLS returns the whole table for an admin, so the
// page can split it into Pending / Live / Rejected and group events by
// organization for the "earlier hackathons" line in the review view.
export async function loadHackathonsForReview() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("hackathons")
    .select(HACKATHON_REVIEW_FIELDS)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Only admins can read every hackathon. Check that the admin SQL migration has been run in Supabase.",
      );
    }
    if (error.code === "42703") {
      throw new Error(
        `The hackathon review columns are missing: ${error.message}. Apply the tier migration in Supabase.`,
      );
    }
    throw error;
  }
  return data || [];
}

// The three tiers with their examples and multipliers. Readable by anyone (the
// host form uses the same wording), so an admin page never needs a special case.
export async function loadTierSettings() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("tier_settings")
    .select("tier, label, description, examples, criteria, points_multiplier")
    .order("tier", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.code === "42501") {
      throw new Error(
        "The tier settings table is missing. Apply the tier migration in Supabase.",
      );
    }
    throw error;
  }
  return data || [];
}

// The only way to approve or reject an event. Every rule lives in the database
// function, so the messages below are the server's own words: a missing tier, a
// lower tier than the claim without a note, or a rejection without a reason.
export async function reviewHackathon({ hackathonId, decision, tier = null, note = null }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("review_hackathon", {
    p_hackathon_id: hackathonId,
    p_decision: decision,
    p_tier: tier === null || tier === undefined || tier === "" ? null : Number(tier),
    p_note: note === null || note === undefined ? null : note.trim(),
  });
  if (error) {
    if (error.code === "42501") {
      throw new Error("Only admins can review hackathons.");
    }
    if (error.code === "42883" || error.code === "PGRST202") {
      throw new Error(
        "The review_hackathon function is missing. Apply the tier migration in Supabase.",
      );
    }
    throw new Error(error.message || "The review could not be saved. Please try again.");
  }
  return data;
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
