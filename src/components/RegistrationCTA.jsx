import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatPrice } from "../lib/format";
import { fetchRegistrationInfo, isFull, registeredCount } from "../lib/registrations";
import { listHackathonTeams, myTeamFrom, teamCodeFrom } from "../lib/teams";
import { Arrow } from "./Icons";

// The sidebar card on a hackathon page: registration status, current team, and
// the single call to action that opens the registration page.
export default function RegistrationCTA({ hackathon, slug }) {
  const { session, user } = useAuth();
  const [info, setInfo] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!hackathon?.id) return;
    setLoading(true);
    setFailed(false);
    try {
      const [infoData, teamRows] = await Promise.all([
        fetchRegistrationInfo(hackathon.id),
        listHackathonTeams(hackathon.id),
      ]);
      setInfo(infoData);
      setTeams(teamRows);
    } catch (requestError) {
      console.error("Could not load registration status.", requestError);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [hackathon?.id]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const registerHref = `/hackathons/${encodeURIComponent(slug)}/register`;
  const myTeam = myTeamFrom(teams, user?.id);
  const registered = Boolean(info?.my_registration) || Boolean(myTeam);
  const price = Number(info?.price ?? hackathon?.price) || 0;
  const capacity = Number(info?.capacity) || 0;

  if (!session) {
    return (
      <>
        <Link
          className="button button-dark button-full"
          to={`/login?redirect=${encodeURIComponent(registerHref)}`}
        >
          Log in to register <Arrow />
        </Link>
        <p className="muted tiny centered">Create a free account to register and form a team.</p>
      </>
    );
  }

  if (loading) {
    return <p className="registration-status">Checking your registration…</p>;
  }

  if (failed) {
    return (
      <p className="registration-status" data-error="true">
        Registration status couldn’t be loaded.{" "}
        <button
          className="text-link hackathon-retry"
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
        >
          Try again
        </button>
      </p>
    );
  }

  if (registered) {
    return (
      <>
        <p className="registration-status" data-state="registered">
          You are registered{info?.paid ? " · payment complete" : ""}.
        </p>
        {myTeam ? (
          <p className="muted tiny centered">
            Team “{myTeam.name}” · ID {teamCodeFrom(myTeam.id)} ·{" "}
            {(myTeam.members || []).length}/{Number(myTeam.max_members ?? myTeam.size) || "?"}{" "}
            members
          </p>
        ) : (
          <p className="muted tiny centered">You haven’t chosen a team yet.</p>
        )}
        <Link className="button button-dark button-full" to={registerHref}>
          Manage team <Arrow />
        </Link>
      </>
    );
  }

  if (isFull(info)) {
    return (
      <button className="button button-dark button-full" type="button" disabled>
        Full
      </button>
    );
  }

  return (
    <>
      <Link className="button button-dark button-full" to={registerHref}>
        Register for this hackathon <Arrow />
      </Link>
      <p className="muted tiny centered">
        {price > 0 ? `Entry fee ${formatPrice(price)} · ` : ""}
        {capacity
          ? `${registeredCount(info)} of ${capacity} registered`
          : `${registeredCount(info)} registered`}
      </p>
    </>
  );
}
