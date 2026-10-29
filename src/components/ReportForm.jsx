import { useId, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase, supabaseSetupMessage } from "../lib/supabase";
import FriendCodeInput from "./FriendCodeInput";

// The one report form used everywhere a member can be reported.
//
// Flow: type the six-digit friend ID -> the person's name and ID are shown for
// confirmation -> reason (+ optional detail) -> Submit. The row goes into
// public.reports through the browser client; its RLS policy only accepts a row
// where reporter_id is the signed-in user, and only admins can read it back.
//
// <ReportForm context="Report from chat: Team Rocket" onSubmitted={close} />
export default function ReportForm({ context = "", onSubmitted = null, onCancel = null }) {
  const { user } = useAuth();
  const uniqueId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState({ text: "", error: false });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const finish = () => {
    setSent(false);
    setTarget(null);
    setReason("");
    setDetails("");
    setStatus({ text: "", error: false });
    if (onSubmitted) onSubmitted();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!target || busy) return;

    if (!supabase || !user) {
      setStatus({ text: supabaseSetupMessage, error: true });
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setStatus({ text: "Add a short reason (at least 3 characters).", error: true });
      return;
    }

    // The chat/page context is kept alongside what the reporter typed.
    const composedContext = [context.trim(), details.trim()].filter(Boolean).join("\n\n").slice(0, 2000);

    setBusy(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: target.id,
      reason: trimmedReason.slice(0, 500),
      context: composedContext || null,
    });

    if (error) {
      console.error("Could not send this report:", error.message, {
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      const text =
        error.code === "23505"
          ? `You have already reported ${target.full_name}. An admin will review the first report.`
          : error.code === "23514" || error.code === "23502"
            ? "Add a reason with at least 3 characters and try again."
            : error.code === "42501" || /row-level security/i.test(error.message)
              ? "Reports are not open to your account yet. Run the reports migration in Supabase."
              : error.message || "That report could not be sent.";
      setStatus({ text, error: true });
      setBusy(false);
      return;
    }

    setSent(true);
    setTarget(null);
    setReason("");
    setDetails("");
    setStatus({
      text: `Report sent about ${target.full_name}. Only the admins can see it.`,
      error: false,
    });
    setBusy(false);
  };

  return (
    <div className="report-form-block">
      <p className="eyebrow">REPORT A MEMBER</p>
      <p className="muted small">
        Reports go to the admins only. The person you report is never told who reported them.
      </p>

      {sent ? (
        <button className="button button-outline" type="button" onClick={finish}>
          Done
        </button>
      ) : !target ? (
        <FriendCodeInput
          id={`report-${uniqueId}`}
          label="Their six-digit ID"
          confirmLabel="This is them"
          onConfirm={(person) => {
            setTarget(person);
            setStatus({ text: "", error: false });
          }}
          disabled={busy}
        />
      ) : (
        <form className="report-form" onSubmit={handleSubmit}>
          <div className="report-target">
            <span>
              <strong>{target.full_name}</strong>
              <small className="muted tiny"> ID {target.friend_code}</small>
            </span>
            <button
              className="text-link"
              type="button"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Change person
            </button>
          </div>

          <label htmlFor={`report-reason-${uniqueId}`}>Why are you reporting them?</label>
          <textarea
            id={`report-reason-${uniqueId}`}
            name="reason"
            rows={3}
            maxLength={500}
            required
            placeholder="Spam, harassment, impersonation…"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />

          <label htmlFor={`report-details-${uniqueId}`}>
            Anything else the admins should know? (optional)
          </label>
          <textarea
            id={`report-details-${uniqueId}`}
            name="details"
            rows={2}
            maxLength={2000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            disabled={busy}
          />

          <div className="filter-list">
            <button className="button button-dark" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Submit report"}
            </button>
            {onCancel ? (
              <button
                className="button button-outline"
                type="button"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      )}

      <p className="form-message" role="status" aria-live="polite" data-error={status.error}>
        {status.text}
      </p>
    </div>
  );
}
