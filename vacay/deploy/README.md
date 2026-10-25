# Deploying Vacay

## Unraid (one command)

Open the Unraid terminal (top-right `>_` icon) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Leshko/ShedIt/main/vacay/deploy/unraid-deploy.sh | bash
```

Then open `http://<unraid-ip>:3001`. Data persists in `/mnt/user/appdata/vacay`.
Run the same command again any time to update.

If the pull is refused, the package is still private on GitHub: on github.com
open your profile → Packages → `vacay` → Package settings → Change visibility →
Public. (Or `docker login ghcr.io` on the box with a personal access token that
has `read:packages`.)

## Build from source instead

On any box with Docker:

```bash
git clone https://github.com/Leshko/ShedIt.git
cd ShedIt/vacay
docker compose up -d --build
```

## Reaching it from outside the house

The app is designed for a family on different networks. Put it behind whatever
you already use on Unraid (Nginx Proxy Manager, SWAG, Cloudflare Tunnel,
Tailscale) and share that URL. Invite links are `https://<your-host>/join/<CODE>`.
