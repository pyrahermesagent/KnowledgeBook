/**
 * KnowledgeBook TypeScript/JavaScript SDK
 * 
 * Official SDK for KnowledgeBook documentation platform
 * Provides typed interfaces and helper functions for all APIs
 */

// Types
export interface KnowledgeBookConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}

export interface Project {
  id: number;
  slug: string;
  name: string;
  description?: string;
  accent_color: string;
  icon_url?: string;
  font_family: string;
  bg_color: string;
  bg_subtle: string;
  text_color: string;
  text_muted: string;
  border_color: string;
  radius: number;
  updated_at: string;
  role?: 'admin' | 'member';
}

export interface Section {
  id: number;
  project_id: number;
  title: string;
  position: number;
  updated_at: string;
}

export interface Page {
  id: number;
  project_id: number;
  section_id?: number;
  slug: string;
  title: string;
  content: string;
  position: number;
  updated_at: string;
}

export interface Member {
  id: number;
  project_id: number;
  email: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface UploadResponse {
  url: string;
  filename: string;
  size: number;
  content_type: string;
}

export interface Theme {
  accent_color: string;
  font_family: string;
  bg_color: string;
  bg_subtle: string;
  text_color: string;
  text_muted: string;
  border_color: string;
  radius: number;
}

export interface WalletUser {
  id: number;
  wallet_address: string;
  created_at: string;
}

export interface TokenGatedConfig {
  project_id: number;
  token_contract: string;
  token_id?: number;
  min_balance?: number;
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base';
}

export interface NftOwnership {
  project_id: number;
  nft_contract: string;
  nft_token_id: number;
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base';
  owner_address: string;
  granted_at: string;
}

// Main SDK Class
export class KnowledgeBook {
  private baseUrl: string;
  private apiKey?: string;
  private accessToken?: string;

  constructor(config: KnowledgeBookConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.accessToken = config.accessToken;
  }

  private async request(endpoint: string, options?: RequestInit) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Projects API
  async listProjects(): Promise<{ projects: Project[] }> {
    return this.request('/api/projects');
  }

  async getProject(slug: string): Promise<Project> {
    return this.request(`/api/projects/${slug}`);
  }

