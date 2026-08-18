import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Droplets, Gauge, Power, RefreshCw, Thermometer, Wifi, WifiOff } from "lucide-react";
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

function ago(ageMs: number | null) {
  if (ageMs === null) return "ยังไม่มีข้อมูล";
  if (ageMs < 1000) return "เมื่อสักครู่";
  return `${Math.floor(ageMs / 1000)} วินาทีที่แล้ว`;
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`simple-status ${ok ? "simple-status--ok" : "simple-status--bad"}`}><span />{children}</span>;
}

function RelayRow({ relay, onCommand, onRename }: { relay: FarmDevice; onCommand: (relay: FarmDevice) => void; onRename: (relay: FarmDevice) => void }) {
  const pending = Boolean(relay.pendingCommand);
  const isOn = relay.confirmedState === "ON";
  return <div className="simple-relay-row">
    <div className="simple-relay-name"><b>{relay.name}</b><small>Relay ช่องที่ {relay.id}</small></div>
    <div className="simple-relay-state"><span>Hardware</span><strong className={isOn ? "simple-on" : ""}>{relay.confirmedState}</strong></div>
    <div className="simple-relay-state"><span>คำสั่งล่าสุด</span><strong>{relay.desiredState ?? "—"}</strong></div>
    <button className="simple-button simple-button--secondary" onClick={() => onRename(relay)}>เปลี่ยนชื่อ</button>
    <button className={`simple-button ${isOn ? "simple-button--off" : "simple-button--on"}`} disabled={pending} onClick={() => onCommand(relay)}>
      {pending ? <><RefreshCw size={15} className="simple-spin" /> รอยืนยัน</> : <><Power size={15} /> {isOn ? "สั่ง OFF" : "สั่ง ON"}</>}
    </button>
    {pending && <small className="simple-pending">ส่งคำสั่งแล้ว ยังไม่ถือว่า Hardware เปลี่ยนสถานะ</small>}
  </div>;
}

export default function Home() {
  const [state, setState] = useState<FarmControlState>(fallbackState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchFarmState().then((next) => { if (active) { setState(next); setLoading(false); } }).catch((err) => { if (active) { setError(err instanceof Error ? err.message : "โหลดสถานะไม่สำเร็จ"); setLoading(false); } });
    const events = new EventSource("/api/events");
    events.addEventListener("snapshot", (event) => { if (!active) return; try { setState(JSON.parse((event as MessageEvent).data) as FarmControlState); setError(null); } catch { setError("ได้รับข้อมูลสถานะไม่ถูกต้อง"); } });
    events.onerror = () => setError("การเชื่อมต่อ Real-time ขัดข้อง กำลังเชื่อมต่อใหม่");
    return () => { active = false; events.close(); };
  }, []);

  const command = async (relay: FarmDevice) => {
    const desiredState = relay.confirmedState === "ON" ? "OFF" : "ON";
    try { await sendRelayCommand(relay.id, desiredState); toast.success(`ส่งคำสั่ง ${desiredState} แล้ว`, { description: "กำลังรอ ESP8266 ยืนยันสถานะ Hardware" }); } catch (err) { toast.error(err instanceof Error ? err.message : "ส่งคำสั่งไม่สำเร็จ"); }
  };
  const rename = async (relay: FarmDevice) => {
    const name = window.prompt("ชื่อ Relay ใหม่", relay.name)?.trim();
    if (!name || name === relay.name) return;
    try { await renameRelay(relay.id, name); toast.success("บันทึกชื่อแล้ว"); } catch { toast.error("บันทึกชื่อไม่สำเร็จ"); }
  };

  const mqttOk = state.mqtt.status === "CONNECTED";
  const espOk = state.esp8266.status === "Online";
  const sensorOk = state.dht22.status === "OK";
  const rtcOk = state.rtc.status === "OK";

  return <main className="simple-dashboard">
    <header className="simple-header"><div><p className="simple-kicker">SMART FARM DASHBOARD</p><h1>แผงควบคุมฟาร์ม</h1><p>ติดตามและควบคุมอุปกรณ์ ESP8266 ผ่าน Backend แบบ Real-time</p></div><div className="simple-live"><span className={loading ? "simple-dot simple-dot--bad" : "simple-dot"} />{loading ? "กำลังโหลด" : "Real-time"}</div></header>
    {error && <div className="simple-alert"><AlertTriangle size={18} />{error}</div>}

    <section className="simple-grid simple-grid--status">
      <div className="simple-card"><div className="simple-card-title"><Wifi size={18} /> MQTT</div><Status ok={mqttOk}>{state.mqtt.status}</Status><small>{state.mqtt.lastMessageAt ? `ข้อความล่าสุด ${ago(Date.now() - Date.parse(state.mqtt.lastMessageAt))}` : "ยังไม่มี MQTT message"}</small></div>
      <div className="simple-card"><div className="simple-card-title"><Gauge size={18} /> ESP8266</div><Status ok={espOk}>{espOk ? "Online" : "Offline"}</Status><small>Heartbeat: {ago(state.esp8266.heartbeatAgeMs)}</small></div>
      <div className="simple-card"><div className="simple-card-title"><Thermometer size={18} /> DHT22</div><Status ok={sensorOk}>{state.dht22.status}</Status><small>ข้อมูลล่าสุด: {ago(state.dht22.ageMs)}</small></div>
      <div className="simple-card"><div className="simple-card-title"><Clock3 size={18} /> RTC</div><Status ok={rtcOk}>{rtcOk ? "RTC OK" : "RTC ERROR"}</Status><small>{state.rtc.iso ? new Date(state.rtc.iso).toLocaleString("th-TH") : "ยังไม่มีเวลาอุปกรณ์"}</small></div>
    </section>

    <section className="simple-section"><h2>ข้อมูลเซนเซอร์</h2><div className="simple-grid simple-grid--sensor"><div className="simple-value-card"><Thermometer size={22} /><span>อุณหภูมิ</span><strong>{state.dht22.temperature === null ? "—" : state.dht22.temperature.toFixed(1)} <small>°C</small></strong></div><div className="simple-value-card"><Droplets size={22} /><span>ความชื้น</span><strong>{state.dht22.humidity === null ? "—" : state.dht22.humidity.toFixed(1)} <small>%</small></strong></div></div></section>

    <section className="simple-section"><div className="simple-section-heading"><div><h2>ควบคุม Relay</h2><p>สถานะ Hardware จะเปลี่ยนเมื่อได้รับการยืนยันจาก ESP8266 เท่านั้น</p></div><span className="simple-note"><CheckCircle2 size={15} /> Backend MQTT</span></div><div className="simple-relays">{state.relays.map((relay) => <RelayRow key={relay.id} relay={relay} onCommand={command} onRename={rename} />)}</div></section>
    <footer className="simple-footer"><span>อัปเดตล่าสุด: {new Date(state.updatedAt).toLocaleString("th-TH")}</span><span><WifiOff size={14} /> MQTT credential อยู่ฝั่ง Backend เท่านั้น</span></footer>
  </main>;
}
