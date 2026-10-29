import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Organization accounts (offline, in-person hackathons only)
// ---------------------------------------------------------------------------

export const ORGANIZATION_TYPES = [
  { value: "college_club", label: "College club" },
  { value: "company", label: "Company" },
  { value: "community", label: "Community or meetup" },
];

// Labels exist for every type a form can no longer offer, so rows that were
// saved before "Individual organizer" was retired still read properly.
export const ORGANIZATION_TYPE_LABELS = {
  college_club: "College club",
  company: "Company",
  community: "Community or meetup",
  individual: "Individual organizer",
};

export function organizationTypeLabel(value) {
  return ORGANIZATION_TYPE_LABELS[value] || value || "Organization";
}

// Copy for the status banner on the dashboard and the host page.
export const ORGANIZATION_STATUS = {
  pending: {
    title: "Your organization is under review",
    message: "You can host as soon as it is approved.",
  },
  approved: {
    title: "Your organization is approved",
    message: "You can host hackathons.",
  },
  rejected: {
    title: "Your organization was not approved",
    message: "Read the review note below, then contact the HackMate team to ask for another review.",
  },
};

// ---------------------------------------------------------------------------
// Organization emails: company or education addresses only
// ---------------------------------------------------------------------------
// Every free mailbox provider we reject, in one place. A domain that is not on
// this list — a company, or an institution such as .edu, .edu.xx or .ac.xx — is
// accepted.

export const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.in",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "zoho.com",
  "rediffmail.com",
  "mail.com",
  "yandex.com",
  "tutanota.com",
];

// The one sentence shown whenever an organization email is blocked.
export const ORG_EMAIL_MESSAGE = "Organizations need a company or college email.";

// Hint under the official email field, for every organization type.
export const ORG_EMAIL_HINT =
  "Use a company or college address — gmail.com, yahoo.com, outlook.com and other free providers are not accepted.";

export function isFreeEmailDomain(email) {
  return FREE_EMAIL_DOMAINS.includes(emailDomain(email));
}

