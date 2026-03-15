# Privacy and Safety

## Wellness only

EyeGuard provides wellness reminders and habit analytics only. It is not a medical device, does not diagnose illness, and should not be used as a substitute for clinical advice.

## Data minimization

- Raw webcam frames stay on the device and are never stored.
- The backend stores only derived event data such as blink counts, posture alerts, break timestamps, and daily totals.
- Settings are limited to product behavior preferences needed for the experience.

## User isolation

- Every persisted record is linked to a single user id.
- Authenticated routes read and write user-scoped records only.
- Access tokens are short-lived and refresh tokens are hashed at rest.

## Graceful fallback

If a user denies camera access, EyeGuard remains usable for:

- session timing
- 20-20-20 reminders
- manual breaks
- profile and settings
- analytics based on non-camera events

## Safety copy

Use the following language in product surfaces:

- "EyeGuard supports healthier work habits and wellness awareness."
- "Camera cues are approximate and not a medical assessment."
- "If discomfort persists, consult a qualified health professional."
