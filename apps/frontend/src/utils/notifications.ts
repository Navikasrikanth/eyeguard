type WellnessNotificationPayload = {
  title: string;
  body: string;
  tag?: string;
  focusOnClick?: boolean;
};

export async function requestWellnessNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (window.electronBridge?.showNotification) {
    return "granted";
  }

  if (!("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }

  return Notification.permission;
}

export async function showWellnessNotification(payload: WellnessNotificationPayload): Promise<boolean> {
  if (window.electronBridge?.showNotification) {
    try {
      return await window.electronBridge.showNotification({
        title: payload.title,
        body: payload.body,
        focusOnClick: payload.focusOnClick ?? true
      });
    } catch (error) {
      console.warn("[EyeGuard notifications] Electron notification failed", error);
    }
  }

  if (!("Notification" in window)) {
    return false;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      console.warn("[EyeGuard notifications] browser permission request failed", error);
      return false;
    }
  }

  if (permission !== "granted") {
    return false;
  }

  const notification = new Notification(payload.title, {
    body: payload.body,
    tag: payload.tag
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return true;
}
