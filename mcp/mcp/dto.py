"""MCP-specific DTOs for TabVault operations."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class MCPBaseDTO(BaseModel):
    """Base class for all MCP DTOs."""
    pass


class TabDTO(MCPBaseDTO):
    """Tab DTO for MCP operations (without viewed property)."""
    
    id: str
    url: str
    title: str
    favicon: Optional[str] = None
    note: str
    agent_review: str
    tags: List[str]
    group_id: Optional[str] = None
    position: float
    archived: bool
    archived_at: Optional[datetime] = None
    hidden_until: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class TabCreateDTO(MCPBaseDTO):
    """DTO for creating tabs in MCP."""
    
    url: str = Field(min_length=1, max_length=4096)
    title: Optional[str] = Field(default=None, max_length=1024)
    note: str = Field(default="")
    agent_review: str = Field(default="")
    tags: List[str] = Field(default_factory=list)
    group_id: Optional[str] = Field(default=None, max_length=128)
    position: Optional[float] = Field(default=None, ge=0)
    id: Optional[str] = Field(default=None, max_length=128)


class TabUpdateDTO(MCPBaseDTO):
    """DTO for updating tabs in MCP (without viewed property)."""
    
    url: Optional[str] = None
    title: Optional[str] = None
    note: Optional[str] = None
    agent_review: Optional[str] = None
    tags: Optional[List[str]] = None
    group_id: Optional[str] = None
    position: Optional[float] = None
    archived: Optional[bool] = None
    hidden_until: Optional[datetime] = None


class TabDeleteResultDTO(MCPBaseDTO):
    """DTO for tab deletion results."""
    
    id: str
    deleted_at: datetime
    hard: bool


class TabListResponseDTO(MCPBaseDTO):
    """DTO for tab list responses."""
    
    items: List[TabDTO]
    total: int
    limit: int
    offset: int


class GroupDTO(MCPBaseDTO):
    """DTO for group data."""
    
    id: str
    name: str
    category: str
    created_at: datetime
    updated_at: datetime


class GroupCreateDTO(MCPBaseDTO):
    """DTO for creating groups."""
    
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=100)


class GroupUpdateDTO(MCPBaseDTO):
    """DTO for updating groups."""
    
    name: Optional[str] = None
    category: Optional[str] = None


class GroupDeleteResultDTO(MCPBaseDTO):
    """DTO for group deletion results."""
    
    id: str
    deleted_at: datetime
    hard: bool


class TagDTO(MCPBaseDTO):
    """DTO for tag data."""
    
    name: str
    description: Optional[str] = None


class TagCreateDTO(MCPBaseDTO):
    """DTO for creating tags."""
    
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=1024)


class TagUpdateDTO(MCPBaseDTO):
    """DTO for updating tags."""
    
    name: Optional[str] = None
    description: Optional[str] = None


class TagDeleteResultDTO(MCPBaseDTO):
    """DTO for tag deletion results."""
    
    name: str
    deleted_at: datetime
    hard: bool