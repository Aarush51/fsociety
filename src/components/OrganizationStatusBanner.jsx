import { ORGANIZATION_STATUS } from "../lib/organizations";

export default function OrganizationStatusBanner({ organization }) {
  const status = organization?.status || "pending";
  const copy = ORGANIZATION_STATUS[status] || ORGANIZATION_STATUS.pending;
  return (
    <section
      id="organization-status"
      className={`organization-status organization-status-${status}`}
      role="status"
      aria-live="polite"
    >
      <p className="eyebrow">ORGANIZATION STATUS · {status.toUpperCase()}</p>
      <h2>{copy.title}</h2>
      <p>{copy.message}</p>
      {status === "rejected" && organization?.review_note ? (
        <p className="organization-status-note">
          <strong>Review note:</strong> {organization.review_note}
        </p>
      ) : null}
    </section>
  );
}
