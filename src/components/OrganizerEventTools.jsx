import { useCallback, useEffect, useMemo, useState } from "react";
import AttendanceSheet from "./AttendanceSheet";
import {
  attendanceSummary,
  availableTeams,
  buildResultEntries,
  HONOURABLE_MENTION_COUNT,
  loadHackathonResults,
  loadHackathonRoster,
  PLACES,
  publishResults,
  saveHackathonAttendance,
  saveHackathonResults,
  teamsFromRoster,
  unpublishResults as unpublishResultsRequest,
  validateResults,
} from "../lib/attendance";

// Organizer tools for one hackathon, shown on the organizer dashboard.
//   ATTENDANCE  the roster for the day, one tap target per participant
//   RESULTS     teams ranked 1 to 10 plus two honourable mentions, publishable
//
// Teams are grouped from get_hackathon_roster() rather than list_hackathon_teams():
// the listing RPC only returns teams for upcoming/active hackathons, while the
// roster works after the event ends and already carries each member's team.
//
// Every write goes through an admin-checked RPC (see src/lib/attendance.js), so
// the rules hold even if the browser is bypassed: only the hackathon's organizer
// can write, and only teams with an attended member can be placed.

const TABS = [
  { value: "attendance", label: "Attendance" },
  { value: "results", label: "Results" },
];

const EMPTY_PLACES = PLACES.reduce((slots, place) => ({ ...slots, [place]: "" }), {});

function representativeLabel(team) {
  if (!team?.representative) return "No team chosen";
  return `Saved as ${team.representative.full_name} · ${
    team.representative.role === "leader" ? "Leader" : "Member"
  }`;
}

