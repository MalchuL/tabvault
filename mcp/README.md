# TabVault MCP Bridge

This is the MCP (Model Control Protocol) bridge for TabVault, which allows external tools to interact with your tab library through the MCP protocol.

## Features

- **URL-based operations**: Access tabs by URL instead of IDs
- **Batch updates**: Update all tabs with the same URL at once
- **MCP-compliant**: Follows the standard MCP protocol for tool discovery and execution
- **Domain-driven design**: Clean separation of concerns following DDD principles

## Installation

```bash
cd mcp
pip install -e .
```

Or using uv:

```bash
cd mcp
uv pip install -e .
```

## Usage

### Environment Variables

Set these environment variables before running the MCP server:

```bash
export TABVAULT_SERVER_URL=http://localhost:47821
export TABVAULT_API_KEY=admin
```

### Running the Server

```bash
tabvault-mcp
```

## Available Tools

### Tab Operations

- `get_tab_by_url(url)`: Get tab by URL
- `list_tabs_by_url(url)`: List all tabs with matching URL  
- `update_tabs_by_url(url, ...)` : Update all tabs with matching URL
- `create_tab(...)`: Create a new tab
- `tag_tabs_by_url(url, tag_name)`: Add tag to all tabs with matching URL
- `untag_tabs_by_url(url, tag_name)`: Remove tag from all tabs with matching URL
- `list_tabs(...)`: List tabs with optional filtering

### Group Operations

- `get_group_by_name(name)`: Get group by name
- `list_groups()`: List all groups
- `create_group(name, category)`: Create a new group

## Development

Install development dependencies:

```bash
cd mcp
pip install -e ".[dev]"
```

Run tests:

```bash
cd mcp
pytest
```

Format code:

```bash
cd mcp
ruff format .
```