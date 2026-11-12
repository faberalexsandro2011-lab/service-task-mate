const DEVICE_KEY = "centralos-device-id-v1";
const DEVICE_COOKIE_KEY = "centralos-device-id-v1";

function readDeviceCookie(): string | null {
  const prefix = `${DEVICE_COOKIE_KEY}=`;
  const entry = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return null;
  }
}

function writeDeviceCookie(deviceId: string): void {
  const isCentralOsDomain = window.location.hostname === "centralos.tec.br"
    || window.location.hostname.endsWith(".centralos.tec.br");
  const domain = isCentralOsDomain ? "; Domain=.centralos.tec.br" : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${DEVICE_COOKIE_KEY}=${encodeURIComponent(deviceId)}; Max-Age=31536000; Path=/; SameSite=Lax${domain}${secure}`;
}

export function getCentralOSDeviceId(): string {
  // O cookie compartilhado mantém o mesmo ID entre centralos.tec.br e www.centralos.tec.br.
  // O localStorage continua como cópia local e fallback caso cookies estejam indisponíveis.
  let localId: string | null = null;
  try {
    localId = window.localStorage.getItem(DEVICE_KEY);
  } catch {
    // Alguns navegadores podem bloquear o acesso ao armazenamento local.
  }

  const cookieId = readDeviceCookie();
  const existing = cookieId || localId;
  if (existing && existing.length >= 16 && existing.length <= 128) {
    try {
      window.localStorage.setItem(DEVICE_KEY, existing);
    } catch {
      // O cookie ainda mantém a identidade entre os endereços oficiais.
    }
    writeDeviceCookie(existing);
    return existing;
  }

  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(DEVICE_KEY, generated);
  } catch {
    // O cookie é o armazenamento persistente alternativo.
  }
  writeDeviceCookie(generated);
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
