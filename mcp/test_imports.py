"""Test that all MCP modules can be imported correctly."""
import sys
import os

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test that all modules import without errors."""
    
    # Test basic imports
    try:
        from mcp import __init__
        print("✓ mcp.__init__ imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.__init__: {e}")
        return False
        
    try:
        from mcp.client import MCPClient
        print("✓ mcp.client imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.client: {e}")
        return False
        
    try:
        from mcp.dto import TabDTO, TabCreateDTO
        print("✓ mcp.dto imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.dto: {e}")
        return False
        
    try:
        from mcp.domain.tabs.resources import TabResource
        print("✓ mcp.domain.tabs.resources imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.domain.tabs.resources: {e}")
        return False
        
    try:
        from mcp.domain.tabs.tools import get_tab_by_url, list_tabs_by_url
        print("✓ mcp.domain.tabs.tools imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.domain.tabs.tools: {e}")
        return False
        
    try:
        from mcp.domain.groups.resources import GroupResource
        print("✓ mcp.domain.groups.resources imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.domain.groups.resources: {e}")
        return False
        
    try:
        from mcp.domain.tags.resources import TagResource
        print("✓ mcp.domain.tags.resources imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.domain.tags.resources: {e}")
        return False
        
    try:
        from mcp.main import initialize_server, main
        print("✓ mcp.main imported successfully")
    except Exception as e:
        print(f"✗ Failed to import mcp.main: {e}")
        return False
        
    print("All imports successful!")
    return True

if __name__ == "__main__":
    test_imports()