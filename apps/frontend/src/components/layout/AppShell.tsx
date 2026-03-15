import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

import { useAuth } from "@/features/auth/AuthContext";

const navItems = [
  { to: "/", labelKey: "home" },
  { to: "/about", labelKey: "about" },
  { to: "/dashboard", labelKey: "dashboard" },
  { to: "/settings", labelKey: "settings" }
];

export function AppShell() {
  const location = useLocation();
  const { t } = useTranslation();
  const { user, settings } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-stack">
          <div className="brand-mark">EG</div>
          <div>
            <p className="eyebrow">Desktop wellness assistant</p>
            <h1>{t("brand")}</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
              to={item.to}
              end={item.to === "/"}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <p className="eyebrow">Safety</p>
          <p>{t("wellnessOnly")}</p>
        </div>
      </aside>

      <main className="main-shell">
        <motion.header
          className="topbar"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div>
            <p className="eyebrow">Current space</p>
            <h2>{location.pathname === "/" ? "Monitoring Hub" : location.pathname.slice(1)}</h2>
          </div>
          <div className="topbar-meta">
            <div className="pill">{settings?.language.toUpperCase()}</div>
            <div className="user-chip">
              <strong>{user?.username}</strong>
              <span>{user?.email}</span>
            </div>
          </div>
        </motion.header>
        <Outlet />
      </main>
    </div>
  );
}
