function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`[config] Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  mqtt: {
    host: required("MQTT_HOST", "localhost"),
    port: Number(process.env.MQTT_PORT ?? 8883),
    username: required("MQTT_USERNAME", "change-me"),
    password: required("MQTT_PASSWORD", "change-me"),
    base: process.env.MQTT_BASE ?? "smartfarm",
    heartbeatTimeoutMs: Number(process.env.HEARTBEAT_TIMEOUT_MS ?? 90_000),
    sensorFreshnessMs: Number(process.env.SENSOR_FRESHNESS_MS ?? 120_000),
    commandTimeoutMs: Number(process.env.COMMAND_TIMEOUT_MS ?? 15_000),
  },
};

export function mqttUrl() {
  return `mqtts://${config.mqtt.host}:${config.mqtt.port}`;
}
