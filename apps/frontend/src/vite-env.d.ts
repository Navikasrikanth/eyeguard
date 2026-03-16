/// <reference types="vite/client" />

interface Window {
  electronBridge?: {
    setLaunchOnStartup: (enabled: boolean) => Promise<boolean>;
    getVisionServiceUrl: () => Promise<string>;
    showNotification: (payload: { title: string; body: string; focusOnClick?: boolean }) => Promise<boolean>;
    presentForceBreak: () => Promise<boolean>;
    releaseForceBreak: () => Promise<boolean>;
    setSystemBlueLightFilter: (payload: {
      enabled: boolean;
      intensity?: number;
    }) => Promise<{
      supported: boolean;
      active: boolean;
      message: string;
    }>;
  };
}
