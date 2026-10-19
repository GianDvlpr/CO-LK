export const SESSION_DURATION_HOURS = 8;

export function sessionExpiresAt(startedAt = new Date()) {
  return new Date(startedAt.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
}
