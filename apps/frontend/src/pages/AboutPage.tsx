const pillars = [
  {
    title: "Privacy-first monitoring",
    copy: "EyeGuard processes webcam-derived wellness cues in memory and stores only lightweight event summaries."
  },
  {
    title: "20-20-20 habit loop",
    copy: "Every 20 minutes, a reminder encourages a 20-second distance break to reduce screen fatigue."
  },
  {
    title: "Wellness, not diagnosis",
    copy: "Posture and blink outputs are approximate wellness prompts and should not be treated as medical advice."
  }
];

export function AboutPage() {
  return (
    <div className="page-stack">
      <section className="card about-hero">
        <p className="eyebrow">About EyeGuard</p>
        <h2>Designed for healthier screen habits without overclaiming certainty.</h2>
        <p>
          EyeGuard is a desktop-first wellness application that combines camera-based posture and blink awareness with
          timed breaks, guided exercises, and user-specific analytics. The product is intentionally positioned as
          wellness support only, not a diagnostic or therapeutic medical tool.
        </p>
        <p>
          The current MVP prioritizes reliability, graceful fallback, and privacy. If the webcam is unavailable or
          permission is denied, reminder timing, break guidance, and user analytics continue to work. This means the
          app remains helpful even in restricted environments such as enterprise laptops or privacy-conscious setups.
        </p>
      </section>

      <div className="metric-grid">
        {pillars.map((pillar) => (
          <article className="metric-card" key={pillar.title}>
            <span>{pillar.title}</span>
            <strong>{pillar.copy}</strong>
          </article>
        ))}
      </div>

      <section className="card prose-card">
        <p className="eyebrow">Why it matters</p>
        <h3>Modern desk work compresses blinking, posture awareness, and recovery time.</h3>
        <p>
          Long stretches of laptop use often reduce natural blink frequency and encourage forward-head posture.
          EyeGuard responds to that pattern with a practical loop: monitor, remind, interrupt, guide, and review. The
          analytics dashboard helps users notice whether they are actually taking breaks, whether posture warnings are
          clustering at certain times of day, and whether their blink behavior shifts across sessions.
        </p>
        <p>
          The premium UI layer is intentionally additive. Core reminders and monitoring stay fast and lightweight,
          while motion, depth, and layered cards make the experience feel polished rather than clinical. That balance is
          what keeps the MVP demo-ready without sacrificing the underlying product foundations.
        </p>
      </section>
    </div>
  );
}
