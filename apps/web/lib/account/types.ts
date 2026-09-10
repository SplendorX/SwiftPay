export type AccountType = "PERSONAL" | "BUSINESS";

export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type BusinessAsset = "USDC" | "EURC";

export type AccountRecord = {
  account_type: AccountType;
  account_upgraded_at: string | null;
  account_type_selected: boolean;
  avatar_url: string | null;
  bio: string | null;
  display_name: string | null;
  locale: string;
  username: string;
  wallet_address: string;
};

export type BusinessAccountProfile = {
  address_line: string | null;
  business_name: string;
  business_size: string | null;
  category: string | null;
  contact_email: string | null;
  country: string | null;
  currency: BusinessAsset;
  description: string | null;
  industry: string | null;
  logo_url: string | null;
  phone: string | null;
  registration_number: string | null;
  social_links: Record<string, string>;
  tax_identifier: string | null;
  updated_at: string;
  verification_status: "UNVERIFIED" | "PENDING" | "VERIFIED";
  wallet_address: string;
  website: string | null;
};

export type InvoiceItemInput = {
  description: string;
  discount?: string;
  quantity: string;
  tax?: string;
  unitPrice: string;
};

export type InvoiceItemRecord = {
  description: string;
  discount?: string;
  id: string;
  quantity: string;
  tax: string;
  total: string;
  unit_price: string;
};

export type InvoiceRecord = {
  allow_partial_payment?: boolean;
  amount_received?: string;
  created_at: string;
  currency: BusinessAsset;
  customer_company: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_username?: string | null;
  customer_wallet: string | null;
  discount: string;
  due_date: string | null;
  id: string;
  invoice_number: string;
  issue_date: string | null;
  notes: string | null;
  overpayment?: string;
  paid_at: string | null;
  payment_link: string | null;
  payment_terms: string | null;
  public_id: string;
  status: InvoiceStatus;
  subtotal: string;
  tax: string;
  total: string;
  updated_at: string;
  wallet_address: string;
};

export type InvoiceWithItems = InvoiceRecord & {
  items: InvoiceItemRecord[];
};

export type InvoiceSummary = {
  overdue: number;
  paid: number;
  pending: number;
  totalInvoiced: number;
};
