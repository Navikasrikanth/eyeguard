# Acceptance Criteria Mapping

## Safety and product boundary

- The app must label itself as a wellness support tool, not a medical diagnostic product.
- About, auth, and monitoring surfaces must include safety language.

## Authentication and privacy

- A user can sign up with a unique email and password.
- Passwords are stored hashed with bcrypt.
- A signed-in user can only view and mutate their own profile, settings, and analytics.
- Refresh tokens can be invalidated on logout.

## Real-time monitoring

- When camera permission is granted, the home page shows live camera status, blink count, posture status, and last alert time.
- When poor posture is detected, a visible red alert renders the text `correct your posture`.
- When camera permission is denied or unavailable, the app shows a non-blocking fallback state and keeps timers active.

## Break behavior

- A reminder appears every configured interval, defaulting to 20 minutes.
- A user can trigger a manual break from the home screen.
- Break mode shows a 20-second countdown and guided exercise cards.
- After 20 seconds the app returns to monitoring automatically and resumes timers.
- If force break is enabled, EyeGuard should auto-start the break when the timer expires instead of allowing snooze.

## Persistence and analytics

- Screen time, breaks, posture alerts, and blink totals are persisted per user per day.
- The dashboard shows historical totals and daily trends.
- Settings changes persist per user and affect future reminder behavior.
- In Electron, background monitoring and force-break presentation should remain available when the app is not the active window.

## Responsiveness

- Desktop layouts are the primary target and remain clear on laptop screens.
- Navigation, cards, and break screen remain usable on common mobile widths.
