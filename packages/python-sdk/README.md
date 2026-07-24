# KnowledgeBook Python SDK

Official KnowledgeBook Python SDK for interacting with the KnowledgeBook documentation platform.

## Installation

```bash
pip install knowledgebook
# or
pip install git+https://github.com/knowledgebook/sdk-python.git
```

## Usage

### Basic Setup

```python
from knowledgebook import KnowledgeBook

# Create a client instance
kb = KnowledgeBook(
    base_url="https://knowledgebook.plutolabs.app",
    access_token="your-access-token"  # Optional
)
```

### Projects

```python
# List all projects
projects = kb.list_projects()
print(projects)

# Get a specific project
project = kb.get_project("my-project")
print(project.name)

# Create a new project
new_project = kb.create_project({
    "name": "My New Project",
    "description": "Project description",
    "accent_color": "#34c759"
})
```

### Sections & Pages

```python
# List sections
sections = kb.list_sections("my-project")

# Create a section
section = kb.create_section("my-project", {
    "title": "API Reference",
    "position": 2
})

# Create a page
page = kb.create_page("my-project", {
    "title": "Getting Started",
    "slug": "getting-started",
    "content": "# Getting Started\n\nThis is my content.",
    "section_id": section.id,
    "position": 1
})
```

### Web3 Authentication

```python
# Login with wallet
wallet_user = kb.login_with_wallet(
    address="0x123...",
    message="Login to KnowledgeBook",
    signature="0x..."
)

# Set NFT ownership for project
kb.set_nft_ownership(
    project_slug="my-project",
    nft_contract="0xContract...",
    nft_token_id=123,
    network="ethereum",
    owner_address="0xOwner..."
)
```

### MCP Integration

```python
# List projects via MCP
projects_text = kb.list_projects_mcp()
print(projects_text)

# Search documentation
search_results = kb.search_mcp("authentication", project="docs")
print(search_results)
```

### Theme Management

```python
# Get project theme
theme = kb.get_theme("my-project")

# Update theme
kb.update_theme("my-project", {
    "accent_color": "#34c759",
    "font_family": "Inter",
    "bg_color": "#ffffff"
})
```

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"
pip install -e ".[web3]"

# Run tests
pytest

# Run linter
ruff check .

# Type check
mypy knowledgebook
```

## API Reference

See the [full API documentation](https://github.com/knowledgebook/docs/blob/main/api/rest.md) for complete endpoint reference.

## Requirements

- Python 3.8+
- requests >= 2.28.0
- pydantic >= 2.0.0

Optional:
- web3 >= 6.0.0 (for Web3 features)

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## License

MIT License - see LICENSE file for details.

## Support

- 📚 [Documentation](https://knowledgebook.plutolabs.app/docs)
- 💬 [Community Forum](https://forum.knowledgebook.app)
- 🐛 [GitHub Issues](https://github.com/knowledgebook/sdk-python/issues)
