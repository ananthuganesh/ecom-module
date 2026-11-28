# Lock the server to Cloudflare

## Why

With `TRUST_PROXY=1` the API takes the shopper's IP from Cloudflare's
`CF-Connecting-IP` header (`apps/api/app/services/rate_limit.py`). Every
per-IP limit — OTP, login, contact form, checkout, coupons — keys on that IP.

If the server can be reached **without** going through Cloudflare, anyone can
send a made-up `CF-Connecting-IP` on each request and get a fresh rate-limit
bucket every time. Locking the server so only Cloudflare can reach it closes
that hole.

`docker-compose.yml` publishes `3000` (web) and `8001` (API) on all
interfaces, so both are reachable by IP unless something in front blocks them.

## Check whether you're exposed

From a machine outside the server (not through Cloudflare):

```bash
curl -m 5 -sI http://<server-public-ip>:3000/ | head -1
curl -m 5 -sI http://<server-public-ip>:8001/api/health | head -1
```

A response means the origin is exposed. A timeout means something already
blocks it.

## Fix — option A: Cloudflare Tunnel (recommended)

No open ports at all; Cloudflare connects out to Cloudflare.

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create tunnel
   (cloudflared). Install the connector on the server as shown.
2. Public hostnames: `urbanaana.com` → `http://localhost:3000`, and
   `api.urbanaana.com` → `http://localhost:8001` if that subdomain is used.
3. In `docker-compose.yml`, bind the ports to localhost only:
   `"127.0.0.1:3000:3000"` and `"127.0.0.1:8001:8000"`.
4. Close 80/443/3000/8001 in the cloud provider's firewall / security group.

## Fix — option B: allow only Cloudflare IPs

Docker-published ports **skip `ufw`**, so a plain `ufw allow` rule is not
enough. Either:

- put nginx (or Caddy) on 80/443 in front, firewall 80/443 to
  [Cloudflare's IP ranges](https://www.cloudflare.com/ips/), and bind the
  containers to `127.0.0.1` as in option A step 3; or
- add the Cloudflare ranges to the `DOCKER-USER` iptables chain and drop
  everything else for ports 3000/8001.

Cloudflare's ranges change occasionally; refresh them from
`https://www.cloudflare.com/ips-v4` and `/ips-v6` (a weekly cron is enough).

## After

- Keep `TRUST_PROXY=1`.
- Re-run the two `curl` checks above: both should time out.
