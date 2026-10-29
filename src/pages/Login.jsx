import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import PageTitle from "../components/PageTitle";
import { landingPath } from "../lib/access";
import { safeRedirectTarget } from "../lib/format";
import { ORG_EMAIL_MESSAGE, fetchMyOrganization, isAllowedOrgEmail } from "../lib/organizations";

const AUDIENCES = [
  { value: "participant", label: "Participant" },
  { value: "organization", label: "Organization" },
];

// Shown on /organization/register when a participant account signs in under the
// Organization tab without owning an organization yet.
const NO_ORGANIZATION_NOTICE =
  "You are signed in as an organization, but this account has no organization yet. Register one below to start hosting hackathons.";

// An email that owns an organization belongs on the Organization tab, and a
// free mailbox can never hold an organizer account.
const ORGANIZER_ACCOUNT_NOTICE =
  "This email is registered as an organizer. Log in with the Organization tab instead.";

export default function Login() {
  const { session, loading, signIn, signOut, mode, chooseMode, configError } = useAuth();
  const { organization, loading: organizationLoading } = useOrganization();
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

  // Already signed in: land where the stored mode lives instead of always
  // bouncing to the participant dashboard. While a fresh organization login is
  // being resolved this page stays mounted so the notice keeps its destination.
  if (!loading && session && !resolvingOrganization) {
    const destination =
      safeRedirectTarget(redirect) ||
      (mode === "organization" && organizationLoading
        ? null
        : landingPath({ mode, hasOrganization: Boolean(organization) }));
    if (destination) return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const wantsOrganization = audience === "organization";
    chooseMode(wantsOrganization ? "organization" : "participant");
    if (wantsOrganization) setResolvingOrganization(true);
    setSubmitting(true);
    setMessage({ text: "", error: false });
    try {
      const data = await signIn(email.trim(), password);

      // Organizations may only sign in with a company or college address, so a
      // blocked mailbox is signed straight back out.
      if (wantsOrganization && !isAllowedOrgEmail(data?.user?.email)) {
        try {
          await signOut();
        } catch (signOutError) {
          console.error("Could not sign out after a blocked organization email.", signOutError);
        }
        chooseMode("organization");
        setResolvingOrganization(false);
        setMessage({ text: ORG_EMAIL_MESSAGE, error: true });
        return;
      }

      if (!wantsOrganization) {
        // The reverse rule: an account that owns an organization cannot use the
        // participant login. A failed lookup must never block a normal sign-in.
        let ownsOrganization = null;
        try {
          ownsOrganization = await fetchMyOrganization(data?.user?.id);
        } catch (lookupError) {
          console.error("Could not check for an organization on this account.", lookupError);
        }
        if (ownsOrganization) {
          try {
            await signOut();
          } catch (signOutError) {
            console.error("Could not sign out after a blocked participant login.", signOutError);
          }
          setMessage({ text: ORGANIZER_ACCOUNT_NOTICE, error: true });
          return;
        }
        navigate(safeRedirectTarget(redirect) || "/");
        return;
      }
      // Organization mode: owners go straight to their dashboard, everyone else
      // is sent (still signed in) to register the organization they came for.
      const organizationRow = await fetchMyOrganization(data?.user?.id);
      if (organizationRow) {
        navigate("/organizer");
        return;
      }
      navigate("/organization/register", { state: { notice: NO_ORGANIZATION_NOTICE } });
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
            New to HackMate?{" "}
            <Link to={audience === "organization" ? "/signup?as=organization" : "/signup"}>
              Create an account
            </Link>
            {audience === "organization" ? " — then log in here as an organization." : null}
          </p>
        </section>
      </main>
    </>
  );
}
