# Hostinger VPS — First-Time Setup Guide

Run these commands **once** when you SSH into a fresh VPS. After this, use `deploy.sh` for all future pushes.

## Prerequisites
- Hostinger VPS (Ubuntu 22.04 LTS recommended)
- SSH access as root
- Domain pointed to VPS IP (A record → VPS IP)

---

## Step 1 — SSH into VPS

```bash
ssh root@YOUR_VPS_IP
```

## Step 2 — Install Nginx

```bash
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx
```

## Step 3 — Create web root

```bash
mkdir -p /var/www/kindred-givings
chown -R www-data:www-data /var/www/kindred-givings
```

## Step 4 — Upload Nginx config

From your local machine (repo root):

```bash
scp deploy/nginx.conf root@YOUR_VPS_IP:/etc/nginx/sites-available/kindred-givings
```

Then on the VPS:

```bash
# Edit the config — replace YOURDOMAIN.com with your actual domain
nano /etc/nginx/sites-available/kindred-givings

# Enable the site
ln -s /etc/nginx/sites-available/kindred-givings /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Step 5 — Get SSL certificate

```bash
certbot --nginx -d app.YOURDOMAIN.com
# Follow prompts; Certbot will auto-configure HTTPS and renewal
```

## Step 6 — First deploy

From your local machine (repo root):

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh root@YOUR_VPS_IP
```

## Step 7 — Verify

Open `https://app.YOURDOMAIN.com` in a browser. You should see the Kindred Givings app.

---

## All future deploys

```bash
./deploy/deploy.sh root@YOUR_VPS_IP
```

That's it — builds locally, pushes `dist/`, reloads Nginx. ~30 seconds total.

---

## Supabase note

The app connects directly to Supabase cloud (`zaexufclxmrpiuxogsjo.supabase.co`).
No DB lives on this VPS — only the static frontend. Supabase RLS protects all data.
