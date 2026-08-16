// Style: Midnight SCADA — confirmed device truth is adapted from the legacy MQTT contract; UI names never enter MQTT payloads.
import mqtt, { type MqttClient } from "mqtt";

export type DeviceType = "pump" | "zone1" | "zone2" | "light";
export type DeviceMode = "manual" | "auto" | "schedule";
export type DeviceStatus = "ON" | "OFF" | "unknown";

export type FarmDevice = {
  id: string;
  type: DeviceType;
  name: string;
  status: DeviceStatus;
  mode: DeviceMode;
  lastUpdated: string | null;
  mqttTopic: string;
  pendingCommand: "ON" | "OFF" | null;
};

export type FarmSchedule = {
  deviceId: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
  repeat: "daily" | "weekly";
  daysOfWeek: number[];
  lastTriggered: string | null;
};

export type FarmControlState = {
  devices: FarmDevice[];
  schedules: FarmSchedule[];
  deviceNames: Record<string, string>;
  lastActions: string[];
  rtc: { iso: string | null; source: "rtc" | "unknown" };
  sensors: { temperature: number | null; humidity: number | null; lastUpdated: string | null };
  mqtt: { connected: boolean; configured: boolean; broker: string | null; lastMessage: string | null };
};

const LEGACY_BASE = "smartfarm";
const relayForDevice: Record<string, "pump" | "zone1" | "lighthome" | "lightsala"> = {
  pump: "pump",
  zone1: "zone1",
  zone2: "lighthome",
  light: "lightsala",
};
const deviceForRelay: Record<string, string> = Object.fromEntries(Object.entries(relayForDevice).map(([deviceId, relay]) => [relay, deviceId]));

export const mqttConfig = {
  url: import.meta.env.VITE_MQTT_URL ?? "wss://650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud:8884/mqtt",
  username: import.meta.env.VITE_MQTT_USERNAME ?? "",
  password: import.meta.env.VITE_MQTT_PASSWORD ?? "",
  topics: {
    command: (deviceId: string) => `${LEGACY_BASE}/relay/${relayForDevice[deviceId]}/set`,
    status: `${LEGACY_BASE}/relay/+/status`,
    sensor: `${LEGACY_BASE}/sensor/dht11`,
    online: `${LEGACY_BASE}/status/online`,
    heartbeat: `${LEGACY_BASE}/device/status`,
    modeStatus: `${LEGACY_BASE}/mode/status`,
    scheduleStatus: `${LEGACY_BASE}/schedule/+/status`,
  },
};

const baseDevices: FarmDevice[] = [
  { id: "pump", type: "pump", name: "ปั๊มหลัก", status: "unknown", mode: "manual", lastUpdated: null, mqttTopic: mqttConfig.topics.command("pump"), pendingCommand: null },
  { id: "zone1", type: "zone1", name: "แปลงผัก", status: "unknown", mode: "schedule", lastUpdated: null, mqttTopic: mqttConfig.topics.command("zone1"), pendingCommand: null },
  { id: "zone2", type: "zone2", name: "โรงเรือน", status: "unknown", mode: "manual", lastUpdated: null, mqttTopic: mqttConfig.topics.command("zone2"), pendingCommand: null },
  { id: "light", type: "light", name: "ไฟศาลา", status: "unknown", mode: "auto", lastUpdated: null, mqttTopic: mqttConfig.topics.command("light"), pendingCommand: null },
];

export const createInitialFarmState = (): FarmControlState => ({
  devices: baseDevices,
  schedules: [
    { deviceId: "pump", enabled: true, startTime: "06:00", endTime: "06:15", repeat: "daily", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], lastTriggered: null },
    { deviceId: "zone1", enabled: true, startTime: "05:30", endTime: "07:00", repeat: "daily", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], lastTriggered: null },
  ],
  deviceNames: Object.fromEntries(baseDevices.map((device) => [device.id, device.name])),
  lastActions: [],
  rtc: { iso: null, source: "unknown" },
  sensors: { temperature: null, humidity: null, lastUpdated: null },
  mqtt: { connected: false, configured: Boolean(mqttConfig.username && mqttConfig.password), broker: mqttConfig.url, lastMessage: null },
});

export function createMqttClient(onState: (event: { topic: string; payload: string }) => void, onConnection: (connected: boolean) => void): MqttClient | null {
  if (!mqttConfig.username || !mqttConfig.password) return null;
  const client = mqtt.connect(mqttConfig.url, { username: mqttConfig.username, password: mqttConfig.password, clean: true, reconnectPeriod: 5000, keepalive: 30, connectTimeout: 30000 });
  client.on("connect", () => {
    onConnection(true);
    client.subscribe([mqttConfig.topics.status, mqttConfig.topics.sensor, mqttConfig.topics.online, mqttConfig.topics.heartbeat, mqttConfig.topics.modeStatus, mqttConfig.topics.scheduleStatus]);
  });
  client.on("reconnect", () => onConnection(false));
  client.on("close", () => onConnection(false));
  client.on("message", (topic, payload) => onState({ topic, payload: payload.toString() }));
  return client;
}

export function publishDeviceCommand(client: MqttClient | null, deviceId: string, desired: "ON" | "OFF") {
  const topic = mqttConfig.topics.command(deviceId);
  if (!client || !client.connected || !relayForDevice[deviceId]) return false;
  client.publish(topic, desired, { qos: 0 });
  return true;
}

export function getScheduleAction(schedule: FarmSchedule, rtcIso: string | undefined): "ON" | "OFF" | null {
  if (!schedule.enabled || !rtcIso) return null;
  const rtcDate = new Date(rtcIso);
  if (Number.isNaN(rtcDate.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(rtcDate);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const hhmm = `${parts.find((part) => part.type === "hour")?.value ?? "00"}:${parts.find((part) => part.type === "minute")?.value ?? "00"}`;
  if (schedule.repeat === "weekly" && !schedule.daysOfWeek.includes(day)) return null;
  if (schedule.lastTriggered?.slice(0, 16) === rtcIso.slice(0, 16)) return null;
  if (hhmm === schedule.startTime) return "ON";
  if (hhmm === schedule.endTime) return "OFF";
  return null;
}

export function parseStatusMessage(payload: string, topic = ""): { deviceId?: string; status?: "ON" | "OFF"; rtcIso?: string; online?: boolean; temperature?: number; humidity?: number } | null {
  const relayMatch = topic.match(/^smartfarm\/relay\/([^/]+)\/status$/);
  if (relayMatch) {
    const status = payload.trim().toUpperCase();
    const deviceId = deviceForRelay[relayMatch[1]];
    if (deviceId && (status === "ON" || status === "OFF")) return { deviceId, status: status as "ON" | "OFF" };
    return null;
  }
  if (topic === mqttConfig.topics.online) return { online: ["true", "online", "1", "yes"].includes(payload.trim().toLowerCase()) };
  if (topic === mqttConfig.topics.sensor) {
    try { const value = JSON.parse(payload) as { temperature?: number; humidity?: number }; const temperature = Number(value.temperature); const humidity = Number(value.humidity); return { temperature: Number.isFinite(temperature) ? temperature : undefined, humidity: Number.isFinite(humidity) ? humidity : undefined }; } catch { return null; }
  }
  if (topic === mqttConfig.topics.heartbeat) {
    try { const value = JSON.parse(payload) as { online?: boolean; time?: string; rtc?: boolean }; return { online: value.online !== false, rtcIso: value.time }; } catch { return null; }
  }
  return null;
}
