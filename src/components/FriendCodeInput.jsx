import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { initialsFromName, shortName } from "../lib/format";
import { supabase, supabaseSetupMessage } from "../lib/supabase";

// Friend IDs are "HM-" + 6 characters from A-Z and 2-9 (no 0, O, 1, I).
const CODE_BODY_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const MAX_BODY_LENGTH = 6;

// Forgiving while typing: uppercase, alphanumeric only, prefix dropped so the
// input can show "HM-" itself while the user types or pastes a code.
function codeBodyFromInput(value) {
  const cleaned = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return (cleaned.startsWith("HM") ? cleaned.slice(2) : cleaned).slice(0, MAX_BODY_LENGTH);
}

function displayCode(body) {
  return body ? `HM-${body}` : "HM-";
}

/**
 * Reusable "add someone by friend ID" field.
 *
 * Type or paste a code, check it, and the matched member is shown as
 * "Found: Rahul S." before anything is confirmed. Unknown codes show an error,
 * and your own code is refused. The confirmed member is handed to `onConfirm`,
 * so the surrounding page decides what adding a friend means.
 */
export default function FriendCodeInput({
  onConfirm,
  confirmLabel = "Add friend",
  label = "Friend ID",
  id = "friend-code",
  disabled = false,
}) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [found, setFound] = useState(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });

  const code = displayCode(body);
  const busy = disabled || checking;

  const reset = () => {
    setBody("");
    setFound(null);
    setMessage({ text: "", error: false });
  };

  const handleChange = (event) => {
    setBody(codeBodyFromInput(event.target.value));
    setFound(null);
    setMessage({ text: "", error: false });
  };

  const handleLookup = async (event) => {
    event.preventDefault();
    if (busy) return;

    setFound(null);
    if (!supabase) {
      setMessage({ text: supabaseSetupMessage, error: true });
      return;
    }
    if (!user) {
      setMessage({ text: "Log in to look up a friend ID.", error: true });
      return;
    }
    if (!CODE_BODY_PATTERN.test(body)) {
      setMessage({ text: "A friend ID looks like HM-K7F2Q9.", error: true });
      return;
    }

    setChecking(true);
    setMessage({ text: "Checking that ID…", error: false });
    try {
      const { data, error } = await supabase.rpc("find_user_by_code", { p_code: code });
      if (error) throw error;
      if (!data) {
        setMessage({ text: `No HackMate member has the ID ${code}.`, error: true });
        return;
      }
      if (data.id === user.id) {
        setMessage({
          text: "That is your own friend ID — share it so a friend can add you.",
          error: true,
        });
        return;
      }
      setFound(data);
      setMessage({ text: "", error: false });
    } catch (error) {
      console.error("Could not look up that friend ID.", error);
      setMessage({
        text: error.message || "Could not look up that friend ID. Try again.",
        error: true,
      });
    } finally {
      setChecking(false);
    }
  };

  const handleConfirm = () => {
    if (!found || found.id === user?.id) return;
    const member = found;
    reset();
    onConfirm?.(member);
  };

  return (
    <form className="friend-code-form" id={`${id}-form`} onSubmit={handleLookup}>
      <label htmlFor={`${id}-input`}>{label}</label>
      <div className="friend-code-input-row">
        <input
          id={`${id}-input`}
          name="friend_code"
          type="text"
          autoComplete="off"
          spellCheck="false"
          maxLength={MAX_BODY_LENGTH + 3}
          placeholder="HM-K7F2Q9"
          disabled={busy}
          value={code}
          onChange={handleChange}
        />
        <button
          id={`${id}-check`}
          className="button button-outline"
          type="submit"
          disabled={busy}
        >
          {checking ? "Checking…" : "Check ID"}
        </button>
      </div>
      <p
        id={`${id}-message`}
        className="form-message"
        role="status"
        aria-live="polite"
        data-error={message.error}
      >
        {message.text}
      </p>
      {found ? (
        <div className="friend-code-found" id={`${id}-found`} aria-live="polite">
          <div className="friend-code-found-person">
            <span className="avatar avatar-small blue">{initialsFromName(found.full_name)}</span>
            <div>
              <strong>Found: {shortName(found.full_name)}</strong>
              <span className="muted tiny">{found.friend_code}</span>
            </div>
          </div>
          <button
            id={`${id}-confirm`}
            className="button button-dark"
            type="button"
            onClick={handleConfirm}
            disabled={disabled}
          >
            {confirmLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}
