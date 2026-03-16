import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      brand: "EyeGuard",
      home: "Home",
      about: "About",
      dashboard: "Dashboard",
      settings: "Settings",
      monitoringStatus: "Monitoring status",
      manualBreak: "Take a Break",
      postureAlert: "correct your posture",
      wellnessOnly: "Wellness support only. Not a medical diagnosis."
    }
  },
  hi: {
    translation: {
      brand: "EyeGuard",
      home: "होम",
      about: "जानकारी",
      dashboard: "डैशबोर्ड",
      settings: "सेटिंग्स",
      monitoringStatus: "मॉनिटरिंग स्थिति",
      manualBreak: "ब्रेक लें",
      postureAlert: "अपनी मुद्रा ठीक करें",
      wellnessOnly: "यह केवल वेलनेस सहायता है, मेडिकल निदान नहीं।"
    }
  }
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
