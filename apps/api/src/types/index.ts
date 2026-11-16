import { Request } from 'express';
import { Company, AdminUser } from '@prisma/client';

export interface PrinterInfo {
  name: string;
  displayName?: string;
  description?: string;
  status?: number | string;
  isDefault?: boolean;
  type?: 'local' | 'network' | 'usb';
  host?: string;
  port?: number;
}

export interface AdminPayload {
  id: string;
  email: string;
  name: string;
}

export interface AuthenticatedAdminRequest extends Request {
  admin?: AdminPayload;
}

export interface AuthenticatedCompanyRequest extends Request {
  company?: Company;
}

export interface AgentRegisterPayload {
  machineToken: string;
  hostname?: string;
  os?: string;
  version?: string;
  defaultPrinter?: string;
  printers?: PrinterInfo[];
}

export interface AgentHeartbeatPayload {
  machineToken: string;
  defaultPrinter?: string;
  printers?: PrinterInfo[];
}

export interface AgentSetDefaultPrinterPayload {
  machineToken: string;
  defaultPrinter: string;
}

export interface AgentUnclaimPayload {
  machineToken: string;
}

export interface PrintStatusPayload {
  jobId: string;
  status: 'PRINTING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
}

export interface PrintJobDispatchPayload {
  jobId: string;
  title: string;
  printerName?: string | null;
  type: 'TEXT' | 'RAW' | 'PDF' | 'IMAGE' | 'HTML';
  content: string;
  options?: any;
}
