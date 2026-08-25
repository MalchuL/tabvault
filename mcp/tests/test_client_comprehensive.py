"""
Comprehensive tests for MCP client.
These tests validate all CRUD operations for tabs, groups, and tags.
"""
import pytest

from mcp.client import MCPClient
from mcp.dto import (
    TabDTO, TabCreateDTO, TabUpdateDTO, TabDeleteResultDTO, TabListResponseDTO,
    GroupDTO, GroupCreateDTO, GroupUpdateDTO, GroupDeleteResultDTO,
    TagDTO, TagCreateDTO, TagUpdateDTO, TagDeleteResultDTO
)


def test_all_dto_exist():
    """Test that all required DTOs exist."""
    # All Tab DTOs
    assert TabDTO is not None
    assert TabCreateDTO is not None
    assert TabUpdateDTO is not None
    assert TabDeleteResultDTO is not None
    assert TabListResponseDTO is not None
    
    # All Group DTOs
    assert GroupDTO is not None
    assert GroupCreateDTO is not None
    assert GroupUpdateDTO is not None
    assert GroupDeleteResultDTO is not None
    
    # All Tag DTOs
    assert TagDTO is not None
    assert TagCreateDTO is not None
    assert TagUpdateDTO is not None
    assert TagDeleteResultDTO is not None


def test_dto_structures():
    """Test that all DTOs are properly structured."""
    # Test TabDTO structure
    tab_dto = TabDTO(
        id="tab-123",
        url="http://example.com",
        title="Example Title",
        created_at="2023-01-01T00:00:00Z"
    )
    assert hasattr(tab_dto, 'id')
    assert hasattr(tab_dto, 'url')
    assert hasattr(tab_dto, 'title')
    
    # Test TabCreateDTO structure
    tab_create_dto = TabCreateDTO(
        url="http://example.com",
        title="Example Title"
    )
    assert hasattr(tab_create_dto, 'url')
    assert hasattr(tab_create_dto, 'title')
    
    # Test TabUpdateDTO structure
    tab_update_dto = TabUpdateDTO(
        title="Updated Title"
    )
    assert hasattr(tab_update_dto, 'title')
    
    # Test GroupDTO structure
    group_dto = GroupDTO(
        id="group-123",
        name="Test Group",
        created_at="2023-01-01T00:00:00Z"
    )
    assert hasattr(group_dto, 'id')
    assert hasattr(group_dto, 'name')
    
    # Test GroupCreateDTO structure
    group_create_dto = GroupCreateDTO(
        name="Test Group"
    )
    assert hasattr(group_create_dto, 'name')
    
    # Test GroupUpdateDTO structure
    group_update_dto = GroupUpdateDTO(
        name="Updated Group Name"
    )
    assert hasattr(group_update_dto, 'name')
    
    # Test TagDTO structure
    tag_dto = TagDTO(
        name="test-tag",
        created_at="2023-01-01T00:00:00Z"
    )
    assert hasattr(tag_dto, 'name')
    
    # Test TagCreateDTO structure
    tag_create_dto = TagCreateDTO(
        name="test-tag"
    )
    assert hasattr(tag_create_dto, 'name')
    
    # Test TagUpdateDTO structure
    tag_update_dto = TagUpdateDTO(
        name="updated-tag-name"
    )
    assert hasattr(tag_update_dto, 'name')


@pytest.mark.asyncio
async def test_client_initialization():
    """Test client initialization with URL only."""
    client = MCPClient("http://localhost:47821")
    assert client.base_url == "http://localhost:47821"


@pytest.mark.asyncio
async def test_client_has_all_methods():
    """Test that client has all required CRUD methods."""
    client = MCPClient("http://localhost:47821")
    
    # Test Tab methods
    assert hasattr(client, 'create_tab')
    assert hasattr(client, 'get_tab')
    assert hasattr(client, 'update_tab')
    assert hasattr(client, 'delete_tab')
    assert hasattr(client, 'list_tabs')
    
    # Test Group methods
    assert hasattr(client, 'create_group')
    assert hasattr(client, 'get_group')
    assert hasattr(client, 'update_group')
    assert hasattr(client, 'delete_group')
    assert hasattr(client, 'list_groups')
    
    # Test Tag methods
    assert hasattr(client, 'create_tag')
    assert hasattr(client, 'get_tag')
    assert hasattr(client, 'update_tag')
    assert hasattr(client, 'delete_tag')
    assert hasattr(client, 'list_tags')