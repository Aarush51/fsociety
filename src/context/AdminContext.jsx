import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchIsAdmin } from "../lib/admin";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const AdminContext = createContext(null);

// Exposes whether the signed-in user is an admin, so the header can hide the
// Admin link and /admin can redirect everyone else home.
export function AdminProvider({ children }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !user) {
      setIsAdmin(false);
      setLoading(false);
      return false;
    }
    setLoading(true);
    try {
      const value = await fetchIsAdmin();
      setIsAdmin(value);
      return value;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ isAdmin, loading, refresh }), [isAdmin, loading, refresh]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdmin must be used inside an AdminProvider.");
  return context;
}
