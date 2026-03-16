# EyeGuard Feature List

## Product Boundaries And Safety

- Wellness support positioning throughout the product.
- Explicit non-medical disclaimer on core screens.
- About page copy explaining that EyeGuard is not a diagnosis or treatment tool.
- Reminder modal language that frames interventions as wellness prompts.
- Monitoring UI that describes posture and blink outputs as approximate cues.
- AI posture coach prompt constrained to wellness guidance, not diagnosis.
- AI coach provider abstraction for OpenAI or Gemini.

## Authentication And Account Security

- Signup flow with email, username, and password.
- Login flow with email and password.
- Browser-side password minimum length validation.
- Backend-side password validation.
- Password hashing before storage.
- JWT-style access token handling.
- Refresh token handling for session renewal.
- Automatic session bootstrap on app reload when a refresh token exists.
- Logout flow that clears the local session.
- Password change flow inside settings.
- User profile editing for username, full name, avatar URL, and bio.
- Per-user language preference.

## Privacy And Data Handling

- User-scoped analytics so each account only sees its own data.
- SQLite persistence for users, settings, daily metrics, reminders, breaks, blinks, and posture events.
- No raw webcam video stored in the database.
- Only derived posture, blink, break, and screen-time events are persisted.
- Optional AI coach snapshot sent only on explicit user request.
- No database storage of the AI review image.
- Local Python vision service can process webcam frames without storing raw video.
- Local auth session persistence in browser storage.
- Electron startup preference persisted in a local preferences file.

## Webcam Monitoring And Wellness Detection

- Live webcam preview inside the Home page.
- Camera permission handling with clear denied, unsupported, and error states.
- Camera startup verification that waits for a real frame before reporting readiness.
- Camera mute and ended-track diagnostics.
- Blink detection using eye aspect ratio from face landmarks.
- Real-time blink counter in the monitoring UI.
- Posture calibration flow that learns a personal neutral baseline.
- Manual posture recalibration button.
- Baseline-aware posture detection instead of fixed global thresholds.
- Head tilt detection relative to baseline.
- Vertical head drift detection relative to baseline.
- Off-center head shift detection relative to baseline.
- Lean toward or away from the screen detection relative to baseline.
- Upper-body shoulder tilt detection when pose landmarks are available.
- Shoulder-to-neck compression detection for slump awareness when pose landmarks are available.
- Composite slump detection that combines dropped head, lean, and shoulder compression cues.
- Real-time posture reasons shown in the UI.
- Real-time posture score smoothing to reduce noisy frame spikes.
- Red posture warning state with the message `correct your posture`.
- Live canvas overlay that changes color based on posture state.
- Camera-model fallback where timers still work even if landmark models cannot load.
- Head-cue fallback if the upper-body pose model is unavailable.
- Electron background handoff to a local Python vision service when the app is not the active window.
- Background blink bucket capture in the local Python vision service.
- Background posture alert capture in the local Python vision service.
- Sync of hidden-session blink and posture events back into the main analytics backend when the app returns.
- Optional one-off AI posture review from the current webcam frame.
- Manual `Review posture with AI` action on the Home page.
- AI coach status check so the UI can remain local-only when OpenAI is not configured.
- AI coach result card with posture label, severity, confidence, reasons, and coaching guidance.
- AI coach request payload that includes local heuristic context for a better second opinion.
- Gemini provider option for the AI coach via environment configuration.

## Monitoring Session Logic

- App-session screen-time tracking while the app is visible.
- Screen-time pause during the guided break flow.
- Next-break countdown on the Home page.
- Session-time persistence to the backend in 10-second batches.
- Blink events persisted in minute buckets.
- Posture alerts persisted with timestamps, severity, reasons, and metric details.
- Posture alert persistence throttling to reduce noisy duplicates.
- Optional forced-break mode that auto-starts the break when the reminder timer expires.
- Console logging in the browser for camera and posture diagnostics.
- Backend terminal logging for posture alerts with the exact reasons and metric deltas.

