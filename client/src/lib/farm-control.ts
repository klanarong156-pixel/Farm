// Style: Midnight SCADA — data-first state contracts keep confirmed device truth separate from UI naming.
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
  mqtt: { connected: boolean; configured: boolean; broker: string | null; lastMessage: string | null };
};

const topics = {
  command: import.meta.env.VITE_MQTT_COMMAND_TOPIC ?? "",
  status: import.meta.env.VITE_MQTT_STATUS_TOPIC ?? "",
  heartbeat: import.meta.env.VITE_MQTT_HEARTBEAT_TOPIC ?? "",
};

export const mqttConfig = {
  url: import.meta.env.VITE_MQTT_URL ?? "wss://650188a0ee2b4367b7c131fb385590a9.s1.eu.hivemq.cloud:8884/mqtt",
  username: import.meta.env.VITE_MQTT_USERNAME ?? "",
  password: import.meta.env.VITE_MQTT_PASSWORD ?? "",
  topics,
};

const baseDevices: FarmDevice[] = [
  { id: "pump", type: "pump", name: "ปั๊มหลัก", status: "unknown", mode: "manual", lastUpdated: null, mqttTopic: topics.command, pendingCommand: null },
  { id: "zone1", type: "zone1", name: "แปลงผัก", status: "unknown", mode: "schedule", lastUpdated: null, mqttTopic: topics.command, pendingCommand: null },
  { id: "zone2", type: "zone2", name: "โรงเรือน", status: "unknown", mode: "manual", lastUpdated: null, mqttTopic: topics.command, pendingCommand: null },
  { id: "light", type: "light", name: "ไฟศาลา", status: "unknown", mode: "auto", lastUpdated: null, mqttTopic: topics.command, pendingCommand: null },
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
  mqtt: { connected: false, configured: Boolean(mqttConfig.username && mqttConfig.password && mqttConfig.topics.command && mqttConfig.topics.status), broker: mqttConfig.url, lastMessage: null },
});

export function createMqttClient(onState: (event: { topic: string; payload: string }) => void, onConnection: (connected: boolean) => void): MqttClient | null {
  if (!mqttConfig.username || !mqttConfig.password || !mqttConfig.topics.command || !mqttConfig.topics.status) return null;
  const client = mqtt.connect(mqttConfig.url, { username: mqttConfig.username, password: mqttConfig.password, clean: true, reconnectPeriod: 5000 });
  client.on("connect", () => { onConnection(true); client.subscribe([mqttConfig.topics.status, mqttConfig.topics.heartbeat].filter(Boolean)); });
  client.on("reconnect", () => onConnection(false));
  client.on("close", () => onConnection(false));
  client.on("message", (topic, payload) => onState({ topic, payload: payload.toString() }));
  return client;
}

export function publishDeviceCommand(client: MqttClient | null, deviceId: string, desired: "ON" | "OFF") {
  if (!client || !client.connected || !mqttConfig.topics.command) return false;
  client.publish(mqttConfig.topics.command, JSON.stringify({ deviceId, command: desired }), { qos: 1 });
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

export function parseStatusMessage(payload: string): { deviceId: string; status: "ON" | "OFF"; rtcIso?: string } | null {
  try {
    const value = JSON.parse(payload) as { deviceId?: string; id?: string; status?: string; state?: string; rtc?: string; timestamp?: string };
    const status = String(value.status ?? value.state ?? "").toUpperCase();
    const deviceId = value.deviceId ?? value.id;
    if (!deviceId || (status !== "ON" && status !== "OFF")) return null;
    return { deviceId, status: status as "ON" | "OFF", rtcIso: value.rtc ?? value.timestamp };
  } catch {
    return null;
  }
}
