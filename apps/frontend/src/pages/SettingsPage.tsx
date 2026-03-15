import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/features/auth/AuthContext";

export function SettingsPage() {
  const { changePassword, logout, settings, updateProfile, updateSettings, user } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    fullName: "",
    avatarUrl: "",
    bio: ""
  });
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    newPassword: ""
  });

  useEffect(() => {
    setProfileDraft({
      username: user?.username ?? "",
      fullName: user?.fullName ?? "",
      avatarUrl: user?.avatarUrl ?? "",
      bio: user?.bio ?? ""
    });
  }, [user]);

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    await updateProfile(profileDraft);
    setStatus("Profile saved.");
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    await changePassword(passwordDraft);
    setPasswordDraft({ currentPassword: "", newPassword: "" });
    setStatus("Password updated.");
  }

  async function handleLaunchOnStartup(enabled: boolean) {
    const persisted = window.electronBridge ? await window.electronBridge.setLaunchOnStartup(enabled) : enabled;
    await updateSettings({ launchOnStartup: persisted });
    setStatus("Startup preference saved.");
  }

  return (
    <div className="page-stack">
      {status ? <div className="support-banner">{status}</div> : null}

      <div className="home-grid">
        <form className="card stack-form" onSubmit={handleProfileSubmit}>
          <div className="card-head">
            <div>
              <p className="eyebrow">Profile settings</p>
              <h3>Identity and presentation</h3>
            </div>
          </div>
          <label>
            <span>Username</span>
            <input
              onChange={(event) => setProfileDraft((current) => ({ ...current, username: event.target.value }))}
              value={profileDraft.username}
            />
          </label>
          <label>
            <span>Full name</span>
            <input
              onChange={(event) => setProfileDraft((current) => ({ ...current, fullName: event.target.value }))}
              value={profileDraft.fullName}
            />
          </label>
          <label>
            <span>Avatar URL</span>
            <input
              onChange={(event) => setProfileDraft((current) => ({ ...current, avatarUrl: event.target.value }))}
              value={profileDraft.avatarUrl}
            />
          </label>
          <label>
            <span>Bio</span>
            <textarea
              onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))}
              rows={4}
              value={profileDraft.bio}
            />
          </label>
          <button className="primary-button" type="submit">
            Save profile
          </button>
        </form>

        <section className="card stack-form">
          <div className="card-head">
            <div>
              <p className="eyebrow">Preferences</p>
              <h3>Notifications, language, and camera behavior</h3>
            </div>
          </div>
          <label>
            <span>Language</span>
            <select
              onChange={(event) => void updateSettings({ language: event.target.value as "en" | "hi" })}
              value={settings?.language ?? "en"}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
          <label>
            <span>Reminder interval</span>
            <input
              max={60}
              min={5}
              onChange={(event) => void updateSettings({ reminderIntervalMinutes: Number(event.target.value) })}
              type="range"
              value={settings?.reminderIntervalMinutes ?? 20}
            />
            <small>{settings?.reminderIntervalMinutes ?? 20} minutes</small>
          </label>
          <label className="toggle-row">
            <span>Notifications</span>
            <input
              checked={settings?.notificationsEnabled ?? true}
              onChange={(event) => void updateSettings({ notificationsEnabled: event.target.checked })}
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>Camera monitoring</span>
            <input
              checked={settings?.cameraEnabled ?? true}
              onChange={(event) => void updateSettings({ cameraEnabled: event.target.checked })}
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>Launch on startup</span>
            <input
              checked={settings?.launchOnStartup ?? false}
              onChange={(event) => void handleLaunchOnStartup(event.target.checked)}
              type="checkbox"
            />
          </label>
        </section>
      </div>

      <div className="home-grid">
        <form className="card stack-form" onSubmit={handlePasswordSubmit}>
          <div className="card-head">
            <div>
              <p className="eyebrow">Security</p>
              <h3>Change password</h3>
            </div>
          </div>
          <label>
            <span>Current password</span>
            <input
              onChange={(event) => setPasswordDraft((current) => ({ ...current, currentPassword: event.target.value }))}
              type="password"
              value={passwordDraft.currentPassword}
            />
          </label>
          <label>
            <span>New password</span>
            <input
              onChange={(event) => setPasswordDraft((current) => ({ ...current, newPassword: event.target.value }))}
              type="password"
              value={passwordDraft.newPassword}
            />
          </label>
          <button className="primary-button" type="submit">
            Update password
          </button>
        </form>

        <section className="card stack-form">
          <div className="card-head">
            <div>
              <p className="eyebrow">Account</p>
              <h3>Session controls</h3>
            </div>
          </div>
          <p className="support-copy">
            Your analytics and settings are scoped to your account. Logging out clears the local session while keeping
            persisted metrics in your private profile.
          </p>
          <button className="ghost-button" onClick={() => void logout()} type="button">
            Log out
          </button>
        </section>
      </div>
    </div>
  );
}
