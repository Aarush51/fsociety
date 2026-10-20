import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageTitle from "../components/PageTitle";
import { safeRedirectTarget } from "../lib/format";

export default function Login() {
  const { session, loading, signIn, configError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Navigate to={safeRedirectTarget(redirect) || "/dashboard"} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage({ text: "", error: false });
    try {
      await signIn(email.trim(), password);
      navigate(safeRedirectTarget(redirect) || "/dashboard");
    } catch (error) {
      setMessage({
        text: error.message || "Authentication failed. Please try again.",
        error: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle title="Log in | HackMate" />
      <main className="auth-main">
        <section className="auth-card">
          <span className="brand-mark auth-logo">H</span>
          <div className="auth-heading">
            <p className="eyebrow">GOOD TO SEE YOU AGAIN</p>
            <h1>Welcome back.</h1>
            <p className="muted small">Pick up where you left off.</p>
          </div>
          <form id="auth-form" onSubmit={handleSubmit}>
            <label>
              Email address
              <input
                autoComplete="email"
                name="email"
                placeholder="you@college.edu"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                name="password"
                placeholder="At least 8 characters"
                type="password"
                minLength="8"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              className="button button-dark button-full"
              type="submit"
              disabled={submitting || Boolean(configError)}
            >
              Log in
            </button>
            <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
              {configError || message.text}
            </p>
          </form>
          <p className="auth-switch">
            New to HackMate? <Link to="/signup">Create an account</Link>
          </p>
        </section>
      </main>
    </>
  );
}
