function EventRow({ event, rating, toolsOpen, onToggleTools }) {
  const venue = [event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced";
  const dates = `${formatEventDate(event.starts_at)} – ${formatEventDate(event.ends_at)}`;
  const registered = Number(event.registered_count) || 0;
  const capacity = Number(event.capacity) || 0;

  // Review state. The admin's tier is the real one; the organizer's claim is
  // only shown when the two differ, so the row stays quiet in the common case.
  const reviewStatus = event.approval_status || "approved";
  const tier = Number(event.tier) || null;
  const claimedTier = Number(event.claimed_tier) || null;
  const statusLabel =
    reviewStatus === "pending"
      ? "Pending review"
      : reviewStatus === "rejected"
        ? "Rejected"
        : tier
          ? `Live · Tier ${tier}`
          : "Live";
  const tierNote =
    reviewStatus === "approved" && tier && claimedTier && tier !== claimedTier
      ? `Tier ${tier} (you chose Tier ${claimedTier})`
      : "";
  const ended = event.ends_at ? new Date(event.ends_at).getTime() <= Date.now() : false;
  return (
    <article className="dashboard-data-card">
      <span>
        <strong>{event.title}</strong>
        <small>{venue}</small>
        <span className="organizer-event-meta">
          <span>{dates}</span>
          <span>{capacity ? `${registered} of ${capacity} registered` : `${registered} registered`}</span>
          <span>{formatPrice(event.price)}</span>
          {tierNote ? <span>{tierNote}</span> : null}
          {ended ? (
