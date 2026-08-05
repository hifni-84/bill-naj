/** Tipe bersama untuk pembelian voucher di portal (aman dipakai di browser). */
export type PortalPlan = {
  name: string;
  price: number;
  rate_limit: string;
  validity_seconds: number;
  service: "hotspot" | "pppoe";
};

export type Order = {
  id: number;
  code: string;
  plan: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  username: string;
  password: string;
  qty: number;
  vouchers: { username: string; password: string }[];
  pay_url: string;
  created_at: string;
  paid_at: string | null;
};
