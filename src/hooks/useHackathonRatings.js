import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchHackathonRating } from "../lib/reviews";

// Sample/demo cards carry no uuid; only real rows are worth a lookup.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// { [hackathon uuid]: { average, count } } for a list of hackathon rows or
// card objects (hackathonCardData keeps the uuid on `.uuid`, raw rows on `.id`).
// The rating RPCs are authenticated-only by design, so signed-out visitors
// simply see cards without a rating instead of an error.
export default function useHackathonRatings(cards) {
  const { session } = useAuth();
  const signedIn = Boolean(session);
  const [ratings, setRatings] = useState({});

  const key = [
    ...new Set(
      (cards || [])
        .map((card) => card?.uuid || card?.id)
        .filter((id) => UUID.test(id)),
    ),
  ].join(",");

  useEffect(() => {
    let active = true;
    const ids = key ? key.split(",") : [];

    if (!signedIn || !ids.length) {
      setRatings({});
      return undefined;
    }

    Promise.all(ids.map(async (id) => ({ id, rating: await fetchHackathonRating(id) })))
      .then((entries) => {
        if (!active) return;
        setRatings(
          Object.fromEntries(
            entries.filter((entry) => entry.rating && Number(entry.rating.count) > 0),
          ),
        );
      })
      .catch((requestError) => {
        console.error("Could not load hackathon ratings.", requestError);
        if (active) setRatings({});
      });

    return () => {
      active = false;
    };
  }, [key, signedIn]);

  return ratings;
}
