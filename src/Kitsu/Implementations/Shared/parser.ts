/* SPDX-License-Identifier: GPL-3.0-or-later */

import { ContentRating, type MangaInfo, type SearchResultItem } from "@paperback/types";

import type { KitsuImage, MangaAttributes, MangaResource } from "./models";

export const SITE_URL = "https://kitsu.app";

export function getContentRating(attributes: MangaAttributes): ContentRating {
  if (attributes.ageRating === "R18" || attributes.nsfw === true) {
    return ContentRating.ADULT;
  }
  if (attributes.ageRating === "R") {
    return ContentRating.MATURE;
  }
  return ContentRating.EVERYONE;
}

/** Canonical title first, then every other distinct title Kitsu knows about. */
export function parseTitles(attributes: MangaAttributes): string[] {
  const all = [
    attributes.canonicalTitle,
    attributes.titles?.en,
    attributes.titles?.en_jp,
    attributes.titles?.ja_jp,
    ...(attributes.abbreviatedTitles ?? []),
  ].filter((title): title is string => typeof title === "string" && title.trim().length > 0);

  return [...new Set(all)];
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
  const titles = parseTitles(a);

  // Kitsu's average rating is a percentage string ("82.28"); Paperback wants 0-1.
  const percent = a.averageRating != null ? Number(a.averageRating) : NaN;

  const additionalInfo: Record<string, string> = {};
  if (a.subtype) additionalInfo["Type"] = a.subtype;
  if (a.chapterCount) additionalInfo["Chapters"] = String(a.chapterCount);
  if (a.volumeCount) additionalInfo["Volumes"] = String(a.volumeCount);
  if (a.serialization) additionalInfo["Serialization"] = a.serialization;

  return {
    primaryTitle: titles[0] ?? "Unknown",
    secondaryTitles: titles.slice(1),
    synopsis: a.synopsis ?? "",
    thumbnailUrl: pickImage(a.posterImage, ["large", "medium", "original", "small"]),
    status: parseStatus(a.status),
    rating: Number.isFinite(percent) ? percent / 100 : undefined,
    contentRating: getContentRating(a),
    contentType: a.subtype === "novel" ? "novel" : "comic",
    additionalInfo,
    shareUrl: a.slug ? `${SITE_URL}/manga/${a.slug}` : undefined,
  };
}

export function parseSearchResult(manga: MangaResource): SearchResultItem {
  const a = manga.attributes;
  const titles = parseTitles(a);

  return {
    mangaId: manga.id,
    title: titles[0] ?? "Unknown",
    subtitle: a.subtype ?? undefined,
    imageUrl: pickImage(a.posterImage, ["medium", "small", "large", "original"]),
    contentRating: getContentRating(a),
  };
}
