# Todo: Verify Legacy Sensor Pins

- [x] ระบุไฟล์ firmware/dashboard เดิมที่กำหนด pin ของ sensor
- [x] ตรวจ DHT type และหมายเลข GPIO/D pin จากโค้ดจริง
- [x] ตรวจ MQTT topic/payload ที่ส่งค่าจาก sensor
- [x] เทียบกับ parser และ label ใน dashboard ใหม่
- [x] แก้เฉพาะ mapping/config หากพบ mismatch ที่ยืนยันได้
- [x] รัน typecheck/build และตรวจ diff ไม่แตะระบบเก่า
- [x] สรุป pin ที่ยืนยันได้และรายการที่ต้องวัดกับ ESP จริง
