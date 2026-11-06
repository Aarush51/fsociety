import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function SetupCard({ title, message }) {
  return (
    <main className="auth-main">
      <section className="auth-card">
        <h1>{title}</h1>
        <p className="muted small">{message}</p>
        <Link className="button button-dark button-full" to="/login">
          Go to log in
        </Link>
      </section>
    </main>
  );
}

export default function ProtectedRoute({ children }) {
  const {
    session,
    loading,
    configError,
    authError,
    suspended,
    suspensionLoading,
    suspensionUserId,
    suspensionError,
  } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="auth-main">
        <p className="muted small" role="status">
          Checking your session…
        </p>
      </main>
    );
  }

  if (configError) {
    return (
      <SetupCard
        title="Supabase setup required"
        message="Add your Supabase project URL and publishable key to .env to use this protected page."
      />
    );
  }

  if (authError && !session) {
    return (
      <SetupCard
        title="Could not verify your session"
        message="Supabase could not be reached. Check your project configuration and connection, then try again."
      />
    );
  }

  if (!session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (suspensionLoading || suspensionUserId !== session.user.id) {
    return (
      <main className="auth-main">
        <p className="muted small" role="status">
          Checking your account status…
        </p>
      </main>
    );
  }

  if (suspensionError) {
    return (
      <main className="auth-main">
        <section className="auth-card" role="alert">
          <h1>Could not verify your account status</h1>
          <p className="muted small">
            {suspensionError.message || "Supabase could not verify whether your account is suspended."}
          </p>
        </section>
      </main>
    );
  }

  if (suspended) {
    return (
      <main className="auth-main">
        <section className="auth-card" role="alert">
          <h1>Your account is suspended</h1>
          <p className="muted small">
            You cannot access this page while your account is suspended.
          </p>
        </section>
      </main>
    );
  }

  return children;
}
