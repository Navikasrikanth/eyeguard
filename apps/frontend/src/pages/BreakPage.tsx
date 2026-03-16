import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { useMonitoring } from "@/features/monitoring/MonitoringContext";

const exercises = [
  {
    title: "Distance reset",
    copy: "Look toward a far point across the room and soften your focus."
  },
  {
    title: "Blink refresh",
    copy: "Blink slowly and completely several times to re-wet the eyes."
  },
  {
    title: "Shoulder release",
    copy: "Unclench the jaw, lower the shoulders, and lengthen the spine."
  }
];

export function BreakPage() {
  const { activeBreak, completeBreak } = useMonitoring();
  const [secondsLeft, setSecondsLeft] = useState(20);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((value) => value - 1);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) {
      void completeBreak();
    }
  }, [completeBreak, secondsLeft]);

  const currentExercise = useMemo(() => {
    const completed = 20 - secondsLeft;
    return exercises[Math.min(exercises.length - 1, Math.floor(completed / 7))];
  }, [secondsLeft]);

  if (!activeBreak) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="break-screen">
      <section className="break-card">
        <p className="eyebrow">Guided break</p>
        <h1>{secondsLeft}s</h1>
        <p>
          Follow the exercise cards below. EyeGuard will automatically return you to monitoring when the countdown
          finishes.
        </p>

        <div className="exercise-grid">
          {exercises.map((exercise) => (
            <article
              className={exercise.title === currentExercise.title ? "exercise-card is-current" : "exercise-card"}
              key={exercise.title}
            >
              <strong>{exercise.title}</strong>
              <span>{exercise.copy}</span>
            </article>
          ))}
        </div>

        <div className="break-progress">
          <div className="break-progress-bar" style={{ width: `${((20 - secondsLeft) / 20) * 100}%` }} />
        </div>
      </section>
    </div>
  );
}
