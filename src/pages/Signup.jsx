import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageTitle from "../components/PageTitle";
import { SkillsFields, cleanInterests, cleanSkillLevels } from "../features/teams";
import { safeRedirectTarget } from "../lib/format";

export default function Signup() {
  const { session, loading, signUp, configError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [skillLevels, setSkillLevels] = useState({});
  const [interests, setInterests] = useState([]);
  const [hobbies, setHobbies] = useState("");
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
      const result = await signUp(email.trim(), password, name.trim(), {
        skills: cleanSkillLevels(skillLevels),
        interests: cleanInterests(interests),
        hobbies: hobbies.trim(),
      });
      if (!result.session) {
        setMessage({
          text: "Check your email to confirm your account, then log in.",
          error: false,
        });
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
          <div className="auth-heading">
            <p className="eyebrow">YOUR NEXT THING STARTS HERE</p>
            <h1>Join HackMate.</h1>
            <p className="muted small">Create an account and find your people.</p>
          </div>
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
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </section>
      </main>
    </>
  );
}
