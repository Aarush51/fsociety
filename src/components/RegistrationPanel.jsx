import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FriendCodeInput from "./FriendCodeInput";
import HackathonTeamPanel from "./HackathonTeamPanel";
import { Arrow } from "./Icons";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import { formatPrice, shortName } from "../lib/format";
import { countProfileSkills, fetchMyProfileExtras } from "../lib/profiles";
import {
  acceptInvite,
  declineInvite,
  fetchMyTeamState,
  fetchRegistrationInfo,
  isFull,
  reduceTeamSize,
  registerForHackathon,
  registeredCount,
} from "../lib/registrations";
import { sizeRuleMessage, teamSizeChoices, teamSizeName } from "../lib/teamSizes";
import { startRegistrationPayment } from "../features/payments/startRegistrationPayment";

export default function RegistrationPanel({ hackathon, slug }) {
  const { user, session } = useAuth();
  const { organization } = useOrganization();
  const [info, setInfo] = useState(null);
  const [teamState, setTeamState] = useState(null);
  const [teamError, setTeamError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [size, setSize] = useState(null);
  const [useFriends, setUseFriends] = useState(false);
  const [useMatching, setUseMatching] = useState(false);
  const [friends, setFriends] = useState([]);
  const [skillCount, setSkillCount] = useState(null);

  const hackathonId = hackathon?.id;
  // The RPC returns the authoritative price, capacity and team size; fall back
  // to the row while it is still loading.
  const price = Number(info?.price ?? hackathon?.price) || 0;
  const capacity = Number(info?.capacity) || 0;
  const maxSize = Number(info?.team_size_max ?? hackathon?.team_size_max) || 4;
  const choices = teamSizeChoices(maxSize);
  const isOwner = Boolean(
    organization?.id && hackathon?.organization_id && organization.id === hackathon.organization_id,
  );
  const registration = teamState?.registration || info?.my_registration || null;
  const invites = (teamState?.invites_for_me || []).filter((invite) => invite.status === "pending");
  const hasTeam = Boolean(teamState?.team);
  const matchingSpots = useMatching && size ? Math.max(size - 1 - friends.length, 0) : 0;

  const loadInfo = useCallback(async () => {
    if (!hackathonId) return;
    setLoading(true);
    setError(null);
    try {
      setInfo(await fetchRegistrationInfo(hackathonId));
    } catch (requestError) {
      console.error("Could not load registrations for this hackathon.", requestError);
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [hackathonId]);

  const loadTeam = useCallback(async () => {
    if (!hackathonId || !user) {
      setTeamState(null);
      setTeamError(false);
      return;
    }
    try {
      setTeamState(await fetchMyTeamState(hackathonId));
      setTeamError(false);
    } catch (requestError) {
      console.error("Could not load your team for this hackathon.", requestError);
      setTeamError(true);
    }
  }, [hackathonId, user]);

  useEffect(() => {
    loadInfo();
    loadTeam();
  }, [loadInfo, loadTeam]);

  // While skill matching is still looking, refresh the team quietly so newly
  // matched teammates appear without a manual reload.
  useEffect(() => {
    if (!user || !teamState?.waiting_for_match) return undefined;
    const timer = setInterval(() => {
      loadTeam();
    }, 20000);
    return () => clearInterval(timer);
  }, [user, teamState?.waiting_for_match, loadTeam]);

  // Only asked once, and only when the skill-based matching note is shown.
  useEffect(() => {
    if (step !== 3 || !useMatching || skillCount !== null) return undefined;
    let active = true;
    fetchMyProfileExtras()
      .then((extras) => {
        if (active) setSkillCount(countProfileSkills(extras));
      })
      .catch((requestError) => {
        console.error("Could not load your skills.", requestError);
        if (active) setSkillCount(0);
      });
    return () => {
      active = false;
    };
  }, [step, useMatching, skillCount]);

  const resetFlow = () => {
    setStep(0);
    setSize(null);
    setUseFriends(false);
    setUseMatching(false);
    setFriends([]);
    setMessage({ text: "", error: false });
  };

  const goToStepTwo = () => {
    if (!size) {
      setMessage({ text: "Choose a team size first.", error: true });
      return;
    }
    setMessage({ text: "", error: false });
    setStep(size === 1 ? 4 : 2);
  };

  const goToStepThree = () => {
    if (size > 1 && !useFriends && !useMatching) {
      setMessage({
        text: "Choose add friends by ID, skill-based matching, or both to fill your team.",
        error: true,
      });
      return;
    }
    setMessage({ text: "", error: false });
    setStep(3);
  };

  const handleFriendAdded = (member) => {
    if (friends.length >= size - 1) {
      setMessage({
        text: `Your ${teamSizeName(size)} team only has ${size - 1} ${
          size - 1 === 1 ? "spot" : "spots"
        } for friends. Remove one to add someone else.`,
        error: true,
      });
      return;
    }
    setFriends((current) =>
      current.some((friend) => friend.id === member.id) ? current : [...current, member],
    );
    setMessage({ text: "", error: false });
  };

  const removeFriend = (friendId) => {
    setFriends((current) => current.filter((friend) => friend.id !== friendId));
    setMessage({ text: "", error: false });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user || submitting || !size) return;

    if (friends.length > size - 1) {
      setMessage({
        text: `You picked ${teamSizeName(size)} (${size}) but added ${friends.length} friends. Remove one or choose a bigger team.`,
        error: true,
      });
      return;
    }

    if (friends.length + matchingSpots < size - 1) {
      setMessage({ text: sizeRuleMessage(size, friends.length), error: true });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "", error: false });
    try {
      if (isFull(info)) {
        setMessage({ text: "This hackathon just filled up.", error: true });
        await loadInfo();
        return;
      }
      let paid = false;
      if (price > 0) {
        // Keep the placeholder payment; swap in Razorpay before marking paid.
        const payment = await startRegistrationPayment(hackathonId);
        if (payment?.status !== "paid") {
          setMessage({
            text: "Payment was not completed, so your seat is not reserved yet.",
            error: true,
          });
          return;
        }
        paid = true;
      }
      await registerForHackathon({
        hackathonId,
        size,
        friendCodes: friends.map((friend) => friend.friend_code),
        useMatching,
        paid,
      });
      await Promise.all([loadInfo(), loadTeam()]);
      resetFlow();
      setMessage({
        text: "You're registered. Your team is ready for invites and matching.",
        error: false,
      });
    } catch (registerError) {
      setMessage({
        text: registerError.message || "You could not be registered. Please try again.",
        error: true,
      });
      if (registerError?.code === "23505") await loadInfo();
    } finally {
      setSubmitting(false);
    }
  };

  const runTeamAction = async (action, successText) => {
    setBusy(true);
    setMessage({ text: "", error: false });
    try {
      await action();
      await Promise.all([loadInfo(), loadTeam()]);
      setMessage({ text: successText, error: false });
    } catch (actionError) {
      setMessage({
        text: actionError.message || "That could not be saved. Please try again.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = (inviteId) =>
    runTeamAction(() => acceptInvite(inviteId), "You joined the team. See you at the venue!");
  const handleDecline = (inviteId) =>
    runTeamAction(() => declineInvite(inviteId), "Invite declined.");
  const handleReduce = (teamId) =>
    runTeamAction(() => reduceTeamSize(teamId), "Team size updated.");

  return (
    <div className="registration-panel">
      {capacity ? (
        <div className="registration-count">
          <strong>
            {registeredCount(info)} / {capacity}
          </strong>
          <span>registered</span>
        </div>
      ) : null}

      {loading ? (
        <p className="registration-status">Checking available spots…</p>
      ) : error ? (
        <p className="registration-status" data-error="true">
          Spots could not be loaded.{" "}
          <button className="text-link hackathon-retry" type="button" onClick={() => loadInfo()}>
            Try again
          </button>
        </p>
      ) : isOwner ? (
        <p className="registration-status">This is your hackathon — registration is for participants.</p>
      ) : !session ? (
        <>
          <Link
            className="button button-dark button-full"
            to={`/login?redirect=${encodeURIComponent(`/hackathons/${slug}`)}`}
          >
            Log in to register <Arrow />
          </Link>
          <p className="muted tiny centered">Create a free account to register and form your team.</p>
        </>
      ) : registration || hasTeam || invites.length ? (
        <>
          {registration ? (
            <p className="registration-status" data-state="registered">
              You are registered{registration.paid ? " · payment complete" : ""}.
            </p>
          ) : null}
          <HackathonTeamPanel
            teamState={teamState}
            busy={busy}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onReduce={handleReduce}
            onRefresh={loadTeam}
          />
          {teamError ? (
            <p className="registration-status" data-error="true">
              Your team could not be loaded. Make sure the team SQL migration has been applied.
            </p>
          ) : null}
        </>
      ) : isFull(info) ? (
        <button className="button button-dark button-full" type="button" disabled>
          Full
        </button>
      ) : (
        <div className="registration-flow">
          {step === 0 ? (
            <button
              className="button button-dark button-full"
              type="button"
              onClick={() => {
                setMessage({ text: "", error: false });
                setStep(1);
              }}
            >
              Register and form your team <Arrow />
            </button>
          ) : null}

          {step > 0 ? (
            <p className="eyebrow">REGISTER AND FORM YOUR TEAM · STEP {step} OF 4</p>
          ) : null}

          {step === 1 ? (
            <>
              <p className="muted small">How many people are you building with?</p>
              <div className="filter-list" role="group" aria-label="Team size">
                {choices.map((option) => (
                  <button
                    key={option.size}
                    className={`${
                      size === option.size ? "filter-active" : "skill"
                    } hackathon-theme`}
                    type="button"
                    aria-pressed={size === option.size}
                    onClick={() => {
                      setSize(option.size);
                      setMessage({ text: "", error: false });
                    }}
                  >
                    {option.name} ({option.size})
                  </button>
                ))}
              </div>
              <button
                className="button button-dark button-full"
                type="button"
                onClick={goToStepTwo}
                disabled={!size}
              >
                Continue <Arrow />
              </button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="muted small">
                How do you want to fill the other {size - 1} {size - 1 === 1 ? "spot" : "spots"}?
                You can use both.
              </p>
              <div className="filter-list" role="group" aria-label="How to fill your team">
                <button
                  className={`${useFriends ? "filter-active" : "skill"} hackathon-theme`}
                  type="button"
                  aria-pressed={useFriends}
                  onClick={() => {
                    setUseFriends((current) => !current);
                    setMessage({ text: "", error: false });
                  }}
                >
                  Add friends by ID
                </button>
                <button
                  className={`${useMatching ? "filter-active" : "skill"} hackathon-theme`}
                  type="button"
                  aria-pressed={useMatching}
                  onClick={() => {
                    setUseMatching((current) => !current);
                    setMessage({ text: "", error: false });
                  }}
                >
                  Skill-based matching
                </button>
              </div>
              <div className="org-form-actions">
                <button className="button button-outline" type="button" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="button button-dark" type="button" onClick={goToStepThree}>
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              {useFriends ? (
                <>
                  <p className="muted small">
                    Add up to {size - 1} {size - 1 === 1 ? "friend" : "friends"} by their six-digit
                    ID.
                  </p>
                  <FriendCodeInput
                    id="team-friend-lookup"
                    label="Friend ID"
                    confirmLabel="Add to team"
                    addedIds={friends.map((friend) => friend.id)}
                    onConfirm={handleFriendAdded}
                    disabled={submitting}
                  />
                  {friends.length ? (
                    <div className="dashboard-item-list">
                      {friends.map((friend) => (
                        <article className="dashboard-data-card" key={friend.id}>
                          <span>
                            <strong>{shortName(friend.full_name)}</strong>
                            <small>{friend.friend_code}</small>
                          </span>
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => removeFriend(friend.id)}
                          >
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}

              {useMatching ? (
                <>
                  <p className="muted small">
                    We’ll match you automatically with people whose skills complement yours as
                    more people register. You can invite friends as well.
                  </p>
                  {skillCount === 0 ? (
                    <p className="registration-status" data-error="true">
                      You have no skills on your profile yet.{" "}
                      <Link className="text-link" to="/profile">
                        Add skills
                      </Link>{" "}
                      so the organizer can match you.
                    </p>
                  ) : null}
                </>
              ) : null}

              <div className="org-form-actions">
                <button className="button button-outline" type="button" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  className="button button-dark"
                  type="button"
                  onClick={() => {
                    setMessage({ text: "", error: false });
                    setStep(4);
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <p className="muted small">
                {teamSizeName(size)} ({size})
                {friends.length
                  ? ` · ${friends.length} ${friends.length === 1 ? "friend" : "friends"} invited`
                  : ""}
                {matchingSpots
                  ? ` · ${matchingSpots} ${matchingSpots === 1 ? "spot" : "spots"} matched by skills`
                  : ""}
              </p>
              {price > 0 ? (
                <p className="muted tiny">
                  Entry fee {formatPrice(price)} · collected before your seat is reserved.
                </p>
              ) : null}
              <div className="org-form-actions">
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => setStep(size === 1 ? 1 : 3)}
                >
                  Back
                </button>
                <button
                  className="button button-dark"
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting
                    ? "Registering…"
                    : price > 0
                      ? `Pay and register · ${formatPrice(price)}`
                      : "Confirm registration"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      <p
        className="registration-status"
        role="status"
        aria-live="polite"
        data-error={message.error}
      >
        {message.text}
      </p>
    </div>
  );
}
