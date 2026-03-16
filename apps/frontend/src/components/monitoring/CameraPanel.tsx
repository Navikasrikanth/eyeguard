import type { RefObject } from "react";

type CameraPanelProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  cameraState: "pending" | "ready" | "denied" | "unsupported" | "error";
  helperMessage: string;
};

export function CameraPanel({ videoRef, overlayRef, cameraState, helperMessage }: CameraPanelProps) {
  return (
    <section className="camera-panel card">
      <div className="card-head">
        <div>
          <p className="eyebrow">Live webcam monitoring</p>
          <h3>Real-time blink and posture cues</h3>
        </div>
        <div className={`status-pill status-${cameraState}`}>{cameraState}</div>
      </div>

      <div className="camera-stage">
        <video ref={videoRef} autoPlay muted playsInline className="camera-video" />
        <canvas ref={overlayRef} className="camera-overlay" />
        {cameraState !== "ready" ? (
          <div className="camera-fallback">
            <strong>Camera fallback mode</strong>
            <span>{helperMessage}</span>
          </div>
        ) : null}
      </div>

      <p className="support-copy">{helperMessage}</p>
    </section>
  );
}
