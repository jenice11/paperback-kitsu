# Kitsu Tracker Extenstion

Paperback 0.9 tracker extension for [kitsu.app](https://kitsu.app). It syncs your
**manga reading progress (chapter number)**.

## What it does

- Log in with your Kitsu email/username and password (Kitsu only supports the OAuth
  password grant). Only tokens are stored, in Paperback's secure state, and they are
  refreshed automatically.
- Planned: ratings, status changes, volumes, removing entries,
  collection import, discover sections.

## Security notes

- The password is only sent once, to Kitsu's token endpoint, and is cleared from memory
  right after a successful login. It is never logged or stored.
- Access and refresh tokens live only in Paperback's secure state and in the
  `Authorization` header; they are never put in URLs.
- Anything not written by this extension (server error bodies, errors from the host
  runtime) is passed through `redact()` in `Implementations/Shared/log.ts` before it
  is logged or shown in the UI, so a server or runtime that echoes a secret back
  won't leak it.

## Install

https://jenice11.github.io/paperback-kitsu/0.9/stable/

## Develop

Requires Node 24 (same as CI).

```sh
npm ci
npm run dev          # serve with watch, add the printed URL in Paperback
npm run conformance  # tsc + lint + format check
npm run bundle
```

## License

GPL-3.0-or-later. The project layout and tooling follow Inkdex's
[template-extensions](https://github.com/inkdex/template-extensions).
