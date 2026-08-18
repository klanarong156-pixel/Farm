import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Cloud, Droplets, Leaf, LockKeyhole, Radio, RefreshCw, Settings2, Thermometer, Wifi, WifiOff, Zap } from "lucide-react";
import { toast } from "sonner";
import { fetchFarmState, renameRelay, sendRelayCommand, type FarmControlState, type FarmDevice } from "@/lib/farm-control";

const fallbackState: FarmControlState = {
  mqtt: { status: "DISCONNECTED", lastMessageAt: null, brokerConfigured: false },
  esp8266: { status: "Unknown", lastHeartbeatAt: null, heartbeatAgeMs: null },
  dht22: { temperature: null, humidity: null, status: "DHT22 OFFLINE", capturedAt: null, ageMs: null },
  rtc: { iso: null, status: "UNKNOWN" },
  relays: [1, 2, 3, 4].map((id) => ({ id, name: `Relay ${id}`, desiredState: null, confirmedState: "UNKNOWN", pendingCommand: null, pendingSince: null, lastConfirmedAt: null })),
  updatedAt: new Date().toISOString(),
};

function ageLabel(ageMs: number | null) {
  if (ageMs === null) return "ยังไม่มีข้อมูล";
  if (ageMs < 1_000) return "เมื่อสักครู่";
  return `${Math.floor(ageMs / 1_000)} วินาทีที่แล้ว`;
}

function StatusBadge({ tone, children }: { tone: "green" | "red" | "amber" | "slate"; children: React.ReactNode }) {
  return <span className={`status-badge status-badge--${tone}`}><span className="status-badge__dot" />{children}</span>;
}

function RelayCard({ relay, onCommand, onRename }: { relay: FarmDevice; onCommand: (relay: FarmDevice) => void; onRename: (relay: FarmDevice) => void }) {
  const isConfirmedOn = relay.confirmedState === "ON";
  const isPending = Boolean(relay.pendingCommand);
  return <article className={`relay-card ${isConfirmedOn ? "relay-card--active" : ""}`}>
    <div className="relay-card__head"><div className="relay-index">0{relay.id}</div><button className="ghost-button" onClick={() => onRename(relay)} aria-label={`แก้ชื่อ ${relay.name}`}><Settings2 size={15} /></button></div>
    <div className="relay-card__identity"><div><span className="micro-label">RELAY CHANNEL</span><h3>{relay.name}</h3></div><div className={`relay-icon ${isConfirmedOn ? "relay-icon--on" : ""}`}><Zap size={18} /></div></div>
    <div className="relay-card__state"><div><span className="micro-label">CONFIRMED HARDWARE STATE</span><strong className={isConfirmedOn ? "text-live" : relay.confirmedState === "OFF" ? "text-muted" : "text-warning"}>{relay.confirmedState}</strong></div><div className="relay-command"><span className="micro-label">DESIRED</span><span>{relay.desiredState ?? "—"}</span></div></div>
    <button className={`relay-action ${isConfirmedOn ? "relay-action--on" : ""}`} disabled={isPending} onClick={() => onCommand(relay)}>{isPending ? <><RefreshCw size={16} className="spin" />รอ ESP8266 ยืนยัน {relay.pendingCommand}</> : <><PowerIcon state={isConfirmedOn} />สั่งให้เป็น {isConfirmedOn ? "OFF" : "ON"}</>}</button>
    {isPending && <p className="pending-note"><Clock3 size={13} />ส่งคำสั่งแล้ว · ยังไม่ถือว่า Hardware เปลี่ยนสถานะ</p>}
  </article>;
}

function PowerIcon({ state }: { state: boolean }) { return state ? <WifiOff size={16} /> : <Wifi size={16} />; }

