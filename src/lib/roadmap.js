// Calls HackMate's own roadmap route. The AI key stays on the server, and the
// returned plan is only ever held in component state until the user acts on it.
export async function requestRoadmap(brief) {
  const response = await fetch("/api/roadmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.error === "string" && data.error
        ? data.error
        : "The roadmap service is unavailable right now. Try again.";
    throw new Error(message);
  }

  if (!Array.isArray(data?.phases) || !data.phases.length) {
    throw new Error("The roadmap service returned an unexpected response. Try again.");
  }

  return data;
}

export function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
