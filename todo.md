# Todo: Legacy Dashboard MQTT Compatibility

- [x] ระบุ repository/branch ที่เป็น dashboard เก่า
- [x] อ่านเฉพาะไฟล์ MQTT, RTC, ESP และ relay โดยไม่แก้ไขไฟล์ต้นฉบับ
- [x] สรุป topic, payload, credentials flow และ event lifecycle เดิม
- [x] ตรวจจุดเสี่ยงเรื่อง duplicate listener และ topic collision
- [x] สร้าง adapter แยกสำหรับ dashboard ใหม่โดยคง contract เดิม
- [x] รัน typecheck/build และตรวจ diff ว่าไม่แตะระบบเก่า
- [ ] สร้าง checkpoint พร้อมรายงาน compatibility
