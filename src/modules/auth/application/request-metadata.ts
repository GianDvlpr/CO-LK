const UNKNOWN_IP = "unknown";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}

export function getRequestIp(request: Request) {
  const ip =
    firstHeaderValue(request.headers.get("x-forwarded-for")) ??
    firstHeaderValue(request.headers.get("x-real-ip")) ??
    firstHeaderValue(request.headers.get("cf-connecting-ip"));
  return (ip ?? UNKNOWN_IP).slice(0, 100);
}

export function getRequestUserAgent(request: Request) {
  return request.headers.get("user-agent")?.trim().slice(0, 1000) || undefined;
}
