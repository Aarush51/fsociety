import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Arrow } from "./Icons";
import { useAuth } from "../context/AuthContext";
import { useOrganization } from "../context/OrganizationContext";
import { formatPrice } from "../lib/format";
import {
  fetchRegistrationInfo,
  isFull,
  registerForHackathon,
  registeredCount,
} from "../lib/registrations";
import { startRegistrationPayment } from "../features/payments/startRegistrationPayment";

export default function RegistrationPanel({ hackathon, slug }) {
  const { user, session } = useAuth();
  const { organization } = useOrganization();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState({ text: "", error: false });
  const [submitting, setSubmitting] = useState(false);

  const hackathonId = hackathon?.id;
  // The RPC returns the authoritative price and capacity; fall back to the row
  // while it is still loading.
  const price = Number(info?.price ?? hackathon?.price) || 0;
  const capacity = Number(info?.capacity) || 0;
  // Organizers never register for their own hackathon.
  const isOwner = Boolean(
    organization?.id && hackathon?.organization_id && organization.id === hackathon.organization_id,
  );

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

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const registration = info?.my_registration || null;
  const full = isFull(info);

  const handleRegister = async () => {
    if (!user) return;
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
      const saved = await registerForHackathon({ hackathonId, userId: user.id, paid });
      setInfo((current) => ({
        ...current,
        my_registration: saved,
        registered_count: registeredCount(current) + 1,
      }));
      setMessage({ text: "You're registered. See you at the venue!", error: false });
    } catch (registerError) {
      setMessage({
        text: registerError.message || "You could not be registered. Please try again.",
        error: true,
      });
      // A duplicate means the row already exists, so reload and show that state.
      if (registerError?.code === "23505") await loadInfo();
    } finally {
      setSubmitting(false);
    }
  };

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
          <p className="muted tiny centered">Create a free account to register and find a team.</p>
        </>
      ) : registration ? (
        <p className="registration-status" data-state="registered">
          You are registered{registration.paid ? " · payment complete" : ""}.
        </p>
      ) : full ? (
        <button className="button button-dark button-full" type="button" disabled>
          Full
        </button>
      ) : (
        <button
          className="button button-dark button-full"
          type="button"
          onClick={handleRegister}
          disabled={submitting}
        >
          {submitting ? "Registering…" : price > 0 ? `Register · ${formatPrice(price)}` : "Register for free"}
        </button>
      )}

      {!loading && !error && !isOwner && !registration && !full && price > 0 ? (
        <p className="muted tiny centered">Entry fee {formatPrice(price)} · paid at checkout.</p>
      ) : null}
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
