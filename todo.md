# Todo: Fix Duplicate React Keys

- [x] ระบุทุกจุดที่ render รายการ action ด้วย key ที่ไม่ unique
- [x] เปลี่ยน key เป็น identifier ที่มีเอกลักษณ์ต่อรายการ โดยไม่เปลี่ยนข้อความที่แสดง
- [x] ตรวจไม่มี duplicate key ในรายการสถานะและ action อื่น
- [x] รัน typecheck/build และตรวจ browser console หลังแก้
- [x] สร้าง checkpoint ฉบับส่งมอบ

## Smart Farm Implementation

- [x] Backend-only MQTT service with TLS options, reconnect backoff, duplicate subscription/listener protection, and truthful connection status
- [x] Relay 4-channel desired/confirmed state reconciliation with pending timeout
- [x] DHT22 telemetry freshness timeout and SENSOR ERROR handling
- [x] RTC and heartbeat monitoring with Online / Offline and RTC ERROR states
- [x] HTTP API and SSE event stream for the Dashboard; no frontend MQTT credentials
- [x] SQLite persistence for telemetry, heartbeat, and relay events using Node 22 `node:sqlite`
- [x] Elegant responsive Dashboard with relay cards, pending confirmation, telemetry cards, and system status
- [x] ESP8266 firmware sample for DHT22, RTC, Relay x4, heartbeat, retained online status, and acknowledgments
- [x] Environment template and Git ignore rules for MQTT secrets and runtime database files
- [x] Architecture and setup documentation
- [x] Vitest coverage for desired/confirmed state and freshness/offline detection
- [x] TypeScript check, tests, production build, and server startup smoke test
- [ ] Validate with the user's real MQTT broker and physical ESP8266 hardware
- [ ] Replace firmware TLS `setInsecure()` placeholder with the broker CA certificate before production
- [ ] Configure deployment process and TLS certificate rotation policy

## Simple Usage Improvements

- [x] เพิ่มคำสั่ง setup แบบง่ายสำหรับติดตั้ง dependency และสร้าง .env จาก template
- [x] เพิ่มคำสั่ง start แบบง่ายสำหรับ build และเริ่ม Backend/Dashboard
- [x] เพิ่มไฟล์ตัวอย่างตั้งค่า MQTT ที่อ่านง่าย พร้อมคำอธิบายภาษาไทย
- [x] เขียนคู่มือ Quick Start ภาษาไทยแบบทำตามทีละขั้น�ยที่สุด
- [x] เพิ่มการตรวจสอบค่าตั้งค่าที่จำเป็นและข้อความ error ที่เข้าใจง่าย
- [x] ทดสอบ flow setup/start และ push การปรับปรุงขึ้น GitHub
