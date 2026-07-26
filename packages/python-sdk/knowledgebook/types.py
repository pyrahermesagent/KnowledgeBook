"""
Types and models for KnowledgeBook Python SDK.
"""

from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class Project(BaseModel):
    id: int
    slug: str
    name: str
    description: Optional[str] = None
    accent_color: str
    icon_url: Optional[str] = None
    font_family: str
    bg_color: str
    bg_subtle: str
    text_color: str
    text_muted: str
    border_color: str
    radius: int
    updated_at: datetime
    role: Optional[Literal["admin", "member"]] = None


class Section(BaseModel):
    id: int
    project_id: int
    title: str
    position: int
    updated_at: datetime


class Page(BaseModel):
    id: int
    project_id: int
    section_id: Optional[int] = None
    slug: str
    title: str
    content: str
    position: int
    updated_at: datetime


class Member(BaseModel):
    id: int
    project_id: int
    email: str
    role: Literal["admin", "member"]
    joined_at: datetime


class Theme(BaseModel):
    accent_color: str
    font_family: str
    bg_color: str
    bg_subtle: str
    text_color: str
    text_muted: str
    border_color: str
    radius: int


class WalletUser(BaseModel):
    id: int
    wallet_address: str
    created_at: datetime


class TokenGatedConfig(BaseModel):
    project_id: int
    token_contract: str
    token_id: Optional[int] = None
    min_balance: Optional[int] = None
    network: Literal["ethereum", "polygon", "arbitrum", "base"]


class NftOwnership(BaseModel):
    project_id: int
    nft_contract: str
    nft_token_id: int
    network: Literal["ethereum", "polygon", "arbitrum", "base"]
    owner_address: str
    granted_at: datetime


class UploadResponse(BaseModel):
    url: str
    filename: str
    size: int
    content_type: str
