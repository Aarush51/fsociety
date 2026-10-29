import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DraftRestoredNote from "../components/DraftRestoredNote";
import PageTitle from "../components/PageTitle";
import { SkillsFields, cleanInterests, cleanSkillLevels } from "../features/teams";
import useFormDraft from "../hooks/useFormDraft";
import { safeRedirectTarget } from "../lib/format";
import { ORG_EMAIL_MESSAGE, isAllowedOrgEmail } from "../lib/organizations";

const AUDIENCES = [
  { value: "participant", label: "Participant" },
  { value: "organization", label: "Organization" },
];

export default function Signup() {
  const { session, loading, signUp, chooseMode, configError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");

  // Signup happens before there is a user id, so the draft key is just "signup".
  // The password is never part of these values: it stays in its own state below.
  const [values, setValues, clearDraft, draftRestored] = useFormDraft("signup", {
    audience: searchParams.get("as") === "organization" ? "organization" : "participant",
    name: "",
    email: "",
    skillLevels: {},
    interests: [],
    hobbies: "",
  });
  const { audience, name, email, skillLevels, interests, hobbies } = values;
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);

  const setField = (field) => (value) =>
    setValues((current) => ({ ...current, [field]: value }));
  const setAudience = setField("audience");
  const setName = setField("name");
  const setEmail = setField("email");
  const setSkillLevels = setField("skillLevels");
  const setInterests = setField("interests");
  const setHobbies = setField("hobbies");

  if (!loading && session) {
    return <Navigate to={safeRedirectTarget(redirect) || "/dashboard"} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const wantsOrganization = audience === "organization";
    // Organizer accounts need a company or college address, so a free mailbox is
    // rejected before the account is ever created.
    if (wantsOrganization && !isAllowedOrgEmail(email.trim())) {
      setMessage({ text: ORG_EMAIL_MESSAGE, error: true });
      return;
    }
    chooseMode(wantsOrganization ? "organization" : "participant");
    setSubmitting(true);
    setMessage({ text: "", error: false });
    try {
      // Organizers are never asked for participant skills: they only get an
      // account here and register their organization on the next page.
      const result = wantsOrganization
        ? await signUp(email.trim(), password, name.trim())
        : await signUp(email.trim(), password, name.trim(), {
            skills: cleanSkillLevels(skillLevels),
            interests: cleanInterests(interests),
            hobbies: hobbies.trim(),
          });
      // The account exists, so the typed-in draft (and the password in memory)
      // has served its purpose.
      clearDraft();
      setPassword("");
      if (!result.session) {
        setMessage({
          text: wantsOrganization
            ? "Check your email to confirm your account, then log in as an organization."
            : "Check your email to confirm your account, then log in.",
          error: false,
        });
      } else if (wantsOrganization) {
        navigate("/organization/register");
      } else {
        navigate(safeRedirectTarget(redirect) || "/dashboard");
      }
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
      <PageTitle title="Create an account | HackMate" />
      <main className="auth-main">
        <section className="auth-card">
          <span className="brand-mark auth-logo">H</span>
          <div className="auth-audience" role="tablist" aria-label="Sign up as">
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
            <p className="eyebrow">
              {audience === "organization"
                ? "HOST HACKATHONS PEOPLE REMEMBER"
                : "YOUR NEXT THING STARTS HERE"}
            </p>
            <h1>{audience === "organization" ? "Host on HackMate." : "Join HackMate."}</h1>
            <p className="muted small">
              {audience === "organization"
                ? "Create an organizer account, then register your organization."
                : "Create an account and find your people."}
            </p>
          </div>
          {draftRestored ? <DraftRestoredNote onStartOver={() => clearDraft()} /> : null}
          <form id="auth-form" onSubmit={handleSubmit}>
            <label>
              Your name
              <input
                autoComplete="name"
                name="name"
                placeholder="Jamie Kim"
                maxLength="100"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
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
                autoComplete="new-password"
                name="password"
                placeholder="At least 8 characters"
                type="password"
                minLength="8"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {audience === "participant" ? (
              <SkillsFields
                id="signup-skills"
                skillLevels={skillLevels}
                interests={interests}
                hobbies={hobbies}
                onSkillLevelsChange={setSkillLevels}
                onInterestsChange={setInterests}
                onHobbiesChange={setHobbies}
                disabled={submitting}
              />
            ) : null}
            <label className="checkbox-label">
              <input type="checkbox" required />
              <span>I agree to help build a kind and welcoming community.</span>
            </label>
            <button
              className="button button-dark button-full"
              type="submit"
              disabled={submitting || Boolean(configError)}
            >
              Create your account
            </button>
            <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
              {configError || message.text}
            </p>
          </form>
          <p className="auth-switch">
            Already have an account?{" "}
            <Link to={audience === "organization" ? "/login?as=organization" : "/login"}>Log in</Link>
          </p>
        </section>
      </main>
    </>
  );
}
