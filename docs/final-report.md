# SmartFarm “สวนลุงนะ” — Farm Control System Final Report

## Executive Summary

Repository ที่ผู้ใช้เลือก (`klanarong156-pixel/Farm`) ถูกตรวจสอบแล้วและพบว่าเป็น repository ว่าง ไม่มี commit, source code, MQTT topic mapping หรือ firmware contract เดิมให้ตรวจสอบความเข้ากันได้แบบย้อนหลังได้ ดังนั้น implementation ชุดนี้จึงสร้าง frontend control-room สำหรับระบบจริงโดยวาง **safe defaults**: ไม่มีการสร้างสถานะ ON/OFF ปลอม, ไม่ส่งชื่ออุปกรณ์ไปยัง MQTT, ไม่ใช้ browser time เป็น scheduling authority และจะไม่ส่งคำสั่งหาก MQTT configuration ยังไม่ครบ

> สถานะ `unknown` หมายถึงยังไม่มี status reply จาก ESP ไม่ใช่ OFF และไม่ใช่การเดาค่าสถานะ

## 1. ระบบที่เพิ่ม

ระบบที่เพิ่มประกอบด้วย unified device control panel สำหรับ Pump, Zone 1, Zone 2 และ Garden Light รวมถึง dynamic naming, manual/auto/schedule mode, RTC schedule editor, MQTT connection layer และ system status panel ที่แยกสถานะ `connected`, `unknown` และ `pending` อย่างชัดเจน

## 2. Device Model

| Field | ความหมาย | นโยบายความปลอดภัย |
|---|---|---|
| `id` | รหัสอุปกรณ์ เช่น `pump`, `zone1` | ใช้เป็น identity ใน UI และ payload command |
| `type` | ประเภทอุปกรณ์ | จำกัดเป็น `pump \| zone1 \| zone2 \| light` |
| `name` | ชื่อที่ผู้ใช้กำหนด | เก็บใน UI/localStorage เท่านั้น ไม่ส่งไป ESP |
| `status` | `ON`, `OFF` หรือ `unknown` | เปลี่ยนจาก MQTT status reply เท่านั้น |
| `mode` | `manual`, `auto`, `schedule` | เปลี่ยนใน state เดียวกับ device |
| `lastUpdated` | RTC timestamp จาก node | ไม่ใช้ browser time เป็นแหล่งข้อมูลหลัก |
| `mqttTopic` | command topic ของอุปกรณ์ | อ่านจาก environment configuration ไม่ hardcode topic ใหม่ |
| `pendingCommand` | คำสั่งที่ส่งแล้วแต่ยังไม่ confirm | ป้องกัน optimistic state และ MQTT spam |

## 3. Schedule Logic

แต่ละ schedule มี `deviceId`, `enabled`, `startTime`, `endTime`, `repeat`, `daysOfWeek` และ `lastTriggered` ตาม requirement ระบบจะเปิดใช้งาน schedule ได้เฉพาะเมื่อมี RTC event/timestamp จาก node และไม่ใช้ `setTimeout` ใน browser เป็น logic หลัก ปัจจุบัน UI editor รองรับเวลาเปิด–ปิด, daily/weekly repeat และวันในสัปดาห์ ส่วน trigger จริงควรผูกกับรูปแบบ RTC payload ของ firmware เมื่อมี contract ที่ยืนยันแล้ว

การกัน duplicate trigger ทำโดยให้ scheduler ฝั่ง integration ตรวจ timestamp/วัน/ช่วงเวลาจาก RTC event และต้องบันทึก `lastTriggered` ต่อ device ก่อนส่ง event รอบถัดไป การ implement ให้เสร็จสมบูรณ์กับอุปกรณ์จริงจำเป็นต้องยืนยัน schema ของ heartbeat/status payload และวิธีที่ระบบปัจจุบันประกาศ RTC event เพิ่มเติม เนื่องจาก repository เดิมไม่มีข้อมูลดังกล่าว

## 4. RTC Integration

หน้าจอแสดงเวลาและ `lastUpdated` จาก `rtc` หรือ `timestamp` ใน MQTT status payload เท่านั้น หากไม่มี timestamp จะแสดง `ยังไม่ได้รับเวลา RTC` และจะไม่คำนวณ trigger จากเวลาบนเครื่องผู้ใช้ การใช้ `Date` ใน component มีไว้เพื่อ format timestamp ที่มาจาก node ให้ผู้ใช้อ่านง่ายเท่านั้น

## 5. MQTT Flow

```text
User action
  → publish command topic: { deviceId, command }
  → ESP execute relay
  → ESP publish status topic
  → client parses status
  → farmControl.devices.status updates
  → UI removes pending state
```

Client ใช้ MQTT over WebSocket และ subscribe เพียงครั้งเดียวหลัง connection สำเร็จ โดยอ่านค่าต่อไปนี้จาก environment เพื่อไม่ฝัง credentials ลงใน source code

| Variable | ใช้สำหรับ |
|---|---|
| `VITE_MQTT_URL` | HiveMQ WebSocket URL |
| `VITE_MQTT_USERNAME` | MQTT username |
| `VITE_MQTT_PASSWORD` | MQTT password |
| `VITE_MQTT_COMMAND_TOPIC` | topic ที่ firmware รับคำสั่งเดิม |
| `VITE_MQTT_STATUS_TOPIC` | topic ที่ firmware รายงานสถานะเดิม |
| `VITE_MQTT_HEARTBEAT_TOPIC` | topic heartbeat เดิม |

