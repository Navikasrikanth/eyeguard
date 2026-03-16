# Architecture

## Overview

EyeGuard uses a desktop-first layered architecture:

1. Electron provides the desktop shell, startup behavior, and window lifecycle.
2. React renders the user interface, live monitoring, break flow, and analytics.
3. FastAPI handles authentication, settings, and metrics persistence.
4. SQLite stores only derived wellness events and daily rollups for the MVP.
5. A local Python vision service supports background blink and posture monitoring in Electron.

## Monitoring flow

- The frontend requests webcam access only after the user signs in and opens monitoring.
- MediaPipe face landmarks are used client-side to estimate blink activity and head alignment.
- MediaPipe pose landmarks are used when available for shoulder-aware posture cues.
- Derived events are reduced into lightweight summaries before being sent to the backend.
- If the camera is unavailable, the app continues running session timers, reminders, and manual breaks.
- When the Electron app goes into the background, webcam monitoring can hand off to a local Python vision service and sync the derived events back later.

## Security model

- Passwords are hashed with bcrypt before storage.
- Access and refresh tokens are signed separately.
- Refresh tokens are stored as hashes and can be revoked per user session.
- Every API query is filtered by the authenticated user id.
- Auth routes include basic in-memory rate limiting for the MVP.

## Persistence model

- `daily_metrics`: per-user per-day aggregate screen time, alerts, breaks, and blink totals.
- `break_events`: timestamped break sessions with auto/manual origin.
- `posture_events`: posture warnings with severity and source.
- `blink_buckets`: per-minute blink summaries for charts.
- `settings`: user preferences including reminder interval and camera mode.
- `settings`: user preferences including reminder interval, camera mode, launch on startup, and force break.

## Reliability notes

- Screen time increments are batched from the client to reduce API chatter.
- Break mode pauses monitoring and screen-time accrual, then auto-resumes after the countdown.
- When force break is enabled, the timed break can auto-start and request Electron to restore and surface the desktop app.
- Desktop window close hides the app in production-ready builds; the MVP currently quits fully for simplicity.
