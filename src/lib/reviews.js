import { supabase } from "./supabase";

// Event reviews live in public.event_reviews (see the event_reviews migration).
// The migration is applied separately in Supabase, so every helper here returns
// null / [] when the table or a function is missing or the viewer is not
// allowed to call it, instead of breaking the page.

const UNAVAILABLE_CODES = ["42P01", "42883", "42501", "401", "403", "PGRST202", "PGRST205", "PGRST301"];

function isUnavailable(error) {
  if (!error) return false;
  if (UNAVAILABLE_CODES.includes(error.code)) return true;
  return /does not exist|not find the function|permission denied|row-level security/i.test(
    error.message || "",
  );
}

// True when event_reviews (or its functions) simply have not been migrated yet.
export function isReviewsUnavailable(error) {
  return isUnavailable(error);
}

// { average, count } for one hackathon, hidden reviews already excluded.
// average is null while there are no reviews.
export async function fetchHackathonRating(hackathonId) {
  if (!supabase || !hackathonId) return null;
  const { data, error } = await supabase.rpc("get_hackathon_rating", {
    p_hackathon_id: hackathonId,
  });
  if (error) {
    if (isUnavailable(error)) return null;
    throw error;
  }
  return data || null;
}

// Same shape, aggregated over every hackathon of one organization.
export async function fetchOrganizationRating(organizationId) {
  if (!supabase || !organizationId) return null;
  const { data, error } = await supabase.rpc("get_organization_rating", {
    p_organization_id: organizationId,
  });
  if (error) {
    if (isUnavailable(error)) return null;
    throw error;
  }
  return data || null;
}

// Visible reviews for one hackathon, newest first. Each row carries only a
// reviewer first name: profiles stay unreadable from the client.
export async function fetchHackathonReviews(hackathonId) {
  if (!supabase || !hackathonId) return [];
  const { data, error } = await supabase.rpc("list_hackathon_reviews", {
    p_hackathon_id: hackathonId,
  });
  if (error) {
    if (isUnavailable(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

// { ended, block_reason, review } for the signed-in viewer of one hackathon.
export async function fetchMyReviewState(hackathonId) {
  if (!supabase || !hackathonId) return null;
  const { data, error } = await supabase.rpc("get_my_review_state", {
    p_hackathon_id: hackathonId,
  });
  if (error) {
    if (isUnavailable(error)) return null;
    throw error;
  }
  return data || null;
}

// Insert a new review, or update the caller's own rating and comment.
// Row Level Security owns the eligibility rules; this only translates the
// database's answers into copy the form can show.
export async function saveEventReview({ hackathonId, reviewId = null, rating, comment = "" }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const trimmed = String(comment || "").trim().slice(0, 1000);
  const payload = {
    rating: Number(rating),
    comment: trimmed || null,
  };

  const request = reviewId
    ? supabase.from("event_reviews").update(payload).eq("id", reviewId).select("id").maybeSingle()
    : supabase
        .from("event_reviews")
        .insert({ ...payload, hackathon_id: hackathonId })
        .select("id")
        .single();

  const { data, error } = await request;
  if (error) throw reviewWriteError(error);
  if (reviewId && !data) {
    throw new Error("Your review was not saved: the database blocked the update.");
  }
  return data;
}

function reviewWriteError(error) {
  if (!error) return new Error("Your review could not be saved.");
  if (error.code === "23505") {
    return new Error("You already reviewed this event. Use Edit to change your rating.");
  }
  if (error.code === "23514") {
    return new Error("A rating has to be a whole number of stars between 1 and 5.");
  }
  if (error.code === "42501" || /row-level security/i.test(error.message || "")) {
    return new Error(
      "The database blocked this review. You can review once the event has ended and you are registered (and paid, when the event is not free).",
    );
  }
  if (isUnavailable(error)) {
    return new Error("Reviews are not available yet: run the event reviews migration in Supabase.");
  }
  return new Error(error.message || "Your review could not be saved.");
}

// "4.3 / 5 (12 reviews)" — or "No reviews yet" while nothing has been written.
export function formatRatingSummary(rating) {
  const count = Number(rating?.count) || 0;
  if (!count) return "No reviews yet";
  const average = Number(rating?.average);
  const label = count === 1 ? "review" : "reviews";
  return `${(Number.isFinite(average) ? average : 0).toFixed(1)} / 5 (${count} ${label})`;
}

export function hasReviews(rating) {
  return (Number(rating?.count) || 0) > 0;
}
