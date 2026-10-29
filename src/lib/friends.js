import { supabase } from "./supabase";

// Friends, friend requests and the two reads the personal pages need.
//
// Everything goes through security-definer RPCs from
// supabase/migrations/20261028120000_add_friends.sql:
//   send_friend_request(p_code)        request by six-digit ID
//   respond_friend_request(id, bool)   accept or decline (recipient only)
//   cancel_friend_request(id)          cancel one I sent
//   remove_friend(user_id)             end a friendship
//   list_friends()                     id, display name, six-digit ID only
//   list_friend_requests()             my own pending requests, both ways
//
// The tables themselves only expose the caller's own rows and accept no client
// writes. Until the SQL has been run in Supabase the functions are missing; that
// is reported as a clear message instead of a raw PostgREST error.

export const FRIENDS_SETUP_MESSAGE =
  "Friends isn't set up yet. Run supabase/migrations/20261028120000_add_friends.sql in Supabase, then reload this page.";

function isMissingFeature(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    error.code === "PGRST202" ||
    error.code === "42P01" ||
    error.code === "42883" ||
    /could not find the function|does not exist|schema cache/i.test(message)
  );
}

function friendError(error, fallback) {
  if (!error) return new Error(fallback);
  if (isMissingFeature(error)) return new Error(FRIENDS_SETUP_MESSAGE);
  return new Error(error.message || fallback);
}

export function emptyFriendRequests() {
  return { incoming: [], sent: [] };
}

// id + display name + six-digit ID. No emails or phone numbers, by design.
export async function listFriends() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_friends");
  if (error) throw friendError(error, "Your friends could not be loaded.");
  return Array.isArray(data) ? data : [];
}

export async function listFriendRequests() {
  if (!supabase) return emptyFriendRequests();
  const { data, error } = await supabase.rpc("list_friend_requests");
  if (error) throw friendError(error, "Your friend requests could not be loaded.");
  return {
    incoming: Array.isArray(data?.incoming) ? data.incoming : [],
    sent: Array.isArray(data?.sent) ? data.sent : [],
  };
}

// The SQL rejects yourself, unknown IDs, existing friends, duplicate pending
// requests, suspended accounts and more than 20 requests a day.
export async function sendFriendRequest(friendCode) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("send_friend_request", {
    p_code: String(friendCode || "").trim(),
  });
  if (error) throw friendError(error, "That friend request could not be sent.");
  return data || { status: "pending" };
}

export async function respondFriendRequest(requestId, accept) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("respond_friend_request", {
    p_request_id: requestId,
    p_accept: Boolean(accept),
  });
  if (error) throw friendError(error, "That request could not be answered.");
  return data || { status: accept ? "accepted" : "declined" };
}

export async function cancelFriendRequest(requestId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("cancel_friend_request", { p_request_id: requestId });
  if (error) throw friendError(error, "That request could not be cancelled.");
}

export async function removeFriend(userId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("remove_friend", { p_user_id: userId });
  if (error) throw friendError(error, "That friend could not be removed.");
}

// One sentence for the "sent" state, keyed off what the function returned.
export function friendRequestStatusMessage(result) {
  if (result?.status === "accepted") {
    return "You had a request from them, so you're friends now.";
  }
  if (result?.status === "friends") {
    return "You're already friends.";
  }
  return "Friend request sent.";
}
