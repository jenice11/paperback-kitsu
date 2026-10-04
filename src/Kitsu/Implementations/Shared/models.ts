/* SPDX-License-Identifier: GPL-3.0-or-later */

// Minimal JSON:API + Kitsu typings; only the fields this extension reads.

export interface JsonApiResource<A> {
  id: string;
  type: string;
  attributes: A;
}

export interface JsonApiError {
  title?: string;
  detail?: string;
  status?: string;
}

export interface JsonApiDocument<T> {
  data: T;
  meta?: { count?: number };
  links?: { next?: string };
  errors?: JsonApiError[];
}

export interface KitsuImage {
  tiny?: string;
  small?: string;
  medium?: string;
  large?: string;
  original?: string;
}

export interface MangaAttributes {
  slug?: string;
  synopsis?: string | null;
  titles?: Record<string, string | null | undefined>;
  canonicalTitle?: string;
  abbreviatedTitles?: string[] | null;
  /** Percentage as a string, e.g. "82.28" */
  averageRating?: string | null;
  ageRating?: "G" | "PG" | "R" | "R18" | null;
  /** current | finished | tba | unreleased | upcoming */
  status?: string | null;
  subtype?: string | null;
  chapterCount?: number | null;
  volumeCount?: number | null;
  posterImage?: KitsuImage | null;
  serialization?: string | null;
}
export type MangaResource = JsonApiResource<MangaAttributes>;

export type LibraryStatus = "current" | "planned" | "completed" | "on_hold" | "dropped";

export interface LibraryEntryAttributes {
  status?: LibraryStatus;
  progress?: number;
  /** 2-20 in steps of 1, i.e. the 1-10 star rating doubled */
  ratingTwenty?: number | null;
  progressedAt?: string | null;
}
export type LibraryEntryResource = JsonApiResource<LibraryEntryAttributes>;

export interface UserAttributes {
  name?: string;
  slug?: string;
}
export type UserResource = JsonApiResource<UserAttributes>;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  /** Seconds until the access token expires (30 days by default) */
  expires_in: number;
  created_at: number;
  scope?: string;
}

export interface TokenErrorResponse {
  error?: string;
  error_description?: string;
}
