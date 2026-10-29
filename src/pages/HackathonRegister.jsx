import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { startRegistrationPayment } from "../features/payments/startRegistrationPayment";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import TeamFormation from "../components/TeamFormation";
import { useAuth } from "../context/AuthContext";
import { formatEventDate, formatPrice } from "../lib/format";
import { fetchOwnProfile, saveRegistrationProfile } from "../lib/profiles";
import {
  fetchRegistrationInfo,
  isFull,
  registeredCount,
  remainingSpots,
  saveRegistration,
} from "../lib/registrations";
import { listHackathonTeams, myTeamFrom } from "../lib/teams";
import { fetchPendingTeammateReviewCount } from "../lib/teammateReviews";
import { supabase } from "../lib/supabase";

const REGISTER_FIELDS =
  "id, slug, title, starts_at, ends_at, registration_deadline, status, price, capacity, venue_name, city";

const STEPS = [
  { key: "details", label: "1 Your details" },
  { key: "register", label: "2 Register" },
  { key: "team", label: "3 Team" },
];

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

function addSkillToList(list, value) {
  const skill = String(value || "").trim();
  if (!skill || skill.length > 80) return list;
  if (list.some((item) => item.toLowerCase() === skill.toLowerCase())) return list;
  if (list.length >= 20) return list;
  return [...list, skill];
}

