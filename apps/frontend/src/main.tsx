import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@/i18n/config";
import { AuthProvider } from "@/features/auth/AuthContext";
import { App } from "@/app/App";
import "@/styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
