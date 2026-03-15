/// <reference types="vite/client" />

interface Window {
  electronBridge?: {
    setLaunchOnStartup: (enabled: boolean) => Promise<boolean>;
    getVisionServiceUrl: () => Promise<string>;
  };
}
