import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import {
  ORGANIZATION_TYPES,
  ORG_EMAIL_HINT,
  createOrganization,
  validateOrganization,
} from "../lib/organizations";

const EMPTY_FORM = {
  org_type: "college_club",
  org_name: "",
  contact_email: "",
  phone: "",
  city: "",
  address: "",
  website: "",
  description: "",
  proof_url: "",
  coordinator_name: "",
  coordinator_email: "",
  signed_name: "",
  agreed: false,
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

export default function OrganizationRegister() {
  const { user } = useAuth();
  const { organization, loading, refresh } = useOrganization();
  const navigate = useNavigate();
  const notice = useLocation().state?.notice;
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);

  if (!loading && organization) {
    return <Navigate to="/organizer" replace />;
  }

  const update = (name) => (event) => {
    const { value, checked, type } = event.target;
    setValues((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const isCollegeClub = values.org_type === "college_club";

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = validateOrganization(values);
    setErrors(result.errors);
    if (!result.valid) {
      setMessage({ text: "Please fix the highlighted fields and try again.", error: true });
      return;
    }
    setSubmitting(true);
    setMessage({ text: "", error: false });
    try {
      await createOrganization(user.id, values);
      await refresh();
      navigate("/organizer");
    } catch (error) {
      setMessage({ text: error.message || "Your organization could not be saved.", error: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle title="Register your organization | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="ORGANIZER ACCOUNTS"
          title="Host offline hackathons people remember."
          description="Tell us who you are and where you organize. Every organization is reviewed by hand before its first event goes live."
        />
        {notice ? (
          <p className="form-message" role="status" aria-live="polite">
            {notice}
          </p>
        ) : null}
        <form className="org-form" onSubmit={handleSubmit} noValidate>
          <Field label="Who is organizing?" error={errors.org_type}>
            <select name="org_type" value={values.org_type} onChange={update("org_type")} required>
              {ORGANIZATION_TYPES.map((type) => (
                <option value={type.value} key={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Organization name" error={errors.org_name}>
            <input
              name="org_name"
              maxLength="160"
              placeholder="Campus Builders Club"
              value={values.org_name}
              onChange={update("org_name")}
              required
            />
          </Field>

          <Field label="Official email" hint={ORG_EMAIL_HINT} error={errors.contact_email}>
            <input
              name="contact_email"
              type="email"
              placeholder={isCollegeClub ? "club@college.edu" : "team@yourorganization.com"}
              value={values.contact_email}
              onChange={update("contact_email")}
              required
            />
          </Field>

          <Field label="Phone" hint="10 to 15 digits; +91 and spaces are fine." error={errors.phone}>
            <input
              name="phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={values.phone}
              onChange={update("phone")}
              required
            />
          </Field>

          <Field label="City" error={errors.city}>
            <input
              name="city"
              maxLength="100"
              placeholder="Pune"
              value={values.city}
              onChange={update("city")}
              required
            />
          </Field>

          <Field
            label="Address"
            hint="The address we can reach you at — this is not the event venue."
            error={errors.address}
          >
            <textarea
              name="address"
              rows="2"
              maxLength="300"
              placeholder="Block C, College Road, Pune 411001"
              value={values.address}
              onChange={update("address")}
              required
            />
          </Field>

          <Field label="Website (optional)" error={errors.website}>
            <input
              name="website"
              placeholder="https://campusbuilders.club"
              value={values.website}
              onChange={update("website")}
            />
          </Field>

          <Field
            label="What do you organize?"
            hint="A sentence or two about your events and the people who join them."
            error={errors.description}
          >
            <textarea
              name="description"
              rows="4"
              maxLength="2000"
              placeholder="We run monthly build nights and one 36-hour offline hackathon every year for students across the city."
              value={values.description}
              onChange={update("description")}
              required
            />
          </Field>

          <Field
            label="Proof of organization"
            hint="A link to an ID, registration certificate or club letter (Google Drive, Dropbox, your site)."
            error={errors.proof_url}
          >
            <input
              name="proof_url"
              placeholder="https://drive.google.com/…"
              value={values.proof_url}
              onChange={update("proof_url")}
              required
            />
          </Field>

          {isCollegeClub ? (
            <div className="org-form-section">
              <p className="eyebrow">FACULTY COORDINATOR</p>
              <p className="org-field-hint">
                College clubs need a faculty coordinator we can verify with the institution.
              </p>
              <Field label="Coordinator name" error={errors.coordinator_name}>
                <input
                  name="coordinator_name"
                  maxLength="120"
                  placeholder="Dr A. Rao"
                  value={values.coordinator_name}
                  onChange={update("coordinator_name")}
                  required
                />
              </Field>
              <Field
                label="Coordinator email"
                hint="Must be a college email — gmail.com, yahoo.com and outlook.com are not accepted."
                error={errors.coordinator_email}
              >
                <input
                  name="coordinator_email"
                  type="email"
                  placeholder="coordinator@college.edu"
                  value={values.coordinator_email}
                  onChange={update("coordinator_email")}
                  required
                />
              </Field>
            </div>
          ) : null}

          <div className="org-form-section">
            <p className="eyebrow">ORGANIZER TERMS</p>
            <div className="org-terms" tabIndex="0">
              <p>1. Everything I have entered in this form is true.</p>
              <p>2. I will hold the event at the venue and for the price I list.</p>
              <p>3. Hackmate may remove a listing after complaints.</p>
            </div>
            <label className="org-checkbox">
              <input
                name="agreed"
                type="checkbox"
                checked={values.agreed}
                onChange={update("agreed")}
              />
              <span>I have read and agree to the organizer terms above.</span>
            </label>
            {errors.agreed ? (
              <span className="org-field-error" role="alert">
                {errors.agreed}
              </span>
            ) : null}
            <Field
              label="Type your full name to sign"
              hint="Typing your name here works as your signature."
              error={errors.signed_name}
            >
              <input
                name="signed_name"
                maxLength="120"
                placeholder="Rao Kumar"
                value={values.signed_name}
                onChange={update("signed_name")}
                required
              />
            </Field>
          </div>

          <div className="org-form-actions">
            <button className="button button-dark" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
            <Link className="text-link" to="/organizer">
              Go to my dashboard
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
