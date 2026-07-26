# KnowledgeBook Python SDK
"""
Official KnowledgeBook SDK for Python.

A comprehensive SDK for interacting with the KnowledgeBook documentation platform,
including REST API, MCP server, and Web3 authentication.
"""

from .client import KnowledgeBook
from .types import (
    Project,
    Section,
    Page,
    Member,
    Theme,
    TokenGatedConfig,
    NftOwnership,
    WalletUser,
)

__version__ = "1.0.0"
__all__ = [
    "KnowledgeBook",
    "Project",
    "Section",
    "Page",
    "Member",
    "Theme",
    "TokenGatedConfig",
    "NftOwnership",
    "WalletUser",
]
