const path = require("node:path");
const fs = require("node:fs");
const { spawn, execFile, execFileSync } = require("node:child_process");
const { promisify } = require("node:util");
const { app, BrowserWindow, ipcMain, Notification } = require("electron");

const isDev = Boolean(process.env.EYEGUARD_FRONTEND_URL);
const visionPort = process.env.EYEGUARD_VISION_PORT || "8765";
const execFileAsync = promisify(execFile);
let visionProcess = null;
let mainWindow = null;
let forceBreakPinned = false;
let systemBlueLightFilterActive = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isTrustedRendererOrigin(value) {
  if (!value) {
    return false;
  }
  if (String(value).startsWith("file:")) {
    return true;
  }
  const parsed = parseUrl(value);
  return Boolean(parsed && ["localhost", "127.0.0.1"].includes(parsed.hostname));
}

function configureMediaPermissions(electronSession) {
  electronSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission !== "media") {
      return false;
    }

    const origin =
      details?.securityOrigin ||
      details?.requestingUrl ||
      requestingOrigin ||
      webContents?.getURL?.() ||
      "";
    const allowed = isTrustedRendererOrigin(origin);

    console.info("[EyeGuard desktop] media permission check", {
      allowed,
      permission,
      origin,
      mediaType: details?.mediaType ?? "unknown"
    });

    return allowed;
  });

  electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission !== "media") {
      callback(false);
      return;
    }

    const origin = details?.requestingUrl || details?.securityOrigin || webContents.getURL();
    const mediaTypes = Array.isArray(details?.mediaTypes)
      ? details.mediaTypes
      : details?.mediaType
        ? [details.mediaType]
        : ["unknown"];
    const allowed =
      isTrustedRendererOrigin(origin) &&
      mediaTypes.every((mediaType) => ["video", "audio", "unknown"].includes(mediaType));

    console.info("[EyeGuard desktop] media permission request", {
      allowed,
      permission,
      origin,
      mediaTypes
    });

    callback(allowed);
  });
}

function preferencesPath() {
  return path.join(app.getPath("userData"), "preferences.json");
}

function readPreferences() {
  try {
    return JSON.parse(fs.readFileSync(preferencesPath(), "utf-8"));
  } catch {
    return { launchOnStartup: false };
  }
}

function writePreferences(preferences) {
  fs.writeFileSync(preferencesPath(), JSON.stringify(preferences, null, 2));
}

function resolveFrontendEntry() {
  if (isDev) {
    return process.env.EYEGUARD_FRONTEND_URL;
  }
  return path.join(__dirname, "..", "..", "frontend", "dist", "index.html");
}

function buildSystemBlueLightScript(enabled, intensity) {
  const warmedIntensity = clamp(Number.isFinite(intensity) ? intensity : 0.65, 0.35, 0.85);
  const greenFactor = enabled ? Number((1 - warmedIntensity * 0.18).toFixed(3)) : 1;
  const blueFactor = enabled ? Number((1 - warmedIntensity * 0.42).toFixed(3)) : 1;

  return `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct GammaRamp {
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)]
    public ushort[] Red;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)]
    public ushort[] Green;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)]
    public ushort[] Blue;
}

public static class GammaRampInterop {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

    [DllImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetDeviceGammaRamp(IntPtr hdc, ref GammaRamp ramp);
}
"@

function New-GammaChannel([double]$factor) {
    $channel = New-Object "System.UInt16[]" 256
    for ($i = 0; $i -lt 256; $i++) {
        $value = [Math]::Min(65535, [Math]::Round($i * 257 * $factor))
        $channel[$i] = [System.UInt16]$value
    }
    return $channel
}

$ramp = [GammaRamp]::new()
$ramp.Red = New-GammaChannel 1
$ramp.Green = New-GammaChannel ${greenFactor}
$ramp.Blue = New-GammaChannel ${blueFactor}
$desktopDc = [GammaRampInterop]::GetDC([IntPtr]::Zero)

if ($desktopDc -eq [IntPtr]::Zero) {
    throw "Unable to access the desktop display context."
}

try {
    if (-not [GammaRampInterop]::SetDeviceGammaRamp($desktopDc, [ref]$ramp)) {
        throw "The display driver rejected the gamma update."
    }
} finally {
    [void][GammaRampInterop]::ReleaseDC([IntPtr]::Zero, $desktopDc)
}
`;
}

