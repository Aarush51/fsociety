import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase, supabaseSetupMessage } from "../lib/supabase";
import ReportForm from "./ReportForm";

// One chat for both kinds of conversation:
//   <Chat teamId={team.id} … />        team chat (messages.team_id)
//   <Chat friendId={friend.id} … />    friend-to-friend chat (messages.friend_pair)
//
// Reads go through list_chat_messages() because profiles is owner-only, so the
// browser cannot join a message to its sender's name. Sends go straight to the
// messages table; its RLS policy only accepts a sender who belongs to the chat.
// New rows arrive through Supabase Realtime on public.messages.
//
// No provider key or service-role key is involved: only the publishable client.

const MESSAGE_LIMIT_NOTE = "The newest 100 messages are shown.";

// Canonical lowercase uuid strings sort the same way Postgres orders uuid values,
// so both members build the same friend_pair key regardless of who opens it.
function friendPairKey(a, b) {
  const left = String(a || "").toLowerCase();
  const right = String(b || "").toLowerCase();
  if (!left || !right || left === right) return "";
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function timeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(
    undefined,
    sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
  ).format(date);
}

// A missing table/function is setup, not user error.
function isSchemaError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42883" ||
    /could not find the (function|table)|schema cache/i.test(message)
  );
}

export default function Chat({
  teamId = null,
  friendId = null,
  title = "Chat",
  subtitle = "",
  participants = [],
  onClose = null,
}) {
  const { user } = useAuth();
  const pairKey = useMemo(
    () => (friendId ? friendPairKey(user?.id, friendId) : ""),
    [friendId, user?.id],
  );
  const mode = teamId ? "team" : pairKey ? "friend" : "";

  const [messages, setMessages] = useState([]);
  const [people, setPeople] = useState(Array.isArray(participants) ? participants : []);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState({ text: "", error: false });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const threadRef = useRef(null);

  const names = useMemo(() => {
    const map = new Map();
    (people || []).forEach((person) => {
      if (person?.id) map.set(person.id, person.full_name);
    });
    if (user?.id && !map.has(user.id)) map.set(user.id, "You");
    return map;
  }, [people, user?.id]);

  const senderName = useCallback(
    (message) => {
      if (message?.sender_name) return message.sender_name;
      const known = names.get(message?.sender_id);
      if (known) return known;
      return message?.sender_id === user?.id ? "You" : "A HackMate member";
    },
    [names, user?.id],
  );

  const load = useCallback(async () => {
    if (!mode) {
      setLoading(false);
      setStatus({ text: "This chat could not be opened.", error: true });
      return;
    }
    if (!supabase) {
      setLoading(false);
      setStatus({ text: supabaseSetupMessage, error: true });
      return;
    }

    setLoading(true);
    setStatus({ text: "Loading messages…", error: false });
    const { data, error } = await supabase.rpc("list_chat_messages", {
      p_team_id: teamId || null,
      p_friend_pair: pairKey || null,
    });

    if (error) {
      console.error("Could not load this chat:", error.message, {
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      setMessages([]);
      setStatus({
        text: isSchemaError(error)
          ? "Chat isn't set up on the database yet. Run the Huddle migrations in Supabase, then try again."
          : error.message || "This chat could not be loaded.",
        error: true,
      });
      setLoading(false);
      return;
    }

    if (!data) {
      setMessages([]);
      setStatus({ text: "This conversation is not available to you.", error: true });
      setLoading(false);
      return;
    }

    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setPeople((current) => (Array.isArray(data.participants) ? data.participants : current));
    setStatus({ text: "", error: false });
    setLoading(false);
  }, [mode, pairKey, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: RLS on public.messages decides which inserts this subscriber sees.
  useEffect(() => {
    if (!supabase || !mode) return undefined;

    const filter = teamId ? `team_id=eq.${teamId}` : `friend_pair=eq.${pairKey}`;
    const channel = supabase
      .channel(`chat:${teamId || pairKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter },
        (payload) => {
          const row = payload?.new;
          if (!row?.id) return;
          setMessages((current) =>
            current.some((message) => message.id === row.id)
              ? current
              : [
                  ...current,
                  {
                    id: row.id,
                    sender_id: row.sender_id,
                    body: row.body,
                    created_at: row.created_at,
                  },
                ],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mode, pairKey, teamId]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || !mode) return;

    if (!supabase || !user) {
      setStatus({ text: "Log in to send a message.", error: true });
      return;
    }

    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        team_id: teamId || null,
        friend_pair: teamId ? null : pairKey,
        body,
      })
      .select("id, sender_id, body, created_at")
      .single();

    if (error) {
      console.error("Could not send this message:", error.message, {
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      setStatus({ text: error.message || "That message could not be sent.", error: true });
      setSending(false);
      return;
    }

    setDraft("");
    setStatus({ text: "", error: false });
    setMessages((current) =>
      current.some((message) => message.id === data.id) ? current : [...current, data],
    );
    setSending(false);
  };

  return (
    <section className="chat-panel" aria-label={title}>
      <div className="chat-head">
        <div>
          {subtitle ? <p className="eyebrow">{subtitle}</p> : null}
          <h2>{title}</h2>
        </div>
        <div className="filter-list">
          <button
            className="button button-outline"
            type="button"
            aria-expanded={reportOpen}
            onClick={() => setReportOpen((open) => !open)}
          >
            {reportOpen ? "Close report" : "Report"}
          </button>
          {onClose ? (
            <button className="button button-outline" type="button" onClick={onClose}>
              Close chat
            </button>
          ) : null}
        </div>
      </div>

      {reportOpen ? (
        <ReportForm
          context={`Report from chat: ${title}`}
          onCancel={() => setReportOpen(false)}
          onSubmitted={() => setReportOpen(false)}
        />
      ) : null}

      <p className="hackathon-status" role="status" aria-live="polite" data-error={status.error}>
        {status.text}
        {status.error ? (
          <>
            {" "}
            <button className="text-link hackathon-retry" type="button" onClick={load}>
              Try again
            </button>
          </>
        ) : null}
      </p>

      <div className="chat-thread" ref={threadRef} aria-live="polite" aria-busy={loading}>
        {messages.length ? (
          messages.map((message) => {
            const mine = message.sender_id === user?.id;
            return (
              <article
                className={`chat-message${mine ? " chat-message-own" : ""}`}
                key={message.id}
              >
                <div className="chat-message-top">
                  <strong>{senderName(message)}</strong>
                  <small>
                    <time dateTime={message.created_at || undefined}>
                      {timeLabel(message.created_at)}
                    </time>
                  </small>
                </div>
                <p>{message.body}</p>
              </article>
            );
          })
        ) : loading ? null : (
          <p className="muted small chat-empty">
            No messages yet. Say hello{people.length > 1 ? " to your team" : ""}.
          </p>
        )}
      </div>

      {messages.length >= 100 ? <p className="muted tiny chat-empty">{MESSAGE_LIMIT_NOTE}</p> : null}

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          name="body"
          type="text"
          aria-label={`Message ${title}`}
          autoComplete="off"
          maxLength={2000}
          placeholder="Write a message…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={sending || !mode}
        />
        <button
          className="button button-dark"
          type="submit"
          disabled={sending || !draft.trim() || !mode}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
