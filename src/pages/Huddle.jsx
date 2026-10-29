import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Chat from "../components/Chat";
import { Arrow } from "../components/Icons";
import FriendCodeInput from "../components/FriendCodeInput";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import ReportForm from "../components/ReportForm";
import TeammateReviews from "../components/TeammateReviews";
import { useAuth } from "../context/AuthContext";
import { useFriends } from "../context/FriendsContext";
import {
  cancelFriendRequest,
  emptyFriendRequests,
  friendRequestStatusMessage,
  listFriendRequests,
  listFriends,
  logFriendError,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
} from "../lib/friends";
import { formatEventDate, formatNumber, shortName } from "../lib/format";
import { fetchMyHackathons } from "../lib/personal";
import { fetchMyTeamState } from "../lib/registrations";
import { memberCount, teamCodeFrom } from "../lib/teams";

// The Huddle is the social half of HackMate: friends, the teams you are on, the
// chats you share with them, and reporting a member to the admins. The personal
// half (ID, points, rank, events, skills, editing your profile) stays on the
// Dashboard and /profile.
//
// TABS
//   Friends         requests, the friends list and a 1:1 chat per friend
//   Teams and chat  the teams you are on, each with its own team chat
//   Reviews         teammate reviews owed after a hackathon ends
//   Reports         the shared ReportForm (admins read the queue)
const TABS = [
  { key: "friends", label: "Friends" },
  { key: "teams", label: "Teams and chat" },
  { key: "reviews", label: "Reviews" },
  { key: "reports", label: "Reports" },
];

