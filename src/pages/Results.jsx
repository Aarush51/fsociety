import { useEffect, useState } from "react";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { supabase } from "../lib/supabase";

const ORDINAL_SUFFIX = { 1: "st", 2: "nd", 3: "rd" };

function ordinalSuffix(place) {
  const remainder = place % 100;
  if (remainder >= 11 && remainder <= 13) return "th";
  return ORDINAL_SUFFIX[place % 10] || "th";
}

export function placeLabel(place) {
  return place ? `${place}${ordinalSuffix(place)} place` : "Honourable mention";
}

function parsePublishedResults(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!Array.isArray(parsed)) {
    throw new Error("Published results returned an unexpected response.");
  }

  return parsed.map((hackathon, hackathonIndex) => {
    const entries = (Array.isArray(hackathon?.results) ? hackathon.results : [])
      .map((row, rowIndex) => {
        const teamName = String(row?.team_name || row?.participant_name || "").trim();
        const place = Number(row?.place);
        const hasPlace = Number.isInteger(place) && place > 0;
        const mention = row?.honourable_mention === true;
        if (!teamName || (!hasPlace && !mention)) return null;
        return {
          key: `${hackathon.hackathon_id || hackathonIndex}-${rowIndex}`,
          teamName,
          place: hasPlace ? place : null,
          mention,
        };
      })
      .filter(Boolean);
    const placed = entries.filter((entry) => entry.place && !entry.mention);
    return {
      key: hackathon.hackathon_id || hackathon.slug || hackathonIndex,
      title: hackathon.title || "Hackathon",
      podiums: placed.filter((entry) => entry.place <= 3),
      rest: placed.filter((entry) => entry.place > 3),
      mentions: entries.filter((entry) => entry.mention),
    };
  });
}

export function PublishedResults({ groups = [] }) {
  return groups.map((group) => (
    <section
      className="dashboard-data-section results-hackathon"
      key={group.key}
      aria-label={`Results for ${group.title}`}
    >
      <div className="section-heading dashboard-heading results-hackathon-heading">
        <div>
          <p className="eyebrow">HACKATHON</p>
          <h2>{group.title}</h2>
        </div>
      </div>

      {group.podiums.length ? (
        <div className="results-podium">
          {group.podiums.map((entry) => (
            <article
              className="team-card results-podium-card"
              data-place={entry.place}
              key={entry.key}
            >
              <p className="eyebrow">{placeLabel(entry.place).toUpperCase()}</p>
              <h3 className="results-podium-team">{entry.teamName}</h3>
              <p className="results-podium-event muted tiny">{group.title}</p>
            </article>
          ))}
        </div>
      ) : null}

      {group.rest.length ? (
        <ol
          className="results-place-list"
          aria-label={`Remaining places for ${group.title}`}
        >
          {group.rest.map((entry) => (
            <li className="results-place-row" key={entry.key}>
              <span className="results-place-rank">{placeLabel(entry.place)}</span>
              <strong>{entry.teamName}</strong>
            </li>
          ))}
        </ol>
      ) : null}

      {group.mentions.length ? (
        <section className="results-mentions" aria-label={`Honourable mentions for ${group.title}`}>
          <h3>Honourable mentions</h3>
          <ul className="results-mention-list">
            {group.mentions.map((entry) => (
              <li key={entry.key}>
                <span aria-hidden="true">✳</span>
                <strong>{entry.teamName}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  ));
}

export function ResultsContent({ groups = [], loading = false, error = null }) {
  return (
    <>
      {loading ? (
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading published results…
        </p>
      ) : null}

      {error ? (
        <p className="form-message" role="status" data-error="true">
          {error.message || "Published results could not be loaded."}
        </p>
      ) : null}

      {!loading && !error && !groups.length ? (
        <div className="team-empty">
          <p>No results published yet.</p>
        </div>
      ) : null}

      {!loading && !error && groups.length ? <PublishedResults groups={groups} /> : null}
    </>
  );
}

export default function Results() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error: requestError } = await supabase.rpc("get_published_results");
      if (requestError) throw requestError;
      return parsePublishedResults(data);
    })()
      .then((nextGroups) => {
        if (!active) return;
        setGroups(nextGroups);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load published results.", requestError);
        setGroups([]);
        setError(requestError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageTitle title="Results | HackMate" />
      <main className="page-main wrap results-page">
        <PageIntro
          eyebrow="PUBLISHED RESULTS"
          title="The work that stood out."
          description="Every result sheet an organizer has published — winners, finalists and honourable mentions."
        />
        <ResultsContent groups={groups} loading={loading} error={error} />
      </main>
    </>
  );
}