export default function Home() {
  const [state, setState] = useState<FarmControlState>(fallbackState);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchFarmState().then((next) => { if (active) { setState(next); setLoading(false); } }).catch((error) => { if (active) { setLastError(error.message); setLoading(false); } });
    const events = new EventSource("/api/events");
    events.addEventListener("snapshot", (event) => { if (!active) return; try { setState(JSON.parse((event as MessageEvent).data) as FarmControlState); setLastError(null); } catch { setLastError("ได้รับข้อมูลสถานะไม่ถูกต้อง"); } });
    events.onerror = () => setLastError("Real-time stream ขัดข้อง กำลังรอการเชื่อมต่อใหม่");
    return () => { active = false; events.close(); };
  }, []);

  const onlineRelays = useMemo(() => state.relays.filter((relay) => relay.confirmedState !== "UNKNOWN").length, [state.relays]);
  const handleCommand = async (relay: FarmDevice) => {
    const desiredState = relay.confirmedState === "ON" ? "OFF" : "ON";
    try { await sendRelayCommand(relay.id, desiredState); toast.info(`ส่งคำสั่ง ${desiredState} ไป Relay ${relay.id}`, { description: "กำลังรอ confirmed state จาก ESP8266" }); } catch (error) { toast.error(error instanceof Error ? error.message : "ส่งคำสั่งไม่สำเร็จ"); }
  };
  const handleRename = async (relay: FarmDevice) => {
    const name = window.prompt("ชื่อ Relay ใหม่", relay.name)?.trim();
    if (!name || name === relay.name) return;
    try { await renameRelay(relay.id, name); toast.success("บันทึกชื่อ Relay แล้ว"); } catch { toast.error("บันทึกชื่อไม่สำเร็จ"); }
  };
  const mqttConnected = state.mqtt.status === "CONNECTED";
  const espOnline = state.esp8266.status === "Online";
  const sensorTone = state.dht22.status === "OK" ? "green" : state.dht22.status === "SENSOR ERROR" ? "red" : "amber";

  return <div className="app-shell"><aside className="sidebar"><div className="brand-lockup"><div className="brand-mark"><Leaf size={20} /></div><div><span className="brand-kicker">สวนลุงนะ</span><strong>SMART FARM</strong></div></div><div className="sidebar-section"><span className="sidebar-caption">CONTROL CENTER</span><nav><button className="nav-link nav-link--active"><Activity size={17} />Overview</button><button className="nav-link" onClick={() => toast.info("หน้าอุปกรณ์จะเพิ่มเมื่อเชื่อมต่อ node เพิ่มเติม")}><Radio size={17} />Devices</button><button className="nav-link" onClick={() => toast.info("Audit log จะดึงจาก Backend ในรุ่นถัดไป")}><Clock3 size={17} />Event history</button></nav></div><div className="sidebar-bottom"><div className="secure-chip"><LockKeyhole size={15} /><span><b>Backend secured</b><small>MQTT credentials never reach browser</small></span></div><span className="version-label">SMARTFARM CORE · 1.0</span></div></aside><main className="main-content"><header className="topbar"><div><span className="eyebrow">LIVE OPERATIONS / 01</span><h1>Farm command center</h1><p>ศูนย์ควบคุมอุปกรณ์และ telemetry จาก ESP8266 แบบ real-time</p></div><div className="topbar-meta"><span className="last-sync"><span className="pulse-ring" />Live stream <b>{loading ? "SYNCING" : "ACTIVE"}</b></span><span>{new Date(state.updatedAt).toLocaleTimeString("th-TH")}</span></div></header>{lastError && <div className="alert-banner"><AlertTriangle size={16} />{lastError}</div>}<section className="hero-grid"><div className="hero-card"><div className="hero-card__content"><span className="eyebrow">SYSTEM PULSE</span><h2>ความพร้อมของฟาร์ม<br /><em>ในมุมเดียว</em></h2><p>สถานะทั้งหมดอ้างอิงจากข้อมูลที่ Backend ได้รับจากอุปกรณ์จริง ไม่ใช้ optimistic hardware state</p><div className="hero-footer"><StatusBadge tone={mqttConnected ? "green" : "red"}>MQTT {state.mqtt.status}</StatusBadge><span className="hero-separator">•</span><span className="hero-footnote">{state.mqtt.lastMessageAt ? `message ${ageLabel(Date.now() - Date.parse(state.mqtt.lastMessageAt))}` : "รอ MQTT message"}</span></div></div><div className="hero-orbit"><div className="orbit orbit--outer" /><div className="orbit orbit--inner" /><div className="orbit-core"><Leaf size={27} /><span>NODE<br /><b>01</b></span></div><div className="orbit-spark orbit-spark--one" /><div className="orbit-spark orbit-spark--two" /></div></div><div className="status-stack"><div className="metric-card"><div className="metric-card__icon metric-card__icon--green"><Wifi size={18} /></div><div><span className="micro-label">ESP8266 NODE</span><strong>{state.esp8266.status}</strong><small>{ageLabel(state.esp8266.heartbeatAgeMs)} · heartbeat</small></div><StatusBadge tone={espOnline ? "green" : "red"}>{espOnline ? "Online" : "Offline"}</StatusBadge></div><div className="metric-card"><div className="metric-card__icon metric-card__icon--amber"><Radio size={18} /></div><div><span className="micro-label">RELAY CONFIRMATIONS</span><strong>{onlineRelays}<small> / {state.relays.length}</small></strong><small>สถานะจาก hardware เท่านั้น</small></div><StatusBadge tone={onlineRelays === state.relays.length ? "green" : "amber"}>{onlineRelays === state.relays.length ? "SYNCED" : "PARTIAL"}</StatusBadge></div></div></section><section className="section-block"><div className="section-heading"><div><span className="eyebrow">TELEMETRY / REAL-TIME</span><h2>Environmental signal</h2></div><span className="data-freshness"><span className="freshness-dot" />{ageLabel(state.dht22.ageMs)}</span></div><div className="telemetry-grid"><div className="telemetry-card"><div className="telemetry-card__top"><div className="telemetry-icon telemetry-icon--coral"><Thermometer size={18} /></div><StatusBadge tone={sensorTone}>{state.dht22.status}</StatusBadge></div><span className="micro-label">TEMPERATURE</span><div className="telemetry-value">{state.dht22.temperature === null ? "—" : state.dht22.temperature.toFixed(1)}<small>°C</small></div><p>DHT22 · {state.dht22.capturedAt ? "ยืนยันจาก ESP8266" : "รอข้อมูลใหม่"}</p></div><div className="telemetry-card"><div className="telemetry-card__top"><div className="telemetry-icon telemetry-icon--cyan"><Droplets size={18} /></div><StatusBadge tone={sensorTone}>{state.dht22.status}</StatusBadge></div><span className="micro-label">HUMIDITY</span><div className="telemetry-value">{state.dht22.humidity === null ? "—" : state.dht22.humidity.toFixed(1)}<small>%</small></div><p>DHT22 · freshness timeout {Math.round((state.dht22.ageMs ?? 0) / 1000)}s</p></div><div className="telemetry-card telemetry-card--rtc"><div className="telemetry-card__top"><div className="telemetry-icon telemetry-icon--violet"><Clock3 size={18} /></div><StatusBadge tone={state.rtc.status === "OK" ? "green" : "red"}>{state.rtc.status === "OK" ? "RTC OK" : "RTC ERROR"}</StatusBadge></div><span className="micro-label">DEVICE RTC</span><div className="rtc-value">{state.rtc.iso ? new Date(state.rtc.iso).toLocaleTimeString("th-TH") : "—:—"}</div><p>{state.rtc.iso ? new Date(state.rtc.iso).toLocaleDateString("th-TH", { dateStyle: "long" }) : "รอเวลาอ้างอิงจาก ESP8266"}</p></div></div></section><section className="section-block"><div className="section-heading"><div><span className="eyebrow">ACTUATION / CONFIRMED STATES</span><h2>Relay control deck</h2></div><span className="section-note"><CheckCircle2 size={14} /> Hardware confirmation required</span></div><div className="relay-grid">{state.relays.map((relay) => <RelayCard key={relay.id} relay={relay} onCommand={handleCommand} onRename={handleRename} />)}</div></section><footer className="page-footer"><span>© 2026 Smart Farm Operations</span><span>Backend-only MQTT architecture · No frontend credentials</span></footer></main></div>;
}
