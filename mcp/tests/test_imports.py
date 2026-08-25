"""
Test that all MCP modules can be imported correctly.
"""
import pytest

def test_mcp_imports():
    """Test that all MCP modules can be imported."""
    # Test basic imports
    from mcp.client import MCPClient
    from mcp.dto import (
        TabDTO, TabCreateDTO, TabUpdateDTO, TabDeleteResultDTO, TabListResponseDTO,
        GroupDTO, GroupCreateDTO, GroupUpdateDTO, GroupDeleteResultDTO,
        TagDTO, TagCreateDTO, TagUpdateDTO, TagDeleteResultDTO
    )
    
    # Test that we can create instances
    tab_dto = TabDTO(
        id="test-tab",
        url="http://example.com",
        title="Test Title",
        created_at="2023-01-01T00:00:00Z"
    )
    
    group_create_dto = GroupCreateDTO(
        name="Test Group"
    )
    
    tag_create_dto = TagCreateDTO(
        name="test-tag"
    )
    
    # Verify basic functionality
    assert tab_dto.id == "test-tab"
    assert group_create_dto.name == "Test Group"
    assert tag_create_dto.name == "test-tag"


def test_client_methods_exist():
    """Test that client has expected methods."""
    from mcp.client import MCPClient
    
    client = MCPClient("http://localhost:47821")
    
    # Check all CRUD methods exist
    methods = [
        'create_tab', 'get_tab', 'update_tab', 'delete_tab', 'list_tabs',
        'create_group', 'get_group', 'update_group', 'delete_group', 'list_groups',
        'create_tag', 'get_tag', 'update_tag', 'delete_tag', 'list_tags'
    ]
    
    for method in methods:
        assert hasattr(client, method), f"Client missing method: {method}"