export const ORGANIZATION_FIELDS =
  "id, owner_id, org_name, org_type, contact_email, phone, city, address, website, description, proof_url, coordinator_name, coordinator_email, signed_name, agreed_at, status, review_note, created_at";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function emailDomain(email) {
  const parts = String(email || "").trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

// A company or college address: well formed, and not a free mailbox provider.
export function isAllowedOrgEmail(email) {
  return EMAIL_PATTERN.test(String(email || "").trim()) && !isFreeEmailDomain(email);
}

export function isHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Accepts "example.com" and stores it as "https://example.com".
export function withHttps(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function validateOrganization(values) {
  const errors = {};
  const orgName = values.org_name.trim();
  const contactEmail = values.contact_email.trim();
  const city = values.city.trim();
  const address = values.address.trim();
  const description = values.description.trim();
  const proofUrl = values.proof_url.trim();
  const signedName = values.signed_name.trim();

  if (!ORGANIZATION_TYPES.some((type) => type.value === values.org_type)) {
    errors.org_type = "Choose who is organizing.";
  }
  if (orgName.length < 2) errors.org_name = "Add the organization name.";
  else if (orgName.length > 160) errors.org_name = "Keep the name under 160 characters.";

  // The official email has to be a company or college address for every type.
  if (!EMAIL_PATTERN.test(contactEmail)) errors.contact_email = "Add a valid official email address.";
  else if (!isAllowedOrgEmail(contactEmail)) errors.contact_email = ORG_EMAIL_MESSAGE;

  if (!values.phone.trim()) errors.phone = "Add a phone number.";
  else if (!isPhoneNumber(values.phone)) errors.phone = "Add a phone number with 10 to 15 digits.";

  if (city.length < 2) errors.city = "Add the city where you organize events.";
  if (address.length < 4) errors.address = "Add the full address of the organization.";
  if (description.length < 20) {
    errors.description = "Tell us what you organize in at least 20 characters.";
  }
  if (!proofUrl) errors.proof_url = "Add a link to your proof of organization.";
  else if (!isHttpUrl(proofUrl)) {
    errors.proof_url = "Paste a link that starts with http:// or https://.";
  }
  if (values.website.trim() && !isHttpUrl(withHttps(values.website))) {
    errors.website = "Paste a link that starts with http:// or https://.";
  }
  if (signedName.length < 2) {
    errors.signed_name = "Type your full name to sign the organizer terms.";
  }
  if (!values.agreed) {
    errors.agreed = "Tick the box to accept the organizer terms.";
  }

  // College clubs also need a faculty coordinator on an institutional email.
  const coordinatorName = values.coordinator_name.trim();
  const coordinatorEmail = values.coordinator_email.trim();
  if (values.org_type === "college_club") {
    if (coordinatorName.length < 2) {
      errors.coordinator_name = "Add the faculty coordinator's name.";
    }
    if (!EMAIL_PATTERN.test(coordinatorEmail)) {
      errors.coordinator_email = "Add the faculty coordinator's email address.";
    } else if (isFreeEmailDomain(coordinatorEmail)) {
      errors.coordinator_email =
        "Use the coordinator's college email address — free providers such as gmail.com and yahoo.com are not accepted.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export async function fetchMyOrganization(ownerId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!ownerId) return null;
  const { data, error } = await supabase
    .from("organizations")
    .select(ORGANIZATION_FIELDS)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function createOrganization(ownerId, values) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const isCollegeClub = values.org_type === "college_club";
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      owner_id: ownerId,
      org_name: values.org_name.trim(),
      org_type: values.org_type,
      contact_email: values.contact_email.trim(),
      phone: values.phone.trim(),
      city: values.city.trim(),
      address: values.address.trim(),
      website: values.website.trim() ? withHttps(values.website) : null,
      description: values.description.trim(),
      proof_url: withHttps(values.proof_url),
      coordinator_name: isCollegeClub ? values.coordinator_name.trim() : null,
      coordinator_email: isCollegeClub ? values.coordinator_email.trim() : null,
      signed_name: values.signed_name.trim(),
      status: "pending",
    })
    .select(ORGANIZATION_FIELDS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("This account already has an organization.");
    }
    if (error.code === "42501") {
      throw new Error(
        "Your organization could not be saved. Make sure the organizer SQL migration has been run in Supabase.",
      );
    }
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Organizer hackathons
// ---------------------------------------------------------------------------

export const ORGANIZER_HACKATHON_FIELDS =
  "id, slug, title, venue_name, city, address, maps_url, capacity, price, starts_at, ends_at, status, approval_status, tier, claimed_tier, review_note";

// A hackathon is current until its end date passes.
export function isCurrentEvent(event, now = Date.now()) {
  if (!event?.ends_at) return true;
  const endsAt = new Date(event.ends_at).getTime();
  return Number.isNaN(endsAt) ? true : endsAt >= now;
}

export function summarizeOrganizerEvents(events = []) {
  const current = [];
  const past = [];
  events.forEach((event) => (isCurrentEvent(event) ? current.push(event) : past.push(event)));
  return {
    current,
    past,
    registeredTotal: events.reduce((total, event) => total + (Number(event.registered_count) || 0), 0),
  };
}

// Loads the organizer's hackathons plus how many people registered for each one.
export async function loadOrganizerEvents(organizationId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: hackathons, error } = await supabase
    .from("hackathons")
    .select(ORGANIZER_HACKATHON_FIELDS)
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: false });
  if (error) throw error;

  const events = (hackathons || []).map((event) => ({ ...event, registered_count: 0 }));
  if (!events.length) return events;

  const { data: registrations, error: registrationError } = await supabase
    .from("registrations")
    .select("hackathon_id")
    .in(
      "hackathon_id",
      events.map((event) => event.id),
    );
  if (registrationError) {
    // A missing organizer read policy silently returns zero rows, and a closed
    // grant returns an error. Never widen the policy from the client: say what
    // is wrong so the policy can be applied in Supabase instead.
    const blocked = ["42501", "401", "403"].includes(registrationError.code);
    if (blocked) {
      throw new Error(
        "The registered counts could not be read: row level security blocked public.registrations. Apply the organizer read policy from the organizer migration in Supabase. No policy was loosened here.",
      );
    }
    throw registrationError;
  }

  const counts = new Map();
  (registrations || []).forEach((row) => {
    counts.set(row.hackathon_id, (counts.get(row.hackathon_id) || 0) + 1);
  });
  return events.map((event) => ({ ...event, registered_count: counts.get(event.id) || 0 }));
}

