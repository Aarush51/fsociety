import { supabase } from "./supabase";

// Teammate reviews. Everything comes from supabase/migrations/
// 20261029131000_add_teammate_reviews.sql:
//   pending_teammate_review_count()   how many reviews the caller still owes
//   get_teammate_reviews()            { pending, written, received }
//   public.teammate_reviews           insert as yourself, read what you wrote or got
//
// The table's RLS policy checks that the reviewee really was your teammate and
// that the hackathon has ended, so a failed insert is a rule, never a client bug.

export const TEAMMATE_REVIEWS_SETUP_MESSAGE =
  "Teammate reviews aren't set up yet. Run supabase/migrations/20261029131000_add_teammate_reviews.sql in Supabase, then reload this page.";

function isSchemaError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42883" ||
    /could not find the (function|table)|schema cache/i.test(message)
  );
}

export function logTeammateReviewError(label, error) {
  if (!error) return;
  console.error(label, error.message, {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

// A missing migration must never lock somebody out of registering, so a schema
// error counts as "nothing pending". The console keeps the real reason.
export async function fetchPendingTeammateReviewCount() {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("pending_teammate_review_count");
  if (error) {
    logTeammateReviewError("Could not count pending teammate reviews.", error);
    return 0;
  }
  return Number(data) || 0;
}

export async function fetchTeammateReviews() {
  const empty = { pending: [], written: [], received: [] };
  if (!supabase) return empty;
  const { data, error } = await supabase.rpc("get_teammate_reviews");
  if (error) {
    logTeammateReviewError("Could not load teammate reviews.", error);
    if (isSchemaError(error)) return empty;
    throw error;
  }
  return {
    pending: Array.isArray(data?.pending) ? data.pending : [],
    written: Array.isArray(data?.written) ? data.written : [],
    received: Array.isArray(data?.received) ? data.received : [],
  };
}

export async function saveTeammateReview({ hackathonId, revieweeId, reviewerId, rating, comment = "" }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!reviewerId) throw new Error("Log in to review a teammate.");
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("Pick a rating from 1 to 5 stars.");
  }

  const { data, error } = await supabase
    .from("teammate_reviews")
    .insert({
      hackathon_id: hackathonId,
      reviewee_id: revieweeId,
      // The server also enforces reviewer_id = auth.uid(); send it explicitly so
      // the returned row is readable under the SELECT policy.
      reviewer_id: reviewerId,
      rating: value,
      comment: comment.trim() ? comment.trim().slice(0, 1000) : null,
    })
    .select("id, rating, comment, created_at")
    .single();

  if (error) {
    logTeammateReviewError("Could not save this teammate review.", error);
    if (error.code === "23505") {
      throw new Error("You already reviewed this teammate for that hackathon.");
    }
    if (error.code === "42501" || /row-level security/i.test(error.message || "")) {
      throw new Error(
        "Only a teammate from a finished hackathon can be reviewed. If this keeps happening, check that the teammate reviews migration has been run.",
      );
    }
    if (isSchemaError(error)) throw new Error(TEAMMATE_REVIEWS_SETUP_MESSAGE);
    throw new Error(error.message || "That review could not be saved.");
  }

  return data;
}
