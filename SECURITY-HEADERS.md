# HTTP security headers for deployment

The HTML meta policy is a fallback. For stronger enforcement, configure response headers at the CDN/hosting layer. GitHub Pages does not let a repository set arbitrary HTTP response headers, so use a CDN/edge configuration if you need these headers on the public site.

Recommended starting point (validate in staging before enforcement):

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https://pvuobngrybygohendwaz.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Notes:
- Send HSTS only after HTTPS is confirmed on every covered hostname; `includeSubDomains` requires every subdomain to support HTTPS.
- `frame-ancestors` is intentionally in the HTTP-header example because browsers ignore it in a CSP meta element.
- If a future payment provider, CAPTCHA provider, or media host requires another origin, add only the exact origin and directive it needs. Do not restore a blanket `frame-src https:`.
- The inline CSS and JavaScript patterns currently in this legacy app mean `unsafe-inline` remains in `style-src`; removing it requires a separate refactor of inline styles. Do not add `unsafe-inline` to `script-src` as a workaround.