  async createProject(data: Partial<Project>): Promise<Project> {
    return this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateProject(slug: string, data: Partial<Project>): Promise<Project> {
    return this.request(`/api/projects/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteProject(slug: string): Promise<void> {
    await this.request(`/api/projects/${slug}`, {
      method: 'DELETE'
    });
  }

  // Import API
  async importFromGitBook(
    gitbookUrl: string,
    projectName: string,
    description?: string
  ): Promise<Project> {
    return this.request('/api/projects/import-gitbook', {
      method: 'POST',
      body: JSON.stringify({ gitbook_url: gitbookUrl, project_name: projectName, project_description: description })
    });
  }

  // Sections API
  async listSections(projectSlug: string): Promise<{ sections: Section[] }> {
    return this.request(`/api/projects/${projectSlug}/sections`);
  }

  async createSection(projectSlug: string, data: Partial<Section>): Promise<Section> {
    return this.request(`/api/projects/${projectSlug}/sections`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateSection(projectSlug: string, sectionId: number, data: Partial<Section>): Promise<Section> {
    return this.request(`/api/projects/${projectSlug}/sections/${sectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteSection(projectSlug: string, sectionId: number): Promise<void> {
    await this.request(`/api/projects/${projectSlug}/sections/${sectionId}`, {
      method: 'DELETE'
    });
  }

  // Pages API
  async listPages(projectSlug: string): Promise<{ pages: Page[] }> {
    return this.request(`/api/projects/${projectSlug}/pages`);
  }

  async getPage(projectSlug: string, pageSlug: string): Promise<Page> {
    return this.request(`/api/projects/${projectSlug}/view/${pageSlug}`);
  }

  async createPage(projectSlug: string, data: Partial<Page>): Promise<Page> {
    return this.request(`/api/projects/${projectSlug}/pages`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updatePage(projectSlug: string, pageId: number, data: Partial<Page>): Promise<Page> {
    return this.request(`/api/projects/${projectSlug}/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deletePage(projectSlug: string, pageId: number): Promise<void> {
    await this.request(`/api/projects/${projectSlug}/pages/${pageId}`, {
      method: 'DELETE'
    });
  }

  // Members API
  async listMembers(projectSlug: string): Promise<{ members: Member[] }> {
    return this.request(`/api/projects/${projectSlug}/members`);
  }

  async addMember(projectSlug: string, email: string, role: 'admin' | 'member' = 'member'): Promise<Member> {
    return this.request(`/api/projects/${projectSlug}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
  }

  async removeMember(projectSlug: string, memberId: number): Promise<void> {
    await this.request(`/api/projects/${projectSlug}/members/${memberId}`, {
      method: 'DELETE'
    });
  }

  // Upload API
  async uploadFile(projectSlug: string, file: File | Blob): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}/api/projects/${projectSlug}/upload`, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  // Theme API
  async getTheme(projectSlug: string): Promise<Theme> {
    return this.request(`/api/projects/${projectSlug}/theme`);
  }

  async updateTheme(projectSlug: string, data: Partial<Theme>): Promise<Theme> {
    return this.request(`/api/projects/${projectSlug}/theme`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  // Web3 API
  async loginWithWallet(
    address: string,
    message: string,
    signature: string
  ): Promise<{ token: string; user: WalletUser }> {
    return this.request('/api/auth/wallet/login', {
      method: 'POST',
      body: JSON.stringify({ address, message, signature })
    });
  }

  // Token-Gated API
  async createTokenGatedProject(
    projectSlug: string,
    tokenContract: string,
    network: 'ethereum' | 'polygon' | 'arbitrum' | 'base',
    tokenType: 'erc20' | 'erc721',
    value: number
  ): Promise<TokenGatedConfig> {
    return this.request(`/api/projects/${projectSlug}/token-gate`, {
      method: 'POST',
      body: JSON.stringify({
        token_contract: tokenContract,
        network,
        token_type: tokenType,
        value
      })
    });
  }

  async checkTokenAccess(projectSlug: string, walletAddress: string): Promise<{ hasAccess: boolean; reason?: string }> {
    return this.request(`/api/token-gate/${projectSlug}/check/${walletAddress}`);
  }

  // NFT API
  async setNftOwnership(
    projectSlug: string,
    nftContract: string,
    nftTokenId: number,
    network: 'ethereum' | 'polygon' | 'arbitrum' | 'base',
    ownerAddress: string
  ): Promise<NftOwnership> {
    return this.request(`/api/projects/${projectSlug}/nft-ownership`, {
      method: 'POST',
      body: JSON.stringify({
        nft_contract: nftContract,
        nft_token_id: nftTokenId,
        network,
        owner_address: ownerAddress
      })
    });
  }

  async transferProjectOwnership(
    projectSlug: string,
    fromWallet: string,
    toWallet: string,
    nftContract: string,
    nftTokenId: number
  ): Promise<{ success: boolean }> {
    return this.request(`/api/projects/${projectSlug}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({
        from_wallet: fromWallet,
        to_wallet: toWallet,
        nft_contract: nftContract,
        nft_token_id: nftTokenId
      })
    });
  }

  // MCP API
  async listProjectsMcp(): Promise<string> {
    return this.callMcpTool('list_projects', {});
  }

  async getProjectMcp(project: string): Promise<string> {
    return this.callMcpTool('get_project', { project });
  }

  async getPageMcp(project: string, page: string): Promise<string> {
    return this.callMcpTool('get_page', { project, page });
  }

  async searchMcp(query: string, project?: string): Promise<string> {
    return this.callMcpTool('search', { query, project });
  }

  private async callMcpTool(toolName: string, params: Record<string, unknown>): Promise<string> {
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params
        },
        id: 1
      })
    });

    const result = await response.json();
    return result.result?.content?.[0]?.text || JSON.stringify(result);
  }
}

// Export utility functions
export * from './utils';
export * from './types';
