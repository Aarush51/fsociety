import { useCallback, useEffect, useMemo, useState } from "react";
import AttendanceSheet from "./AttendanceSheet";
import {
  attendanceSummary,
  availableOptions,
  buildResultEntries,
  HONOURABLE_MENTION_COUNT,
  loadHackathonResults,
  loadHackathonRoster,
  PLACES,
  publishResults,
  saveHackathonAttendance,
  saveHackathonResults,
  unpublishResults as unpublishResultsRequest,
  validateResults,
} from "../lib/attendance";

// Organizer tools for one hackathon, shown on the organizer dashboard.
//   ATTENDANCE  the roster for the day, one tap target per participant
//   RESULTS     places 1 to 10 plus two honourable mentions, publishable
//
// Every write goes through an admin-checked RPC (see src/lib/attendance.js), so
// the rules hold even if the browser is bypassed: only the hackathon's organizer
// can write, and only attendees can be placed.

const TABS = [
  { value: "attendance", label: "Attendance" },
  { value: "results", label: "Results" },
];

const EMPTY_PLACES = PLACES.reduce((slots, place) => ({ ...slots, [place]: "" }), {});

function personLabel(person) {
  return person.team_name ? `${person.full_name} · ${person.team_name}` : person.full_name;
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
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, savedResults] = await Promise.all([
        loadHackathonRoster(event.id),
        loadHackathonResults(event.id),
      ]);
      setRoster(rows);

      const attended = rows.filter((person) => person.attended).map((person) => person.user_id);
      setAttendedIds(attended);
      setSavedIds(attended);

      // Restore what was saved last time.
      const nextPlaces = { ...EMPTY_PLACES };
      const nextMentions = [];
      savedResults.forEach((row) => {
        if (row.place && PLACES.includes(Number(row.place))) nextPlaces[Number(row.place)] = row.user_id;
        else if (row.honourable_mention) nextMentions.push(row.user_id);
      });
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

  // Results only offer people whose attendance has been saved — that is exactly
  // what the database will accept when the result is written.
  const attendedPeople = useMemo(
    () => (roster || []).filter((person) => savedIds.includes(person.user_id)),
    [roster, savedIds],
  );

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
  const optionsFor = (currentUserId) =>
    availableOptions(attendedPeople, currentUserId, [...usedInPlaces, ...usedInMentions]);

  const entries = buildResultEntries(places, mentions);

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
            {attendedPeople.length
              ? `${attendedPeople.length} attended ${
                  attendedPeople.length === 1 ? "participant" : "participants"
                } can be placed.`
              : "Save attendance first — only attended participants can be placed."}
          </p>

          <div className="results-grid">
            {PLACES.map((place) => (
              <label className="results-slot" key={place}>
                <span className="eyebrow">{place === 1 ? "1ST PLACE" : `PLACE ${place}`}</span>
                <select
                  value={places[place] || ""}
                  onChange={(changeEvent) => {
                    setPlaces((current) => ({ ...current, [place]: changeEvent.target.value }));
                    setMessage({ text: "", error: false });
                  }}
                >
                  <option value="">No one</option>
                  {optionsFor(places[place]).map((person) => (
                    <option value={person.user_id} key={person.user_id}>
                      {personLabel(person)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {[0, 1].map((slot) => (
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
                  <option value="">No one</option>
                  {optionsFor(mentions[slot]).map((person) => (
                    <option value={person.user_id} key={person.user_id}>
                      {personLabel(person)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <p className="muted tiny">
            Exactly {HONOURABLE_MENTION_COUNT} honourable mentions are needed before publishing. A
            {" "}participant can hold only one place or mention.
          </p>

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
