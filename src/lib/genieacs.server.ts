import type { AcsCreds } from "./genieacs-store";
import type { AcsDevice, AcsHost, AcsParam, AcsVlan, AcsWan, AcsWlan } from "./genieacs-types";

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
  // Kumpulkan root WLAN dari parameter apa pun (SSID mungkin belum ter-fetch)
  const roots = new Map<string, { index: string; igd: boolean }>();
  for (const key of Object.keys(flat)) {
    const igd = key.match(/^(.*WLANConfiguration\.(\d+))(\.|$)/);
    const tr181 = key.match(/^(Device\.WiFi\.SSID\.(\d+))(\.|$)/);
    const m = igd ?? tr181;
    if (!m) continue;
    if (!roots.has(m[1]!)) roots.set(m[1]!, { index: m[2]!, igd: Boolean(igd) });
  }
  for (const [root, meta] of roots) {
    const { index, igd } = meta;
    const ssidPath = `${root}.SSID`;
    const ssid = pick(
      flat,
      ssidPath,
      `${root}.X_ZTE-COM_SSID`,
      `${root}.X_HW_SSID`,
      `Device.WiFi.SSID.${index}.SSID`,
      `Device.WiFi.SSID.${index}.Alias`,
    );
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
    const ap = `Device.WiFi.AccessPoint.${index}`;
    const channelPath = igd ? `${root}.Channel` : `Device.WiFi.Radio.${index}.Channel`;
    const hiddenPath = igd ? `${root}.SSIDAdvertisementEnabled` : `${ap}.SSIDAdvertisementEnabled`;
    const securityPath = igd ? `${root}.BeaconType` : `${ap}.Security.ModeEnabled`;
    const clients = Number(
      pick(
        flat,
        `${root}.TotalAssociations`,
        `${root}.AssociatedDeviceNumberOfEntries`,
        `${ap}.AssociatedDeviceNumberOfEntries`,
      ) || 0,
    );
    wlans.push({
      index,
      root,
      ssidPath,
      ssid,
      passwordPath,
      password: String(flat[passwordPath] ?? ""),
      enabled: String(pick(flat, `${root}.Enable`, `Device.WiFi.SSID.${index}.Enable`)) === "true",
      band,
      channel: pick(flat, channelPath),
      channelPath,
      hidden: pick(flat, hiddenPath) === "false",
      hiddenPath,
      enablePath: `${root}.Enable`,
      security: pick(flat, securityPath),
      securityPath,
      bssid: pick(flat, `${root}.BSSID`, `${root}.MACAddress`, `Device.WiFi.SSID.${index}.BSSID`),
      clients,
    });
  }
  return wlans.sort((a, b) => Number(a.index) - Number(b.index));
}

function collectHosts(flat: Flat): AcsHost[] {
  const hosts: AcsHost[] = [];
  const seen = new Set<string>();
  for (const path of Object.keys(flat)) {
    const m = path.match(/^(.*Hosts\.Host\.(\d+))\./);
    if (!m) continue;
    const root = m[1]!;
    if (seen.has(root)) continue;
    seen.add(root);
    hosts.push({
      name: pick(flat, `${root}.HostName`) || "(tanpa nama)",
      ip: pick(flat, `${root}.IPAddress`),
      mac: pick(flat, `${root}.MACAddress`),
      iface: pick(flat, `${root}.InterfaceType`, `${root}.Layer2Interface`),
      active: pick(flat, `${root}.Active`) === "true",
      lease: pick(flat, `${root}.LeaseTimeRemaining`),
    });
  }
  return hosts;
}

