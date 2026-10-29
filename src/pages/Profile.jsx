import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DraftRestoredNote from "../components/DraftRestoredNote";
import useFormDraft from "../hooks/useFormDraft";
import { SkillsFields, cleanHobbies, cleanInterests, cleanSkillLevels } from "../features/teams";
import { Arrow } from "../components/Icons";
import PageIntro from "../components/PageIntro";
import PageTitle from "../components/PageTitle";
import { formatEventDate, formatNumber, initialsFromName } from "../lib/format";
import { supabase } from "../lib/supabase";

const EMPTY_PROFILE_DRAFT = {
  full_name: "",
  username: "",
  bio: "",
  skills: [],
  skill_levels: {},
  interests: [],
  hobbies: "",
};

const COIN_PAGE_SIZE = 10;
const COIN_MAX_LIMIT = 200;
const TRANSACTION_LABELS = {
  earned: "Earned",
  spent: "Spent",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default function Profile() {
  const { user } = useAuth();
  // Every editable field the page owns lives in one draft, so a refresh keeps
  // the edits. The draft waits for the stored profile (and its extras) so it is
  // always merged over complete server values instead of blank fields.
  const [serverProfile, setServerProfile] = useState(null);
  const [extrasSettled, setExtrasSettled] = useState(false);
  const [values, setValues, clearDraft, draftRestored] = useFormDraft(
    `profile.${user?.id ?? "anonymous"}`,
    serverProfile ?? EMPTY_PROFILE_DRAFT,
    { enabled: Boolean(serverProfile) && extrasSettled },
  );
  const form = values;
  const skills = values.skills;
  const skillLevels = values.skill_levels;
  const interests = values.interests;
  const hobbies = values.hobbies;
  const [skillInput, setSkillInput] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "Loading your profile…", error: false });
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState(null);
  const [coinLimit, setCoinLimit] = useState(COIN_PAGE_SIZE);
  const [historyKey, setHistoryKey] = useState(0);
  const [extrasLoaded, setExtrasLoaded] = useState(false);
  const [extrasMessage, setExtrasMessage] = useState({ text: "", error: false });

  const setField = (field) => (value) =>
    setValues((current) => ({
      ...current,
      [field]: typeof value === "function" ? value(current[field]) : value,
    }));
  const setForm = (next) => setValues((current) => ({ ...current, ...next }));
  const setSkills = setField("skills");
  const setSkillLevels = setField("skill_levels");
  const setInterests = setField("interests");
  const setHobbies = setField("hobbies");

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
        // This is the base a restored draft is merged over, not the form state.
        setServerProfile((current) => ({
          ...EMPTY_PROFILE_DRAFT,
          ...(current || {}),
          full_name: data.full_name || "",
          username: data.username || "",
          bio: data.bio || "",
          skills: data.skills || [],
        }));
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

  // The caller's own coin ledger, newest first. The RPC caps the page at 200 rows.
  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    setLedgerLoading(true);
    setLedgerError(null);
    supabase
      .rpc("get_my_coin_transactions", { p_limit: coinLimit })
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        setLedger({
          balance: Number(data?.balance) || 0,
          transaction_count: Number(data?.transaction_count) || 0,
          transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        });
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load the coin ledger.", requestError);
        setLedger(null);
        setLedgerError(requestError);
      })
      .finally(() => {
        if (active) setLedgerLoading(false);
      });

    return () => {
      active = false;
    };
  }, [coinLimit, historyKey]);

  // Skills with levels, interests and hobbies come from their own RPC, so the
  // free-text skills list above keeps working exactly as it did before.
  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    setExtrasMessage({ text: "", error: false });
    // The saved draft unlocks once this lookup settles. A request that never
    // answers must not keep the profile waiting, so the form unlocks anyway and
    // the level fields stay read-only (and are not saved) until they load.
    const unlockDraft = setTimeout(() => {
      if (active) setExtrasSettled(true);
    }, 8000);
    supabase
      .rpc("get_my_profile_extras")
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) throw requestError;
        setServerProfile((current) => ({
          ...EMPTY_PROFILE_DRAFT,
          ...(current || {}),
          skill_levels: cleanSkillLevels(data?.skill_levels),
          interests: cleanInterests(data?.interests),
          hobbies: cleanHobbies(data?.hobbies),
        }));
        setExtrasLoaded(true);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Could not load skills, interests and hobbies.", requestError);
        // Keep the empty defaults and leave the fields locked: saving now would
        // overwrite whatever is stored with empty values.
        setExtrasLoaded(false);
        setExtrasMessage({
          text: requestError.message || "Skills, interests and hobbies could not be loaded.",
          error: true,
        });
      })
      .finally(() => {
        // A failed lookup still unlocks the profile draft: the rest of the form
        // is editable and should not lose what someone typed.
        clearTimeout(unlockDraft);
        if (active) setExtrasSettled(true);
      });

    return () => {
      active = false;
      clearTimeout(unlockDraft);
    };
  }, [historyKey]);

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
      const trimmedName = form.full_name.trim();
      const trimmedUsername = form.username.trim();
      const trimmedBio = form.bio.trim();
      const { error } = await supabase.rpc("save_my_profile", {
        p_full_name: trimmedName,
        p_username: trimmedUsername,
        p_bio: trimmedBio,
        p_skills: skills,
      });
      if (error) throw error;
      let savedValues = {
        ...values,
        full_name: trimmedName,
        username: trimmedUsername,
        bio: trimmedBio,
      };
      setMessage({ text: "Your profile has been saved.", error: false });

      // The level-based fields save in their own call: the profile itself is
      // already stored, so a problem here never loses the rest of the edits.
      if (extrasLoaded) {
        try {
          const { data: saved, error: extrasError } = await supabase.rpc("save_my_profile_extras", {
            p_skill_levels: cleanSkillLevels(skillLevels),
            p_interests: cleanInterests(interests),
            p_hobbies: hobbies.trim(),
          });
          if (extrasError) throw extrasError;
          savedValues = {
            ...savedValues,
            skill_levels: cleanSkillLevels(saved?.skill_levels),
            interests: cleanInterests(saved?.interests),
            hobbies: cleanHobbies(saved?.hobbies),
          };
          setExtrasMessage({ text: "", error: false });
        } catch (extrasError) {
          console.error("Could not save skills, interests and hobbies.", extrasError);
          setExtrasMessage({
            text: extrasError.message || "Skills, interests and hobbies could not be saved.",
            error: true,
          });
        }
      }
      // The profile is stored, so the saved draft has nothing left to restore.
      clearDraft(savedValues);
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

  // Editing waits for the whole profile (including skills, interests and
  // hobbies) so a saved draft is always merged over real values and nothing
  // typed during the load can be overwritten.
  const disabled = !ready || !extrasSettled || saving;
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
            {draftRestored ? (
              <DraftRestoredNote
                onStartOver={() => {
                  clearDraft();
                  setMessage({ text: "", error: false });
                }}
              />
            ) : null}
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
              <div className="tf-profile-section">
                <p className="eyebrow">SKILL LEVELS, INTERESTS AND HOBBIES</p>
                <SkillsFields
                  id="profile-skills-fields"
                  skillLevels={skillLevels}
                  interests={interests}
                  hobbies={hobbies}
                  onSkillLevelsChange={setSkillLevels}
                  onInterestsChange={setInterests}
                  onHobbiesChange={setHobbies}
                  disabled={disabled || !extrasLoaded}
                />
                <p
                  id="profile-extras-message"
                  className="form-message"
                  role="status"
                  aria-live="polite"
                  data-error={extrasMessage.error}
                >
                  {extrasMessage.text}
                </p>
              </div>
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
        <section className="dashboard-data-section" aria-label="Coin history">
            <div className="section-heading">
              <div>
                <p className="eyebrow">COIN HISTORY</p>
                <h2>How you earned.</h2>
              </div>
              {ledger ? (
                <span className="muted tiny">
                  {formatNumber(ledger.transaction_count)}{" "}
                  {ledger.transaction_count === 1 ? "transaction" : "transactions"}
                </span>
              ) : null}
            </div>
            <div id="profile-coin-ledger" className="profile-history-list" aria-live="polite">
              {ledgerLoading ? (
                <p className="dashboard-empty">Loading your coin history…</p>
              ) : ledgerError ? (
                <p className="dashboard-empty">
                  Your coin history couldn’t be loaded.{" "}
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => setHistoryKey((key) => key + 1)}
                  >
                    Try again
                  </button>
                </p>
              ) : ledger?.transactions.length ? (
                ledger.transactions.map((transaction) => (
                  <article className="profile-coin-row" key={transaction.id}>
                    <div>
                      <strong>
                        {transaction.description ||
                          TRANSACTION_LABELS[transaction.transaction_type] ||
                          "Coin activity"}
                      </strong>
                      <small>
                        {TRANSACTION_LABELS[transaction.transaction_type] ||
                          transaction.transaction_type}{" "}
                        · {formatEventDate(transaction.created_at)}
                      </small>
                    </div>
                    <span
                      className={`profile-coin-amount ${Number(transaction.amount) < 0 ? "negative" : "positive"}`}
                    >
                      {Number(transaction.amount) < 0 ? "−" : "+"}
                      {formatNumber(Math.abs(Number(transaction.amount) || 0))}
                    </span>
                  </article>
                ))
              ) : (
                <p className="dashboard-empty">
                  No coin activity yet. Join a hackathon and contribute to start earning.
                </p>
              )}
            </div>
            {ledger && ledger.transactions.length < ledger.transaction_count ? (
              coinLimit < COIN_MAX_LIMIT ? (
                <button
                  className="text-link profile-history-more"
                  type="button"
                  onClick={() => setCoinLimit((limit) => Math.min(limit + 25, COIN_MAX_LIMIT))}
                  disabled={ledgerLoading}
                >
                  Show more transactions
                </button>
              ) : (
                <p className="muted tiny profile-history-note">
                  Showing the latest {formatNumber(ledger.transactions.length)} of{" "}
                  {formatNumber(ledger.transaction_count)} transactions.
                </p>
              )
            ) : null}
        </section>
      </main>
    </>
  );
}