## 20-20-20 Reminder And Break Flow

- Automatic reminder loop based on the user's configured interval.
- Default 20-minute reminder cadence.
- Manual `Take a Break` button on the Home page.
- Reminder modal with `Start break` and `Snooze 2 min`.
- Native reminder notifications in Electron when notifications are enabled.
- Browser reminder notifications when notifications are enabled and browser permission is granted.
- 30-second pre-break notifications before the reminder is due.
- Poor-posture streak notifications after 2 minutes of continuous warning state.
- Low-blink reminder notifications after an extended blink drought.
- Session summary notifications that point the user toward the analytics dashboard.
- AI coach completion notifications after a review finishes.
- Force-break path that skips snooze and jumps straight into the break countdown.
- Reminder events persisted to analytics.
- Dedicated break screen.
- 20-second countdown timer for the break flow.
- Guided break exercise cards.
- Automatic return to monitoring after the countdown finishes.
- Break events persisted with start time, end time, duration, and initiation source.
- Support for distinguishing auto-initiated vs manual breaks.

## Pages And Navigation

- Auth page with sign up and log in modes.
- Home page for live monitoring, session status, and AI review.
- About page with long-form explanation and supporting cards.
- Dashboard page for recent analytics and event history.
- Settings page for profile, security, preferences, and logout.
- Break page for the timed exercise flow.
- Protected routing so app pages only load after authentication.

## Dashboard And Analytics

- 14-day analytics summary loading from the backend.
- Summary cards for screen time, breaks, alerts, and blinks.
- Screen-time area chart.
- Breaks vs posture alerts bar chart.
- Recent posture events list.
- Recent break history list.
- Daily history payload with screen time, breaks, alerts, posture alerts, and blink totals.
- Today summary support in the analytics response.
- Activity streak calculation in the analytics response.
- Backfill handling for legacy posture events that predate newer shoulder metrics.

## Settings And Preferences

- Language selector.
- Reminder interval slider.
- Reminder interval slider with a 1-to-60 minute range.
- Notifications toggle.
- Camera monitoring toggle.
- Posture sensitivity setting persisted per user.
- Launch-on-startup toggle routed through Electron IPC.
- Force-break toggle persisted per user.
- Saved/failed feedback banner for settings changes.
- Profile save status feedback.
- Password change status feedback.
- Startup preference save feedback.

## Desktop Shell

- Electron desktop window wrapper for the React app.
- Desktop-first window sizing and minimum dimensions.
- Secure preload bridge with context isolation.
- IPC method for launch-on-startup preference.
- IPC methods to present and release a forced break window.
- Open-at-login integration through Electron.
- Dev mode support via a frontend URL environment variable.
- Electron force-break presentation that restores the app window, brings it to the front, and pins it on top during the timed break.

## API And Backend Foundations

- FastAPI backend application entry point.
- Health endpoint.
- CORS configuration for local development.
- Auth routes.
- User and profile routes.
- Settings routes.
- Metrics ingestion routes.
- Analytics summary route.
- AI coach status route.
- AI coach posture review route.
- SQLite schema initialization on startup.
- Lightweight schema migration for posture event detail storage.
- Local Python vision service with its own health and session control endpoints.

## UI And Experience

- Desktop-first layout with card-heavy composition.
- Motion-enhanced modals and metric cards.
- Hero sections and layered visual accents.
- Wellness status cards on the Home page.
- Friendly helper copy for fallback and calibration states.
- Responsive layout that still renders on smaller breakpoints.
- Disabled-button styling for unavailable optional actions.

## Documentation And Validation Assets

- README with quick-start guidance and privacy framing.
- Architecture notes in `docs/architecture.md`.
- Privacy notes in `docs/privacy.md`.
- Acceptance criteria mapping in `docs/acceptance-criteria.md`.
- Demo script in `docs/demo-script.md`.
- Manual smoke checklist in `testing/manual-smoke-checklist.md`.
- Frontend heuristic tests.
- Backend API tests.