function collectVlans(flat: Flat): AcsVlan[] {
  const out: AcsVlan[] = [];
  for (const path of Object.keys(flat)) {
    // cocokkan berbagai nama vendor: VLANID, VLANIDMark, X_..._VLANID, VID, TagValue, VLANIDMark
    if (
      !/(^|\.)(X_[^.]*_)?(VLAN(ID)?(Mark)?|VID|TagValue|VLANIDMark)$/i.test(path) &&
      !/VLAN/i.test(path.split(".").pop() ?? "")
    )
      continue;
    const value = String(flat[path] ?? "");
    if (!value.length || value === "0" || value === "-1") continue;
    const scope = /WANPPPConnection/.test(path)
      ? "WAN PPPoE"
      : /WANIPConnection/.test(path)
        ? "WAN IP"
        : /Ethernet|Bridge|LAN/i.test(path)
          ? "LAN / Bridge"
          : "Lainnya";
    out.push({ path, value, scope });
  }
  return out;
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
    // VLAN bisa berada di dalam koneksi, atau di level WANConnectionDevice induknya
    const connDevice = root.replace(/\.(WANPPPConnection|WANIPConnection)\.\d+$/, "");
    const vlanRe = /(VLANID|VLANIDMark|VLAN$|_VLAN|VID$|TagValue$)/i;
    const vlanKey =
      Object.keys(flat).find((k) => k.startsWith(`${root}.`) && vlanRe.test(k)) ??
      Object.keys(flat).find(
        (k) => k.startsWith(`${connDevice}.`) && vlanRe.test(k) && String(flat[k] ?? "").length,
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
      vlanPath: vlanKey ?? `${root}.X_VLANID`,
      natEnabled: pick(flat, `${root}.NATEnabled`) === "true",
      uptime: Number(pick(flat, `${root}.Uptime`) || 0),
      dns: pick(flat, `${root}.DNSServers`),
      gateway: pick(flat, `${root}.DefaultGateway`),
      netmask: pick(flat, `${root}.SubnetMask`),
      macAddress: pick(flat, `${root}.MACAddress`),
      bytesSent: Number(pick(flat, `${root}.Stats.EthernetBytesSent`) || 0),
      bytesReceived: Number(pick(flat, `${root}.Stats.EthernetBytesReceived`) || 0),
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
  // Ambang online mengikuti interval inform ONU (default 300s), minimal 10 menit.
  const informInterval = Number(
    pick(
      flat,
      "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
      "Device.ManagementServer.PeriodicInformInterval",
    ) || 300,
  );
  const onlineWindow = Math.max(10 * 60 * 1000, informInterval * 2.5 * 1000);
  const txKey = Object.keys(flat).find((k) => /TXPower|TxPower|TXOpticalPower/i.test(k));
  const tempKey = Object.keys(flat).find((k) => /Temperature/i.test(k));
  const macKey = Object.keys(flat).find((k) => /MACAddress$/i.test(k));
  const ponKey = Object.keys(flat).find((k) => /PONMode|GponMode|X_.*_PON/i.test(k));
  const regKey = Object.keys(flat).find((k) => /RegistrationState|OnlineState/i.test(k));
  const pppStatusKey = Object.keys(flat).find((k) =>
    /WANPPPConnection\.\d+\.ConnectionStatus$/.test(k),
  );
  const wlans = collectWlans(flat);
  const hosts = collectHosts(flat);
  const hostsActive = hosts.filter((h) => h.active).length || hosts.length;
  const wifiClients = wlans.reduce((a, w) => a + w.clients, 0);
  const tagsRaw = (raw as { _tags?: unknown })._tags;

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
    hardware: pick(
      flat,
      "InternetGatewayDevice.DeviceInfo.HardwareVersion",
      "Device.DeviceInfo.HardwareVersion",
    ),
    oui: id.split("-")[0] ?? "",
    productClass: pick(
      flat,
      "InternetGatewayDevice.DeviceInfo.ProductClass",
      "Device.DeviceInfo.ProductClass",
    ),
    mac: macKey ? String(flat[macKey] ?? "") : "",
    lanIp: pick(
      flat,
      "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress",
      "Device.IP.Interface.1.IPv4Address.1.IPAddress",
    ),
    pppStatus: pppStatusKey ? String(flat[pppStatusKey] ?? "") : "",
    ip: ipKey ? String(flat[ipKey] ?? "") : "",
    ppp: pppKey ? String(flat[pppKey] ?? "") : "",
    uptime: Number(
      pick(flat, "InternetGatewayDevice.DeviceInfo.UpTime", "Device.DeviceInfo.UpTime") || 0,
    ),
    rxPower: rxKey ? String(flat[rxKey] ?? "") : "",
    txPower: txKey ? String(flat[txKey] ?? "") : "",
    temperature: tempKey ? String(flat[tempKey] ?? "") : "",
    cpuUsage: pick(
      flat,
      "InternetGatewayDevice.DeviceInfo.ProcessStatus.CPUUsage",
      "Device.DeviceInfo.ProcessStatus.CPUUsage",
    ),
    memoryFree: pick(
      flat,
      "InternetGatewayDevice.DeviceInfo.MemoryStatus.Free",
      "Device.DeviceInfo.MemoryStatus.Free",
    ),
    memoryTotal: pick(
      flat,
      "InternetGatewayDevice.DeviceInfo.MemoryStatus.Total",
      "Device.DeviceInfo.MemoryStatus.Total",
    ),
    ponMode: ponKey ? String(flat[ponKey] ?? "") : "",
    registrationState: regKey ? String(flat[regKey] ?? "") : "",
    tags: Array.isArray(tagsRaw) ? tagsRaw.map(String) : [],
    lastInform,
    online: informTime > 0 && Date.now() - informTime < 10 * 60 * 1000,
    hostsActive,
    wifiClients,
    totalUsers: hostsActive + wifiClients,
    wlans,
    wans: collectWans(flat),
    hosts,
    vlans: collectVlans(flat),
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
  // Refresh seluruh pohon + subtree penting (SSID/VLAN sering belum ter-fetch
  // kalau hanya mengandalkan refresh root pada beberapa ONU)
  const subtrees = [
    "",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice",
    "InternetGatewayDevice.LANDevice.1.Hosts",
    "Device.WiFi",
    "Device.IP.Interface",
  ];
  for (const objectName of subtrees) {
    try {
      await postTask(creds, deviceId, { name: "refreshObject", objectName });
    } catch {
      // objek tidak ada pada model perangkat ini — lanjutkan
    }
  }
  return { ok: true as const };
}

export async function rebootAcsDevice(creds: AcsCreds, deviceId: string) {
  await postTask(creds, deviceId, { name: "reboot" });
  return { ok: true as const };
}

/**
 * Penjelajahan penuh: minta ONU mengirimkan SEMUA nama + nilai parameter.
 * getParameterNames(nextLevel=false) menelusuri seluruh subtree, lalu
 * refreshObject mengambil nilainya.
 */
export async function discoverAcsParams(creds: AcsCreds, deviceId: string) {
  const roots = ["InternetGatewayDevice", "Device"];
  let queued = 0;
  const errors: string[] = [];
  for (const root of roots) {
    for (const task of [
      { name: "getParameterNames", objectName: `${root}.`, nextLevel: false },
      { name: "refreshObject", objectName: root },
    ]) {
      try {
        await postTask(creds, deviceId, task);
        queued += 1;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  if (!queued) throw new Error(errors[0] ?? "Tidak ada tugas yang bisa dikirim");
  return { ok: true as const, queued };
}

export async function factoryResetAcsDevice(creds: AcsCreds, deviceId: string) {
  await postTask(creds, deviceId, { name: "factoryReset" });
  return { ok: true as const };
}

/** Set parameter apa pun (generik) */
export async function setAcsParams(
  creds: AcsCreds,
  deviceId: string,
  values: Array<{ path: string; value: string; type?: string }>,
) {
  await postTask(creds, deviceId, {
    name: "setParameterValues",
    parameterValues: values.map((v) => [v.path, v.value, v.type ?? "xsd:string"]),
  });
  return { ok: true as const };
}

export async function addAcsObject(creds: AcsCreds, deviceId: string, objectName: string) {
  await postTask(creds, deviceId, {
    name: "addObject",
    objectName: objectName.replace(/\.$/, ""),
  });
  return { ok: true as const };
}

export async function deleteAcsObject(creds: AcsCreds, deviceId: string, objectName: string) {
  await postTask(creds, deviceId, { name: "deleteObject", objectName });
  return { ok: true as const };
}

/** Set VLAN pada WAN yang sudah ada; mencoba beberapa nama parameter vendor */
export async function setAcsVlan(
  creds: AcsCreds,
  deviceId: string,
  input: { wanPath: string; vlan: string; priority: string; vlanPath?: string },
) {
  const root = input.wanPath.replace(/\.$/, "");
  const paths = input.vlanPath
    ? [input.vlanPath]
    : [`${root}.X_VLANID`, `${root}.X_ZTE-COM_VLANID`, `${root}.X_HW_VLAN`, `${root}.VLANIDMark`];
  const values = paths.map((p) => ({ path: p, value: input.vlan, type: "xsd:unsignedInt" }));
  if (input.priority) {
    values.push({
      path: `${root}.X_VLANPriority`,
      value: input.priority,
      type: "xsd:unsignedInt",
    });
  }
  await setAcsParams(creds, deviceId, values);
  return { ok: true as const };
}

/** Ambil seluruh parameter perangkat (untuk penjelajah parameter) */
export async function listAcsParams(creds: AcsCreds, deviceId: string): Promise<AcsParam[]> {
  const raw = (await acsFetch(
    creds,
    `/devices/?query=${encodeURIComponent(JSON.stringify({ _id: deviceId }))}`,
  )) as Record<string, unknown>[];
  const dev = Array.isArray(raw) ? raw[0] : null;
  if (!dev) throw new Error("Perangkat tidak ditemukan");
  const flat = flatten(dev as Record<string, unknown>);
  return Object.keys(flat)
    .sort()
    .map((path) => ({ path, value: String(flat[path] ?? ""), writable: true }));
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

  const values: Array<[string, string, string]> = [[`${root}.Enable`, "true", "xsd:boolean"]];
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
