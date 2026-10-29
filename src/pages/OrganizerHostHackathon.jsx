import { useState } from "react";
<<<<<<< HEAD
import { Link, Navigate } from "react-router-dom";
=======
import { Link, Navigate, useNavigate } from "react-router-dom";
import DraftRestoredNote from "../components/DraftRestoredNote";
>>>>>>> dba09642439d0269aa9a22867da2b2752b4f506c
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import useFormDraft from "../hooks/useFormDraft";
import { createHackathon, validateHackathon } from "../lib/organizations";

const EMPTY_FORM = {
  title: "",
  description: "",
  venue_name: "",
  city: "",
  starts_at: "",
  ends_at: "",
  price: "0",
  capacity: "",
  team_size_max: "4",
  claimed_tier: "",
  claimed_tier_reason: "",
  expected_participants: "",
  prize_pool: "",
  // Optional fields, moved into the collapsed "More details" section.
  address: "",
  maps_url: "",
  banner_url: "",
  theme_tags: "",
  rules: "",
  prize_details: "",
};

// Tier 1 is the highest level, Tier 3 the lowest. The copy is the organizer-facing
// definition of each level; an admin decides the final tier after review.
const TIER_OPTIONS = [
  {
    value: "1",
    label: "Tier 1 (highest)",
    description:
      "Flagship events, national or multi-college, 300+ participants, prize pool of ₹1,00,000 or more, well-known backing, industry judges, 24+ hours.",
  },
  {
    value: "2",
    label: "Tier 2",
    description:
      "Solid college or company events, 100 to 300 participants, prize pool ₹20,000 to ₹1,00,000, mentors.",
  },
  {
    value: "3",
    label: "Tier 3",
    description:
      "Small, new or club-level events, under 100 participants, small or no prize pool, first edition.",
  },
];

const TIER_HELPER =
  "An admin reviews every hackathon and sets the final tier. Pick the one that honestly fits; your choice does not change your points or ranking.";

const SUBMITTED_MESSAGE = "Submitted for review. It goes live once an admin approves it.";

