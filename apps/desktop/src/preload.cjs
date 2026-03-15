const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronBridge", {
  setLaunchOnStartup(enabled) {
    return ipcRenderer.invoke("launch-on-startup:set", enabled);
  },
  getVisionServiceUrl() {
    return ipcRenderer.invoke("vision-service:url");
  }
});
