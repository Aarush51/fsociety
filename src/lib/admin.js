import { ORGANIZATION_FIELDS } from "./organizations";
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