export default function OrganizerEventTools({ event }) {
  const [tab, setTab] = useState("attendance");
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [attendedIds, setAttendedIds] = useState([]);
  const [savedIds, setSavedIds] = useState([]);
  const [places, setPlaces] = useState(EMPTY_PLACES);
  const [mentions, setMentions] = useState(["", ""]);
  const [resultsNote, setResultsNote] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setResultsNote("");
    try {
      const [rows, savedResults] = await Promise.all([
        loadHackathonRoster(event.id),
        loadHackathonResults(event.id),
      ]);
      setRoster(rows);

      const attended = rows.filter((person) => person.attended).map((person) => person.user_id);
      setAttendedIds(attended);
      setSavedIds(attended);

      // Restore what was saved last time, one slot per team. The RPC stores a
      // user_id for each result, so each saved row is mapped back to its team
      // through the roster.
      const rosterTeams = teamsFromRoster(rows, attended);
      const teamNameByMember = new Map();
      rosterTeams.forEach((team) => {
        team.members.forEach((member) => teamNameByMember.set(member.user_id, team.name));
      });
      const teamByName = new Map(rosterTeams.map((team) => [team.name, team]));
      const nextPlaces = { ...EMPTY_PLACES };
      const nextMentions = [];
      const skippedIds = [];

      savedResults.forEach((row) => {
        const teamName = teamNameByMember.get(row.user_id);
        const team = teamName ? teamByName.get(teamName) : null;
        if (!team?.representative) {
          skippedIds.push(row.user_id);
          return;
        }
        if (row.place && PLACES.includes(Number(row.place))) {
          nextPlaces[Number(row.place)] = team.name;
        } else if (row.honourable_mention && !nextMentions.includes(team.name)) {
          nextMentions.push(team.name);
        }
      });

      const skippedNames = [...new Set(skippedIds)]
        .map((id) => rows.find((person) => person.user_id === id)?.full_name)
        .filter(Boolean);
      setResultsNote(
        skippedIds.length
          ? `Saved ${skippedIds.length === 1 ? "result" : "results"}${
              skippedNames.length ? ` for ${skippedNames.join(", ")}` : ""
            } could not be matched to a team with an attended member, so ${
              skippedIds.length === 1 ? "it was" : "they were"
            } left out. Pick a team to save it again.`
          : "",
      );

      setPlaces(nextPlaces);
      setMentions([nextMentions[0] || "", nextMentions[1] || ""]);
      setPublished(savedResults.some((row) => row.published));
    } catch (requestError) {
      console.error("Could not load the attendance tools.", requestError);
      setRoster([]);
      setLoadError(requestError);
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Teams from the roster, so this works for a hackathon in any status. Results
  // only offer teams with a saved-attendance member — that is exactly what the
  // database will accept when the result is written.
  const teams = useMemo(() => teamsFromRoster(roster || [], savedIds), [roster, savedIds]);
  const teamByName = useMemo(() => new Map(teams.map((team) => [team.name, team])), [teams]);
  const eligibleTeams = useMemo(
    () => teams.filter((team) => team.representative),
    [teams],
  );
  const teamlessAttended = useMemo(() => {
    const inTeam = new Set();
    teams.forEach((team) => team.members.forEach((member) => inTeam.add(member.user_id)));
    return (roster || []).filter(
      (person) => savedIds.includes(person.user_id) && !inTeam.has(person.user_id),
    );
  }, [roster, teams, savedIds]);

  const toggleAttended = (userId) => {
    setMessage({ text: "", error: false });
    setAttendedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const submitAttendance = async () => {
    setBusy("attendance");
    setMessage({ text: "", error: false });
    try {
      const saved = await saveHackathonAttendance(event.id, attendedIds);
      setSavedIds(attendedIds);
      const attended = Number(saved?.attended) || attendedIds.length;
      setMessage({ text: attendanceSummary(attended), error: false });
    } catch (requestError) {
      setMessage({ text: requestError.message || "Attendance could not be saved.", error: true });
    } finally {
      setBusy("");
    }
  };

  const usedInPlaces = Object.values(places).filter(Boolean);
  const usedInMentions = mentions.filter(Boolean);
  const optionsFor = (currentName) =>
    availableTeams(teams, currentName, [...usedInPlaces, ...usedInMentions]);

  const entries = buildResultEntries(places, mentions, teams);

  const submitResults = async (alsoPublish) => {
    const check = validateResults({
      entries,
      attendedIds: savedIds,
      publishing: Boolean(alsoPublish),
    });
    if (!check.valid) {
      setMessage({ text: check.errors[0], error: true });
      return;
    }

    setBusy(alsoPublish ? "publish" : "save");
    setMessage({ text: "", error: false });
    try {
      await saveHackathonResults(event.id, entries);
      if (alsoPublish) {
        // publish_results also awards the points for these places and mentions.
        const summary = await publishResults(event.id);
        setPublished(true);
        const awarded = Number(summary?.awarded) || 0;
        const total = Number(summary?.total_points) || 0;
        setMessage({
          text: `Published ${check.places.length} ${
            check.places.length === 1 ? "place" : "places"
          } and ${check.mentions.length} honourable mentions for ${event.title}. ${awarded} ${
            awarded === 1 ? "participant" : "participants"
          } awarded ${total} ${total === 1 ? "point" : "points"}.`,
          error: false,
        });
      } else {
        setMessage({ text: `Results saved for ${event.title}.`, error: false });
      }
    } catch (requestError) {
      setMessage({ text: requestError.message || "The results could not be saved.", error: true });
    } finally {
      setBusy("");
    }
  };

  const unpublishResults = async () => {
    setBusy("unpublish");
    setMessage({ text: "", error: false });
    try {
      const summary = await unpublishResultsRequest(event.id);
      setPublished(false);
      const removed = Number(summary?.removed) || 0;
      setMessage({
        text: `Results for ${event.title} are no longer public.${removed ? ` ${removed} points removed.` : ""}`,
        error: false,
      });
    } catch (requestError) {
      setMessage({ text: requestError.message || "The results could not be unpublished.", error: true });
    } finally {
      setBusy("");
    }
  };

  const attendanceDirty =
    attendedIds.length !== savedIds.length ||
    attendedIds.some((id) => !savedIds.includes(id));

  return (
    <div className="organizer-tools">
      <div className="filter-list" role="tablist" aria-label={`${event.title} organizer tools`}>
        {TABS.map((option) => (
          <button
            className={`${tab === option.value ? "filter-active" : "skill"} hackathon-theme`}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            key={option.value}
            onClick={() => {
              setTab(option.value);
              setMessage({ text: "", error: false });
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <p className="form-message" role="status" data-error="true">
          {loadError.message}{" "}
          <button className="text-link" type="button" onClick={load}>
            Try again
          </button>
        </p>
      ) : null}

      {loading ? (
        <p className="hackathon-status" role="status" aria-live="polite">
          Loading {event.title}…
        </p>
      ) : null}

      {!loading && !loadError && tab === "attendance" ? (
        <>
          {roster && roster.length ? (
            <>
              <AttendanceSheet
                roster={roster}
                attendedIds={attendedIds}
                onToggle={toggleAttended}
              />
              <div className="org-form-actions">
                <button
                  className="button button-dark"
                  type="button"
                  disabled={busy === "attendance"}
                  onClick={submitAttendance}
                >
                  {busy === "attendance" ? "Saving…" : "Submit attendance"}
                </button>
                <span className="muted tiny">
                  {attendedIds.length} of {roster.length} marked
                  {attendanceDirty ? " · unsaved changes" : ""}
                </span>
              </div>
            </>
          ) : (
            <p className="team-empty">No registrations yet, so there is nobody to mark.</p>
          )}
        </>
      ) : null}

      {!loading && !loadError && tab === "results" ? (
        <>
          <p className="muted small">
            {savedIds.length === 0
              ? "Save attendance first — only members marked as attended are eligible."
              : eligibleTeams.length
                ? `${eligibleTeams.length} of ${teams.length} ${
                    teams.length === 1 ? "team" : "teams"
                  } can be ranked. Each ranked team is saved under its leader if they attended, otherwise the first attended member.`
                : teams.length
                  ? "No team has an attended member yet, so no team can be ranked. Save attendance first."
                  : "No teams have been formed for this hackathon yet, so there is nothing to rank."}
          </p>

          {resultsNote ? <p className="muted tiny">{resultsNote}</p> : null}

          <div className="results-grid">
            {PLACES.map((place) => {
              const team = teamByName.get(places[place]);
              return (
                <label className="results-slot" key={place}>
                  <span className="eyebrow">{place === 1 ? "1ST PLACE" : `PLACE ${place}`}</span>
                  <select
                    value={places[place] || ""}
                    onChange={(changeEvent) => {
                      setPlaces((current) => ({ ...current, [place]: changeEvent.target.value }));
                      setMessage({ text: "", error: false });
                    }}
                  >
                    <option value="">No team</option>
                    {optionsFor(places[place]).map((option) => (
                      <option value={option.name} key={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <span className="muted tiny">{representativeLabel(team)}</span>
                </label>
              );
            })}
            {[0, 1].map((slot) => {
              const team = teamByName.get(mentions[slot]);
              return (
                <label className="results-slot" key={`mention-${slot}`}>
                  <span className="eyebrow">HONOURABLE MENTION {slot + 1}</span>
                  <select
                    value={mentions[slot] || ""}
                    onChange={(changeEvent) => {
                      const next = [...mentions];
                      next[slot] = changeEvent.target.value;
                      setMentions(next);
                      setMessage({ text: "", error: false });
                    }}
                  >
                    <option value="">No team</option>
                    {optionsFor(mentions[slot]).map((option) => (
                      <option value={option.name} key={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <span className="muted tiny">{representativeLabel(team)}</span>
                </label>
              );
            })}
          </div>

          <p className="muted tiny">
            Exactly {HONOURABLE_MENTION_COUNT} honourable mentions are needed before publishing. A
            team can hold only one place or mention.
          </p>

          {teams.length ? (
            <div className="results-teams">
              <p className="eyebrow">TEAMS IN THIS HACKATHON</p>
              <div className="team-list results-team-list">
                {teams.map((team) => (
                  <article className="team-card" key={team.name}>
                    <div className="team-card-heading">
                      <div>
                        <p className="eyebrow">TEAM</p>
                        <h2>{team.name}</h2>
                      </div>
                      <span className="team-member-count">
                        {team.members.filter((member) => member.attended).length}/
                        {team.members.length} ATTENDED
                      </span>
                    </div>
                    <ul className="results-team-members">
                      {team.members.map((member) => (
                        <li key={member.user_id}>
                          <span>
                            <strong>{member.full_name}</strong>{" "}
                            <span className="muted tiny">
                              @{member.username}
                              {member.role === "leader" ? " · Leader" : ""} ·{" "}
                              {member.attended ? "Attended" : "Did not attend"}
                            </span>
                          </span>
                          {team.representative?.user_id === member.user_id ? (
                            <span className="results-representative">REPRESENTATIVE</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {!team.representative ? (
                      <p className="muted tiny">
                        No member is marked as attended, so this team can’t be ranked.
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
              {teamlessAttended.length ? (
                <p className="muted tiny">
                  {teamlessAttended.length} attended{" "}
                  {teamlessAttended.length === 1 ? "participant is" : "participants are"} not on a
                  team, so they can’t be ranked as a team.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="org-form-actions">
            <button
              className="button button-dark"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => submitResults(true)}
            >
              {busy === "publish" ? "Publishing…" : published ? "Publish again" : "Publish"}
            </button>
            <button
              className="button button-outline"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => submitResults(false)}
            >
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            {published ? (
              <button
                className="text-link"
                type="button"
                disabled={Boolean(busy)}
                onClick={unpublishResults}
              >
                {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
              </button>
            ) : null}
            <span className="muted tiny">{published ? "Publicly visible" : "Not published yet"}</span>
          </div>
        </>
      ) : null}

      <p className="form-message" role="status" aria-live="polite" data-error={message.error}>
        {message.text}
      </p>
    </div>
  );
}
