export type AcsWlan = {
  index: string;
  root: string;
  ssidPath: string;
  ssid: string;
  passwordPath: string;
  password: string;
  enabled: boolean;
  band: string;
  channel: string;
  channelPath: string;
  hidden: boolean;
  hiddenPath: string;
  enablePath: string;
  security: string;
  securityPath: string;
  bssid: string;
  clients: number;
};

export type AcsWan = {
  /** path instance, mis. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2 */
  path: string;
  /** path induk untuk addObject, diakhiri titik */
  parentPath: string;
  index: string;
  kind: "PPPoE" | "IP";
  name: string;
  connectionType: string;
  username: string;
  ip: string;
  vlan: string;
  status: string;
  enabled: boolean;
  vlanPath: string;
  natEnabled: boolean;
  uptime: number;
  dns: string;
  gateway: string;
  netmask: string;
  macAddress: string;
  bytesSent: number;
  bytesReceived: number;
};

export type AcsHost = {
  name: string;
  ip: string;
  mac: string;
  iface: string;
  active: boolean;
  lease: string;
};

export type AcsVlan = {
  path: string;
  value: string;
  scope: string;
};

export type AcsParam = {
  path: string;
  value: string;
  writable: boolean;
};

export type AcsDevice = {
  id: string;
  serial: string;
  manufacturer: string;
  vendor: "ZTE" | "Huawei" | "VSOL" | "Lainnya";
  model: string;
  firmware: string;
  hardware: string;
  oui: string;
  productClass: string;
  mac: string;
  lanIp: string;
  pppStatus: string;
  ip: string;
  ppp: string;
  uptime: number;
  rxPower: string;
  txPower: string;
  temperature: string;
  cpuUsage: string;
  memoryFree: string;
  memoryTotal: string;
  ponMode: string;
  registrationState: string;
  tags: string[];
  lastInform: string;
  online: boolean;
  hostsActive: number;
  wifiClients: number;
  totalUsers: number;
  wlans: AcsWlan[];
  wans: AcsWan[];
  hosts: AcsHost[];
  vlans: AcsVlan[];
};
