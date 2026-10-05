/* SPDX-License-Identifier: GPL-3.0-or-later */

const logPrefix = "[kitsu-session]";
const STATE_SESSION = "kitsu_session";

export const NOT_LOGGED_IN = "You are not logged in, please log in through the Kitsu settings";

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which the access token expires */
  expiresAt: number;
  userId?: string;
  username?: string;
}

export function getSession(): Session | undefined {
  const raw = Application.getSecureState(STATE_SESSION) as string | null | undefined;
  if (raw == null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(String(raw)) as Partial<Session>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") {
      throw new Error("malformed session");
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: Number(parsed.expiresAt) || 0,
      userId: parsed.userId,
      username: parsed.username,
    };
  } catch {
    console.log(`${logPrefix} stored session is unreadable, clearing it`);
    clearSession();
    return undefined;
  }
}

export function setSession(session: Session): void {
  Application.setSecureState(JSON.stringify(session), STATE_SESSION);
}

export function clearSession(): void {
  Application.setSecureState(null, STATE_SESSION);
}

export function assertMustBeAuthenticated(): Session {
  const session = getSession();
  if (session == null) {
    throw new Error(NOT_LOGGED_IN);
  }
  return session;
}
