import { useEffect, useMemo, useState } from "react";
import EventCard from "../components/EventCard";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { hackathonCardData } from "../lib/format";
import { supabase } from "../lib/supabase";

const HACKATHON_FIELDS =
  "id, slug, title, organizer, description, category, location, prize, registration_deadline, starts_at, ends_at, status, approval_status, tier, venue_name, city, maps_url, capacity, price";

const TIER_SECTIONS = [
  { tier: 1, fallbackLabel: "Tier 1 (highest)" },
  { tier: 2, fallbackLabel: "Tier 2" },
  { tier: 3, fallbackLabel: "Tier 3" },
];

export default function Hackathons() {
  const [rows, setRows] = useState(null);
  const [tierSettings, setTierSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!supabase) {
      // Samples are not approved database rows, so do not show them on Discover.
      setRows([]);
      setTierSettings([]);
      setSourceLabel(" Supabase is not configured; live hackathons cannot be loaded.");
      setLoading(false);
      setFailed(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setFailed(false);
    Promise.all([
      supabase
        .from("hackathons")
        .select(HACKATHON_FIELDS)
        .eq("approval_status", "approved")
        .in("status", ["upcoming", "active"]),
      supabase
        .from("tier_settings")
        .select("tier, label, description")
        .order("tier", { ascending: true }),
    ])
      .then(([hackathonResult, tierResult]) => {
        if (!active) return;
        if (hackathonResult.error) throw hackathonResult.error;
        if (tierResult.error) throw tierResult.error;
        setTierSettings(tierResult.data || []);
        if (hackathonResult.data?.length) {
          setRows(hackathonResult.data);
          setSourceLabel("");
        } else {
          setRows([]);
          setSourceLabel("");
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load hackathons from Supabase.", error);
        setRows([]);
        setTierSettings([]);
        setSourceLabel(" Live events are unavailable.");
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const categories = useMemo(() => {
    if (!rows) return [];
    const unique = [...new Set(rows.map((event) => event.category).filter(Boolean))];
    return unique.sort((first, second) => first.localeCompare(second));
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLocaleLowerCase();
    const direction = sortDirection === "desc" ? -1 : 1;
    return rows
      .filter(
        (event) =>
          !selectedTheme ||
          (event.category || "").toLocaleLowerCase() === selectedTheme.toLocaleLowerCase(),
      )
      .filter((event) =>
        [event.title, event.organizer, event.description, event.category, event.location].some(
          (value) => String(value || "").toLocaleLowerCase().includes(query),
        ),
      )
      .sort((first, second) => {
        const firstDeadline = first.registration_deadline
          ? new Date(first.registration_deadline).getTime()
          : null;
        const secondDeadline = second.registration_deadline
          ? new Date(second.registration_deadline).getTime()
          : null;
        if (firstDeadline === null && secondDeadline === null) return 0;
        if (firstDeadline === null) return 1;
        if (secondDeadline === null) return -1;
        return direction * (firstDeadline - secondDeadline);
      });
  }, [rows, search, selectedTheme, sortDirection]);

  // Search, theme filtering and deadline ordering happen once above, so every
  // section uses exactly the same result set. tier is the admin-assigned column;
  // claimed_tier is deliberately neither selected nor consulted here.
  const grouped = useMemo(() => {
    const byTier = new Map(TIER_SECTIONS.map(({ tier }) => [tier, []]));
    const more = [];
    filtered.forEach((event) => {
      const tier = Number(event.tier);
      if (byTier.has(tier)) byTier.get(tier).push(event);
      else more.push(event);
    });
    return [
      ...TIER_SECTIONS.map((section) => ({
        ...section,
        settings: tierSettings.find((setting) => Number(setting.tier) === section.tier),
        events: byTier.get(section.tier),
      })),
      { tier: null, fallbackLabel: "More hackathons", settings: null, events: more },
    ];
  }, [filtered, tierSettings]);

  const statusText = loading
    ? "Loading hackathons…"
    : filtered.length
      ? `${filtered.length} ${filtered.length === 1 ? "hackathon" : "hackathons"} found.${sourceLabel}`
      : rows?.length
        ? `No hackathons match your search and filters. Try changing them.${sourceLabel}`
        : `No upcoming hackathons yet. Check back soon.${sourceLabel}`;

  return (
    <>
      <PageTitle title="Hackathons | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="FIND YOUR NEXT CHALLENGE"
          title="Good ideas start with showing up."
          description="Explore upcoming hackathons, meet people who care about the same things, and make something you didn't know you could."
        />
        <section className="hackathon-controls" aria-label="Search and filter hackathons">
          <label className="hackathon-search-label" htmlFor="hackathon-search">
            Search hackathons
          </label>
          <input
            id="hackathon-search"
            type="search"
            placeholder="Search events, organizers, locations…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={loading}
          />
          <div className="hackathon-filter-row">
            <div id="hackathon-themes" className="filter-list" aria-label="Filter by theme">
              {[["", "All themes"], ...categories.map((category) => [category, category])].map(
                ([value, label]) => (
                  <button
                    className={`${selectedTheme === value ? "filter-active" : "skill"} hackathon-theme`}
                    type="button"
                    data-theme={value}
                    aria-pressed={selectedTheme === value}
                    key={`${value}-${label}`}
                    onClick={() => setSelectedTheme(value)}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <label className="hackathon-sort-label" htmlFor="hackathon-sort">
              Deadline{" "}
              <select
                id="hackathon-sort"
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value)}
                disabled={loading}
              >
                <option value="asc">Soonest first</option>
                <option value="desc">Latest first</option>
              </select>
            </label>
          </div>
        </section>
        <p id="hackathon-status" className="hackathon-status" role="status" aria-live="polite">
          {statusText}
          {failed ? (
            <>
              {" "}
              <button
                className="text-link hackathon-retry"
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Try again
              </button>
            </>
          ) : null}
        </p>
        <div id="hackathon-results" aria-busy={loading}>
          {grouped.map((section) => {
            if (!section.events.length) return null;
            const heading = section.settings?.label || section.fallbackLabel;
            return (
              <section
                className="hackathon-tier-section"
                aria-labelledby={`hackathon-tier-${section.tier ?? "more"}`}
                key={section.tier ?? "more"}
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">HACKATHONS</p>
                    <h2 id={`hackathon-tier-${section.tier ?? "more"}`}>{heading}</h2>
                    {section.settings?.description ? (
                      <p className="muted section-description">{section.settings.description}</p>
                    ) : null}
                  </div>
                </div>
                <div className="event-grid">
                  {section.events.map((event) => (
                    <EventCard event={hackathonCardData(event)} key={event.id} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="dark-callout">
          <div>
            <p className="eyebrow light-eyebrow">NO EXPERIENCE NEEDED</p>
            <h2>Your first hackathon can start here.</h2>
          </div>
          <p>Bring your curiosity. We'll help you find the people and the project.</p>
        </div>
      </main>
    </>
  );
}
