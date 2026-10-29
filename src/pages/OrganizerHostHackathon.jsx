import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import DraftRestoredNote from "../components/DraftRestoredNote";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import useFormDraft from "../hooks/useFormDraft";
import { createHackathon, HACKATHON_TIERS, validateHackathon } from "../lib/organizations";

const EMPTY_FORM = {
  title: "",
  description: "",
  theme_tags: "",
  venue_name: "",
  address: "",
  city: "",
  capacity: "",
  team_size_max: "4",
  price: "0",
  starts_at: "",
  ends_at: "",
  claimed_tier: "",
  tier_reason: "",
  expected_participants: "",
  prize_pool: "",
};

const SUBMITTED_MESSAGE =
  "Your hackathon was submitted. An admin will review the tier you claimed, and it will appear on the public pages once approved.";

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
  const [values, setValues, clearDraft, draftRestored] = useFormDraft(
    `host-hackathon.${user?.id ?? "anonymous"}`,
    EMPTY_FORM,
  );
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

  // The tier buttons are not inputs, so they clear their own error.
  const chooseTier = (tier) => {
    setValues((current) => ({ ...current, claimed_tier: String(tier) }));
    setErrors((current) => {
      if (!current.claimed_tier) return current;
      const next = { ...current };
      delete next.claimed_tier;
      return next;
    });
  };

  const selectedTier = HACKATHON_TIERS.find(
    (tier) => tier.value === Number(values.claimed_tier),
  );

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
      // The event is pending review now, so it is not on the public pages yet.
      // Stay on the form, say what happens next, and clear it for the next one.
      clearDraft();
      setMessage({ text: SUBMITTED_MESSAGE, error: false });
    } catch (error) {
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
          <p className="eyebrow">EVENT BASICS</p>
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
          <Field label="Description" error={errors.description}>
            <textarea
              name="description"
              rows="5"
              placeholder="What people will build, who should join, and what the weekend looks like."
              value={values.description}
              onChange={update("description")}
              required
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

          <div className="org-form-section">
            <p className="eyebrow">OFFLINE VENUE</p>
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
            <Field label="Full address" error={errors.address}>
              <textarea
                name="address"
                rows="2"
                maxLength="400"
                placeholder="College Road, Pune 411001, Maharashtra"
                value={values.address}
                onChange={update("address")}
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
          </div>

          <div className="org-form-section">
            <p className="eyebrow">SCHEDULE, SEATS AND PRICE</p>
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
          </div>

          <div className="org-form-section">
            <p className="eyebrow">WHICH TIER IS YOUR HACKATHON?</p>
            <div className="filter-list" role="group" aria-label="Which tier is your hackathon?">
              {HACKATHON_TIERS.map((tier) => (
                <button
                  className={
                    Number(values.claimed_tier) === tier.value ? "filter-active" : "skill"
                  }
                  type="button"
                  aria-pressed={Number(values.claimed_tier) === tier.value}
                  key={tier.value}
                  onClick={() => chooseTier(tier.value)}
                >
                  {tier.label}
                </button>
              ))}
            </div>
            {selectedTier ? (
              <span className="org-field-hint">{selectedTier.example}</span>
            ) : null}
            {errors.claimed_tier ? (
              <span className="org-field-error" role="alert">
                {errors.claimed_tier}
              </span>
            ) : null}
            <Field
              label="Reason for this tier (required)"
              hint="An admin reviews this before the tier is shown on your event."
              error={errors.tier_reason}
            >
              <textarea
                name="tier_reason"
                rows="3"
                maxLength="1000"
                placeholder="180 colleges, a ₹5,00,000 prize pool and four national sponsors — the reach is national."
                value={values.tier_reason}
                onChange={update("tier_reason")}
                required
              />
            </Field>
            <Field
              label="Expected participants"
              hint="How many people you expect to take part."
              error={errors.expected_participants}
            >
              <input
                name="expected_participants"
                type="number"
                min="1"
                step="1"
                placeholder="180"
                value={values.expected_participants}
                onChange={update("expected_participants")}
                required
              />
            </Field>
            <Field
              label="Prize pool (rupees)"
              hint="Total prize money — leave 0 if there is no cash prize."
              error={errors.prize_pool}
            >
              <input
                name="prize_pool"
                type="number"
                min="0"
                step="1"
                placeholder="50000"
                value={values.prize_pool}
                onChange={update("prize_pool")}
                required
              />
            </Field>
          </div>

          <div className="org-form-actions">
            <button className="button button-dark" type="submit" disabled={submitting}>
              {submitting ? "Publishing…" : "Publish hackathon"}
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