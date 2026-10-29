import { displayFriendCode } from "../lib/attendance";

// The attendance sheet: one row per registered participant with a tap target
// that turns into a green tick. Presentational only — the parent owns the state
// and the save, so the same markup is easy to check in isolation.
export default function AttendanceSheet({ roster = [], attendedIds = [], onToggle }) {
  return (
    <div className="attendance-table-wrap">
      <table className="attendance-table">
        <thead>
          <tr>
            <th scope="col">Participant</th>
            <th scope="col">Friend code</th>
            <th scope="col">Attended</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((person) => {
            const attended = attendedIds.includes(person.user_id);
            return (
              <tr key={person.user_id}>
                <td>
                  <strong>{person.full_name}</strong>
                  <span className="muted tiny">
                    @{person.username}
                    {person.team_name ? ` · ${person.team_name}` : ""}
                    {person.team_role === "leader" ? " · Leader" : ""}
                  </span>
                </td>
                <td className="attendance-code">{displayFriendCode(person)}</td>
                <td>
                  <button
                    className={`attendance-toggle${attended ? " is-attended" : ""}`}
                    type="button"
                    aria-pressed={attended}
                    aria-label={`${person.full_name} ${attended ? "attended" : "did not attend"}`}
                    onClick={() => onToggle(person.user_id)}
                  >
                    {attended ? "✓" : ""}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
