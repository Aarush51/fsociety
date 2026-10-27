import { Navigate } from "react-router-dom";
import { useOrganization } from "../context/OrganizationContext";

// Organizer-only pages. ProtectedRoute already handles the session; this adds
// the organization requirement and sends everyone else home.
export default function OrganizerRoute({ children }) {
  const { organization, loading, error } = useOrganization();

  if (loading) {
    return (
      <main className="page-main wrap">
        <p className="hackathon-status" role="status" aria-live="polite">
          Checking your organization…
        </p>
      </main>
    );
  }

  // A failed lookup is reported by the page itself, so only a confirmed missing
  // organization redirects — an outage cannot bounce an organizer mid-session.
  if (!organization && !error) return <Navigate to="/" replace />;

  return children;
}
