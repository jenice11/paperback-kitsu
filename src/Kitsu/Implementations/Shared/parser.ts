/* SPDX-License-Identifier: GPL-3.0-or-later */

import { ContentRating, type MangaInfo, type SearchResultItem } from "@paperback/types";

import type { KitsuImage, MangaAttributes, MangaResource } from "../../Services/models";

const SITE_URL = "https://kitsu.app";
const UNKNOWN_TITLE = "Unknown";

function parseContentRating(attributes: MangaAttributes): ContentRating {
  if (attributes.ageRating === "R18") {
    return ContentRating.ADULT;
  }
  if (attributes.ageRating === "R") {
    return ContentRating.MATURE;
  }
  return ContentRating.EVERYONE;
}

/** Canonical title first, then every other distinct title Kitsu knows about. */
function parseTitles(attributes: MangaAttributes): string[] {
  const all = [
    attributes.canonicalTitle,
    attributes.titles?.en,
    attributes.titles?.en_jp,
    attributes.titles?.ja_jp,
    ...(attributes.abbreviatedTitles ?? []),
  ].filter((title): title is string => typeof title === "string" && title.trim().length > 0);

  return [...new Set(all)];
}

export function parsePrimaryTitle(attributes: MangaAttributes): string {
  return parseTitles(attributes)[0] ?? UNKNOWN_TITLE;
}

function pickImage(image: KitsuImage | null | undefined, order: (keyof KitsuImage)[]): string {
  for (const size of order) {
    const url = image?.[size];
    if (url) {
      return url;
    }
  }
  return "";
}

function parseStatus(status: string | null | undefined): string {
  switch (status) {
    case "current":
      return "Ongoing";
    case "finished":
      return "Finished";
    case "upcoming":
    case "unreleased":
      return "Upcoming";
    case "tba":
      return "TBA";
    default:
      return "Unknown";
  }
}

export function parseMangaInfo(manga: MangaResource): MangaInfo {
  const a = manga.attributes;

  // Kitsu's average rating is a percentage string ("82.28"); Paperback wants 0-1.
  const percent = a.averageRating != null ? Number(a.averageRating) : NaN;

  const additionalInfo: Record<string, string> = {};
  if (a.subtype) {
    additionalInfo["Type"] = a.subtype;
  }
  if (a.chapterCount) {
    additionalInfo["Chapters"] = String(a.chapterCount);
  }
  if (a.volumeCount) {
    additionalInfo["Volumes"] = String(a.volumeCount);
  }
  if (a.serialization) {
    additionalInfo["Serialization"] = a.serialization;
  }

  const [primaryTitle = UNKNOWN_TITLE, ...secondaryTitles] = parseTitles(a);

  return {
    primaryTitle,
    secondaryTitles,
    synopsis: a.synopsis ?? "",
    thumbnailUrl: pickImage(a.posterImage, ["large", "medium", "original", "small"]),
    status: parseStatus(a.status),
    rating: Number.isFinite(percent) ? percent / 100 : undefined,
    contentRating: parseContentRating(a),
    contentType: a.subtype === "novel" ? "novel" : "comic",
    additionalInfo,
    shareUrl: a.slug ? `${SITE_URL}/manga/${a.slug}` : undefined,
  };
}

export function parseSearchResult(manga: MangaResource): SearchResultItem {
  const a = manga.attributes;

  return {
    mangaId: manga.id,
    title: parsePrimaryTitle(a),
    subtitle: a.subtype ?? undefined,
    imageUrl: pickImage(a.posterImage, ["medium", "small", "large", "original"]),
    contentRating: parseContentRating(a),
  };
}

/** Kitsu timestamp to `YYYY-MM-DD` (UTC), or "" when the date is not set. */
export function toDateText(iso: string | null | undefined): string {
  return iso?.slice(0, 10) ?? "";
}

/** `YYYY-MM-DD` to a Kitsu timestamp; "" gives null, which clears the date. */
export function parseDateText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  // Comparing back rejects dates JS would roll over, like 2026-02-31.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== trimmed
  ) {
    throw new Error(`"${trimmed}" is not a date. Use YYYY-MM-DD.`);
  }
  return date.toISOString();
}

/** Today on the user's own calendar, as a Kitsu timestamp. */
export function todayTimestamp(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}T00:00:00.000Z`;
}
