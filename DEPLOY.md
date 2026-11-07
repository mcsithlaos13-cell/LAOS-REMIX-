# ขึ้นเว็บ LAOS REMIX ให้เป็นสาธารณะ (ฟรี)

## 1) สมัคร Oracle Cloud (Always Free)
1. เข้า https://www.oracle.com/cloud/free/ แล้วกด Start for free
2. กรอกอีเมล ประเทศ และใส่บัตรเพื่อยืนยันตัวตน (ไม่ตัดเงินถ้าใช้เฉพาะ Always Free)
3. เลือก Home Region ให้ใกล้ที่สุด (เปลี่ยนภายหลังไม่ได้)

## 2) สร้างเครื่อง
1. เมนู Compute → Instances → Create instance
2. Image: Ubuntu 22.04 หรือ 24.04, Shape: เลือกที่มีป้าย "Always Free-eligible"
3. ในส่วน SSH keys เลือก Generate key pair แล้วดาวน์โหลด private key เก็บไว้
4. กด Create รอจนสถานะ Running แล้วจดค่า Public IP

## 3) เข้าเครื่องแล้วติดตั้ง
```
ssh -i <ไฟล์-private-key> ubuntu@<Public-IP>
git clone https://github.com/mcsithlaos13-cell/LAOS-REMIX-.git
bash LAOS-REMIX-/deploy/setup-oracle.sh
```
สคริปต์จะพิมพ์ลิงก์ `https://xxxx.trycloudflare.com` ออกมาตอนท้าย นั่นคือลิงก์เว็บ
(ไม่ต้องเปิดพอร์ตใน Oracle เพราะใช้ Cloudflare Tunnel)

## 4) ดูลิงก์อีกครั้ง / ดูสถานะ
```
sudo journalctl -u laos-tunnel --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
sudo systemctl status laos-remix
```

## 5) อัปเดตเว็บเมื่อแก้โค้ด
```
cd ~/LAOS-REMIX- && git pull && sudo systemctl restart laos-remix
```
(สคริปต์ใช้โฟลเดอร์ ~/LAOS-REMIX ถ้าโคลนเป็นชื่อ LAOS-REMIX- ให้ใช้ชื่อนั้นแทน)

## ข้อมูลและการสำรอง
- ข้อมูล: `data/laos-remix.db` และ `uploads/` อยู่บนดิสก์ของเครื่อง
- สำรองอัตโนมัติทุกวัน 03:30 ไว้ที่ `backups/` (เก็บ 7 ครั้งล่าสุด) ดาวน์โหลดเก็บเองได้ด้วย `scp`
- ลิงก์ trycloudflare เปลี่ยนเมื่อรีสตาร์ต ถ้าอยากได้ลิงก์ถาวรต้องมีโดเมนและตั้ง Cloudflare named tunnel
