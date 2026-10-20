import { Link } from "react-router-dom";
import { Arrow } from "../components/Icons";
import PageTitle from "../components/PageTitle";

export default function NotFound() {
  return (
    <>
      <PageTitle title="Page not found | HackMate" />
      <main className="not-found">
        <p className="eyebrow">404 · PAGE NOT FOUND</p>
        <h1>This page is still a work in progress.</h1>
        <p className="muted">
          Let's get you back to finding good people and great ideas.
        </p>
        <Link className="button button-dark" to="/">
          Back to HackMate <Arrow />
        </Link>
      </main>
    </>
  );
}
