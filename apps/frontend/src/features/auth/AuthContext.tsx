import type { AuthResponse, UserProfile, UserSettings } from "@eyeguard/types";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiClient, loadStoredSession, saveStoredSession } from "@/api/client";
import i18n from "@/i18n/config";

type AuthContextValue = {
  user: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  signup: (payload: { email: string; username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (payload: Partial<UserProfile>) => Promise<void>;
  updateSettings: (payload: Partial<UserSettings>) => Promise<void>;
  changePassword: (payload: { currentPassword: string; newPassword: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function storeAuthResponse(auth: AuthResponse, setUser: (user: UserProfile) => void, setSettings: (settings: UserSettings) => void): void {
  saveStoredSession({
    accessToken: auth.tokens.accessToken,
    refreshToken: auth.tokens.refreshToken
  });
  setUser(auth.user);
  setSettings(auth.settings);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const session = loadStoredSession();
      if (!session) {
        if (mounted) {
          setIsLoading(false);
        }
        return;
      }
      try {
        const refreshed = await apiClient.refresh(session.refreshToken);
        if (!mounted) {
          return;
        }
        storeAuthResponse(refreshed, setUser, setSettings);
      } catch {
        saveStoredSession(null);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (settings?.language) {
      void i18n.changeLanguage(settings.language);
    }
  }, [settings?.language]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      settings,
      isLoading,
      async login(payload) {
        const auth = await apiClient.login(payload);
        storeAuthResponse(auth, setUser, setSettings);
      },
      async signup(payload) {
        const auth = await apiClient.signup(payload);
        storeAuthResponse(auth, setUser, setSettings);
      },
      async logout() {
        const session = loadStoredSession();
        if (session?.refreshToken) {
          await apiClient.logout(session.refreshToken);
        }
        saveStoredSession(null);
        setUser(null);
        setSettings(null);
      },
      async refresh() {
        const profile = await apiClient.getProfile();
        const nextSettings = await apiClient.getSettings();
        setUser(profile);
        setSettings(nextSettings);
      },
      async updateProfile(payload) {
        const profile = await apiClient.updateProfile(payload);
        setUser(profile);
      },
      async updateSettings(payload) {
        const nextSettings = await apiClient.updateSettings(payload);
        setSettings(nextSettings);
      },
      async changePassword(payload) {
        await apiClient.changePassword(payload);
      }
    }),
    [isLoading, settings, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
