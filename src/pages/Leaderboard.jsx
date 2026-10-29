import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Arrow } from "../components/Icons";
import LeaderboardRows from "../components/LeaderboardRows";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { leaderboard } from "../lib/demoData";
import { leaderboardStatusText, mapLeaderboard } from "../lib/leaderboard";
import { supabase } from "../lib/supabase";

export default function Leaderboard() {
  const [people, setPeople] = useState(leaderboard);
  const [status, setStatus] = useState("Loading leaderboard…");

  useEffect(() => {
    if (!supabase) {
      setStatus("Showing sample members. Configure Supabase to load live rankings.");
      return undefined;
    }

    let active = true;
    supabase
      .rpc("get_public_leaderboard")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (!data?.length) {
          setPeople(leaderboard);
          setStatus("No live rankings yet; showing sample members.");
          return;
        }
        const mapped = mapLeaderboard(data);
        setPeople(mapped);
        setStatus(leaderboardStatusText(mapped));
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load the leaderboard.", error);
        setPeople(leaderboard);
        setStatus("Live rankings are unavailable; showing sample members.");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageTitle title="Leaderboard | HackMate" />
      <main className="page-main wrap leaderboard-page">
        <PageIntro
          eyebrow="COMMUNITY SPOTLIGHT"
          title="Celebrate the doers."
          description="Every prototype, new skill, and teammate helped along the way counts. Meet some of the builders showing up this month."
        />
        <section className="leaderboard-stat-grid" aria-label="Leaderboard highlights">
          <article><span>TOP BUILDER</span><strong>{people[0]?.name || "—"}</strong><small>{people[0]?.points || "0"} points</small></article>
          <article><span>ACTIVE THIS MONTH</span><strong>{people.length || 0}</strong><small>ranked creators</small></article>
          <article><span>COMMUNITY SCORE</span><strong>{people.reduce((total, person) => total + (Number(person.score) || 0), 0).toLocaleString()}</strong><small>points earned</small></article>
        </section>
        <div className="leaderboard-page-layout">
          <section className="leaderboard-table">
            <div className="leaderboard-heading">
              <div>
                <strong>Campus creators</strong>
                <p className="tiny muted">Monthly community leaderboard</p>
              </div>
              <span className="filter-active">OCTOBER 2026</span>
            </div>
            <div className="rank-columns">
              <span>RANK</span>
              <span>BUILDER</span>
              <span>POINTS</span>
            </div>
            <p className="hackathon-status" role="status" aria-live="polite">
              {status}
            </p>
            <ol className="rank-list">
              <LeaderboardRows people={people} />
            </ol>
          </section>
          <aside className="leaderboard-aside">
            <span className="panel-star">✳</span>
            <h2>Your story belongs here.</h2>
            <p>
              Join a hackathon, find your people, and start earning points by making things that
              matter.
            </p>
            <Link to="/signup" className="button button-lime button-full">
              Join the community <Arrow />
            </Link>
          </aside>
        </div>
      </main>
    </>
  );
}
