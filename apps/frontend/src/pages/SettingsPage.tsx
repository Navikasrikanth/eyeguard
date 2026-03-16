import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/features/auth/AuthContext";
import { requestWellnessNotificationPermission } from "@/utils/notifications";

type StatusTone = "success" | "error";

export function SettingsPage() {
  const { changePassword, logout, settings, updateProfile, updateSettings, user } = useAuth();
  const [status, setStatus] = useState<{ tone: StatusTone; message: string } | null>(null);
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
    try {
      await updateProfile(profileDraft);
      setStatus({ tone: "success", message: "Profile saved." });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save profile."
      });
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await changePassword(passwordDraft);
      setPasswordDraft({ currentPassword: "", newPassword: "" });
      setStatus({ tone: "success", message: "Password updated." });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to update password."
      });
    }
  }

  async function handleLaunchOnStartup(enabled: boolean) {
    try {
      const persisted = window.electronBridge ? await window.electronBridge.setLaunchOnStartup(enabled) : enabled;
      await updateSettings({ launchOnStartup: persisted });
      setStatus({ tone: "success", message: "Startup preference saved." });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save startup preference."
      });
    }
  }

  async function handleSettingUpdate(
    payload: Parameters<typeof updateSettings>[0],
    successMessage: string,
    failureMessage: string
  ): Promise<boolean> {
    try {
      await updateSettings(payload);
      setStatus({ tone: "success", message: successMessage });
      return true;
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : failureMessage
      });
      return false;
    }
  }

  async function handleNotificationsToggle(enabled: boolean) {
    const saved = await handleSettingUpdate(
      { notificationsEnabled: enabled },
      enabled ? "Notifications enabled." : "Notifications disabled.",
      "Unable to save notification preference."
    );

    if (!saved || !enabled) {
      return;
    }

    try {
      const permission = await requestWellnessNotificationPermission();
      if (permission !== "granted") {
        setStatus({
          tone: "error",
          message:
            permission === "unsupported"
              ? "Notifications were enabled in EyeGuard, but this browser context does not support system notifications."
              : `Notifications were enabled in EyeGuard, but browser permission is ${permission}.`
        });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to request browser notification permission."
      });
    }
  }

  return (
    <div className="page-stack">
      {status ? (
        <div className={status.tone === "error" ? "error-banner" : "support-banner"}>{status.message}</div>
      ) : null}

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
              onChange={(event) =>
                void handleSettingUpdate(
                  { language: event.target.value as "en" | "hi" },
                  "Language preference saved.",
                  "Unable to save language preference."
                )
              }
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
              min={1}
              onChange={(event) =>
                void handleSettingUpdate(
                  { reminderIntervalMinutes: Number(event.target.value) },
                  "Reminder interval saved.",
                  "Unable to save reminder interval."
                )
              }
              type="range"
              value={settings?.reminderIntervalMinutes ?? 20}
            />
            <small>{settings?.reminderIntervalMinutes ?? 20} minutes</small>
          </label>
          <label className="toggle-row">
            <span>Notifications</span>
            <input
              checked={settings?.notificationsEnabled ?? true}
              onChange={(event) => void handleNotificationsToggle(event.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="toggle-row">
            <span>Camera monitoring</span>
            <input
              checked={settings?.cameraEnabled ?? true}
              onChange={(event) =>
                void handleSettingUpdate(
                  { cameraEnabled: event.target.checked },
                  event.target.checked ? "Camera monitoring enabled." : "Camera monitoring disabled.",
                  "Unable to save camera preference."
                )
              }
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
          <label className="toggle-row">
            <span>Force break on timeout</span>
            <input
              checked={settings?.forceBreakEnabled ?? false}
              onChange={(event) =>
                void handleSettingUpdate(
                  { forceBreakEnabled: event.target.checked },
                  event.target.checked ? "Force break enabled." : "Force break disabled.",
                  "Unable to save force break preference."
                )
              }
              type="checkbox"
            />
          </label>
          <p className="support-copy">
            When enabled, EyeGuard auto-starts the 20-second break when the timer expires. In Electron, the desktop app
            will come to the front and stay on top until the break ends. In a browser, enforcement is best-effort only.
          </p>
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
