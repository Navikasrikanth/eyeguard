import { motion, AnimatePresence } from "framer-motion";

type ReminderModalProps = {
  open: boolean;
  forceBreakEnabled: boolean;
  onStart: () => void;
  onDismiss: () => void;
};

export function ReminderModal({ open, forceBreakEnabled, onStart, onDismiss }: ReminderModalProps) {
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
            className="modal-card"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
          >
            <p className="eyebrow">20-20-20 reminder</p>
            <h3>{forceBreakEnabled ? "Break required now" : "Give your eyes a 20-second reset"}</h3>
            <p>
              {forceBreakEnabled
                ? "Force break is enabled, so EyeGuard is about to start the 20-second recovery screen. This is a wellness cue, not a medical diagnosis."
                : "Look 20 feet away, relax your shoulders, and let EyeGuard guide a short wellness break. This is a reminder, not a medical diagnosis."}
            </p>
            <div className="button-row">
              {forceBreakEnabled ? null : (
                <button className="ghost-button" onClick={onDismiss} type="button">
                  Snooze 2 min
                </button>
              )}
              <button className="primary-button" onClick={onStart} type="button">
                {forceBreakEnabled ? "Begin now" : "Start break"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
