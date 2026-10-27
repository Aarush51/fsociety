import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import { shouldLeaveParticipantPage } from "../lib/access";
import { fetchHasParticipantProfileData } from "../lib/profiles";

function CheckingAccess() {
  return (
    <main className="page-main wrap">
      <p className="hackathon-status" role="status" aria-live="polite">
        Checking your access…
      </p>
    </main>
  );
}

// Participant-only pages. An organizer who is signed in on the Organization side
// and has no participant profile data is sent to their dashboard; organizers who
// do have skills, interests or hobbies keep the participant pages.
export default function ParticipantRoute({ children }) {
  const { user, mode } = useAuth();
  const { isOrganizer, loading: organizationLoading } = useOrganization();
  const [hasProfileData, setHasProfileData] = useState(null);
  const mustCheck = Boolean(user) && isOrganizer && mode !== "participant";

  useEffect(() => {
    if (!mustCheck) {
      setHasProfileData(null);
      return undefined;
    }
    let active = true;
    setHasProfileData(null);
    fetchHasParticipantProfileData()
      .then((value) => {
        if (active) setHasProfileData(value);
      })
      .catch((error) => {
        console.error("Could not check your participant profile.", error);
        // An outage should not lock an organizer out of participant pages they
        // may legitimately have data for.
        if (active) setHasProfileData(true);
      });
    return () => {
      active = false;
    };
  }, [mustCheck, user]);

  if (organizationLoading) return <CheckingAccess />;
  if (!mustCheck) return children;
  if (shouldLeaveParticipantPage({ isOrganizer, mode, hasParticipantProfileData: hasProfileData })) {
    return <Navigate to="/organizer" replace />;
  }
  if (hasProfileData === null) return <CheckingAccess />;
  return children;
}
