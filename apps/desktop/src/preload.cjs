const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronBridge", {
  setLaunchOnStartup(enabled) {
    return ipcRenderer.invoke("launch-on-startup:set", enabled);
  },
  getVisionServiceUrl() {
    return ipcRenderer.invoke("vision-service:url");
  },
  showNotification(payload) {
    return ipcRenderer.invoke("notification:show", payload);
  },
  presentForceBreak() {
    return ipcRenderer.invoke("force-break:present");
  },
  releaseForceBreak() {
    return ipcRenderer.invoke("force-break:release");
  },
  setSystemBlueLightFilter(payload) {
    return ipcRenderer.invoke("system-blue-light:set", payload);
  }
});
