# Cloudflare Setup Notes (Production)

Checklist and recommended settings when using Cloudflare in front of your VPS.

1. DNS
- Add `A` records pointing to your VPS public IP for each domain (e.g., `redirects.example.com`, `site.example.com`).
- If you want Cloudflare to proxy traffic, enable the orange cloud. For APIs you may choose to proxy or bypass depending on caching and WAF needs.

2. SSL/TLS
- Set SSL/TLS mode to `Full (strict)`.
- Install a Cloudflare Origin CA certificate on your server (recommended) or use Let's Encrypt and keep Cloudflare in full (strict) mode.

3. Page Rules / Cache
- Create a Page Rule for `https://*/api/*` (or your API domain) to `Cache Level: Bypass` and `Disable Performance` to ensure API responses are not cached.
- For WordPress front-end enable caching and performance settings as appropriate.

4. Firewall / Security
- Use Firewall Rules to block obvious threats and rate-limit abusive endpoints.
- Consider a rule to protect `wp-admin` and `xmlrpc.php` (allow only trusted IPs if possible).

5. Authenticated Origin Pulls (Optional)
- Enable and configure Authenticated Origin Pulls to ensure connections to your origin are from Cloudflare.

6. Headers
- Respect `CF-Connecting-IP` and `X-Forwarded-For` in your app. Nginx should set `real_ip_header CF-Connecting-IP;` if needed.

7. Workers / WAF
- Optionally use Cloudflare WAF for OWASP rules and custom rules for rate-limiting login or API abuse.
