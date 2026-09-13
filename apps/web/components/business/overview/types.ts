export type CashFlowPeriod = "7D" | "30D" | "3M" | "1Y";

export type AssetBreakdownItem = {
  name: string;
  symbol: "USDC" | "EURC";
  balance: number;
  formatted: string;
};

export type LiquiditySummaryData = {
  availableToSpend: number;
  availableToSpendFormatted: string;
  scheduledAndReserved: number;
  scheduledAndReservedFormatted: string;
};

export type BusinessBalanceData = {
  totalBalance: number;
  totalBalanceFormatted: string;
  trendPercentage: number;
  trendDirection: "up" | "down" | "flat";
  assets: AssetBreakdownItem[];
  liquidity: LiquiditySummaryData;
};

export type BusinessMetricItem = {
  id: string;
  title: string;
  valueFormatted: string;
  subtitle: string;
  trend?: string;
  trendPositive?: boolean;
  href?: string;
};

export type CashFlowDataPoint = {
  label: string;
  incoming: number;
  outgoing: number;
  net: number;
};

export type CashFlowSummary = {
  incomingTotal: number;
  incomingTotalFormatted: string;
  outgoingTotal: number;
  outgoingTotalFormatted: string;
  netFlow: number;
  netFlowFormatted: string;
  points: CashFlowDataPoint[];
};

export type BusinessActivityCategory =
  | "software"
  | "invoice"
  | "payroll"
  | "vendor"
  | "transfer";

export type BusinessActivityItem = {
  id: string;
  title: string;
  description: string;
  amountFormatted: string;
  isIncoming: boolean;
  status: "Completed" | "Pending" | "Failed";
  dateFormatted: string;
  category: BusinessActivityCategory;
  txHash?: string;
};

export type BusinessInsightItemData = {
  id: string;
  title: string;
  description: string;
  type: "growth" | "attention" | "upcoming";
  href?: string;
};

export type InvoiceAttentionItem = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  amountFormatted: string;
  dueLabel: string;
  isUrgent?: boolean;
  href?: string;
};

export type InvoiceOverviewData = {
  outstandingTotal: number;
  outstandingFormatted: string;
  outstandingCount: number;
  paidThisMonthTotal: number;
  paidThisMonthFormatted: string;
  paidThisMonthCount: number;
  attentionItems: InvoiceAttentionItem[];
};

export type TeamPaymentsData = {
  nextPayrollDateFormatted: string;
  teamMembersCount: number;
  scheduledAmountFormatted: string;
};

export type HealthIndicatorStatus =
  | "Healthy"
  | "Active"
  | "Good"
  | "Stable"
  | "Attention"
  | "Setup Needed"
  | "New Account"
  | "No Invoices"
  | "Scheduled"
  | "0 Due"
  | (string & {});

export type BusinessHealthIndicatorData = {
  id: string;
  label: string;
  status: HealthIndicatorStatus;
  statusCount?: string;
  description: string;
  tone: "positive" | "neutral" | "warning";
};

export type BusinessFinancialHealthData = {
  indicators: BusinessHealthIndicatorData[];
};
