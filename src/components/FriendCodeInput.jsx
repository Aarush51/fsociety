import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { initialsFromName, shortName } from "../lib/format";
import { FRIEND_CODE_HINT, isFriendCode, normalizeFriendCodeInput } from "../lib/friendCodes";
import { supabase, supabaseSetupMessage } from "../lib/supabase";

/**
 * Reusable "add someone by friend ID" field.
 *
 * Friend IDs are six digits (100000-999999). Type or paste one, check it, and
 * the matched member is shown as "Found: Rahul S." before anything is confirmed.
 * Unknown codes, your own code and people already in `addedIds` show an error
 * instead. The confirmed member is handed to `onConfirm`, so the surrounding
 * page decides what adding a friend means.
 */
export default function FriendCodeInput({
  onConfirm,
  addedIds = [],
  confirmLabel = "Add friend",
  label = "Friend ID",
  id = "friend-code",
  disabled = false,
}) {
  const { user } = useAuth();
  const [digits, setDigits] = useState("");
  const [found, setFound] = useState(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false });

  const busy = disabled || checking;

  const reset = () => {
    setDigits("");
    setFound(null);
    setMessage({ text: "", error: false });
  };

  const handleChange = (event) => {
    setDigits(normalizeFriendCodeInput(event.target.value));
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
    if (!isFriendCode(digits)) {
      setMessage({ text: `A friend ID is ${FRIEND_CODE_HINT}.`, error: true });
      return;
    }

    setChecking(true);
    setMessage({ text: "Checking that ID…", error: false });
    try {
      const { data, error } = await supabase.rpc("find_user_by_code", { p_code: digits });
      if (error) throw error;
      if (!data) {
        setMessage({ text: `No HackMate member has the ID ${digits}.`, error: true });
        return;
      }
      if (data.id === user.id) {
        setMessage({
          text: "That is your own friend ID — share it so a friend can add you.",
          error: true,
        });
        return;
      }
      if (addedIds.includes(data.id)) {
        setMessage({
          text: `${shortName(data.full_name)} is already on your added list.`,
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
          inputMode="numeric"
          pattern="[0-9]{6}"
          autoComplete="off"
          spellCheck="false"
          maxLength="12"
          placeholder="123456"
          aria-describedby={`${id}-message`}
          disabled={busy}
          value={digits}
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
