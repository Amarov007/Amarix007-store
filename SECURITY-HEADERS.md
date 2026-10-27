# HTTP security headers for deployment

The CSP in the `<meta http-equiv="Content-Security-Policy">` of `index.html` and `admin.html` is the fallback that always applies. **GitHub Pages cannot set response headers itself**, so headers that browsers ignore in a `<meta>` (notably `frame-ancestors`) and the other security headers must be added at the edge — here with Cloudflare Transform Rules (the site is already behind Cloudflare, see `CNAME`).

## The policy (must match the meta tag in both HTML files)

```text
default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https://pvuobngrybygohendwaz.supabase.co https://challenges.cloudflare.com https://oauth.telegram.org; frame-src https://challenges.cloudflare.com https://oauth.telegram.org; object-src 'none'; base-uri 'self'; form-action 'self'
```

What each external origin is for:

| Origin | Directive(s) | Why |
| --- | --- | --- |
| `https://pvuobngrybygohendwaz.supabase.co` | `connect-src` | Supabase Auth, REST/RPC, Storage, Edge Functions |
| `https://challenges.cloudflare.com` | `script-src`, `connect-src`, `frame-src` | Cloudflare Turnstile (loads `api.js`, talks to the challenge API, renders its widget in an iframe) |
| `https://telegram.org` | `script-src` | Telegram Login popup (`telegram-widget.js`, loaded only for visitors who are not signed in) |
| `https://oauth.telegram.org` | `connect-src`, `frame-src` | Telegram Login popup / fallback frame |
| `https://fonts.googleapis.com` / `https://fonts.gstatic.com` | `style-src` / `font-src` | Alexandria + Urbanist |
| any `https:` host | `img-src` only | product/banner/payment images uploaded in the admin panel |

`frame-src` used to be `https:` (any site could be framed). It is now Turnstile only.

### Admin-defined embeds (read before deploying)
`app.js` can render an `<iframe>` for **admin-defined embeds**: the "التضمين / Embeds" tab (`CFG.embeds`) and a category's `embed_url` (e.g. the "البونصات المجانية" category, type `embed`). Those URLs live in the live `store_config`, not in the repository (`store-data.js` has `embeds: []` and empty `embed_url`s). With the policy above such an iframe is **blocked** unless its origin is listed in `frame-src`. Before enforcing, open the admin panel → التضمين and the category settings, and for every embed that must keep working add only that exact origin to `frame-src` (in both HTML meta tags *and* the Cloudflare rule), e.g. `frame-src https://challenges.cloudflare.com https://player.example.com`. Do not go back to a blanket `https:`.

Other things checked in `app.js`/`admin.js`: no payment widgets, video players or maps are embedded; WhatsApp/Telegram/social links are plain `target="_blank"` navigations (not governed by `frame-src`/`connect-src`).

## Cloudflare Transform Rules

Cloudflare dashboard → your zone → **Rules → Transform Rules → Modify Response Header → Create rule**. The DNS record for the site must be **proxied** (orange cloud), otherwise the rules never run. Use "Set static" for every header below. Create the three rules in this order.

### Rule 1 — all pages and files
- Name: `AMX security headers (all)`
- When incoming requests match → *Custom filter expression*: `(http.host eq "amarix007.store") or (http.host eq "www.amarix007.store")`
- Then → **Set static**:

| Header | Value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

HSTS notes: send it only after HTTPS works on every subdomain (`includeSubDomains`). If unsure, start with `max-age=86400` for a day, then raise it. Do not add `preload` unless you intend to submit the domain to the preload list (hard to undo).

### Rule 2 — the store pages (CSP)
- Name: `AMX CSP (store)`
- Expression: `(http.host eq "amarix007.store") and (http.request.uri.path in {"/" "/index.html" "/faq/" "/faq/index.html" "/policies/" "/policies/index.html" "/404.html"})`
- Set static → `Content-Security-Policy`:

```text
default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https://pvuobngrybygohendwaz.supabase.co https://challenges.cloudflare.com https://oauth.telegram.org; frame-src https://challenges.cloudflare.com https://oauth.telegram.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

### Rule 3 — the admin panel (CSP with `frame-ancestors 'none'`)
- Name: `AMX CSP (admin)`
- Expression: `(http.host eq "amarix007.store") and (http.request.uri.path in {"/admin" "/admin.html"})`
- Set static → `Content-Security-Policy`:

```text
default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https://pvuobngrybygohendwaz.supabase.co https://challenges.cloudflare.com https://oauth.telegram.org; frame-src https://challenges.cloudflare.com https://oauth.telegram.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Also set `X-Frame-Options: DENY` on this rule for very old browsers (optional; `frame-ancestors` already covers modern ones). The page keeps its JavaScript anti-framing check (`admin-boot.js`) as a second layer.

If an embed origin is added to `frame-src` (see above), change it in rules 2 and 3 as well as in both `<meta>` tags — the meta tag and the header are **both** enforced, so the effective policy is their intersection; keeping them identical avoids surprises. `tests/verify-project.py` checks that the two meta tags are identical.

### Check after saving
```bash
curl -sI https://amarix007.store/ | grep -i -E "content-security|strict-transport|x-content-type|referrer-policy|permissions-policy"
curl -sI https://amarix007.store/admin.html | grep -i -E "content-security-policy"   # must contain frame-ancestors 'none'
```
Then load the store, log in (Turnstile widget must appear) and open the browser console: no `Refused to ...` CSP messages.

## Notes
- `style-src` keeps `'unsafe-inline'` because the legacy app uses inline `style=""` attributes; never add `'unsafe-inline'` to `script-src`.
- Session tokens (`amx_token`, `amx_refresh`) are kept in `localStorage` by design, so any script that runs on the page could read them. The strict `script-src 'self'` (no inline scripts, only Turnstile as external script origin) is the main protection against that — keep it strict and review any new third-party script before adding its origin.
- If a future payment provider, CAPTCHA provider or media host needs another origin, add only that exact origin and directive.
