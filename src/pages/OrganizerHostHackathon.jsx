import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import { createHackathon, validateHackathon } from "../lib/organizations";

const EMPTY_FORM = {
  title: "",
  description: "",
  banner_url: "",
  theme_tags: "",
  venue_name: "",
  address: "",
  city: "",
  maps_url: "",
  capacity: "",
  price: "0",
  starts_at: "",
  ends_at: "",
  rules: "",
  prize_details: "",
};

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
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY_FORM);
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
    return <Navigate to="/organization/register" replace />;
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
      navigate("/organizer");
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
            <p className="eyebrow">WHAT PARTICIPANTS SHOULD KNOW</p>
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
