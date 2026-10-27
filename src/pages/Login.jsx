import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageTitle from "../components/PageTitle";
import { safeRedirectTarget } from "../lib/format";
import { ORG_EMAIL_MESSAGE, fetchMyOrganization, isAllowedOrgEmail } from "../lib/organizations";

const AUDIENCES = [
  { value: "participant", label: "Participant" },
  { value: "organization", label: "Organization" },
];

export default function Login() {
  const { session, loading, signIn, signOut, configError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [audience, setAudience] = useState(
    searchParams.get("as") === "organization" ? "organization" : "participant",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);
  const [resolvingOrganization, setResolvingOrganization] = useState(false);

  // While we check for an organization we keep this page mounted, otherwise the
  // session update would bounce the user to the participant dashboard first.
  if (!loading && session && !resolvingOrganization) {
    return <Navigate to={safeRedirectTarget(redirect) || "/dashboard"} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const wantsOrganization = audience === "organization";
    if (wantsOrganization) setResolvingOrganization(true);
    setSubmitting(true);
    setMessage({ text: "", error: false });
    try {
      const data = await signIn(email.trim(), password);
      if (!wantsOrganization) {
        navigate(safeRedirectTarget(redirect) || "/dashboard");
        return;
      }
      // Organizations may only sign in with a company or college address, so a
      // blocked mailbox is signed straight back out.
      if (!isAllowedOrgEmail(data?.user?.email)) {
        try {
          await signOut();
        } catch (signOutError) {
          console.error("Could not sign out after a blocked organization email.", signOutError);
        }
        setResolvingOrganization(false);
        setMessage({ text: ORG_EMAIL_MESSAGE, error: true });
        return;
      }
      const organization = await fetchMyOrganization(data?.user?.id);
      navigate(organization ? "/organizer" : "/organization/register");
    } catch (error) {
      setResolvingOrganization(false);
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
          <div className="auth-audience" role="tablist" aria-label="Log in as">
            {AUDIENCES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={audience === option.value}
                className={`auth-audience-option${
                  audience === option.value ? " auth-audience-active" : ""
                }`}
                disabled={submitting}
                onClick={() => setAudience(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="auth-heading">
            <p className="eyebrow">GOOD TO SEE YOU AGAIN</p>
            <h1>Welcome back.</h1>
            <p className="muted small">
              {audience === "organization"
                ? "Host offline hackathons for your college, company or community."
                : "Pick up where you left off."}
            </p>
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
              {submitting && audience === "organization" ? "Checking your organization…" : "Log in"}
            </button>
            <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
              {configError || message.text}
            </p>
          </form>
          <p className="auth-switch">
            New to HackMate? <Link to="/signup">Create an account</Link>
            {audience === "organization" ? " — then log in here as an organization." : null}
          </p>
        </section>
      </main>
    </>
  );
}
