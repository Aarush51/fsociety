import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { listFriendRequests } from "../lib/friends";

// How many friend requests are waiting for the signed-in user. The Huddle link
// in the navbar shows a dot while this is above zero, and the Huddle page calls
// `refreshFriends` after accepting, declining, cancelling or removing.
//
// A signed-out visitor has zero. A project without the friends SQL also has
// zero: the header must never break because an RPC is missing, and the Huddle
// page itself explains what to run.

const FriendsContext = createContext(null);

export function FriendsProvider({ children }) {
  const { session, user } = useAuth();
  const [incomingCount, setIncomingCount] = useState(0);

  const refreshFriends = useCallback(async () => {
    if (!session || !user) {
      setIncomingCount(0);
      return 0;
    }
    try {
      const { incoming } = await listFriendRequests();
      setIncomingCount(incoming.length);
      return incoming.length;
    } catch (error) {
      // Missing SQL or a network problem: no dot, no crash.
      console.error("Could not load friend requests.", error);
      setIncomingCount(0);
      return 0;
    }
  }, [session, user]);

  useEffect(() => {
    if (!session) {
      setIncomingCount(0);
      return;
    }
    refreshFriends();
  }, [session, refreshFriends]);

  const value = useMemo(
    () => ({ incomingCount, refreshFriends }),
    [incomingCount, refreshFriends],
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context) throw new Error("useFriends must be used inside a FriendsProvider.");
  return context;
}
