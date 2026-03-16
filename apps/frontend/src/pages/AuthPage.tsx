import { FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { useAuth } from "@/features/auth/AuthContext";

export function AuthPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = useMemo(
    () =>
      mode === "signup"
        ? {
            title: "Create your private wellness workspace",
            subtitle: "EyeGuard stores only derived wellness metrics and never raw webcam video."
          }
        : {
            title: "Welcome back to EyeGuard",
            subtitle: "Sign in to continue your screen-time, blink, and break history."
          },
    [mode]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const username = String(form.get("username") ?? "");
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signup({ email, password, username });
      } else {
        await login({ email, password });
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <motion.section
        className="auth-hero"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="hero-orb hero-orb-primary" />
        <div className="hero-orb hero-orb-secondary" />
        <p className="eyebrow">Wellness assistant for desktop work</p>
        <h1>EyeGuard</h1>
        <p className="hero-copy">
          Real-time blink awareness, posture nudges, private analytics, and guided 20-second breaks for healthier
          screen habits.
        </p>
        <div className="hero-card-grid">
          <article className="glass-card">
            <strong>Privacy first</strong>
            <span>Derived wellness events only. No raw webcam storage.</span>
          </article>
          <article className="glass-card">
            <strong>20-20-20 loop</strong>
            <span>Automatic reminders plus manual breaks whenever you need them.</span>
          </article>
          <article className="glass-card">
            <strong>Wellness support</strong>
            <span>Informational cues only, not medical diagnosis.</span>
          </article>
        </div>
      </motion.section>

      <motion.section
        className="auth-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08 }}
      >
        <div className="auth-toggle">
          <button
            className={mode === "signup" ? "toggle-button is-active" : "toggle-button"}
            onClick={() => setMode("signup")}
            type="button"
          >
            Sign up
          </button>
          <button
            className={mode === "login" ? "toggle-button is-active" : "toggle-button"}
            onClick={() => setMode("login")}
            type="button"
          >
            Log in
          </button>
        </div>

        <div className="form-copy">
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>

        <form className="stack-form" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <label>
              <span>Username</span>
              <input
                autoComplete="username"
                minLength={2}
                name="username"
                placeholder="eyeguard-user"
                required
                type="text"
              />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input autoComplete="email" name="email" placeholder="you@example.com" required type="email" />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          {mode === "signup" ? <p className="support-copy">Use at least 8 characters for your password.</p> : null}
          {error ? <div className="error-banner">{error}</div> : null}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Working..." : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>
      </motion.section>
    </div>
  );
}
