export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  apiKey: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    agents: number;
    jobs: number;
  };
}

export interface PrinterInfo {
  name: string;
  displayName?: string;
  description?: string;
  status?: string;
  isDefault?: boolean;
}

export interface Agent {
  id: string;
  code: string;
  name: string | null;
  status: 'ONLINE' | 'OFFLINE';
  lastSeenAt: string;
  hostname: string | null;
  os: string | null;
  version: string | null;
  ipAddress: string | null;
  defaultPrinter: string | null;
  printers: PrinterInfo[] | any[];
  companyId: string | null;
  company?: {
    id: string;
    name: string;
    slug?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  updateStatus?: string;
  downloadProgress?: number;
  _count?: {
    jobs: number;
  };
}

export type PrintJobStatus = 'QUEUED' | 'PRINTING' | 'COMPLETED' | 'FAILED';
export type PrintJobType = 'TEXT' | 'RAW' | 'PDF' | 'IMAGE' | 'HTML';

export interface PrintJob {
  id: string;
  companyId: string | null;
  agentId: string;
  printerName: string;
  type: PrintJobType;
  title: string | null;
  content: string;
  options: any;
  status: PrintJobStatus;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company?: {
    id: string;
    name: string;
  } | null;
  agent?: {
    id: string;
    code: string;
    name: string | null;
    hostname?: string | null;
    defaultPrinter?: string | null;
  } | null;
}

export interface DashboardStats {
  companies: {
    total: number;
  };
  agents: {
    total: number;
    online: number;
    offline: number;
    unassigned: number;
  };
  jobs: {
    total: number;
    last24h: number;
    queued: number;
    failed: number;
    completed: number;
  };
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface SocketDashboardEvent {
  type:
    | 'agent_status'
    | 'agent_heartbeat'
    | 'agent_assigned'
    | 'agent_unclaimed'
    | 'agent_updated'
    | 'agent_printer_updated'
    | 'agent_update_status'
    | 'new_print_job'
    | 'print_job_status';
  agent?: any;
  agentId?: string;
  job?: any;
  code?: string;
  defaultPrinter?: string;
  timestamp?: string;
  updateStatus?: string;
  currentVersion?: string;
  availableVersion?: string;
  downloadProgress?: number;
}