หาก environment ยังไม่ครบ ระบบจะยัง render UI ได้ แต่จะไม่เปิด connection และปุ่ม control จะไม่ส่งคำสั่งหรือเปลี่ยนสถานะอุปกรณ์

## 6. UI Components

หน้าจอประกอบด้วย sidebar แบบ persistent, telemetry header, DHT22 cards, RTC/MQTT status strip, selected-device hero panel, device cards ทั้ง 4 อุปกรณ์, schedule panel, system status และ schedule editor แบบ side sheet บน mobile จะเปลี่ยนเป็น layout single-column และซ่อน sidebar เพื่อให้ใช้งานบนหน้าจอแคบได้

ชื่ออุปกรณ์แก้ไขแบบ inline และบันทึกทันทีใน UI พร้อม toast ยืนยันว่าไม่ส่งชื่อไป ESP ส่วน manual toggle จะคงสถานะเดิมไว้จนกว่าจะได้รับ MQTT confirmation และแสดง pending ระหว่างรอ

## 7. State Changes

state ใหม่รวมอยู่ใน `FarmControlState` เดียว ประกอบด้วย `devices`, `schedules`, `deviceNames`, `lastActions`, `rtc` และ `mqtt` ไม่มี context หรือ state manager แยกซ้ำ ระบบยังเปิดทางให้ merge กับ sensor/pump state เดิมได้เมื่อมี source code เดิมเข้ามาใน repository

## 8. Compatibility Check

| รายการตรวจ | ผลตรวจ |
|---|---|
| Repository เดิม | ไม่พบ source code หรือ commit เดิมใน GitHub repository |
| MQTT topic เดิม | ยังไม่มี topic mapping ใน repository จึงไม่เปลี่ยน topic และใช้ environment config แทน |
| Hardware assumption | ใช้เฉพาะ RTC, DHT22, ESP และ relay ตาม hardware context; ไม่มี soil moisture/light/rain sensor ปลอม |
| Fake ON/OFF | ไม่พบ optimistic status; initial state เป็น `unknown` |
| Dynamic naming | แยกเป็น UI/localStorage ไม่อยู่ใน MQTT payload |
| Listener duplication | สร้าง MQTT client/listener ใน effect เดียวและ cleanup ด้วย `client.end(true)` |
| MQTT spam | ไม่ส่งเมื่อ connection/config ไม่พร้อม และ lock ด้วย `pendingCommand` |
| TypeScript | ผ่าน `pnpm check` |
| Production build | ผ่าน `pnpm build` |
| Visual verification | ตรวจ desktop full-page screenshot แล้ว; responsive CSS ครอบคลุม mobile breakpoint |

## 9. Risk Points

ความเสี่ยงหลักคือยังไม่มี firmware contract จาก repository เดิม จึงไม่สามารถยืนยันชื่อ field ของ status/heartbeat payload, command topic ที่ใช้อยู่จริง, รูปแบบ RTC timestamp, retained message policy หรือ relay acknowledgement semantics ได้ การนำไปใช้จริงต้องเติม environment topic mapping ให้ตรงกับ ESP และตรวจ payload กับ firmware ก่อนเปิดใช้งาน control

อีกประเด็นคือ frontend static ไม่ควรเก็บ MQTT password แบบ public ใน production แม้ระบบจะรองรับการอ่านจาก environment ก็ตาม สำหรับ deployment จริงควรใช้ broker credential ที่จำกัดสิทธิ์, client certificate หรือ backend proxy ที่ออก short-lived credentials แทนการเผยแพร่ account หลักใน browser

## 10. สิ่งที่ต้องทดสอบกับ ESP จริง

1. ยืนยัน command/status/heartbeat topic ที่ firmware ใช้อยู่แล้ว และกรอกลง environment โดยไม่เปลี่ยนชื่อ topic
2. ยืนยัน payload จริงของคำสั่ง เช่น field ชื่อ `deviceId` และ `command` รวมถึงค่าที่ relay รองรับ
3. ยืนยัน status reply ว่าระบุ device id, ON/OFF และ RTC timestamp จาก node ได้ครบ
4. ทดสอบกด ON/OFF แล้วตรวจว่าหน้าจอคง `pending` จน status reply กลับมา และไม่เปลี่ยนสถานะเองหาก ESP ไม่ตอบ
5. ทดสอบ reconnect, WiFi loss, broker loss และ retained status เพื่อยืนยันว่าไม่มีสถานะค้างผิด
6. ทดสอบ RTC schedule ในช่วงเปลี่ยนนาที, reboot node, ไฟดับ และเวลาข้ามวัน เพื่อกัน duplicate trigger
7. ทดสอบชื่อภาษาไทยและตรวจ packet MQTT ว่าชื่อไม่ถูกส่งไป ESP
8. ทดสอบ mode manual/auto/schedule กับ firmware จริงว่าการเปลี่ยน mode ไม่ override logic ฝั่ง relay โดยไม่ได้รับการออกแบบร่วมกัน

## Files Delivered

| File | หน้าที่ |
|---|---|
| `client/src/pages/Home.tsx` | Dashboard UI, control actions, naming, schedule editor |
| `client/src/lib/farm-control.ts` | Device model, MQTT config/client, parser, command publisher |
| `client/src/index.css` | Midnight SCADA design system and responsive layout |
| `client/index.html` | Thai metadata and typography setup |
| `ideas.md` | Design brainstorm and selected visual direction |

## References

[1]: https://github.com/mqttjs/MQTT.js "MQTT.js — JavaScript MQTT client"
[2]: https://docs.hivemq.com/hivemq-cloud/mqtt-websocket.html "HiveMQ Cloud MQTT over WebSocket documentation"
