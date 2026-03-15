# Manual Smoke Checklist

## Auth and privacy

- Create a new account and confirm the app opens to Home.
- Sign out and confirm protected pages are no longer available.
- Create a second account and verify analytics do not leak across users.

## Webcam and fallback

- Grant webcam access and confirm live camera preview appears on Home.
- Blink several times and confirm the live blink count increases.
- Trigger poor posture and confirm a red `correct your posture` alert appears.
- Deny webcam access and confirm timers, reminders, and manual breaks still work.

## Break flow

- Wait for the reminder interval or shorten it in Settings for testing.
- Confirm the reminder modal appears.
- Start the auto break and confirm the 20-second screen appears and auto-returns.
- Start a manual break from Home and confirm it is recorded separately.

## Analytics

- Visit Dashboard after a few minutes of use.
- Confirm screen time, alert totals, break history, and blink summaries are populated.
- Refresh the page and confirm persisted values reload for the signed-in user.

## Desktop shell

- Launch the Electron app against the frontend dev server.
- Toggle `Launch on startup` in Settings and confirm the preference persists.