export default function HackathonRegister() {
  const { slug } = useParams();
  const { session, user } = useAuth();

  const [hackathon, setHackathon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [info, setInfo] = useState(null);
  const [teams, setTeams] = useState([]);
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  const [form, setForm] = useState({ full_name: "", username: "", bio: "" });
  const [fieldErrors, setFieldErrors] = useState({});

  const [stage, setStage] = useState(null); // null = derive from registration state
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(0);

  // ---- load hackathon by slug -------------------------------------------------
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setLoadError(new Error("Supabase is not configured."));
      return undefined;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    supabase
      .from("hackathons")
      .select(REGISTER_FIELDS)
      .eq("slug", slug)
      .in("status", ["upcoming", "active"])
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (data) setHackathon(data);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load the hackathon for registration.", error);
        setLoadError(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // ---- load profile, registration status and teams ---------------------------
  const load = useCallback(async () => {
    if (!hackathon?.id || !user?.id) return;
    setLoadError(null);
    try {
      const [profile, infoData, teamRows, pendingCount] = await Promise.all([
        fetchOwnProfile(user.id),
        fetchRegistrationInfo(hackathon.id),
        listHackathonTeams(hackathon.id),
        fetchPendingTeammateReviewCount(),
      ]);
      setPendingReviews(pendingCount);
      if (profile) {
        setForm({
          full_name: profile.full_name || "",
          username: profile.username || "",
          bio: profile.bio || "",
        });
        setSkills(profile.skills || []);
      }
      setInfo(infoData);
      setTeams(teamRows);
    } catch (error) {
      console.error("Could not load your registration state.", error);
      setLoadError(error);
    }
  }, [hackathon?.id, user?.id]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const registered = Boolean(info?.my_registration);
  // A finished hackathon leaves reviews behind; those come before a new signup.
  const blockedByReviews = pendingReviews > 0 && !registered;
  const myTeam = myTeamFrom(teams, user?.id);
  const effectiveStage = stage || (registered ? "team" : "details");
  const spots = remainingSpots(info);
  const price = Number(info?.price ?? hackathon?.price) || 0;

  // ---- step 1: basic information ---------------------------------------------
  const handleDetailsSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    const fullName = form.full_name.trim();
    const username = form.username.trim();
    if (!fullName || fullName.length > 100) errors.full_name = "Enter your name (1–100 characters).";
    if (!USERNAME_PATTERN.test(username)) {
      errors.username = "Username must be 3–30 characters: letters, numbers or underscores.";
    }
    if ((form.bio || "").length > 500) errors.bio = "Bio must be 500 characters or fewer.";
    if (!skills.length) errors.skills = "Add at least one skill — skill-based matching uses it.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setBusy(true);
    setMessage({ text: "", error: false });
    try {
      await saveRegistrationProfile({
        fullName,
        username,
        bio: form.bio,
        skills,
      });
      setStage("register");
      setMessage({ text: "Your details are saved.", error: false });
    } catch (error) {
      setMessage({ text: error.message, error: true });
    } finally {
      setBusy(false);
    }
  };

  // ---- step 2: the registration row -------------------------------------------
  const handleRegister = async () => {
    if (isFull(info)) {
      setMessage({ text: "This hackathon is full — no spots are left to register.", error: true });
      return;
    }
    setBusy(true);
    setMessage({ text: "", error: false });
    try {
      let paid = false;
      if (price > 0) {
        const payment = await startRegistrationPayment(hackathon.id);
        if (payment?.status !== "paid") {
          setMessage({
            text: "The payment was not completed, so your seat was not reserved. Please try again.",
            error: true,
          });
          setBusy(false);
          return;
        }
        paid = true;
      }
      if (!registered) {
        await saveRegistration({ hackathonId: hackathon.id, userId: user.id, paid });
      }
      const infoData = await fetchRegistrationInfo(hackathon.id);
      setInfo(infoData);
      setStage("team");
      setMessage({ text: "You are registered. Now form your team.", error: false });
    } catch (error) {
      if (error.code === "23505") {
        // Already registered — move on to team formation.
        const infoData = await fetchRegistrationInfo(hackathon.id);
        setInfo(infoData);
        setStage("team");
        setMessage({ text: "You are already registered. Form your team below.", error: false });
      } else {
        setMessage({ text: error.message, error: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const addSkill = () => {
    const next = addSkillToList(skills, skillInput);
    if (next !== skills) {
      setSkills(next);
      setFieldErrors((current) => ({ ...current, skills: undefined }));
    }
    setSkillInput("");
  };

  // ---- rendering ---------------------------------------------------------------
  if (!session) return null; // ProtectedRoute handles the redirect

  if (loading) {
    return (
      <main className="page-main wrap">
        <PageTitle title="Register | HackMate" />
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading registration…
        </p>
      </main>
    );
  }

  if (!hackathon) {
    return (
      <main className="page-main wrap">
        <PageTitle title="Register | HackMate" />
        <p className="hackathon-status" role="status" data-error={Boolean(loadError)}>
          {loadError
            ? "Registration couldn’t be loaded. Check your connection and try again."
            : "This hackathon is unavailable or no longer open."}
        </p>
        <div className="org-form-actions">
          <Link className="button button-dark" to="/hackathons">
            Browse hackathons <Arrow />
          </Link>
        </div>
      </main>
    );
  }

  const dates = `${formatEventDate(hackathon.starts_at)} – ${formatEventDate(hackathon.ends_at)}`;

  return (
    <main className="page-main wrap">
      <PageTitle title={`Register: ${hackathon.title} | HackMate`} />
      <Link className="back-link" to={`/hackathons/${encodeURIComponent(hackathon.slug)}`}>
        ← {hackathon.title}
      </Link>
      <PageIntro
        eyebrow="HACKATHON REGISTRATION"
        title={`Register for ${hackathon.title}`}
        description={`${dates}${hackathon.venue_name ? ` · ${hackathon.venue_name}` : ""}${
          hackathon.city ? `, ${hackathon.city}` : ""
        }`}
      />

      <div className="filter-list" aria-label="Registration steps">
        {STEPS.map((step, index) => {
          const active = step.key === effectiveStage;
          const reached =
            step.key === "details" ||
            (step.key === "register" && (effectiveStage !== "details" || registered)) ||
            (step.key === "team" && registered);
          return (
            <span
              key={step.key}
              className={active ? "filter-active" : "skill"}
              aria-current={active ? "step" : undefined}
              style={reached && !active ? { opacity: 1 } : reached ? undefined : { opacity: 0.5 }}
            >
              {step.label}
            </span>
          );
        })}
      </div>

      <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
        {message.text}
      </p>

      {blockedByReviews ? (
        <section className="org-form" aria-label="Teammate reviews pending">
          <p className="eyebrow">REVIEWS PENDING</p>
          <h2>Review your last teammates first.</h2>
          <p className="muted small">
            Every teammate from a finished hackathon has to be reviewed before you can register
            for a new one. You still owe {pendingReviews}{" "}
            {pendingReviews === 1 ? "review" : "reviews"}.
          </p>
          <div className="org-form-actions">
            <Link className="button button-dark" to="/huddle?tab=reviews">
              Open The Huddle · Reviews <Arrow />
            </Link>
          </div>
        </section>
      ) : null}

      {!blockedByReviews && effectiveStage === "details" ? (
        <form className="org-form" onSubmit={handleDetailsSubmit} noValidate>
          <p className="muted small">
            Tell us the basics — this becomes your participant profile and is what teammates and the
            organizer see.
          </p>

          <label htmlFor="reg-full-name">
            Full name
            {fieldErrors.full_name ? (
              <span className="org-field-error">{fieldErrors.full_name}</span>
            ) : null}
          </label>
          <input
            id="reg-full-name"
            name="full_name"
            autoComplete="name"
            maxLength="100"
            required
            value={form.full_name}
            onChange={(event) => setForm({ ...form, full_name: event.target.value })}
          />

          <label htmlFor="reg-username">
            Username
            {fieldErrors.username ? (
              <span className="org-field-error">{fieldErrors.username}</span>
            ) : null}
          </label>
          <input
            id="reg-username"
            name="username"
            autoComplete="username"
            minLength="3"
            maxLength="30"
            pattern="[A-Za-z0-9_]+"
            required
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
          />

          <label htmlFor="reg-bio">
            Short bio <span className="muted tiny">Optional · 500 characters</span>
            {fieldErrors.bio ? <span className="org-field-error">{fieldErrors.bio}</span> : null}
          </label>
          <textarea
            id="reg-bio"
            name="bio"
            maxLength="500"
            rows="3"
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
          />

          <label htmlFor="reg-skill-input">
            Skills
            {fieldErrors.skills ? <span className="org-field-error">{fieldErrors.skills}</span> : null}
          </label>
          <div className="profile-skill-list" aria-live="polite">
            {skills.length ? (
              skills.map((skill, index) => (
                <span className="skill" key={`${skill}-${index}`}>
                  {skill}
                  <button
                    type="button"
                    aria-label={`Remove ${skill}`}
                    onClick={() => setSkills(skills.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span className="muted tiny">No skills added yet.</span>
            )}
          </div>
          <div className="profile-skill-entry">
            <input
              id="reg-skill-input"
              type="text"
              maxLength="80"
              placeholder="Add a skill and press Enter"
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addSkill();
                }
              }}
            />
            <button className="button button-outline" type="button" onClick={addSkill}>
              Add
            </button>
          </div>
          <p className="muted tiny">
            Add up to 20 skills. Skill-based matching uses these to find teams that need you.
          </p>

          <div className="org-form-actions">
            <button className="button button-dark" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save and continue"}
            </button>
          </div>
        </form>
      ) : null}

      {!blockedByReviews && effectiveStage === "register" ? (
        <section className="org-form" aria-label="Confirm registration">
          <p className="eyebrow">CONFIRM YOUR SPOT</p>
          <h2>{hackathon.title}</h2>
          <p className="muted small">
            {dates}
            {hackathon.venue_name ? ` · ${hackathon.venue_name}` : ""}
            {hackathon.city ? `, ${hackathon.city}` : ""}
          </p>
          <p className="muted small">
            {price > 0 ? `Entry fee ${formatPrice(price)} · ` : "Free entry · "}
            {spots !== null
              ? `${registeredCount(info)} of ${Number(info?.capacity)} registered · ${
                  spots <= 0 ? "no spots left" : `${spots} ${spots === 1 ? "spot" : "spots"} left`
                }`
              : `${registeredCount(info)} registered`}
          </p>
          <p className="muted tiny">
            Registered as {form.full_name} (@{form.username}) with {skills.length}{" "}
            {skills.length === 1 ? "skill" : "skills"}.
          </p>
          <div className="org-form-actions">
            <button
              className="button button-dark"
              type="button"
              onClick={handleRegister}
              disabled={busy || (!registered && isFull(info))}
            >
              {busy ? "Registering…" : registered ? "Continue to team" : "Confirm registration"}
            </button>
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setStage("details");
                setMessage({ text: "", error: false });
              }}
            >
              Edit my details
            </button>
          </div>
        </section>
      ) : null}

      {!blockedByReviews && effectiveStage === "team" ? (
        <section aria-label="Team formation">
          <p className="eyebrow">
            {registered ? "YOU ARE REGISTERED · " : ""}
            {myTeam ? "YOUR TEAM" : "NOW FORM YOUR TEAM"}
          </p>
          {!registered ? (
            <div className="org-form-actions">
              <button
                className="button button-dark"
                type="button"
                onClick={() => setStage("register")}
              >
                Finish registration first
              </button>
            </div>
          ) : null}
          <TeamFormation
            hackathon={hackathon}
            userId={user.id}
            mySkills={skills}
            teams={teams}
            myTeam={myTeam}
            onChanged={async () => {
              await load();
            }}
          />
        </section>
      ) : null}
    </main>
  );
}
