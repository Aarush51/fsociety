import { supabase } from "./supabase";

// Public results are read from one place: the get_published_results() RPC. It
// already returns only published sheets, so nothing here queries tables.
export const RESULTS_UNAVAILABLE =
  "Published results are not available right now. Please try again later.";

function resultsError(error, fallback) {
  if (!error) return new Error(fallback);
  if (error.code === "42883" || error.code === "PGRST202") {
    return new Error("Published results are not available in this environment yet.");
  }
  return new Error(error.message || fallback);
}

export async function loadPublishedResults() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("get_published_results");
  if (error) throw resultsError(error, RESULTS_UNAVAILABLE);
  return groupPublishedResults(data);
}

// Keys a hackathon group may use for its list of entries.
const GROUP_ENTRY_KEYS = [
  "results",
  "entries",
  "placements",
  "rankings",
  "winners",
  "teams",
  "mentions",
  "honourable_mentions",
  "honourableMentions",
];

function firstText(...values) {
  const value = values.find(
    (candidate) =>
      (typeof candidate === "string" && candidate.trim() !== "") ||
      typeof candidate === "number",
  );
  return value === undefined ? "" : String(value).trim();
}

function isTruthyFlag(value) {
  return value === true || value === 1 || /^(true|t|yes|1)$/i.test(String(value ?? ""));
}

function toEntry(raw) {
  if (!raw || typeof raw !== "object") return null;

  const place = Number(raw.place ?? raw.position ?? raw.rank ?? raw.placing);
  const hasPlace = Number.isInteger(place) && place > 0;
  const mention = isTruthyFlag(
    raw.honourable_mention ??
      raw.honourableMention ??
      raw.honorable_mention ??
      raw.honorableMention ??
      raw.is_honourable_mention ??
      raw.mention,
  );
  const teamName = firstText(
    raw.team_name,
    raw.teamName,
    raw.team_title,
    raw.team?.name,
    raw.teams?.name,
    raw.team,
    raw.name,
  );

  if (!teamName || (!hasPlace && !mention)) return null;

  return {
    key: `${hasPlace ? `place-${place}` : "mention"}-${teamName}`,
    teamName,
    place: hasPlace ? place : null,
    mention,
  };
}

function finalizeGroup(group) {
  const seen = new Set();
  const entries = group.entries.filter((entry) => {
    const key = entry.place
      ? `place-${entry.place}`
      : `mention-${entry.teamName.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const placed = entries
    .filter((entry) => entry.place)
    .sort((a, b) => a.place - b.place);

  return {
    key: group.key,
    id: group.id,
    slug: group.slug,
    title: group.title,
    podiums: placed.filter((entry) => entry.place <= 3),
    rest: placed.filter((entry) => entry.place > 3),
    mentions: entries
      .filter((entry) => entry.mention && !entry.place)
      .sort((a, b) => a.teamName.localeCompare(b.teamName)),
  };
}

// Accepts the shapes the RPC can reasonably return: an array of hackathon
// groups with a nested entry list, an array of flat rows that already carry the
// hackathon fields, an object wrapping either list, or an object keyed by
// hackathon. Every shape ends up as the same grouped view model.
export function groupPublishedResults(payload) {
  const groups = [];
  const byKey = new Map();

  const ensureGroup = (meta) => {
    const title =
      firstText(
        meta.hackathon_title,
        meta.hackathonTitle,
        meta.title,
        meta.hackathon?.title,
        meta.hackathons?.title,
      ) || "Hackathon";
    const id = firstText(
      meta.hackathon_id,
      meta.hackathonId,
      meta.id,
      meta.hackathon?.id,
      meta.hackathons?.id,
    );
    const slug = firstText(
      meta.hackathon_slug,
      meta.hackathonSlug,
      meta.slug,
      meta.hackathon?.slug,
      meta.hackathons?.slug,
    );
    const key = id || slug || title;

    if (!byKey.has(key)) {
      const group = { key, id, slug, title, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    return byKey.get(key);
  };

  const addRows = (group, rows) => {
    rows.forEach((row) => {
      const entry = toEntry(row);
      if (entry) group.entries.push(entry);
    });
  };

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.hackathons)
        ? payload.hackathons
        : null;

  if (items) {
    items.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const nestedKey = GROUP_ENTRY_KEYS.find((key) => Array.isArray(item[key]));

      if (!nestedKey) {
        addRows(ensureGroup(item), [item]);
        return;
      }
      addRows(ensureGroup(item), item[nestedKey]);
    });
  } else if (payload && typeof payload === "object") {
    Object.entries(payload).forEach(([key, value]) => {
      if (Array.isArray(value)) addRows(ensureGroup({ title: key }), value);
    });
  }

  return groups
    .map(finalizeGroup)
    .filter(
      (group) => group.podiums.length || group.rest.length || group.mentions.length,
    );
}
