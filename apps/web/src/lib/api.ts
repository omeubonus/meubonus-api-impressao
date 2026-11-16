import {
  AdminUser,
  Company,
  Agent,
  PrintJob,
  DashboardStats,
  PaginatedResponse,
  PrintJobType,
  PrintJobStatus,
} from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3335';

class ApiClient {
  private getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem('silentprint_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expirado ou inválido
      if (!endpoint.includes('/auth/login')) {
        localStorage.removeItem('silentprint_token');
        localStorage.removeItem('silentprint_user');
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }

    if (!response.ok) {
      let errorMessage = `Erro HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        // Ignora erro de parse de json
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Health
  async getHealth(): Promise<{ status: string; uptime: number; timestamp: string }> {
    return this.request('/health');
  }

  // Auth
  async login(credentials: { email: string; password: string }): Promise<{ token: string; user: AdminUser }> {
    return this.request('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async getMe(): Promise<{ user: AdminUser }> {
    return this.request('/api/admin/auth/me');
  }

  // Dashboard Stats
  async getStats(): Promise<DashboardStats> {
    return this.request('/api/admin/stats');
  }

  // Companies
  async getCompanies(): Promise<Company[]> {
    return this.request('/api/admin/companies');
  }

  async createCompany(data: { name: string; slug?: string }): Promise<Company> {
    return this.request('/api/admin/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCompany(id: string, data: { name?: string; slug?: string; active?: boolean }): Promise<Company> {
    return this.request(`/api/admin/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async regenerateCompanyKey(id: string): Promise<{ message: string; apiKey: string }> {
    return this.request(`/api/admin/companies/${id}/regenerate-key`, {
      method: 'POST',
    });
  }

  async deleteCompany(id: string): Promise<{ message: string }> {
    return this.request(`/api/admin/companies/${id}`, {
      method: 'DELETE',
    });
  }

  // Agents
  async getAgents(params?: {
    companyId?: string;
    unassigned?: boolean;
    status?: 'ONLINE' | 'OFFLINE';
    search?: string;
  }): Promise<Agent[]> {
    const query = new URLSearchParams();
    if (params?.companyId) query.set('companyId', params.companyId);
    if (params?.unassigned) query.set('unassigned', 'true');
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);

    const queryString = query.toString();
    return this.request(`/api/admin/agents${queryString ? `?${queryString}` : ''}`);
  }

  async assignAgent(id: string, companyId: string): Promise<Agent> {
    return this.request(`/api/admin/agents/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ companyId }),
    });
  }

  async unclaimAgent(id: string): Promise<{ message: string; agent: Agent }> {
    return this.request(`/api/admin/agents/${id}/unclaim`, {
      method: 'POST',
    });
  }

  async updateAgent(id: string, data: { name?: string; defaultPrinter?: string }): Promise<Agent> {
    return this.request(`/api/admin/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async triggerAgentUpdate(id: string, force?: boolean): Promise<{ success: boolean; message?: string; reason?: string; status?: string }> {
    return this.request(`/api/admin/agents/${id}/update`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  }

  async triggerUpdateAllAgents(force?: boolean): Promise<{ success: boolean; triggeredCount: number; message: string; latestVersion: string }> {
    return this.request('/api/admin/agents/update-all', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  }

  async getDownloadsInfo(): Promise<{
    version: string;
    buildingVersion?: string | null;
    windows: { available: boolean; fileName: string; size: string; downloadUrl: string };
    mac: { available: boolean; fileName: string; size: string; downloadUrl: string };
  }> {
    return this.request('/api/downloads/info');
  }

  // Print Test
  async dispatchPrintTest(data: {
    agentId: string;
    printerName?: string;
    type: PrintJobType;
    content: string;
    title?: string;
    options?: any;
  }): Promise<{
    jobId: string;
    status: PrintJobStatus;
    dispatchedImmediately: boolean;
    printerName: string;
    createdAt: string;
  }> {
    return this.request('/api/admin/print-test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Print Jobs
  async getJobs(params?: {
    companyId?: string;
    agentId?: string;
    status?: PrintJobStatus;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<PrintJob>> {
    const query = new URLSearchParams();
    if (params?.companyId) query.set('companyId', params.companyId);
    if (params?.agentId) query.set('agentId', params.agentId);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));

    const queryString = query.toString();
    return this.request(`/api/admin/jobs${queryString ? `?${queryString}` : ''}`);
  }

  async getJobById(id: string): Promise<PrintJob> {
    return this.request(`/api/admin/jobs/${id}`);
  }
}

export const api = new ApiClient();
