# 6. Access by secret link, WebSocket by one-time ticket

**Status:** accepted

## Decision

- No accounts. A board has a public id and a secret key; the invite link is `/b/<id>#k=<key>`. The fragment
  never goes to a server or a Referer; the key is POSTed once to join and stored hashed.
- Joining sets an httpOnly, SameSite=Lax cookie **scoped to `/api/boards/<id>`**: one cookie per board, sent
  nowhere else. State-changing requests must come from an allowed `Origin`.
- The web app (Vercel) proxies REST under its own origin, but not WebSockets: the browser trades its cookie
  for a 60-second, single-use ticket and opens the socket straight to the server, which checks `Origin` and
  redeems the ticket before upgrading.

## Consequences

A leaked WebSocket URL is useless; the server never logs query strings. Losing the cookie means joining again;
changes saved in the browser are kept and sent after that.
