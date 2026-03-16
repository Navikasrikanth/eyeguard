import { AnimatePresence, motion } from "framer-motion";

type CoachConsentModalProps = {
  open: boolean;
  provider: "openai" | "gemini" | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function providerLabel(provider: CoachConsentModalProps["provider"]): string {
  if (provider === "gemini") {
    return "Gemini";
  }
  if (provider === "openai") {
    return "OpenAI";
  }
  return "the selected AI provider";
}

export function CoachConsentModal({ open, provider, loading, onCancel, onConfirm }: CoachConsentModalProps) {
  const label = providerLabel(provider);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal-card consent-modal-card"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
          >
            <p className="eyebrow">AI review consent</p>
            <h3>Send one snapshot to {label}?</h3>
            <p>
              EyeGuard will capture your current webcam frame and send that single image, plus posture context, to the
              external {` ${label} `}service for this one review only.
            </p>
            <div className="support-banner">
              <strong>What gets sent</strong>
              <span>
                One current image frame and local posture signals. EyeGuard does not store the image after the request.
              </span>
            </div>
            <div className="button-row">
              <button className="ghost-button" disabled={loading} onClick={onCancel} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={loading} onClick={onConfirm} type="button">
                {loading ? "Sending..." : `I consent, send to ${label}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