function buildPowerShellArgs(script) {
  return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
}

function formatSystemDisplayFailure(error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  if (stderr) {
    return stderr;
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return "Windows blocked the display filter update. Some drivers do not allow gamma control.";
}

async function applySystemBlueLightFilter(enabled, intensity = 0.65) {
  if (process.platform !== "win32") {
    return {
      supported: false,
      active: false,
      message: "System blue-light control is currently implemented for Windows only."
    };
  }

  try {
    await execFileAsync("powershell.exe", buildPowerShellArgs(buildSystemBlueLightScript(Boolean(enabled), intensity)), {
      windowsHide: true,
      timeout: 12000,
      maxBuffer: 1024 * 1024
    });

    systemBlueLightFilterActive = Boolean(enabled);
    return {
      supported: true,
      active: systemBlueLightFilterActive,
      message: systemBlueLightFilterActive
        ? "EyeGuard warmed the full Windows display with a system-level blue-light filter."
        : "EyeGuard restored the Windows display to its normal color balance."
    };
  } catch (error) {
    systemBlueLightFilterActive = false;
    console.warn("[EyeGuard desktop] system blue-light filter update failed", error);
    return {
      supported: false,
      active: false,
      message: formatSystemDisplayFailure(error)
    };
  }
}

function applySystemBlueLightFilterSync(enabled, intensity = 0.65) {
  if (process.platform !== "win32") {
    return;
  }

  try {
    execFileSync("powershell.exe", buildPowerShellArgs(buildSystemBlueLightScript(Boolean(enabled), intensity)), {
      windowsHide: true,
      timeout: 12000,
      stdio: "ignore"
    });
    systemBlueLightFilterActive = Boolean(enabled);
  } catch (error) {
    systemBlueLightFilterActive = false;
    console.warn("[EyeGuard desktop] synchronous display filter reset failed", error);
  }
}

function startVisionService() {
  if (visionProcess) {
    return;
  }

  const pythonCommand = process.env.EYEGUARD_VISION_PYTHON || "python";
  const visionAppDir = path.join(__dirname, "..", "..", "..", "services", "vision", "app");
  if (!fs.existsSync(visionAppDir)) {
    console.warn("[EyeGuard desktop] vision service directory not found:", visionAppDir);
    return;
  }

  visionProcess = spawn(
    pythonCommand,
    ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(visionPort)],
    {
      cwd: visionAppDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  visionProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[vision] ${chunk}`);
  });

  visionProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[vision] ${chunk}`);
  });

  visionProcess.on("exit", (code) => {
    console.warn("[EyeGuard desktop] vision service exited", code);
    visionProcess = null;
  });
}

function stopVisionService() {
  if (!visionProcess) {
    return;
  }
  visionProcess.kill();
  visionProcess = null;
}