function Field({ label, hint, error, children }) {
  return (
    <label>
      {label}
      {children}
      {hint && !error ? <span className="org-field-hint">{hint}</span> : null}
      {error ? (
        <span className="org-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export default function OrganizerHostHackathon() {
  const { user } = useAuth();
  const { organization, loading } = useOrganization();
<<<<<<< HEAD
  const [values, setValues] = useState(EMPTY_FORM);
=======
  const navigate = useNavigate();
  const [values, setValues, clearDraft, draftRestored] = useFormDraft(
    `host-hackathon.${user?.id ?? "anonymous"}`,
    EMPTY_FORM,
  );
>>>>>>> dba09642439d0269aa9a22867da2b2752b4f506c
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <>
        <PageTitle title="Host a hackathon | HackMate" />
        <main className="page-main wrap">
          <p className="hackathon-status" role="status" aria-live="polite">
            Loading your organization…
          </p>
        </main>
      </>
    );
  }

  if (!organization) {
    return <Navigate to="/" replace />;
  }

  const update = (name) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const selectTier = (value) => {
    setValues((current) => ({ ...current, claimed_tier: value }));
    setErrors((current) => {
      if (!current.claimed_tier) return current;
      const next = { ...current };
      delete next.claimed_tier;
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = validateHackathon(values);
    setErrors(result.errors);
    if (!result.valid) {
      setMessage({ text: "Please fix the highlighted fields and try again.", error: true });
      return;
    }
    setSubmitting(true);
    setMessage({ text: "", error: false });
    try {
      await createHackathon({ organization, user, values });
<<<<<<< HEAD
      // The event is pending review now, so it is not on the public pages yet.
      // Stay on the form, say what happens next, and clear it for the next one.
      setValues(EMPTY_FORM);
      setMessage({ text: SUBMITTED_MESSAGE, error: false });
=======
      clearDraft();
      navigate("/organizer");
>>>>>>> dba09642439d0269aa9a22867da2b2752b4f506c
    } catch (error) {
      // createHackathon keeps the raw Postgres message in here on purpose.
      setMessage({ text: error.message || "Your hackathon could not be saved.", error: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Hosting is only open to approved organizations; everyone else lands back on
  // the dashboard, which explains the current status.
  if (organization.status !== "approved") {
    return <Navigate to="/organizer" replace />;
  }

  const tierReasonLength = values.claimed_tier_reason.length;

  return (
    <>
      <PageTitle title={`Host a hackathon | ${organization.org_name}`} />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="HOST A HACKATHON"
          title="Bring people together, offline."
          description={`Every hackathon you publish runs under ${organization.org_name}. Add the venue first — participants need to know exactly where to show up.`}
        />
        {draftRestored ? (
          <DraftRestoredNote
            onStartOver={() => {
              clearDraft();
              setErrors({});
              setMessage({ text: "", error: false });
            }}
          />
        ) : null}
        <form className="org-form" onSubmit={handleSubmit} noValidate>
          <Field label="Hackathon title" error={errors.title}>
            <input
              name="title"
              maxLength="160"
              placeholder="Mumbai Offline Hack 2026"
              value={values.title}
              onChange={update("title")}
              required
            />
          </Field>
          <Field
            label="Short description"
            hint="One or two lines — what people will build and who should join."
            error={errors.description}
          >
            <textarea
              name="description"
              rows="5"
              placeholder="What people will build, who should join, and what the weekend looks like."
              value={values.description}
              onChange={update("description")}
              required
            />
          </Field>

          <div className="org-form-section">
            <p className="eyebrow">WHERE AND WHEN</p>
            <Field label="Venue name" error={errors.venue_name}>
              <input
                name="venue_name"
                maxLength="200"
                placeholder="Main Innovation Hall"
                value={values.venue_name}
                onChange={update("venue_name")}
                required
              />
            </Field>
            <Field label="City" error={errors.city}>
              <input
                name="city"
                maxLength="120"
                placeholder="Pune"
                value={values.city}
                onChange={update("city")}
                required
              />
            </Field>
            <Field label="Starts at" error={errors.starts_at}>
              <input
                name="starts_at"
                type="datetime-local"
                value={values.starts_at}
                onChange={update("starts_at")}
                required
              />
            </Field>
            <Field label="Ends at" error={errors.ends_at}>
              <input
                name="ends_at"
                type="datetime-local"
                value={values.ends_at}
                onChange={update("ends_at")}
                required
              />
            </Field>
            <Field
              label="Entry fee (rupees)"
              hint="Leave 0 for free — free events skip payment completely."
              error={errors.price}
            >
              <input
                name="price"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={values.price}
                onChange={update("price")}
              />
            </Field>
            <Field label="Capacity" hint="How many people the venue can hold." error={errors.capacity}>
              <input
                name="capacity"
                type="number"
                min="1"
                step="1"
                placeholder="120"
                value={values.capacity}
                onChange={update("capacity")}
                required
              />
            </Field>
            <Field
              label="Maximum team size"
              hint="Participants can form teams from Solo (1) up to this size."
              error={errors.team_size_max}
            >
              <select
                name="team_size_max"
                value={values.team_size_max}
                onChange={update("team_size_max")}
                required
              >
                {[2, 3, 4, 5, 6].map((size) => (
                  <option value={size} key={size}>
                    {size} people
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="org-form-section">
            <p className="eyebrow">TIER</p>
            <div className="idea-field">
              <span className="idea-label" id="tier-question">
                Which tier do you consider your hackathon?
              </span>
              <div className="idea-time-options" role="group" aria-labelledby="tier-question">
                {TIER_OPTIONS.map((option) => (
                  <button
                    className="idea-time-option"
                    type="button"
                    key={option.value}
                    aria-pressed={values.claimed_tier === option.value}
                    onClick={() => selectTier(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
              {errors.claimed_tier ? (
                <span className="org-field-error" role="alert">
                  {errors.claimed_tier}
                </span>
              ) : null}
              <span className="org-field-hint">{TIER_HELPER}</span>
            </div>
            <Field
              label="Why this tier?"
              hint={`${tierReasonLength}/600 characters`}
              error={errors.claimed_tier_reason}
            >
              <textarea
                name="claimed_tier_reason"
                rows="3"
                maxLength="600"
                placeholder="We run a two-day, multi-college event with 400 participants, industry judges and a ₹1,50,000 prize pool."
                value={values.claimed_tier_reason}
                onChange={update("claimed_tier_reason")}
                required
              />
            </Field>
            <Field
              label="Expected participants"
              hint="A rough number. Optional."
              error={errors.expected_participants}
            >
              <input
                name="expected_participants"
                type="number"
                min="1"
                step="1"
                placeholder="300"
                value={values.expected_participants}
                onChange={update("expected_participants")}
              />
            </Field>
            <Field
              label="Prize pool (rupees)"
              hint="Total prize pool. Optional — leave blank for no prize pool."
              error={errors.prize_pool}
            >
              <input
                name="prize_pool"
                type="number"
                min="0"
                step="1"
                placeholder="100000"
                value={values.prize_pool}
                onChange={update("prize_pool")}
              />
            </Field>
          </div>

          <details className="org-form-section">
            <summary className="eyebrow">MORE DETAILS (OPTIONAL)</summary>
            <Field label="Full address" error={errors.address}>
              <textarea
                name="address"
                rows="2"
                maxLength="400"
                placeholder="College Road, Pune 411001, Maharashtra"
                value={values.address}
                onChange={update("address")}
              />
            </Field>
            <Field
              label="Google Maps link"
              hint="Paste the share link so participants can tap Get directions."
              error={errors.maps_url}
            >
              <input
                name="maps_url"
                placeholder="https://maps.app.goo.gl/…"
                value={values.maps_url}
                onChange={update("maps_url")}
              />
            </Field>
            <Field
              label="Banner image URL"
              hint="A public image link (https://…) used at the top of your event."
              error={errors.banner_url}
            >
              <input
                name="banner_url"
                placeholder="https://images.example/banner.jpg"
                value={values.banner_url}
                onChange={update("banner_url")}
              />
            </Field>
            <Field
              label="Theme tags"
              hint="Comma separated, up to 6 — for example: Climate Tech, Open Innovation."
            >
              <input
                name="theme_tags"
                placeholder="Climate Tech, Open Innovation"
                value={values.theme_tags}
                onChange={update("theme_tags")}
              />
            </Field>
            <Field label="Rules" hint="Code of conduct, what to bring, judging rules.">
              <textarea
                name="rules"
                rows="4"
                placeholder="Teams of up to 4. Bring your own laptop and charger."
                value={values.rules}
                onChange={update("rules")}
              />
            </Field>
            <Field label="Prize details" hint="Prize pool, categories and any goodies.">
              <textarea
                name="prize_details"
                rows="3"
                placeholder="₹50,000 pool — ₹25,000 winner, ₹15,000 runner-up, ₹10,000 best beginner team."
                value={values.prize_details}
                onChange={update("prize_details")}
              />
            </Field>
          </details>

          <div className="org-form-actions">
            <button className="button button-dark" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
            <Link className="text-link" to="/organizer">
              Back to dashboard
            </Link>
          </div>
          <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
            {message.text}
          </p>
        </form>
      </main>
    </>
  );
}
