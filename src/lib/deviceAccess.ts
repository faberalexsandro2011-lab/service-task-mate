const DEVICE_KEY = "centralos-device-id-v1";

export function getCentralOSDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing && existing.length >= 16) return existing;
  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(DEVICE_KEY, generated);
  return generated;
}

export function getCentralOSDeviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Microsoft Edge"
    : /Chrome\//.test(ua) ? "Google Chrome"
    : /Firefox\//.test(ua) ? "Mozilla Firefox"
    : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? "Safari"
    : "Navegador";
  const device = /Android/i.test(ua) ? "Celular/tablet Android"
    : /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad"
    : /Windows/i.test(ua) ? "Computador Windows"
    : /Macintosh|Mac OS/i.test(ua) ? "Computador Mac"
    : /Linux/i.test(ua) ? "Computador Linux"
    : "Dispositivo";
  return `${device} · ${browser}`;
}

export function getCentralOSUserAgent(): string {
  return navigator.userAgent || "Navegador não identificado";
}
