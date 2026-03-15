# Tech Stack and Why

## Desktop shell

- Electron

Why:
- lets EyeGuard run as a desktop-first app instead of a browser tab
- supports startup behavior, IPC, and window control for features like force break
- makes background monitoring handoff more realistic than a browser-only setup

## Frontend

- React
- TypeScript
- Vite
- Framer Motion
- React Router
- Recharts
- react-i18next

Why:
- React is fast to build with for a hackathon MVP and keeps the UI modular
- TypeScript keeps shared contracts and monitoring payloads safer across the app
- Vite gives quick local iteration and a simple dev/build workflow
- Framer Motion adds polish without blocking the MVP
- React Router keeps the auth, home, dashboard, settings, and break flow clear
- Recharts is enough for the dashboard without heavy chart setup
- react-i18next makes the language setting real instead of decorative

## Backend API

- FastAPI
- Python

Why:
- FastAPI is fast to build and easy to structure for auth, settings, metrics, and analytics routes
- Python fits naturally with the local vision service and AI provider integrations
- Pydantic models make request and response validation straightforward

## Database

- SQLite

Why:
- zero-setup database for MVP and hackathon portability
- easy to zip, move, and run on a fresh machine
- good enough for auth, settings, reminders, posture events, blink buckets, and daily aggregates
- upgrade path remains open if the project later moves to PostgreSQL

## Vision and webcam monitoring

- Browser `getUserMedia`
- MediaPipe Tasks Vision in the frontend
- MediaPipe + OpenCV in the local Python background service

Why:
- `getUserMedia` is the standard way to access the webcam on-device
- MediaPipe gives reliable landmark detection without sending raw video to a server
- OpenCV is useful for the local background service pipeline in Electron
- this combination keeps the MVP local-first and privacy-conscious

## Blink detection

- Eye Aspect Ratio (EAR) heuristic from face landmarks

Why:
- simple and fast enough for live monitoring
- works well with landmark-based face tracking
- lightweight compared with training a custom blink model

## Posture detection

- MediaPipe face landmarks
- MediaPipe pose landmarks when available
- baseline-calibrated heuristic scoring

Why:
- fixed posture thresholds are too brittle when camera angle changes
- baseline calibration makes the app adapt to the user's neutral seated position
- heuristics are easier to iterate on in a hackathon than a full trained classifier
- combining head tilt, vertical drift, lean, shoulder tilt, and shoulder-neck compression gives a stronger MVP than face-only checks

## Optional AI coach

- OpenAI or Gemini, selected by environment configuration

Why:
- keeps the real-time loop local and reliable
- allows a one-off second opinion without making the whole product cloud-dependent
- useful for richer explanations in ambiguous postures

## Shared contracts

- Local workspace package in `packages/types`

Why:
- keeps frontend request payloads and backend response shapes aligned
- reduces contract drift while iterating quickly
