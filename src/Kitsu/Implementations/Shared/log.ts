/* SPDX-License-Identifier: GPL-3.0-or-later */

import { getSession } from "./session";

/**
 * Anything that can end up in a log line or an error shown to the user but
 * wasn't written by us (server error bodies, errors thrown by the host
 * runtime, which may carry the request headers) goes through here first.
 */
export function redact(text: string, ...extraSecrets: (string | undefined)[]): string {
  let out = text
    // Authorization header values
    .replace(/Bearer\s+[^\s"',}\\]+/gi, "Bearer ***")
    // secrets as JSON fields, including JSON escaped inside another string
    .replace(
      /(\\?"(?:password|access_token|refresh_token|accessToken|refreshToken)\\?"\s*:\s*\\?")[^"\\]*/gi,
      "$1***",
    );

  const session = getSession();
  for (const secret of [session?.accessToken, session?.refreshToken, ...extraSecrets]) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join("***");
    }
  }
  return out;
}

/** One-line, redacted description of a caught value. No stack traces. */
export function errorText(e: unknown, ...extraSecrets: (string | undefined)[]): string {
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return redact(text, ...extraSecrets);
}
