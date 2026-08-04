import type { AcsCreds } from "./genieacs-store";
import type { AcsDevice, AcsWan, AcsWlan } from "./genieacs-types";

type Flat = Record<string, unknown>;

function auth(creds: AcsCreds) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (creds.username) {
    headers["Authorization"] = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
  }
  return headers;
}

function base(creds: AcsCreds) {
  return creds.url.trim().replace(/\/+$/, "");
}

async function acsFetch(creds: AcsCreds, path: string, init?: RequestInit) {
  const res = await fetch(`${base(creds)}${path}`, {
    ...init,
    headers: { ...auth(creds), ...(init?.headers as Record<string, string>) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GenieACS ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  return text ? JSON.parse(text) : null;
}

/** Ubah objek device GenieACS bersarang menjadi map "path" -> nilai */
function flatten(obj: unknown, prefix = "", out: Flat = {}): Flat {
  if (!obj || typeof obj !== "object") return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key.startsWith("_") && key !== "_value") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if ("_value" in v) out[path] = v["_value"];
      flatten(value, path, out);
    }
  }
  return out;
}

function pick(flat: Flat, ...keys: string[]) {
  for (const k of keys) {
    const v = flat[k];
    if (v !== undefined && v !== null && String(v).length) return String(v);
  }
  return "";
}

function detectVendor(text: string): AcsDevice["vendor"] {
  const t = text.toLowerCase();
  if (t.includes("zte")) return "ZTE";
  if (t.includes("huawei") || t.includes("hw")) return "Huawei";
  if (t.includes("vsol") || t.includes("v-sol") || t.includes("vsolution")) return "VSOL";
  return "Lainnya";
}

function collectWlans(flat: Flat): AcsWlan[] {
  const wlans: AcsWlan[] = [];
  for (const path of Object.keys(flat)) {
    const igd = path.match(/^(.*WLANConfiguration\.(\d+))\.SSID$/);
    const tr181 = path.match(/^(Device\.WiFi\.SSID\.(\d+))\.SSID$/);
    const m = igd ?? tr181;
    if (!m) continue;
    const root = m[1]!;
    const index = m[2]!;
    const pwdCandidates = igd
      ? [
          `${root}.KeyPassphrase`,
          `${root}.PreSharedKey.1.KeyPassphrase`,
          `${root}.PreSharedKey.1.PreSharedKey`,
          `${root}.X_ZTE-COM_WPAKey`,
          `${root}.X_HW_WPAKey`,
        ]
      : [
          `Device.WiFi.AccessPoint.${index}.Security.KeyPassphrase`,
          `Device.WiFi.AccessPoint.${index}.Security.PreSharedKey`,
        ];
    const passwordPath = pwdCandidates.find((p) => p in flat) ?? pwdCandidates[0]!;
    const band = pick(flat, `${root}.Standard`, `${root}.OperatingFrequencyBand`).includes("5")
      ? "5 GHz"
      : "2.4 GHz";
    wlans.push({
      index,
      ssidPath: path,
      ssid: String(flat[path] ?? ""),
      passwordPath,
      password: String(flat[passwordPath] ?? ""),
      enabled: String(pick(flat, `${root}.Enable`, `Device.WiFi.SSID.${index}.Enable`)) === "true",
      band,
    });
  }
  return wlans.sort((a, b) => Number(a.index) - Number(b.index));
}

function collectWans(flat: Flat): AcsWan[] {
  const wans: AcsWan[] = [];
  const seen = new Set<string>();
  for (const path of Object.keys(flat)) {
    const m = path.match(/^(.*\.(WANPPPConnection|WANIPConnection)\.(\d+))\./);
    if (!m) continue;
    const root = m[1]!;
    if (seen.has(root)) continue;
    seen.add(root);
    const kind = m[2] === "WANPPPConnection" ? "PPPoE" : "IP";
    const vlanKey = Object.keys(flat).find(
      (k) => k.startsWith(`${root}.`) && /VLANID|VLANIDMark|X_.*_VLANID/i.test(k),
    );
    wans.push({
      path: root,
      parentPath: `${root.replace(/\.\d+$/, "")}.`,
      index: m[3]!,
      kind,
      name: pick(flat, `${root}.Name`) || `${kind} ${m[3]}`,
      connectionType: pick(flat, `${root}.ConnectionType`),
      username: pick(flat, `${root}.Username`),
      ip: pick(flat, `${root}.ExternalIPAddress`),
      vlan: vlanKey ? String(flat[vlanKey] ?? "") : "",
      status: pick(flat, `${root}.ConnectionStatus`),
      enabled: pick(flat, `${root}.Enable`) === "true",
    });
  }
  return wans;
}

