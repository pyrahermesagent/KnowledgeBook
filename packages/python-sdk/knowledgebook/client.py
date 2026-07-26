"""
Main client class for KnowledgeBook Python SDK.
"""

import requests
from typing import Optional, Dict, Any
from .types import (
    Project,
    Section,
    Page,
    Member,
    Theme,
    TokenGatedConfig,
    NftOwnership,
    WalletUser,
    UploadResponse,
)


class KnowledgeBook:
    """Main client for KnowledgeBook API."""
    
    def __init__(self, base_url: str, api_key: Optional[str] = None, 
                 access_token: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.access_token = access_token
        self.session = requests.Session()
        
    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(
            method=method,
            url=url,
            headers=self._get_headers(),
            **kwargs
        )
        response.raise_for_status()
        return response.json()
    
    # Projects API
    def list_projects(self) -> Dict[str, Any]:
        return self._request("GET", "/api/projects")
    
    def get_project(self, slug: str) -> Project:
        data = self._request("GET", f"/api/projects/{slug}")
        return Project(**data)
    
    def create_project(self, data: Dict[str, Any]) -> Project:
        response = self._request("POST", "/api/projects", json=data)
        return Project(**response)
    
    def update_project(self, slug: str, data: Dict[str, Any]) -> Project:
        response = self._request("PATCH", f"/api/projects/{slug}", json=data)
        return Project(**response)
    
    def delete_project(self, slug: str) -> None:
        self._request("DELETE", f"/api/projects/{slug}")
    
    def import_from_gitbook(self, gitbook_url: str, project_name: str, 
                           description: Optional[str] = None) -> Project:
        data = {
            "gitbook_url": gitbook_url,
            "project_name": project_name,
            "project_description": description
        }
        response = self._request("POST", "/api/projects/import-gitbook", json=data)
        return Project(**response)
    
    # Sections API
    def list_sections(self, project_slug: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/projects/{project_slug}/sections")
    
    def create_section(self, project_slug: str, data: Dict[str, Any]) -> Section:
        response = self._request("POST", f"/api/projects/{project_slug}/sections", json=data)
        return Section(**response)
    
    def update_section(self, project_slug: str, section_id: int, 
                      data: Dict[str, Any]) -> Section:
        response = self._request("PATCH", f"/api/projects/{project_slug}/sections/{section_id}", json=data)
        return Section(**response)
    
    def delete_section(self, project_slug: str, section_id: int) -> None:
        self._request("DELETE", f"/api/projects/{project_slug}/sections/{section_id}")
    
    # Pages API
    def list_pages(self, project_slug: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/projects/{project_slug}/pages")
    
    def get_page(self, project_slug: str, page_slug: str) -> Page:
        data = self._request("GET", f"/api/projects/{project_slug}/view/{page_slug}")
        return Page(**data)
    
    def create_page(self, project_slug: str, data: Dict[str, Any]) -> Page:
        response = self._request("POST", f"/api/projects/{project_slug}/pages", json=data)
        return Page(**response)
    
    def update_page(self, project_slug: str, page_id: int, 
                   data: Dict[str, Any]) -> Page:
        response = self._request("PATCH", f"/api/projects/{project_slug}/pages/{page_id}", json=data)
        return Page(**response)
    
    def delete_page(self, project_slug: str, page_id: int) -> None:
        self._request("DELETE", f"/api/projects/{project_slug}/pages/{page_id}")
    
    # Members API
    def list_members(self, project_slug: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/projects/{project_slug}/members")
    
    def add_member(self, project_slug: str, email: str, 
                   role: str = "member") -> Member:
        response = self._request("POST", f"/api/projects/{project_slug}/members", 
                                json={"email": email, "role": role})
        return Member(**response)
    
    def remove_member(self, project_slug: str, member_id: int) -> None:
        self._request("DELETE", f"/api/projects/{project_slug}/members/{member_id}")
    
    # Upload API
    def upload_file(self, project_slug: str, file_path: str) -> UploadResponse:
        headers = self._get_headers()
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        
        with open(file_path, "rb") as f:
            files = {"file": f}
            response = self.session.post(
                f"{self.base_url}/api/projects/{project_slug}/upload",
                headers=headers,
                files=files
            )
        response.raise_for_status()
        return UploadResponse(**response.json())
    
    # Theme API
    def get_theme(self, project_slug: str) -> Theme:
        data = self._request("GET", f"/api/projects/{project_slug}/theme")
        return Theme(**data)
    
    def update_theme(self, project_slug: str, data: Dict[str, Any]) -> Theme:
        response = self._request("PATCH", f"/api/projects/{project_slug}/theme", json=data)
        return Theme(**response)
    
    # Web3 API
    def login_with_wallet(self, address: str, message: str, 
                         signature: str) -> Dict[str, Any]:
        return self._request("POST", "/api/auth/wallet/login", json={
            "address": address,
            "message": message,
            "signature": signature
        })
    
    # Token-Gated API
    def create_token_gated_project(self, project_slug: str, token_contract: str,
                                   network: str, token_type: str, 
                                   value: int) -> TokenGatedConfig:
        response = self._request("POST", f"/api/projects/{project_slug}/token-gate", json={
            "token_contract": token_contract,
            "network": network,
            "token_type": token_type,
            "value": value
        })
        return TokenGatedConfig(**response)
    
    def check_token_access(self, project_slug: str, wallet_address: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/token-gate/{project_slug}/check/{wallet_address}")
    
    # NFT API
    def set_nft_ownership(self, project_slug: str, nft_contract: str,
                         nft_token_id: int, network: str,
                         owner_address: str) -> NftOwnership:
        response = self._request("POST", f"/api/projects/{project_slug}/nft-ownership", json={
            "nft_contract": nft_contract,
            "nft_token_id": nft_token_id,
            "network": network,
            "owner_address": owner_address
        })
        return NftOwnership(**response)
    
    def transfer_project_ownership(self, project_slug: str, from_wallet: str,
                                   to_wallet: str, nft_contract: str,
                                   nft_token_id: int) -> Dict[str, Any]:
        return self._request("POST", f"/api/projects/{project_slug}/transfer-ownership", json={
            "from_wallet": from_wallet,
            "to_wallet": to_wallet,
            "nft_contract": nft_contract,
            "nft_token_id": nft_token_id
        })
    
    # MCP API
    def list_projects_mcp(self) -> str:
        return self._call_mcp_tool("list_projects", {})
    
    def get_project_mcp(self, project: str) -> str:
        return self._call_mcp_tool("get_project", {"project": project})
    
    def get_page_mcp(self, project: str, page: str) -> str:
        return self._call_mcp_tool("get_page", {"project": project, "page": page})
    
    def search_mcp(self, query: str, project: Optional[str] = None) -> str:
        params = {"query": query}
        if project:
            params["project"] = project
        return self._call_mcp_tool("search", params)
    
    def _call_mcp_tool(self, tool_name: str, params: Dict[str, Any]) -> str:
        response = self.session.post(
            f"{self.base_url}/mcp",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            json={
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": params
                },
                "id": 1
            }
        )
        response.raise_for_status()
        result = response.json()
        return result.get("result", {}).get("content", [{}])[0].get("text", str(result))
