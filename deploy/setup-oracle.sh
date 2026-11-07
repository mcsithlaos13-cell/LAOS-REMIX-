#!/usr/bin/env bash
# Run on a fresh Ubuntu VM (Oracle Cloud Always Free):  bash setup-oracle.sh
set -euo pipefail
APP_DIR="$HOME/LAOS-REMIX"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
[ -d "$APP_DIR/.git" ] && git -C "$APP_DIR" pull || git clone https://github.com/mcsithlaos13-cell/LAOS-REMIX-.git "$APP_DIR"
sudo tee /etc/systemd/system/laos-remix.service >/dev/null <<UNIT
[Unit]
Description=LAOS REMIX
After=network.target
[Service]
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Restart=always
User=$USER
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now laos-remix
# daily backup at 03:30 (keeps last 7)
( crontab -l 2>/dev/null | grep -v 'LAOS-REMIX backup'; echo "30 3 * * * cd $APP_DIR && /usr/bin/node backup.js >> backup.log 2>&1 # LAOS-REMIX backup" ) | crontab -
# free public HTTPS link via Cloudflare quick tunnel (URL changes on restart)
curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb"
sudo dpkg -i /tmp/cloudflared.deb
sudo tee /etc/systemd/system/laos-tunnel.service >/dev/null <<UNIT
[Unit]
Description=LAOS REMIX Cloudflare tunnel
After=network.target laos-remix.service
[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://localhost:3000
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now laos-tunnel
sleep 8; echo "ลิงก์เว็บของคุณ:"; sudo journalctl -u laos-tunnel --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
