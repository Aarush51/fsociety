import { useEffect, useMemo, useState } from "react";
import EventCard from "../components/EventCard";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { demoHackathons } from "../lib/demoData";
import { hackathonCardData } from "../lib/format";
import { supabase } from "../lib/supabase";

const HACKATHON_FIELDS =
  "id, slug, title, organizer, description, category, location, prize, registration_deadline, starts_at, ends_at, status, venue_name, city, maps_url, capacity, price";

export default function Hackathons() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setRows(demoHackathons);
      setSourceLabel(" Showing sample hackathons. Configure Supabase to load live events.");
      setLoading(false);
      setFailed(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setFailed(false);
    supabase
      .from("hackathons")
      .select(HACKATHON_FIELDS)
      .in("status", ["upcoming", "active"])
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (data?.length) {
          setRows(data);
          setSourceLabel("");
        } else {
          setRows(demoHackathons);
          setSourceLabel(" No live events yet; showing sample hackathons.");
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load hackathons from Supabase.", error);
        setRows(demoHackathons);
        setSourceLabel(" Live events are unavailable; showing sample hackathons.");
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
        <div id="hackathon-results" className="event-grid" aria-busy={loading}>
          {filtered.map((event) => (
            <EventCard event={hackathonCardData(event)} key={event.id} />
          ))}
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
