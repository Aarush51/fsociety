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

// Country domains slip past a plain list: yahoo.co.in, hotmail.co.uk, live.in.
// These patterns catch a free provider followed by a ccTLD (and an optional
// second level), so "live.acme.com" still counts as a company address.
const FREE_EMAIL_PATTERNS = [
  /^(yahoo|ymail|rocketmail)\.[a-z]{2,3}(\.[a-z]{2,3})?$/,
  /^(hotmail|outlook|live|msn)\.[a-z]{2,3}(\.[a-z]{2,3})?$/,
  /^(gmail|googlemail)\.[a-z]{2,3}(\.[a-z]{2,3})?$/,
  /^(proton|protonmail|pm)\.[a-z]{2,3}(\.[a-z]{2,3})?$/,
  /^(rediff|zoho|gmx|web)\.[a-z]{2,3}(\.[a-z]{2,3})?$/,
];

// "mail.yahoo.co.in" and "www.gmail.com" are the same provider as the bare domain.
function baseDomain(domain) {
  return domain.replace(/^(www|mail|m|email|smtp)\./, "");
}

export function isFreeEmailDomain(email) {
  const domain = baseDomain(emailDomain(email));
  if (!domain) return false;
  if (FREE_EMAIL_DOMAINS.includes(domain)) return true;
  return FREE_EMAIL_PATTERNS.some((pattern) => pattern.test(domain));
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
// Hackathon tiers
// ---------------------------------------------------------------------------
// An organizer only ever CLAIMS a tier; approved_tier is written by an admin
// (enforced in SQL by public.protect_hackathon_tier) and is the only tier the
// app displays to anyone else.

export const HACKATHON_TIERS = [
  {
    value: 1,
    label: "Tier 1",
    example: "National or global flagship event with large prizes and sponsors.",
  },
  {
    value: 2,
    label: "Tier 2",
    example: "City or university-level event with a solid prize pool.",
  },
  {
    value: 3,
    label: "Tier 3",
    example: "Small local, club or community event.",
  },
];

// "Tier 2" for 2, and "" when nothing (or an unexpected value) is stored.
export function tierLabel(value) {
  const tier = HACKATHON_TIERS.find((item) => item.value === Number(value));
  return tier ? tier.label : "";
}

// The Discover page shows one section per approved tier, then everything else.
export const DISCOVER_SECTIONS = [
  { key: "tier-1", tier: 1, eyebrow: "FLAGSHIP", title: "Tier 1", description: "National or global flagship events." },
  { key: "tier-2", tier: 2, eyebrow: "REGIONAL", title: "Tier 2", description: "City and university-level events." },
  { key: "tier-3", tier: 3, eyebrow: "COMMUNITY", title: "Tier 3", description: "Local, club and community events." },
  { key: "more", tier: null, eyebrow: "DISCOVER", title: "More hackathons", description: "Events without an approved tier yet." },
];

// Groups events by the tier an admin approved. Only approved_tier counts: an
// unapproved claim still lands in "More hackathons", and so does anything with
// an unexpected value. Order is Tier 1 → Tier 3 → More.
export function groupHackathonsByTier(events = []) {
  const buckets = DISCOVER_SECTIONS.map((section) => ({ ...section, events: [] }));
  (events || []).forEach((event) => {
    const approved = Number(event?.approved_tier);
    const index = [1, 2, 3].includes(approved) ? approved - 1 : buckets.length - 1;
    buckets[index].events.push(event);
  });
  return buckets;
}

// ---------------------------------------------------------------------------
// Organizer hackathons
// ---------------------------------------------------------------------------

export const ORGANIZER_HACKATHON_FIELDS =
  "id, slug, title, venue_name, city, address, maps_url, capacity, price, starts_at, ends_at, status";

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
  if (!values.address.trim()) errors.address = "Add the full address so people can find the venue.";
  if (!values.city.trim()) errors.city = "Add the city.";

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

  // Tier claim. The approved tier is never set from the browser.
  const claimedTier = Number(values.claimed_tier);
  if (!HACKATHON_TIERS.some((tier) => tier.value === claimedTier)) {
    errors.claimed_tier = "Choose the tier your hackathon belongs to.";
  }

  const tierReason = String(values.tier_reason ?? "").trim();
  if (tierReason.length < 20) {
    errors.tier_reason = "Explain in at least 20 characters why this tier fits your hackathon.";
  } else if (tierReason.length > 1000) {
    errors.tier_reason = "Keep the reason under 1000 characters.";
  }

  const expectedParticipants = Number(values.expected_participants);
  if (
    !String(values.expected_participants ?? "").trim() ||
    !Number.isInteger(expectedParticipants) ||
    expectedParticipants < 1
  ) {
    errors.expected_participants = "Enter how many participants you expect (a whole number).";
  } else if (expectedParticipants > 100000) {
    errors.expected_participants = "Enter a number of expected participants below 100000.";
  }

  const prizePool = values.prize_pool === "" ? 0 : Number(values.prize_pool);
  if (Number.isNaN(prizePool) || prizePool < 0) {
    errors.prize_pool = "Enter the prize pool in rupees, or 0 for no cash prize.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export async function createHackathon({ organization, user, values }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const themes = parseThemeTags(values.theme_tags);
  const venue = values.venue_name.trim();
  const city = values.city.trim();
  const teamSizeMax = Math.min(Math.max(Number(values.team_size_max) || 4, 2), 6);
  const price = values.price.trim() === "" ? 0 : Number(values.price);
  const prizePool = values.prize_pool === "" ? 0 : Number(values.prize_pool);
  const payload = {
      slug: slugFromTitle(values.title),
      title: values.title.trim(),
      description: values.description.trim(),
      category: themes[0] || "Hackathon",
      organizer: organization.org_name,
      location: `${venue}, ${city}`,
      // The public card shows a short prize pool; the number lives in prize_pool.
      prize: prizePool > 0 ? `₹${new Intl.NumberFormat("en-IN").format(prizePool)}` : "No cash prize",
      registration_deadline: new Date(values.starts_at).toISOString(),
      starts_at: new Date(values.starts_at).toISOString(),
      ends_at: new Date(values.ends_at).toISOString(),
      status: "upcoming",
      approval_status: "approved",
      created_by: user.id,
      organization_id: organization.id,
      venue_name: venue,
      address: values.address.trim(),
      city,
      capacity: Number(values.capacity),
      team_size_max: teamSizeMax,
      price,
      theme_tags: themes,
      // The organizer's claim only. approved_tier is intentionally absent: the
      // database forces it to null on insert and only an admin can change it.
      claimed_tier: Number(values.claimed_tier),
      tier_reason: values.tier_reason.trim(),
      expected_participants: Number(values.expected_participants),
      prize_pool: prizePool,
  };

  // team_size_max arrives with the team formation migration. If this project
  // has not applied it yet, retry without the column so hosting still works;
  // the column defaults to 4 once the migration runs.
  let result = await supabase.from("hackathons").insert(payload).select("id, slug").single();
  if (result.error && result.error.code === "42703" && /team_size_max/.test(result.error.message || "")) {
    const { team_size_max: _missingColumn, ...legacyPayload } = payload;
    result = await supabase.from("hackathons").insert(legacyPayload).select("id, slug").single();
  }

  const { data, error } = result;
  if (error) {
        if (error.code === "42501") {
          throw new Error(
            "Only approved organizations can host a hackathon. Check your organization status on the dashboard.",
          );
        }
        if (error.code === "23505") {
          throw new Error("A hackathon with a very similar title already exists. Try another title.");
        }
        if (error.code === "23514") {
          throw new Error(
            `One of the details was rejected: ${error.message}. Check the dates, capacity and links, then try again.`,
          );
        }
        if (error.code === "23502") {
          throw new Error(`A required field was missing: ${error.message}.`);
        }
        if (
          error.code === "42703" &&
          /claimed_tier|tier_reason|expected_participants|prize_pool|team_size_max/.test(
            error.message || "",
          )
        ) {
          throw new Error(
            "The hackathon tier migration has not been applied in Supabase yet, so the tier details could not be saved. Ask an admin to run supabase/migrations/20261029120000_add_hackathon_tiers.sql, then try again.",
          );
        }
        throw new Error(error.message || "Your hackathon could not be saved. Please try again.");
  }
  return data;
}