export function slugFromTitle(title) {
  const base = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "hackathon"}-${suffix}`;
}

export function parseThemeTags(value) {
  return [...new Set(String(value || "").split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 6)
    .map((tag) => tag.slice(0, 40));
}

export function validateHackathon(values) {
  const errors = {};
  if (!values.title.trim()) errors.title = "Give your hackathon a title.";
  else if (values.title.trim().length > 160) errors.title = "Keep the title under 160 characters.";

  if (!values.description.trim()) errors.description = "Describe what people will build.";
  if (!values.venue_name.trim()) errors.venue_name = "Add the venue name.";
  if (!values.city.trim()) errors.city = "Add the city.";
  // The full address moved into "More details (optional)": the column is
  // nullable, so it is no longer required to publish.

  if (values.maps_url.trim() && !isHttpUrl(withHttps(values.maps_url))) {
    errors.maps_url = "Paste a Google Maps link that starts with http:// or https://.";
  }
  if (values.banner_url.trim() && !isHttpUrl(withHttps(values.banner_url))) {
    errors.banner_url = "Paste an image link that starts with http:// or https://.";
  }

  const capacity = Number(values.capacity);
  if (!values.capacity.trim() || !Number.isInteger(capacity) || capacity < 1) {
    errors.capacity = "Enter how many people the venue can hold (a whole number).";
  }

  const teamSizeMax = Number(values.team_size_max);
  if (!Number.isInteger(teamSizeMax) || teamSizeMax < 2 || teamSizeMax > 6) {
    errors.team_size_max = "Choose a maximum team size from 2 to 6.";
  }

  const price = values.price.trim() === "" ? 0 : Number(values.price);
  if (Number.isNaN(price) || price < 0) {
    errors.price = "Enter the entry fee in rupees, or 0 for a free event.";
  }

  const startsAt = values.starts_at ? new Date(values.starts_at) : null;
  const endsAt = values.ends_at ? new Date(values.ends_at) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) errors.starts_at = "Pick the start date and time.";
  if (!endsAt || Number.isNaN(endsAt.getTime())) errors.ends_at = "Pick the end date and time.";
  else if (startsAt && !Number.isNaN(startsAt.getTime()) && endsAt <= startsAt) {
    errors.ends_at = "The end time has to be after the start time.";
  }

  // Tier claim: the reviewer needs a tier and a reason, and the reason is capped
  // at what the hackathons.claimed_tier_reason check constraint allows.
  if (!["1", "2", "3"].includes(String(values.claimed_tier || ""))) {
    errors.claimed_tier = "Pick the tier that fits your hackathon.";
  }
  const tierReason = String(values.claimed_tier_reason || "").trim();
  if (!tierReason) {
    errors.claimed_tier_reason = "Tell the reviewer why you picked this tier.";
  } else if (tierReason.length > 600) {
    errors.claimed_tier_reason = "Keep the reason under 600 characters.";
  }

  // Expected participants and prize pool are optional; only validate a value
  // that was actually typed.
  if (String(values.expected_participants || "").trim()) {
    const expected = Number(values.expected_participants);
    if (!Number.isInteger(expected) || expected < 1) {
      errors.expected_participants = "Enter a whole number of people, or leave it blank.";
    }
  }
  if (String(values.prize_pool || "").trim()) {
    const pool = Number(values.prize_pool);
    if (Number.isNaN(pool) || pool < 0) {
      errors.prize_pool = "Enter the prize pool in rupees, or leave it blank for none.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export async function createHackathon({ organization, user, values }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const themes = parseThemeTags(values.theme_tags);
  const venue = values.venue_name.trim();
  const city = values.city.trim();
  const prizeDetails = values.prize_details.trim();
  const teamSizeMax = Math.min(Math.max(Number(values.team_size_max) || 4, 2), 6);
  const price = values.price.trim() === "" ? 0 : Number(values.price);
  const prizePool = String(values.prize_pool || "").trim() === "" ? 0 : Number(values.prize_pool);
  const expectedParticipants = String(values.expected_participants || "").trim()
    ? Number(values.expected_participants)
    : null;
  const payload = {
      slug: slugFromTitle(values.title),
      title: values.title.trim(),
      description: values.description.trim(),
      category: themes[0] || "Hackathon",
      organizer: organization.org_name,
      location: `${venue}, ${city}`,
      // The public card shows a short prize pool; the full text lives in prize_details.
      prize:
        prizeDetails.slice(0, 190) ||
        (prizePool > 0 ? `\u20b9${prizePool.toLocaleString("en-IN")} prize pool` : null),
      registration_deadline: new Date(values.starts_at).toISOString(),
      starts_at: new Date(values.starts_at).toISOString(),
      ends_at: new Date(values.ends_at).toISOString(),
      status: "upcoming",
      created_by: user.id,
      organization_id: organization.id,
      venue_name: venue,
      address: values.address.trim(),
      city,
      maps_url: values.maps_url.trim() ? withHttps(values.maps_url) : null,
      capacity: Number(values.capacity),
      team_size_max: teamSizeMax,
      price,
      banner_url: values.banner_url.trim() ? withHttps(values.banner_url) : null,
      theme_tags: themes,
      rules: values.rules.trim() || null,
      prize_details: prizeDetails || null,
      // The organizer's claim. approval_status, tier and the review fields are
      // deliberately not sent: the database trigger owns them, and it forces a
      // non-admin insert to 'pending' with no tier.
      claimed_tier: Number(values.claimed_tier),
      claimed_tier_reason: values.claimed_tier_reason.trim(),
      expected_participants: expectedParticipants,
      prize_pool: prizePool,
  };

  // One insert, no silent retry. If a column from the tier migration is missing,
  // the real Postgres error reaches the screen instead of a second attempt
  // hiding it.
  const { data, error } = await supabase
    .from("hackathons")
    .insert(payload)
    .select("id, slug")
    .single();

  if (error) {
    // Always keep what Postgres actually said on screen. A friendly sentence may
    // come first, but the raw message, detail, hint and code stay, so a missing
    // column or a policy failure is obvious instead of a generic "try again".
    const detail = [error.message, error.details, error.hint].filter(Boolean).join(" ");
    const suffix = ` Database said: ${detail || "no further detail"}${
      error.code ? ` (code ${error.code})` : ""
    }`;

    if (error.code === "42501") {
      throw new Error(
        `Only approved organizations can host a hackathon. Check your organization status on the dashboard.${suffix}`,
      );
    }
    if (error.code === "23505") {
      throw new Error(`A hackathon with a very similar title already exists. Try another title.${suffix}`);
    }
    if (error.code === "23514") {
      throw new Error(
        `One of the details was rejected. Check the dates, capacity and links, then try again.${suffix}`,
      );
    }
    if (error.code === "23502") {
      throw new Error(`A required field was missing.${suffix}`);
    }
    if (error.code === "42703") {
      throw new Error(
        `This form needs a database column that does not exist yet. Apply the latest Supabase migration, then try again.${suffix}`,
      );
    }
    throw new Error(detail || "Your hackathon could not be saved.");
  }
  return data;
}
