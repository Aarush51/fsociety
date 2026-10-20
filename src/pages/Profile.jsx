import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { formatNumber, formatReputation, initialsFromName } from "../lib/format";
import { supabase } from "../lib/supabase";

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState({ full_name: "", username: "", bio: "" });
  const [skills, setSkills] = useState([]);
  const [stats, setStats] = useState(null);
  const [skillInput, setSkillInput] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "Loading your profile…", error: false });

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    setMessage({ text: "Loading your profile…", error: false });
    supabase
      .rpc("get_my_profile")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (!data) throw new Error("Your profile could not be found.");
        setForm({
          full_name: data.full_name || "",
          username: data.username || "",
          bio: data.bio || "",
        });
        setSkills(data.skills || []);
        setStats(data);
        setReady(true);
        setMessage({ text: "", error: false });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Could not load the profile.", error);
        setMessage({
          text: error.message || "Could not load your profile. Try again.",
          error: true,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const addSkill = () => {
    const name = skillInput.trim();
    if (!name) return;
    if (name.length > 80) {
      setMessage({ text: "Skills must be 80 characters or fewer.", error: true });
      return;
    }
    if (skills.some((skill) => skill.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMessage({ text: "That skill is already on your profile.", error: true });
      return;
    }
    if (skills.length >= 20) {
      setMessage({ text: "You can add up to 20 skills.", error: true });
      return;
    }
    setSkills([...skills, name]);
    setSkillInput("");
    setMessage({ text: "", error: false });
  };

  const removeSkill = (index) => {
    setSkills(skills.filter((_skill, skillIndex) => skillIndex !== index));
    setMessage({ text: "", error: false });
  };

  const handleSkillKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addSkill();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!supabase || !ready) return;
    setSaving(true);
    setMessage({ text: "Saving your profile…", error: false });
    try {
      const { error } = await supabase.rpc("save_my_profile", {
        p_full_name: form.full_name.trim(),
        p_username: form.username.trim(),
        p_bio: form.bio.trim(),
        p_skills: skills,
      });
      if (error) throw error;
      setForm({
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        bio: form.bio.trim(),
      });
      setMessage({ text: "Your profile has been saved.", error: false });
    } catch (error) {
      console.error("Could not save the profile.", error);
      setMessage({
        text: error.message || "Could not save your profile. Try again.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !ready || saving;
  const displayName = ready ? form.full_name || "Your profile" : "Edit your profile";

  return (
    <>
      <PageTitle title="Profile | HackMate" />
      <main className="page-main wrap">
        <PageIntro
          eyebrow="YOUR CORNER OF THE COMMUNITY"
          title="A profile that feels like you."
          description="Share the skills you bring, what you want to learn, and the kinds of projects you'd love to build."
        />
        <div className="profile-layout">
          <section className="profile-about">
            <div className="profile-card-top">
              <span className="avatar avatar-large lime" id="profile-avatar">
                {ready ? initialsFromName(form.full_name) : "HM"}
              </span>
              <span className="status-label">YOUR PROFILE</span>
            </div>
            <h2 id="profile-heading">{displayName}</h2>
            <p className="muted small" id="profile-email">
              {user?.email || ""}
            </p>
            <form id="profile-form" onSubmit={handleSubmit}>
              <label htmlFor="profile-full-name">Full name</label>
              <input
                id="profile-full-name"
                name="full_name"
                autoComplete="name"
                maxLength="100"
                required
                disabled={disabled}
                value={form.full_name}
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              />
              <label htmlFor="profile-username">Username</label>
              <input
                id="profile-username"
                name="username"
                autoComplete="username"
                minLength="3"
                maxLength="30"
                pattern="[A-Za-z0-9_]+"
                required
                disabled={disabled}
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
              />
              <label htmlFor="profile-bio-input">Bio</label>
              <textarea
                id="profile-bio-input"
                name="bio"
                maxLength="500"
                rows="4"
                disabled={disabled}
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
              />
              <label htmlFor="profile-skill-input">Skills</label>
              <div id="profile-skill-list" className="profile-skill-list" aria-live="polite">
                {skills.length ? (
                  skills.map((skill, index) => (
                    <span className="skill" key={`${skill}-${index}`}>
                      {skill}
                      <button
                        type="button"
                        data-remove-skill={index}
                        aria-label={`Remove ${skill}`}
                        onClick={() => removeSkill(index)}
                        disabled={disabled}
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="muted tiny">No skills added yet.</span>
                )}
              </div>
              <div className="profile-skill-entry">
                <input
                  id="profile-skill-input"
                  type="text"
                  maxLength="80"
                  placeholder="Add a skill and press Enter"
                  disabled={disabled}
                  value={skillInput}
                  onChange={(event) => setSkillInput(event.target.value)}
                  onKeyDown={handleSkillKeyDown}
                />
                <button
                  id="profile-add-skill"
                  className="button button-outline"
                  type="button"
                  onClick={addSkill}
                  disabled={disabled}
                >
                  Add
                </button>
              </div>
              <p className="muted tiny">Add up to 20 skills. Each skill can be up to 80 characters.</p>
              <button className="button button-dark button-full" type="submit" disabled={disabled}>
                Save profile
              </button>
              <p
                id="profile-message"
                className="form-message"
                role="status"
                aria-live="polite"
                data-error={message.error}
              >
                {message.text}
              </p>
            </form>
          </section>
          <div className="profile-side">
            <section className="profile-stats" aria-label="Your HackMate stats">
              <article>
                <span className="eyebrow">COIN BALANCE</span>
                <strong id="profile-coins">{stats ? formatNumber(stats.coin_balance) : "—"}</strong>
                <span className="muted tiny">coins</span>
              </article>
              <article>
                <span className="eyebrow">REPUTATION</span>
                <strong id="profile-reputation">
                  {stats ? formatReputation(stats.reputation) : "—"}
                </strong>
                <span id="profile-review-count" className="muted tiny">
                  {stats
                    ? `${Number(stats.review_count) || 0} ${Number(stats.review_count) === 1 ? "review" : "reviews"}`
                    : "Based on reviews"}
                </span>
              </article>
            </section>
            <section className="dark-callout">
              <p className="eyebrow light-eyebrow">LOOKING TO BUILD</p>
              <h2>Tools that make student life a little easier.</h2>
              <p>
                Interested in education, climate, and creative projects. Always happy to try a new
                idea or learn a new tool.
              </p>
            </section>
            <section className="profile-activity">
              <p className="eyebrow">RECENT ACTIVITY</p>
              <strong>Ready for a first hackathon</strong>
              <p className="muted small">
                There's always a first project. Make this one yours.
              </p>
              <Link className="text-link" to="/hackathons">
                Browse hackathons <Arrow />
              </Link>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
