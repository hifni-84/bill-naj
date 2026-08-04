export type AcsWlan = {
  index: string;
  ssidPath: string;
  ssid: string;
  passwordPath: string;
  password: string;
  enabled: boolean;
  band: string;
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
};

export type AcsDevice = {
  id: string;
  serial: string;
  manufacturer: string;
  vendor: "ZTE" | "Huawei" | "VSOL" | "Lainnya";
  model: string;
  firmware: string;
  ip: string;
  ppp: string;
  uptime: number;
  rxPower: string;
  lastInform: string;
  online: boolean;
  wlans: AcsWlan[];
  wans: AcsWan[];
};
