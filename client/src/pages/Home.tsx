// Style: Midnight SCADA — asymmetric control-room layout, navy depth, emerald confirmed states, no optimistic device status.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Bell, CalendarDays, ChevronRight, CircleHelp, CloudRain, Cpu, Droplets, Edit3, Gauge, Home as HomeIcon, LoaderCircle,
  Leaf, Lightbulb, LockKeyhole, Menu, MoreHorizontal, Power, Radio, RefreshCw, Save, Settings, ShieldCheck, Thermometer,
  Timer, Wifi, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  createInitialFarmState, createMqttClient, getScheduleAction, parseStatusMessage, publishDeviceCommand,
  type DeviceMode, type FarmControlState, type FarmDevice, type FarmSchedule,
} from "@/lib/farm-control";

const navItems = [
  { label: "หน้าแรก", icon: HomeIcon },
  { label: "ควบคุม", icon: Power },
  { label: "ตารางเวลา", icon: CalendarDays },
  { label: "แจ้งเตือน", icon: Bell, count: 3 },
  { label: "ตั้งค่า", icon: Settings },
  { label: "ระบบ", icon: Cpu },
  { label: "ข้อมูลบันทึก", icon: Activity },
  { label: "เกี่ยวกับ", icon: CircleHelp },
];

const deviceMeta: Record<FarmDevice["type"], { icon: typeof Droplets; tint: string; subtitle: string }> = {
  pump: { icon: Droplets, tint: "cyan", subtitle: "Main irrigation relay" },
  zone1: { icon: Leaf, tint: "green", subtitle: "Vegetable plot" },
  zone2: { icon: Leaf, tint: "blue", subtitle: "Greenhouse relay" },
  light: { icon: Lightbulb, tint: "amber", subtitle: "Pavilion lighting" },
};

const weekdayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function formatRtc(iso: string | null) {
  if (!iso) return "ยังไม่ได้รับเวลา RTC";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

function statusLabel(device: FarmDevice) {
  if (device.pendingCommand) return `กำลังรอ ESP ยืนยัน ${device.pendingCommand}`;
  if (device.status === "unknown") return "ยังไม่มีสถานะจาก ESP";
  return device.status === "ON" ? "กำลังทำงาน" : "หยุดทำงาน";
}

function StatusPill({ connected, children }: { connected: boolean; children: React.ReactNode }) {
  return <span className={`status-pill ${connected ? "status-pill--online" : "status-pill--muted"}`}><span className="status-dot" />{children}</span>;
}

function DeviceCard({ device, schedule, onName, onMode, onToggle, onSchedule }: {
  device: FarmDevice; schedule?: FarmSchedule; onName: (name: string) => void; onMode: (mode: DeviceMode) => void;
  onToggle: () => void; onSchedule: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);
  const meta = deviceMeta[device.type];
  const Icon = meta.icon;
  const confirmedOn = device.status === "ON";
  const saveName = () => { const value = draft.trim(); if (value) onName(value); setEditing(false); };
  return (
    <article className={`device-card device-card--${meta.tint}`}>
      <div className="device-card__topline"><span className="eyebrow">{device.type.toUpperCase()} / RELAY</span><span className={`device-symbol device-symbol--${meta.tint}`}><Icon size={18} /></span></div>
      <div className="device-card__title-row">
        {editing ? <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={saveName} onKeyDown={(event) => event.key === "Enter" && saveName()} className="name-input" aria-label="ชื่ออุปกรณ์" /> : <h3>{device.name}</h3>}
        <button className="icon-button" onClick={() => setEditing(true)} aria-label={`แก้ชื่อ ${device.name}`}><Edit3 size={15} /></button>
      </div>
      <p className="muted-text">{meta.subtitle}</p>
      <div className="device-card__status"><span className={confirmedOn ? "state-on" : device.status === "OFF" ? "state-off" : "state-unknown"}>{device.pendingCommand ? <LoaderCircle className="pending-spinner" size={19} aria-label="กำลังรอการยืนยันจาก MQTT" /> : device.status === "unknown" ? "--" : device.status}</span><span className={device.pendingCommand ? "pending-label" : ""}>{statusLabel(device)}</span></div>
      <div className="device-card__controls"><select value={device.mode} onChange={(event) => onMode(event.target.value as DeviceMode)} aria-label={`โหมดของ ${device.name}`}><option value="manual">Manual</option><option value="auto">Auto</option><option value="schedule">Schedule</option></select><button className="schedule-button" onClick={onSchedule}><Timer size={15} />{schedule?.enabled ? `${schedule.startTime}–${schedule.endTime}` : "ตั้งเวลา"}</button><Switch checked={confirmedOn} disabled={Boolean(device.pendingCommand)} onCheckedChange={onToggle} aria-label={`สั่งงาน ${device.name}`} /></div>
    </article>
  );
}

function ScheduleEditor({ schedule, device, onChange, onClose }: { schedule: FarmSchedule; device: FarmDevice; onChange: (next: FarmSchedule) => void; onClose: () => void }) {
  return <div className="schedule-sheet"><div className="sheet-heading"><div><span className="eyebrow">RTC SCHEDULER</span><h2>{device.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={18} /></button></div><p className="muted-text">ระบบจะ trigger จากเวลาที่ node รายงานเท่านั้น ไม่ใช้เวลาจาก browser เป็น logic หลัก</p><div className="schedule-fields"><label>เปิดเวลา<input type="time" value={schedule.startTime} onChange={(e) => onChange({ ...schedule, startTime: e.target.value })} /></label><label>ปิดเวลา<input type="time" value={schedule.endTime} onChange={(e) => onChange({ ...schedule, endTime: e.target.value })} /></label></div><div className="schedule-row"><span>เปิดใช้งานตาราง</span><Switch checked={schedule.enabled} onCheckedChange={(enabled) => onChange({ ...schedule, enabled })} /></div><div className="schedule-row"><span>ทำซ้ำ</span><select value={schedule.repeat} onChange={(e) => onChange({ ...schedule, repeat: e.target.value as FarmSchedule["repeat"] })}><option value="daily">ทุกวัน</option><option value="weekly">รายสัปดาห์</option></select></div><div><span className="field-label">วันทำงาน</span><div className="weekday-list">{weekdayLabels.map((label, index) => <button key={label} className={schedule.daysOfWeek.includes(index) ? "weekday weekday--active" : "weekday"} onClick={() => onChange({ ...schedule, daysOfWeek: schedule.daysOfWeek.includes(index) ? schedule.daysOfWeek.filter((day) => day !== index) : [...schedule.daysOfWeek, index] })}>{label}</button>)}</div></div><div className="schedule-note"><ShieldCheck size={17} /><span>บันทึกเป็น UI configuration เท่านั้น; การ trigger จริงต้องมี RTC event และ MQTT command ที่ส่งสำเร็จ</span></div></div>;
}

export default function Home() {
  const [state, setState] = useState<FarmControlState>(() => {
    const base = createInitialFarmState();
    try { const saved = JSON.parse(localStorage.getItem("smartfarm-device-names") ?? "{}"); return { ...base, deviceNames: saved, devices: base.devices.map((device) => ({ ...device, name: saved[device.id] ?? device.name })) }; } catch { return base; }
  });
  const [selectedId, setSelectedId] = useState("pump");
  const [scheduleDeviceId, setScheduleDeviceId] = useState<string | null>(null);
  const clientRef = useRef<ReturnType<typeof createMqttClient>>(null);
  const selectedDevice = state.devices.find((device) => device.id === selectedId) ?? state.devices[0];
  const selectedSchedule = state.schedules.find((schedule) => schedule.deviceId === (scheduleDeviceId ?? selectedId));
  const onlineCount = state.devices.filter((device) => device.status !== "unknown").length;

  useEffect(() => {
    const client = createMqttClient((event) => {
      const message = parseStatusMessage(event.payload, event.topic);
      if (!message) return;
      setState((current) => {
        const nextSchedules = current.schedules.map((schedule) => {
          const action = getScheduleAction(schedule, message.rtcIso);
          if (!action || !publishDeviceCommand(clientRef.current, schedule.deviceId, action)) return schedule;
          return { ...schedule, lastTriggered: message.rtcIso ?? schedule.lastTriggered };
        });
        const scheduledActions = nextSchedules.flatMap((schedule, index) => schedule.lastTriggered !== current.schedules[index]?.lastTriggered ? [`RTC ${schedule.deviceId} → triggered`] : []);
        const nextDevices = message.deviceId && message.status ? current.devices.map((device) => device.id === message.deviceId ? { ...device, status: message.status ?? device.status, pendingCommand: null, lastUpdated: message.rtcIso ?? current.rtc.iso } : device) : current.devices;
        return { ...current, schedules: nextSchedules, devices: nextDevices, rtc: message.rtcIso ? { iso: message.rtcIso, source: "rtc" } : current.rtc, mqtt: { ...current.mqtt, lastMessage: event.topic }, lastActions: [...scheduledActions, ...current.lastActions].slice(0, 4) };
      });
    }, (connected) => setState((current) => ({ ...current, mqtt: { ...current.mqtt, connected } })));
    clientRef.current = client;
    return () => { client?.end(true); clientRef.current = null; };
  }, []);

  const updateName = (deviceId: string, name: string) => {
    setState((current) => { const deviceNames = { ...current.deviceNames, [deviceId]: name }; localStorage.setItem("smartfarm-device-names", JSON.stringify(deviceNames)); return { ...current, deviceNames, devices: current.devices.map((device) => device.id === deviceId ? { ...device, name } : device) }; });
    toast.success("บันทึกชื่อใน UI แล้ว", { description: "ชื่อจะไม่ถูกส่งไปยัง ESP หรือ MQTT" });
  };
  const updateMode = (deviceId: string, mode: DeviceMode) => setState((current) => ({ ...current, devices: current.devices.map((device) => device.id === deviceId ? { ...device, mode } : device), lastActions: [`เปลี่ยนโหมด ${deviceId} เป็น ${mode}`, ...current.lastActions].slice(0, 4) }));
  const toggleDevice = (device: FarmDevice) => {
    const desired = device.status === "ON" ? "OFF" : "ON";
    if (!state.mqtt.configured) { toast.error("ยังไม่ได้ตั้งค่า MQTT topic/credentials", { description: "จึงไม่ส่งคำสั่งและไม่เปลี่ยนสถานะอุปกรณ์" }); return; }
    if (!publishDeviceCommand(clientRef.current, device.id, desired)) { toast.error("ส่ง MQTT command ไม่สำเร็จ", { description: "ตรวจสอบ broker และ connection ก่อนลองใหม่" }); return; }
    setState((current) => ({ ...current, devices: current.devices.map((item) => item.id === device.id ? { ...item, pendingCommand: desired } : item), lastActions: [`ส่งคำสั่ง ${desired} → ${device.name}`, ...current.lastActions].slice(0, 4) }));
  };
  const updateSchedule = (next: FarmSchedule) => setState((current) => ({ ...current, schedules: current.schedules.some((item) => item.deviceId === next.deviceId) ? current.schedules.map((item) => item.deviceId === next.deviceId ? next : item) : [...current.schedules, next] }));
  const sensorCards = [
    { label: "อุณหภูมิ", value: "รอ DHT22", unit: "°C", icon: Thermometer, tint: "coral", note: "ยังไม่มี sample จาก ESP" },
    { label: "ความชื้นอากาศ", value: "รอ DHT22", unit: "%", icon: Droplets, tint: "cyan", note: "ยังไม่มี sample จาก ESP" },
    { label: "เวลา RTC", value: state.rtc.iso ? new Date(state.rtc.iso).toLocaleTimeString("th-TH") : "--:--", unit: "", icon: Timer, tint: "green", note: state.rtc.source === "rtc" ? "ยืนยันจาก node" : "รอ RTC event" },
    { label: "อุปกรณ์ยืนยันแล้ว", value: `${onlineCount}/${state.devices.length}`, unit: "ตัว", icon: Radio, tint: "amber", note: "ไม่นับสถานะที่คาดเดา" },
  ];

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><Leaf size={25} /></div><div><strong>สวนลุงนะ</strong><span>SMART FARM</span></div></div><nav>{navItems.map(({ label, icon: Icon, count }, index) => <button key={label} className={index === 0 ? "nav-item nav-item--active" : "nav-item"} onClick={() => index !== 0 && toast.info(`${label} จะเชื่อมกับข้อมูลจริงเมื่อเปิด module นี้`)}><Icon size={19} /><span>{label}</span>{count && <b>{count}</b>}</button>)}</nav><div className="sidebar-footer"><div className="profile"><div className="profile-avatar">ล</div><div><strong>ลุงนะ</strong><span>Admin / Node owner</span></div><MoreHorizontal size={16} /></div><small>© 2025 Smart Farm<br />Real device dashboard</small></div></aside><main className="main-content"><header className="topbar"><div className="mobile-brand"><Menu size={19} /><span>สวนลุงนะ</span></div><div className="connection-strip"><div className="connection-item"><span className={state.mqtt.connected ? "live-dot" : "live-dot live-dot--muted"} /><span><b>ระบบออนไลน์</b><small>{state.mqtt.connected ? "CONNECTED" : state.mqtt.configured ? "CONNECTING" : "รอตั้งค่า MQTT"}</small></span></div><div className="connection-item"><Wifi size={21} /><span><b>WiFi</b><small>ต้องอ่านจาก heartbeat</small></span></div><div className="connection-item"><Radio size={21} /><span><b>MQTT</b><small>{state.mqtt.connected ? "Connected" : "Not connected"}</small></span></div><div className="rtc-clock"><Timer size={25} /><span><b>{state.rtc.iso ? new Date(state.rtc.iso).toLocaleTimeString("th-TH") : "--:--:--"}</b><small>{state.rtc.iso ? formatRtc(state.rtc.iso) : "RTC source unavailable"}</small></span></div></div></header><section className="page-heading"><div><span className="eyebrow">FARM CONTROL SYSTEM / REAL MQTT</span><h1>ศูนย์ควบคุมฟาร์ม</h1><p>สั่งงานเมื่อพร้อม ยืนยันเมื่อ ESP ตอบกลับ — ไม่มีสถานะจำลอง</p></div><div className="heading-actions"><StatusPill connected={state.mqtt.connected}>{state.mqtt.connected ? "MQTT Connected" : "MQTT Offline"}</StatusPill><button className="outline-button" onClick={() => toast.info(state.mqtt.configured ? "กำลังใช้ MQTT configuration จาก environment" : "ต้องกำหนด VITE_MQTT_USERNAME, VITE_MQTT_PASSWORD และ topics ก่อน")}>{state.mqtt.configured ? <RefreshCw size={16} /> : <LockKeyhole size={16} />} การเชื่อมต่อ</button></div></section><div className="sensor-grid">{sensorCards.map(({ label, value, unit, icon: Icon, tint, note }) => <article key={label} className="sensor-card"><div className={`sensor-icon sensor-icon--${tint}`}><Icon size={20} /></div><div><span>{label}</span><strong>{value}<small>{unit}</small></strong><p>{note}</p></div><div className={`sparkline sparkline--${tint}`}><span /><span /><span /><span /><span /></div></article>)}</div><section className="hero-grid"><article className="pump-hero"><div className="pump-hero__copy"><div className="hero-topline"><span className="eyebrow">SELECTED DEVICE / {selectedDevice.type.toUpperCase()}</span><span className="mode-chip"><RefreshCw size={14} />{selectedDevice.mode.toUpperCase()}</span></div><h2>{selectedDevice.name}</h2><p>อุปกรณ์จริงผ่าน relay · {selectedDevice.mqttTopic || "ยังไม่ได้ระบุ command topic"}</p><div className="hero-state"><strong className={selectedDevice.status === "ON" ? "state-on" : selectedDevice.status === "OFF" ? "state-off" : "state-unknown"}>{selectedDevice.pendingCommand ? <LoaderCircle className="pending-spinner hero-spinner" size={41} aria-label="กำลังรอการยืนยันจาก MQTT" /> : selectedDevice.status === "unknown" ? "UNKNOWN" : selectedDevice.status}</strong><span className={selectedDevice.pendingCommand ? "pending-label" : ""}>{statusLabel(selectedDevice)}</span></div>
<div className="hero-meta"><div><span>RTC last update</span><b>{formatRtc(selectedDevice.lastUpdated)}</b></div><div><span>Mode</span><b>{selectedDevice.mode}</b></div></div><div className="hero-actions"><button className="danger-button" onClick={() => selectedDevice.status === "ON" && toggleDevice(selectedDevice)} disabled={selectedDevice.status !== "ON" || Boolean(selectedDevice.pendingCommand)}><Power size={18} />หยุดอุปกรณ์</button><button className="manual-button" onClick={() => toggleDevice(selectedDevice)} disabled={Boolean(selectedDevice.pendingCommand)} aria-busy={Boolean(selectedDevice.pendingCommand)}>{selectedDevice.pendingCommand ? <LoaderCircle className="pending-spinner" size={17} aria-hidden="true" /> : <Power size={17} />}{selectedDevice.pendingCommand ? `รอ ESP ยืนยัน ${selectedDevice.pendingCommand}` : selectedDevice.status === "ON" ? "ส่ง OFF (MANUAL)" : "ส่ง ON (MANUAL)"}</button>
</div></div><div className="pump-hero__visual"><img src="/manus-storage/smartfarm-pump_cabd5cd5.png" alt="ภาพประกอบปั๊มน้ำสำหรับฟาร์ม" /><div className="visual-caption"><Zap size={14} /> คำสั่งถูกส่งผ่าน MQTT เมื่อ connection พร้อม</div></div></article><aside className="right-rail"><article className="weather-card"><div className="rail-heading"><div><span className="eyebrow">RTC / NODE TIME</span><h3>เวลาจากอุปกรณ์</h3></div><Timer size={22} /></div><strong>{formatRtc(state.rtc.iso)}</strong><p>ตรรกะตารางเวลาจะทำงานเมื่อได้รับ timestamp จาก RTC เท่านั้น</p><div className="rain-note"><CloudRain size={20} /><span><b>ไม่มีข้อมูลฝน</b><small>ระบบไม่สร้าง sensor ที่ไม่มีใน hardware</small></span></div></article><article className="alert-card"><div className="alert-icon"><ShieldCheck size={20} /></div><div><span className="eyebrow">SAFETY CHECK</span><h3>ไม่ optimistic state</h3><p>ทุก toggle แสดง pending จนกว่า status reply จะกลับมาจาก ESP</p></div></article></aside></section><section className="section-block"><div className="section-title"><div><span className="eyebrow">UNIFIED CONTROL PANEL</span><h2>อุปกรณ์ฟาร์ม</h2></div><span className="muted-text">กดเลือกการ์ดเพื่อดู command และ RTC schedule</span></div><div className="device-grid">{state.devices.map((device) => <div key={device.id} onClick={() => setSelectedId(device.id)} className={selectedId === device.id ? "device-card-wrap device-card-wrap--selected" : "device-card-wrap"}><DeviceCard device={device} schedule={state.schedules.find((schedule) => schedule.deviceId === device.id)} onName={(name) => updateName(device.id, name)} onMode={(mode) => updateMode(device.id, mode)} onToggle={() => toggleDevice(device)} onSchedule={() => setScheduleDeviceId(device.id)} /></div>)}</div></section><section className="lower-grid"><article className="schedule-panel"><div className="section-title"><div><span className="eyebrow">RTC SCHEDULE</span><h2>ตารางรดน้ำอัตโนมัติ</h2></div><button className="text-button" onClick={() => setScheduleDeviceId(selectedId)}>จัดการทั้งหมด <ChevronRight size={16} /></button></div>{state.schedules.map((schedule) => { const device = state.devices.find((item) => item.id === schedule.deviceId); if (!device) return null; return <button className="schedule-row-card" key={schedule.deviceId} onClick={() => setScheduleDeviceId(schedule.deviceId)}><div className={`schedule-orb schedule-orb--${device.type}`}><Timer size={20} /></div><div className="schedule-copy"><strong>{device.name}</strong><span>{schedule.startTime} – {schedule.endTime} · {schedule.repeat === "daily" ? "ทุกวัน" : "รายสัปดาห์"}</span></div><StatusPill connected={schedule.enabled}>{schedule.enabled ? "เปิดใช้งาน" : "ปิดอยู่"}</StatusPill><ChevronRight size={17} /></button>})}<div className="schedule-footer"><LockKeyhole size={16} /><span>Last triggered: {selectedSchedule?.lastTriggered ? formatRtc(selectedSchedule.lastTriggered) : "ยังไม่มี event จาก RTC"}</span></div></article><article className="system-panel"><div className="section-title"><div><span className="eyebrow">SYSTEM STATUS</span><h2>สถานะระบบ</h2></div><Gauge size={20} /></div><div className="system-list"><div><Cpu size={17} /><span>ESP Node</span><b className="unknown-badge">รอ heartbeat</b></div><div><Radio size={17} /><span>MQTT Broker</span><b className={state.mqtt.connected ? "ok-badge" : "unknown-badge"}>{state.mqtt.connected ? "CONNECTED" : "UNKNOWN"}</b></div><div><Wifi size={17} /><span>WiFi</span><b className="unknown-badge">รอ heartbeat</b></div><div><Timer size={17} /><span>RTC Source</span><b className={state.rtc.source === "rtc" ? "ok-badge" : "unknown-badge"}>{state.rtc.source === "rtc" ? "SYNCED" : "UNKNOWN"}</b></div></div><div className="last-actions"><span className="eyebrow">LAST ACTIONS</span>{state.lastActions.length ? state.lastActions.map((action) => <p key={action}><Activity size={13} />{action}</p>) : <p><Activity size={13} />ยังไม่มี command ที่ส่งสำเร็จ</p>}</div></article></section></main>{scheduleDeviceId && selectedSchedule && <div className="sheet-backdrop" onClick={() => setScheduleDeviceId(null)}><div onClick={(event) => event.stopPropagation()}><ScheduleEditor schedule={selectedSchedule} device={state.devices.find((device) => device.id === scheduleDeviceId) ?? selectedDevice} onChange={updateSchedule} onClose={() => setScheduleDeviceId(null)} /></div></div>}</div>;
}
