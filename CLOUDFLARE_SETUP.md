# เชื่อม LAOS REMIX กับ Cloudflare

ตัวเว็บพร้อมใช้ Cloudflare Worker API แล้ว ต้องสร้างที่เก็บข้อมูลในบัญชี Cloudflare ก่อนเชื่อมการเผยแพร่:

1. เชื่อม D1 database `sith` ที่สร้างไว้แล้ว (ตั้งค่า ID ไว้ใน `wrangler.jsonc` แล้ว)
2. เปิดใช้ R2 Object Storage และสร้าง bucket ชื่อ `laos-remix-media`
3. ใน Worker `laos-remix` ตั้ง secret ชื่อ `ADMIN_PASSWORD` ด้วยรหัสเจ้าของเว็บที่คุณกำหนดเอง
4. หลังเชื่อม R2 และตั้ง secret แล้ว เผยแพร่ Worker
5. หลัง Worker เผยแพร่แล้ว ย้ายข้อมูลและไฟล์เพลงเดิมด้วยสคริปต์ใน `scripts/migrate-to-cloudflare.js` โดยตั้ง `LAOS_REMIX_ADMIN_PASSWORD` ในเครื่องก่อนเรียกใช้ สคริปต์จะย้ายรายชื่อ เพลง รูปปก และไฟล์เสียงจาก `data/` กับ `uploads/`

การตั้ง secret ต้องทำใน Cloudflare Dashboard โดยเจ้าของบัญชีเอง อย่าส่งรหัสผ่านในแชตหรือ commit ลง GitHub
