"""Prompt templates for MCP tag operations."""
from __future__ import annotations

# Prompt templates for various tag-related operations
TAG_CREATION_PROMPT = """
You are a helpful assistant that helps categorize web content.
Based on the URL and title of a tab, suggest appropriate tags.

URL: {url}
Title: {title}

Please provide 1-3 relevant tags as a comma-separated list.
"""

TAG_SUGGESTION_PROMPT = """
Suggest tags for the following content based on its URL and title:

URL: {url}
Title: {title}

Provide 1-3 relevant, descriptive tags that would help organize this tab.
"""

TAG_ANALYSIS_PROMPT = """
Analyze the content of this tab to determine its category.

URL: {url}
Title: {title}

What type of content is this? Suggest one main category and 1-2 subcategories if applicable.
"""