function mapDevice(raw: Record<string, unknown>): AcsDevice {
  const flat = flatten(raw);
  const id = String((raw as { _id?: string })._id ?? "");
  const lastInform = String((raw as { _lastInform?: string })._lastInform ?? "");
  const manufacturer = pick(
    flat,
    "InternetGatewayDevice.DeviceInfo.Manufacturer",
    "Device.DeviceInfo.Manufacturer",
  );
  const model = pick(
    flat,
    "InternetGatewayDevice.DeviceInfo.ProductClass",
    "Device.DeviceInfo.ProductClass",
    "InternetGatewayDevice.DeviceInfo.ModelName",
    "Device.DeviceInfo.ModelName",
  );
  const serial = pick(
    flat,
    "InternetGatewayDevice.DeviceInfo.SerialNumber",
    "Device.DeviceInfo.SerialNumber",
  );
  const rxKey = Object.keys(flat).find((k) => /RXPower|RxPower|RXOpticalPower/i.test(k));
  const ipKey = Object.keys(flat).find((k) =>
    /WANIPConnection\.\d+\.ExternalIPAddress$|WANPPPConnection\.\d+\.ExternalIPAddress$|Device\.IP\.Interface\.\d+\.IPv4Address\.\d+\.IPAddress$/.test(
      k,
    ),
  );
  const pppKey = Object.keys(flat).find((k) => /WANPPPConnection\.\d+\.Username$/.test(k));
  const informTime = lastInform ? new Date(lastInform).getTime() : 0;

  return {
    id,
    serial: serial || id,
    manufacturer,
    vendor: detectVendor(`${manufacturer} ${model} ${id}`),
    model,
    firmware: pick(
      flat,
      "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
      "Device.DeviceInfo.SoftwareVersion",
    ),
    ip: ipKey ? String(flat[ipKey] ?? "") : "",
    ppp: pppKey ? String(flat[pppKey] ?? "") : "",
    uptime: Number(
      pick(flat, "InternetGatewayDevice.DeviceInfo.UpTime", "Device.DeviceInfo.UpTime") || 0,
    ),
    rxPower: rxKey ? String(flat[rxKey] ?? "") : "",
    lastInform,
    online: informTime > 0 && Date.now() - informTime < 10 * 60 * 1000,
    wlans: collectWlans(flat),
    wans: collectWans(flat),
  };
}

export async function listAcsDevices(creds: AcsCreds): Promise<AcsDevice[]> {
  const raw = (await acsFetch(creds, "/devices/")) as Record<string, unknown>[];
  return (Array.isArray(raw) ? raw : []).map(mapDevice);
}

async function postTask(creds: AcsCreds, deviceId: string, task: Record<string, unknown>) {
  return acsFetch(
    creds,
    `/devices/${encodeURIComponent(deviceId)}/tasks?connection_request&timeout=10000`,
    { method: "POST", body: JSON.stringify(task) },
  );
}

export async function setAcsWifi(
  creds: AcsCreds,
  deviceId: string,
  values: Array<{ path: string; value: string }>,
) {
  await postTask(creds, deviceId, {
    name: "setParameterValues",
    parameterValues: values.map((v) => [v.path, v.value, "xsd:string"]),
  });
  return { ok: true as const };
}

export async function refreshAcsDevice(creds: AcsCreds, deviceId: string) {
  await postTask(creds, deviceId, { name: "refreshObject", objectName: "" });
  return { ok: true as const };
}

export async function rebootAcsDevice(creds: AcsCreds, deviceId: string) {
  await postTask(creds, deviceId, { name: "reboot" });
  return { ok: true as const };
}


export type AcsWanInput = {
  /** path induk, diakhiri titik, mis. ...WANConnectionDevice.1.WANPPPConnection. */
  parentPath: string;
  kind: "PPPoE" | "IP";
  name: string;
  username: string;
  password: string;
  vlan: string;
  /** IP mode untuk WANIPConnection: DHCP | Static */
  addressingType: string;
  ip: string;
  netmask: string;
  gateway: string;
  dns: string;
};

/** Tambah WAN baru: addObject lalu isi parameternya pada instance terbaru */
export async function addAcsWan(creds: AcsCreds, deviceId: string, input: AcsWanInput) {
  const parent = input.parentPath.endsWith(".") ? input.parentPath : `${input.parentPath}.`;
  await postTask(creds, deviceId, { name: "addObject", objectName: parent.replace(/\.$/, "") });

  // ambil ulang device untuk mengetahui index instance baru
  const raw = (await acsFetch(
    creds,
    `/devices/?query=${encodeURIComponent(JSON.stringify({ _id: deviceId }))}`,
  )) as Record<string, unknown>[];
  const dev = Array.isArray(raw) ? raw[0] : null;
  if (!dev) throw new Error("Perangkat tidak ditemukan setelah addObject");
  const flat = flatten(dev as Record<string, unknown>);
  const indexes = Object.keys(flat)
    .map((k) => k.startsWith(parent) && k.slice(parent.length).match(/^(\d+)\./)?.[1])
    .filter(Boolean)
    .map(Number);
  if (!indexes.length) throw new Error("Instance WAN baru belum terbaca, coba Refresh lalu ulangi");
  const idx = Math.max(...indexes);
  const root = `${parent}${idx}`;

  const values: Array<[string, string, string]> = [
    [`${root}.Enable`, "true", "xsd:boolean"],
  ];
  if (input.name) values.push([`${root}.Name`, input.name, "xsd:string"]);
  if (input.vlan) values.push([`${root}.X_VLANID`, input.vlan, "xsd:unsignedInt"]);
  if (input.kind === "PPPoE") {
    values.push([`${root}.ConnectionType`, "IP_Routed", "xsd:string"]);
    values.push([`${root}.Username`, input.username, "xsd:string"]);
    values.push([`${root}.Password`, input.password, "xsd:string"]);
  } else {
    values.push([`${root}.ConnectionType`, "IP_Routed", "xsd:string"]);
    values.push([`${root}.AddressingType`, input.addressingType || "DHCP", "xsd:string"]);
    if (input.addressingType === "Static") {
      if (input.ip) values.push([`${root}.ExternalIPAddress`, input.ip, "xsd:string"]);
      if (input.netmask) values.push([`${root}.SubnetMask`, input.netmask, "xsd:string"]);
      if (input.gateway) values.push([`${root}.DefaultGateway`, input.gateway, "xsd:string"]);
      if (input.dns) values.push([`${root}.DNSServers`, input.dns, "xsd:string"]);
    }
  }

  await postTask(creds, deviceId, { name: "setParameterValues", parameterValues: values });
  return { ok: true as const, path: root };
}

export async function deleteAcsWan(creds: AcsCreds, deviceId: string, path: string) {
  await postTask(creds, deviceId, { name: "deleteObject", objectName: path });
  return { ok: true as const };
}

