# EyeGuard

EyeGuard is a desktop-first wellness assistant focused on reducing eye strain and posture fatigue through webcam-derived wellness cues, guided breaks, and private user analytics.

## Product boundary

EyeGuard is a wellness support product. It does **not** diagnose eye disease, musculoskeletal conditions, or any medical issue. Monitoring outputs are informational reminders designed to support healthier computer habits.

## Workspace layout

- `apps/frontend`: React + Vite client with monitoring, break flow, dashboard, auth, and settings.
- `apps/desktop`: Electron shell for desktop-first packaging and app session lifecycle.
- `apps/backend`: FastAPI backend with auth, settings, analytics persistence, and user-scoped data access.
- `packages/types`: Shared TypeScript contracts used by the client and desktop shell.
- `packages/ui`: Shared UI tokens and helper components.
- `docs`: Architecture, privacy notes, demo script, and acceptance mapping.

## Quick start

### Frontend

```bash
npm install
npm run dev:frontend
```

### Backend

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r apps/backend/requirements.txt
uvicorn app.main:app --reload --app-dir apps/backend
```

### Desktop

```bash
npm run dev:desktop
```

## Privacy commitments

- Webcam video is processed in-memory on device.
- No raw images or recordings are stored in the database.
- Only derived wellness metrics and event timestamps are persisted.
- All analytics are scoped to the authenticated user.

## MVP priorities

1. Reliable auth, persistence, reminder engine, and fallback behavior.
2. Live blink and posture wellness cues with clear status messaging.
3. Usable analytics and settings pages with safe defaults.
4. Optional premium motion and 3D accents that do not block core flows.
