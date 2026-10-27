import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase, supabaseSetupMessage } from "../lib/supabase";

const AuthContext = createContext(null);

// Which side of the product the visitor picked on the login or signup page.
// Stored so a refreshed session keeps its mode; cleared when the user signs out.
export const AUTH_MODES = { participant: "participant", organization: "organization" };
const AUTH_MODE_STORAGE_KEY = "hackmate.authMode";

function readStoredMode() {
  try {
    const stored = window.localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    return stored === AUTH_MODES.organization || stored === AUTH_MODES.participant ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredMode(value) {
  try {
    if (value) window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, value);
    else window.localStorage.removeItem(AUTH_MODE_STORAGE_KEY);
  } catch {
    // Storage can be blocked, in which case the mode lasts for this page view.
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [mode, setMode] = useState(readStoredMode);
  const configError = isSupabaseConfigured ? null : supabaseSetupMessage;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setAuthError(error);
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setAuthError(error);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error(supabaseSetupMessage);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  // `extras` is optional: { skills: { name: level }, interests: string[],
  // hobbies: string }. They ride along in the signup metadata and the database
  // copies them onto the new profile row, which is the only way they survive
  // when the account still needs its email confirmed. Omitted values are not
  // sent at all, so an ordinary signup is unchanged.
  const signUp = useCallback(async (email, password, fullName, extras = null) => {
    if (!supabase) throw new Error(supabaseSetupMessage);
    const metadata = { full_name: fullName };
    if (extras?.skills && Object.keys(extras.skills).length) metadata.skills = extras.skills;
    if (extras?.interests?.length) metadata.interests = extras.interests;
    if (extras?.hobbies) metadata.hobbies = extras.hobbies;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw error;
    return data;
  }, []);

  // Remembers the Participant / Organization choice made on login or signup.
  const chooseMode = useCallback((next) => {
    const value = next === AUTH_MODES.organization ? AUTH_MODES.organization : AUTH_MODES.participant;
    setMode(value);
    writeStoredMode(value);
    return value;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error(supabaseSetupMessage);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setMode(null);
    writeStoredMode(null);
  }, []);

  // A signed-out visitor has no mode, so the next login starts from the toggle.
  useEffect(() => {
    if (loading || session) return;
    setMode(null);
    writeStoredMode(null);
  }, [loading, session]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      authError,
      configError,
      mode,
      chooseMode,
      signIn,
      signUp,
      signOut,
      isConfigured: isSupabaseConfigured,
    }),
    [session, loading, authError, configError, mode, chooseMode, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
  return context;
}
