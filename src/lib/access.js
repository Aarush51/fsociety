// Role-facing decisions shared by the header, the login page and the guards.
// Kept pure so the participant / organizer / admin matrix can be checked without
// signing an account in.

// Where a login lands before any ?redirect= override applies.
export function landingPath({ mode, hasOrganization }) {
  if (mode === "organization") {
    return hasOrganization ? "/organizer" : "/organization/register";
  }
  return "/";
}

// The links a visitor can actually use. Organizer links only appear when the
// account owns an organization; Admin is added on top of either set.
export function headerLinks({ signedIn, mode, hasOrganization, isAdmin }) {
  let links;

  if (!signedIn) {
    links = [
      { label: "Hackathons", to: "/hackathons" },
      { label: "Idea generator", to: "/ideas" },
      { label: "Leaderboard", to: "/leaderboard" },
    ];
  } else if (mode === "organization" && hasOrganization) {
    links = [
      { label: "Hackathons", to: "/hackathons" },
      { label: "Idea generator", to: "/ideas" },
      { label: "Leaderboard", to: "/leaderboard" },
    ];
  } else {
    links = [
      { label: "Hackathons", to: "/hackathons" },
      { label: "Idea generator", to: "/ideas" },
      { label: "Leaderboard", to: "/leaderboard" },
      { label: "My teams", to: "/teams" },
      { label: "Dashboard", to: "/dashboard" },
      { label: "The Huddle", to: "/huddle" },
    ];
  }

  return isAdmin ? [...links, { label: "Admin", to: "/admin" }] : links;
}

// Participant-only pages send organizers who did not sign in as participants —
// and who have no skills, interests or hobbies on their profile — to their own
// dashboard. Anyone with participant profile data keeps the page.
export function shouldLeaveParticipantPage({ isOrganizer, mode, hasParticipantProfileData }) {
  return Boolean(isOrganizer) && mode !== "participant" && hasParticipantProfileData === false;
}
