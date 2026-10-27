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

// "Rahul Kumar Singh" → "Rahul S." for compact friend-code lookups.
export function shortName(value, fallback = "A HackMate member") {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
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
  const venue = hackathon.venue_name || "";
  const city = hackathon.city || "";
  return {
    id: hackathon.slug,
    category: category.toUpperCase(),
    title: hackathon.title,
    organizer: hackathon.organizer || "Community organizer",
    date: start && end ? `${start} – ${end}` : start || end || "Dates to be announced",
    venue,
    city,
    mapsUrl: hackathon.maps_url || "",
    // Sample/demo hackathons have no price column, so they show no price at all.
    price: formatPrice(hackathon.price),
    location:
      [venue, city].filter(Boolean).join(", ") ||
      hackathon.location ||
      "Location to be announced",
    prize: hackathon.prize || "To be announced",
    deadline,
    accent,
    icon: accent === "blue" ? "↗" : accent === "peach" ? "⌘" : "✳",
    tag: hackathon.status === "active" ? "IN PROGRESS" : "UPCOMING",
  };
}

// Rupee amount for a hackathon entry fee; 0 (or missing) means the event is free.
export function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  if (!amount) return "Free";
  return `₹${new Intl.NumberFormat("en-IN").format(amount)}`;
}

// Only same-origin dashboard/profile/teams/ideas/organizer destinations survive the redirect.
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
  return targetParts.some((part) =>
    ["dashboard", "profile", "teams", "ideas", "organizer", "organization", "hackathons"].includes(
      part,
    ),
  )
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : null;
}
