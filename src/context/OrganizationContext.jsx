import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchMyOrganization } from "../lib/organizations";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const OrganizationContext = createContext(null);

// Keeps the signed-in user's organization (if any) available to the header and
// the organizer pages without every page re-fetching it.
export function OrganizationProvider({ children }) {
  const { user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setOrganization(null);
      setError(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const row = await fetchMyOrganization(user.id);
      setOrganization(row);
      setError(null);
      return row;
    } catch (requestError) {
      console.error("Could not load your organization.", requestError);
      setError(requestError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      organization,
      loading,
      error,
      refresh,
      isOrganizer: Boolean(organization),
    }),
    [organization, loading, error, refresh],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("useOrganization must be used inside an OrganizationProvider.");
  return context;
}
