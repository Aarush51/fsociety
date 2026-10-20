export function formatEventDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, options).format(date);
}

export function initialsFromName(name, fallback = "HM") {
  const parts = String(name || fallback)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .filter(Boolean);
  const initials = parts.map((part) => part[0]).join("").toUpperCase();
  return initials || fallback;
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

export function formatReputation(value) {
  const reputation = Number(value) || 0;
  return reputation ? `${reputation.toFixed(1)} / 5` : "New";
}

// Turns a `hackathons` row into the shape consumed by <EventCard>.
export function hackathonCardData(hackathon) {
  const category = hackathon.category || "Hackathon";
  const categoryLower = category.toLowerCase();
  const accent = categoryLower.includes("climate")
    ? "blue"
    : categoryLower.includes("design") || categoryLower.includes("creative")
      ? "peach"
      : "lime";
  const start = formatEventDate(hackathon.starts_at, { month: "short", day: "numeric" });
  const end = formatEventDate(hackathon.ends_at, { month: "short", day: "numeric" });
  const deadline = formatEventDate(hackathon.registration_deadline);
  return {
    id: hackathon.slug,
    category: category.toUpperCase(),
    title: hackathon.title,
    organizer: hackathon.organizer || "Community organizer",
    date: start && end ? `${start} – ${end}` : start || end || "Dates to be announced",
    location: hackathon.location || "Location to be announced",
    prize: hackathon.prize || "To be announced",
    deadline,
    accent,
    icon: accent === "blue" ? "↗" : accent === "peach" ? "⌘" : "✳",
    tag: hackathon.status === "active" ? "IN PROGRESS" : "UPCOMING",
  };
}

// Only same-origin dashboard/profile/teams destinations survive the redirect.
export function safeRedirectTarget(target) {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return null;
  let destination;
  try {
    destination = new URL(target, window.location.origin);
  } catch {
    return null;
  }
  if (destination.origin !== window.location.origin) return null;
  const targetParts = destination.pathname.split("/").filter(Boolean);
  return targetParts.some((part) => ["dashboard", "profile", "teams"].includes(part))
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : null;
}