export default function Huddle() {
  const { user } = useAuth();
  const { refreshFriends } = useFriends();
  const [searchParams] = useSearchParams();
  // Links such as /huddle?tab=reviews open the matching section directly.
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState(
    TABS.some((item) => item.key === requestedTab) ? requestedTab : "friends",
  );

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState(emptyFriendRequests());
  const [friendsStatus, setFriendsStatus] = useState({ text: "Loading your friends…", error: false });
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [requestMessage, setRequestMessage] = useState({ text: "", error: false });
  const [busyId, setBusyId] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);

  const [teams, setTeams] = useState([]);
  const [teamsStatus, setTeamsStatus] = useState({ text: "Loading your teams…", error: false });
  const [teamsLoading, setTeamsLoading] = useState(true);

  // One chat open at a time: { kind: "team" | "friend", id }.
  const [openChat, setOpenChat] = useState(null);

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    setFriendsStatus({ text: "Loading your friends…", error: false });
    try {
      const [friendRows, requestRows] = await Promise.all([listFriends(), listFriendRequests()]);
      setFriends(friendRows);
      setRequests(requestRows);
      setFriendsStatus({ text: "", error: false });
      refreshFriends();
    } catch (error) {
      console.error("Could not load your friends.", error);
      setFriends([]);
      setRequests(emptyFriendRequests());
      setFriendsStatus({ text: error.message, error: true });
    } finally {
      setFriendsLoading(false);
    }
  }, [refreshFriends]);

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true);
    setTeamsStatus({ text: "Loading your teams…", error: false });
    try {
      const hackathons = await fetchMyHackathons();
      const rows = await Promise.all(
        hackathons.map(async (hackathon) => {
          try {
            const state = await fetchMyTeamState(hackathon.id);
            return state?.team ? { hackathon, team: state.team } : null;
          } catch (error) {
            console.error("Could not load a team.", error);
            return null;
          }
        }),
      );
      setTeams(rows.filter(Boolean));
      setTeamsStatus({ text: "", error: false });
    } catch (error) {
      console.error("Could not load your teams.", error);
      setTeams([]);
      setTeamsStatus({ text: error.message || "Your teams could not be loaded.", error: true });
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriends();
    loadTeams();
  }, [loadFriends, loadTeams]);

  const toggleChat = (kind, id) =>
    setOpenChat((current) =>
      current && current.kind === kind && current.id === id ? null : { kind, id },
    );

  const chatIsOpen = (kind, id) => openChat?.kind === kind && openChat.id === id;

  // ---- friend actions -------------------------------------------------------
  const runFriendAction = async (id, action, successText) => {
    setBusyId(id);
    setRequestMessage({ text: "", error: false });
    try {
      const result = await action();
      await loadFriends();
      const text = typeof successText === "function" ? successText(result) : successText;
      setRequestMessage({ text: text || "", error: false });
    } catch (error) {
      logFriendError("A friend action failed.", error);
      setRequestMessage({ text: error.message || "That could not be saved.", error: true });
    } finally {
      setBusyId("");
    }
  };

  const handleAddFriend = (member) =>
    runFriendAction(
      member.id,
      () => sendFriendRequest(member.friend_code),
      friendRequestStatusMessage,
    );

  const handleRespond = (request, accept) =>
    runFriendAction(
      request.id,
      () => respondFriendRequest(request.id, accept),
      accept ? `You and ${shortName(request.full_name)} are friends now.` : "Request declined.",
    );

  const handleCancel = (request) =>
    runFriendAction(request.id, () => cancelFriendRequest(request.id), "Request cancelled.");

  const handleRemove = (friend) =>
    runFriendAction(
      friend.id,
      async () => {
        await removeFriend(friend.id);
        setRemoveTarget(null);
      },
      `${shortName(friend.full_name)} was removed from your friends.`,
    );

  const pendingCount = requests.incoming.length;

  return (
    <>
      <PageTitle title="The Huddle | HackMate" />
      <main className="page-main huddle-shell">
        <PageIntro
          eyebrow="THE HUDDLE"
          title="Your people, in one place."
          description="Add friends by their six-digit ID, answer the requests waiting on you, and see the teams and reviews you share with the community."
        />

        <div className="filter-list huddle-tabs" role="tablist" aria-label="The Huddle sections">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${active ? "filter-active" : "skill"} hackathon-theme`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
                {item.key === "friends" && pendingCount ? ` (${pendingCount})` : ""}
              </button>
            );
          })}
        </div>

        {tab === "friends" ? (
          <>
            <div className="dashboard-data-section">
              <div className="section-heading dashboard-heading">
                <div>
                  <p className="eyebrow">ADD A FRIEND</p>
                  <h2>Look someone up by ID.</h2>
                </div>
              </div>
              <div className="friend-code-panel">
                <p className="muted small friend-code-intro">
                  Type a six-digit HackMate ID to see who it belongs to, then send a request.
                </p>
                <FriendCodeInput
                  id="huddle-add-friend"
                  label="Their ID"
                  confirmLabel="Send request"
                  addedIds={[
                    ...friends.map((friend) => friend.id),
                    ...requests.incoming.map((request) => request.user_id),
                    ...requests.sent.map((request) => request.user_id),
                  ]}
                  onConfirm={handleAddFriend}
                  disabled={Boolean(busyId)}
                />
                <p
                  className="form-message"
                  role="status"
                  aria-live="polite"
                  data-error={requestMessage.error}
                >
                  {requestMessage.text}
                </p>
              </div>
            </div>

            <p
              className="hackathon-status"
              role="status"
              aria-live="polite"
              data-error={friendsStatus.error}
            >
              {friendsStatus.text}
              {friendsStatus.error ? (
                <>
                  {" "}
                  <button className="text-link hackathon-retry" type="button" onClick={loadFriends}>
                    Try again
                  </button>
                </>
              ) : null}
            </p>

            <div className="dashboard-data-section">
              <div className="section-heading dashboard-heading">
                <div>
                  <p className="eyebrow">INCOMING REQUESTS</p>
                  <h2>Waiting for your answer.</h2>
                </div>
                <span className="muted tiny">
                  {formatNumber(pendingCount)} pending
                </span>
              </div>
              <div className="dashboard-item-list">
                {requests.incoming.length ? (
                  requests.incoming.map((request) => (
                    <article className="dashboard-data-card" key={request.id}>
                      <span>
                        <strong>{request.full_name}</strong>
                        <small>
                          ID {request.friend_code} · asked {formatEventDate(request.created_at)}
                        </small>
                      </span>
                      <div className="filter-list">
                        <button
                          className="button button-dark"
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() => handleRespond(request, true)}
                        >
                          Accept
                        </button>
                        <button
                          className="button button-outline"
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() => handleRespond(request, false)}
                        >
                          Decline
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="dashboard-empty">
                    No one is waiting on you right now. Send a request to get started.
                  </p>
                )}
              </div>
            </div>

            <div className="dashboard-data-section">
              <div className="section-heading dashboard-heading">
                <div>
                  <p className="eyebrow">SENT REQUESTS</p>
                  <h2>Waiting on them.</h2>
                </div>
              </div>
              <div className="dashboard-item-list">
                {requests.sent.length ? (
                  requests.sent.map((request) => (
                    <article className="dashboard-data-card" key={request.id}>
                      <span>
                        <strong>{request.full_name}</strong>
                        <small>
                          ID {request.friend_code} · sent {formatEventDate(request.created_at)}
                        </small>
                      </span>
                      <div className="filter-list">
                        <button
                          className="text-link"
                          type="button"
                          disabled={busyId === request.id}
                          onClick={() => handleCancel(request)}
                        >
                          Cancel
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="dashboard-empty">You have no requests waiting for an answer.</p>
                )}
              </div>
            </div>

            <div className="dashboard-data-section">
              <div className="section-heading dashboard-heading">
                <div>
                  <p className="eyebrow">MY FRIENDS</p>
                  <h2>Your huddle.</h2>
                </div>
                <span className="muted tiny">
                  {formatNumber(friends.length)} {friends.length === 1 ? "friend" : "friends"}
                </span>
              </div>
              <div className="dashboard-item-list">
                {friends.length ? (
                  friends.map((friend) => (
                    <Fragment key={friend.id}>
                      <article className="dashboard-data-card">
                        <span>
                          <strong>{friend.full_name}</strong>
                          <small>ID {friend.friend_code}</small>
                        </span>
                        {removeTarget === friend.id ? (
                          <div className="filter-list">
                            <button
                              className="button button-dark"
                              type="button"
                              disabled={busyId === friend.id}
                              onClick={() => handleRemove(friend)}
                            >
                              Remove friend
                            </button>
                            <button
                              className="button button-outline"
                              type="button"
                              onClick={() => setRemoveTarget(null)}
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <div className="filter-list">
                            <button
                              className="button button-outline"
                              type="button"
                              aria-expanded={chatIsOpen("friend", friend.id)}
                              onClick={() => toggleChat("friend", friend.id)}
                            >
                              {chatIsOpen("friend", friend.id) ? "Hide chat" : "Chat"}
                            </button>
                            <button
                              className="text-link"
                              type="button"
                              onClick={() => setRemoveTarget(friend.id)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </article>
                      {chatIsOpen("friend", friend.id) ? (
                        <Chat
                          friendId={friend.id}
                          title={friend.full_name}
                          subtitle="FRIEND CHAT"
                          participants={[{ id: friend.id, full_name: friend.full_name }]}
                          onClose={() => setOpenChat(null)}
                        />
                      ) : null}
                    </Fragment>
                  ))
                ) : friendsLoading ? null : (
                  <p className="dashboard-empty">
                    Your friends list is empty. Add someone with their six-digit ID above.
                  </p>
                )}
              </div>
            </div>
          </>
        ) : null}

        {tab === "teams" ? (
          <>
            <p
              className="hackathon-status"
              role="status"
              aria-live="polite"
              data-error={teamsStatus.error}
            >
              {teamsStatus.text}
              {teamsStatus.error ? (
                <>
                  {" "}
                  <button className="text-link hackathon-retry" type="button" onClick={loadTeams}>
                    Try again
                  </button>
                </>
              ) : null}
            </p>
            {!teamsLoading && !teamsStatus.error && !teams.length ? (
              <p className="dashboard-empty">
                You are not on a team yet. Register for a hackathon to form one.
              </p>
            ) : null}
            {teams.map(({ hackathon, team }) => (
              <div className="dashboard-data-section" key={hackathon.id}>
                <div className="section-heading dashboard-heading">
                  <div>
                    <p className="eyebrow">
                      {hackathon.title} · TEAM ID {teamCodeFrom(team.id)}
                    </p>
                    <h2>{team.name}</h2>
                  </div>
                  <span className="muted tiny">
                    {memberCount(team)} / {Number(team.size) || memberCount(team)} members
                  </span>
                </div>
                <div className="dashboard-item-list">
                  {(team.members || []).map((member) => (
                    <article className="dashboard-data-card" key={member.id}>
                      <span>
                        <strong>{member.full_name}</strong>
                        <small>
                          @{member.username}
                          {member.role === "leader" ? " · Leader" : ""}
                          {member.id === user?.id ? " · You" : ""}
                        </small>
                      </span>
                    </article>
                  ))}
                </div>
                <div className="filter-list">
                  <button
                    className="button button-outline"
                    type="button"
                    aria-expanded={chatIsOpen("team", team.id)}
                    onClick={() => toggleChat("team", team.id)}
                  >
                    {chatIsOpen("team", team.id) ? "Hide chat" : "Chat"}
                  </button>
                  <Link className="text-link" to={`/hackathons/${encodeURIComponent(hackathon.slug)}`}>
                    Open the hackathon <Arrow />
                  </Link>
                </div>
                {chatIsOpen("team", team.id) ? (
                  <Chat
                    teamId={team.id}
                    title={`${team.name} chat`}
                    subtitle={hackathon.title}
                    participants={(team.members || []).map((member) => ({
                      id: member.id,
                      full_name: member.full_name,
                    }))}
                    onClose={() => setOpenChat(null)}
                  />
                ) : null}
              </div>
            ))}
          </>
        ) : null}

        {tab === "reviews" ? <TeammateReviews /> : null}

        {tab === "reports" ? (
          <div className="dashboard-data-section">
            <div className="section-heading dashboard-heading">
              <div>
                <p className="eyebrow">REPORTS</p>
                <h2>Report a member.</h2>
              </div>
              <span className="muted tiny">Admins only</span>
            </div>
            <div className="friend-code-panel">
              <ReportForm context="Reported from The Huddle" />
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}