function focusMainWindow() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    return false;
  }

  if (win.isMinimized()) {
    win.restore();
  }
  try {
    app.focus({ steal: true });
  } catch {
    app.focus();
  }
  win.show();
  win.moveTop();
  win.webContents.focus();
  win.focus();
  return true;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#071018",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win.setTitle("EyeGuard");
  configureMediaPermissions(win.webContents.session);
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
      forceBreakPinned = false;
    }
  });

  const frontendEntry = resolveFrontendEntry();
  if (isDev) {
    let retriedWithLocalhost = false;
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3 || String(validatedURL).startsWith("data:text/html")) {
        return;
      }

      if (
        !retriedWithLocalhost &&
        typeof validatedURL === "string" &&
        validatedURL.includes("127.0.0.1")
      ) {
        retriedWithLocalhost = true;
        const localhostUrl = validatedURL.replace("127.0.0.1", "localhost");
        console.warn("[EyeGuard desktop] retrying renderer load with localhost", {
          from: validatedURL,
          to: localhostUrl
        });
        void win.loadURL(localhostUrl).catch((error) => {
          console.error("[EyeGuard desktop] localhost retry failed", error);
        });
        return;
      }

      console.error("[EyeGuard desktop] renderer failed to load", {
        errorCode,
        errorDescription,
        validatedURL
      });
      void win.loadURL(
        `data:text/html,${encodeURIComponent(`
          <html>
            <body style="margin:0;background:#071018;color:#f7f5ef;font-family:Aptos,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh;">
              <div style="max-width:720px;padding:32px 36px;border-radius:24px;background:rgba(17,25,32,.92);border:1px solid rgba(247,245,239,.1);box-shadow:0 24px 70px rgba(3,8,12,.28);">
                <p style="margin:0 0 12px;text-transform:uppercase;letter-spacing:.18em;font-size:.78rem;color:#aeb5ad;">EyeGuard desktop</p>
                <h1 style="margin:0 0 16px;font-size:2rem;">The frontend did not load.</h1>
                <p style="margin:0 0 12px;color:#d7ddd6;">Electron opened, but it could not reach the Vite dev server.</p>
                <p style="margin:0 0 18px;color:#aeb5ad;"><strong>URL:</strong> ${validatedURL || frontendEntry}</p>
                <p style="margin:0 0 18px;color:#aeb5ad;"><strong>Error:</strong> ${errorDescription} (${errorCode})</p>
                <pre style="white-space:pre-wrap;background:rgba(6,10,14,.52);padding:16px;border-radius:16px;border:1px solid rgba(247,245,239,.08);color:#f7f5ef;">npm.cmd --workspace apps/frontend run dev</pre>
                <p style="margin:16px 0 0;color:#aeb5ad;">Keep the frontend server running, then restart Electron.</p>
              </div>
            </body>
          </html>
        `)}`
      );
    });
    void win.loadURL(frontendEntry).catch((error) => {
      console.error("[EyeGuard desktop] loadURL threw", error);
    });
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(frontendEntry);
  }
}

app.whenReady().then(() => {
  const preferences = readPreferences();
  app.setLoginItemSettings({ openAtLogin: Boolean(preferences.launchOnStartup) });
  startVisionService();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle("launch-on-startup:set", (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  writePreferences({ launchOnStartup: Boolean(enabled) });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("vision-service:url", () => `http://127.0.0.1:${visionPort}`);

ipcMain.handle("notification:show", (_event, payload) => {
  if (!Notification.isSupported()) {
    console.warn("[EyeGuard desktop] notifications are not supported on this system");
    return false;
  }

  const title = typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : "EyeGuard";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  const focusOnClick = Boolean(payload?.focusOnClick);
  const notification = new Notification({
    title,
    body,
    silent: false
  });

  notification.on("click", () => {
    if (focusOnClick) {
      focusMainWindow();
    }
  });

  notification.show();
  console.info("[EyeGuard desktop] notification shown", { title, focusOnClick });
  return true;
});

ipcMain.handle("force-break:present", () => {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    return false;
  }

  forceBreakPinned = true;
  focusMainWindow();
  win.setAlwaysOnTop(true, "screen-saver");
  win.flashFrame(true);
  console.info("[EyeGuard desktop] force break presented");
  return true;
});

ipcMain.handle("force-break:release", () => {
  const win = mainWindow;
  forceBreakPinned = false;
  if (!win || win.isDestroyed()) {
    return false;
  }

  win.flashFrame(false);
  win.setAlwaysOnTop(false);
  console.info("[EyeGuard desktop] force break released");
  return true;
});

ipcMain.handle("system-blue-light:set", (_event, payload) =>
  applySystemBlueLightFilter(Boolean(payload?.enabled), Number(payload?.intensity))
);

app.on("window-all-closed", () => {
  stopVisionService();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (systemBlueLightFilterActive) {
    applySystemBlueLightFilterSync(false, 0);
  }
  stopVisionService();
});
