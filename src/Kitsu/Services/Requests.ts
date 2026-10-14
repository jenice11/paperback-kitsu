/* SPDX-License-Identifier: GPL-3.0-or-later */

import type { Request } from "@paperback/types";

import type {
  JsonApiDocument,
  TokenErrorResponse,
  TokenResponse,
  UserResource,
} from "../Implementations/Shared/models/main";
import { session } from "../Implementations/Shared/parser/main";
import { logError, redact } from "./log";

const API_ROOT = "https://kitsu.app/api";
const EDGE_ROOT = `${API_ROOT}/edge`;
const TOKEN_URL = `${API_ROOT}/oauth/token`;

const JSON_API = "application/vnd.api+json";

// Access tokens last 30 days; refresh a day early so a request never races
// the expiry.
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

class TokenError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  query?: Query;
  body?: object;
  /**
   * required: throws if logged out (default)
   * optional: sends the token if there is one (Kitsu hides R18 titles from
   *           anonymous requests, so search and details use this)
   */
  auth?: "required" | "optional";
  /** Use this token instead of the stored session (login, before one exists). Never retried. */
  token?: string;
}

function buildQuery(query?: Query): string {
  const parts = Object.entries(query ?? {}).map(
    ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
  );
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

async function send(request: Request): Promise<{ status: number; body: unknown }> {
  const [response, buffer] = await Application.scheduleRequest(request);
  const text = Application.arrayBufferToUTF8String(buffer);

  let body: unknown = undefined;
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }
  return { status: response.status, body };
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

////////////////
// OAuth

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  // NOTE: never log `params`, it contains the password / refresh token.
  const { status, body } = await send({
    url: TOKEN_URL,
    method: "POST",
    // OAuth endpoints take plain JSON, not the JSON:API media type.
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!isOk(status)) {
    const err = (body ?? {}) as TokenErrorResponse;
    throw new TokenError(err.error_description ?? err.error ?? `HTTP ${status}`, err.error);
  }

  const token = body as Partial<TokenResponse> | undefined;
  if (!token?.access_token || !token.refresh_token) {
    throw new TokenError("Kitsu returned an unexpected token response");
  }
  return token as TokenResponse;
}

function expiryOf(token: TokenResponse): number {
  return Date.now() + (Number(token.expires_in) || 0) * 1000;
}

export async function login(username: string, password: string): Promise<session.Session> {
  const logPrefix = "[login]";

  let token: TokenResponse;
  try {
    token = await requestToken({ grant_type: "password", username, password });
  } catch (e) {
    console.log(`${logPrefix} token request failed`);
    if (e instanceof TokenError && e.code === "invalid_grant") {
      throw new Error("Incorrect username or password");
    }
    throw new Error("Unable to log in to Kitsu, please try again later");
  }

  try {
    const doc = await makeRequest<JsonApiDocument<UserResource[]>>("/users", {
      query: { "filter[self]": "true" },
      token: token.access_token,
    });
    const user = doc.data[0];
    if (user == null) {
      throw new Error("no user on response");
    }

    const created: session.Session = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: expiryOf(token),
      userId: user.id,
      username: user.attributes.name ?? user.attributes.slug,
    };
    session.setSession(created);
    console.log(`${logPrefix} complete`);
    return created;
  } catch (e) {
    logError(`${logPrefix} failed to load the account`, e, token.access_token, token.refresh_token);
    throw new Error("Logged in, but could not load your Kitsu account");
  }
}

let refreshInFlight: Promise<session.Session> | undefined;

/** Concurrent callers share one refresh, in case Kitsu rotates refresh tokens. */
function refreshSession(): Promise<session.Session> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<session.Session> {
  const logPrefix = "[refreshSession]";
  const current = session.getSession();
  if (current == null) {
    throw new Error(session.NOT_LOGGED_IN);
  }

  try {
    const token = await requestToken({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    });
    const next: session.Session = {
      ...current,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: expiryOf(token),
    };
    session.setSession(next);
    console.log(`${logPrefix} complete`);
    return next;
  } catch (e) {
    console.log(`${logPrefix} failed`);
    // Only drop the session when Kitsu says the refresh token is dead. A
    // network blip shouldn't log the user out.
    if (e instanceof TokenError && e.code === "invalid_grant") {
      session.clearSession();
      throw new Error("Your Kitsu session has expired, please log in again through the settings");
    }
    throw new Error("Unable to refresh your Kitsu session, please try again later");
  }
}

async function getAccessToken(
  required: boolean,
  forceRefresh: boolean,
): Promise<string | undefined> {
  const current = session.getSession();
  if (current == null) {
    if (required) {
      throw new Error(session.NOT_LOGGED_IN);
    }
    return undefined;
  }

  if (!forceRefresh && Date.now() < current.expiresAt - REFRESH_MARGIN_MS) {
    return current.accessToken;
  }

  try {
    return (await refreshSession()).accessToken;
  } catch (e) {
    if (required) {
      throw e;
    }
    return undefined;
  }
}

////////////////
// API

function describeError(status: number, body: unknown): string {
  const errors = (body as Partial<JsonApiDocument<unknown>> | undefined)?.errors;
  const first = Array.isArray(errors) ? errors[0] : undefined;
  const detail = first?.detail ?? first?.title;
  return detail
    ? `Kitsu error (HTTP ${status}): ${detail}`
    : `Kitsu request failed (HTTP ${status})`;
}

export async function makeRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, auth = "required", token: explicitToken } = options;
  const logPrefix = `[request] ${method} ${path}`;
  const url = `${EDGE_ROOT}${path}${buildQuery(query)}`;

  let forceRefresh = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = explicitToken ?? (await getAccessToken(auth === "required", forceRefresh));

    const headers: Record<string, string> = { accept: JSON_API };
    if (body != null) {
      headers["content-type"] = JSON_API;
    }
    if (token != null) {
      headers.authorization = `Bearer ${token}`;
    }

    const start = Date.now();
    let result: { status: number; body: unknown };
    try {
      result = await send({
        url,
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      logError(`${logPrefix} failed: request error`, e, token);
      throw new Error("Unable to reach Kitsu, please check your connection");
    }
    console.log(`${logPrefix} -> HTTP ${result.status} (${Date.now() - start}ms)`);

    // The token might have been revoked early; refresh once and retry.
    if (result.status === 401 && token != null && explicitToken == null && attempt === 0) {
      forceRefresh = true;
      continue;
    }

    if (!isOk(result.status)) {
      // Server-controlled text: redact before it is logged or shown in the UI.
      const message = redact(describeError(result.status, result.body), token);
      console.log(`${logPrefix} failed: ${message}`);
      throw new Error(message);
    }

    if (result.body === undefined && result.status !== 204) {
      throw new Error("Unable to parse the response from Kitsu");
    }
    return result.body as T;
  }

  // Not reachable: the second attempt always returns or throws above.
  throw new Error("Request retry loop ended without a result");
}
