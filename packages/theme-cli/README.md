# KnowledgeBook CLI

Command-line interface for KnowledgeBook documentation management.

## Installation

```bash
pip install knowledgebook-cli
# or install from source
pip install -e .
```

## Usage

```bash
# List projects
kb project --subcommand list

# Get project details
kb project --subcommand get --slug my-project

# Create a new project
kb project --subcommand create --name "My Project" --description "Project description"

# List sections
kb section --subcommand list --project-slug my-project

# Create a section
kb section --subcommand create --project-slug my-project --title "API Reference"

# List pages
kb page --subcommand list --project-slug my-project

# Upload a file
kb upload --project-slug my-project --file /path/to/image.png

# Get theme settings
kb theme --subcommand get --project-slug my-project
```

## MCP Commands

```bash
# List projects via MCP
kb mcp --subcommand list

# Search documentation
kb mcp --subcommand search --query "authentication"
```

## Options

- `--base-url` / `-u`: KnowledgeBook base URL (default: https://knowledgebook.plutolabs.app)
- `--api-key` / `-k`: API key for authentication
- `--access-token` / `-t`: Access token for authentication

## Examples

### Complete workflow

```bash
# Create a project
kb project --subcommand create --name "API Docs" --description "API Documentation"

# Create sections
kb section --subcommand create --project-slug api-docs --title "Getting Started"
kb section --subcommand create --project-slug api-docs --title "Endpoints"

# Create pages
kb page --subcommand create \
  --project-slug api-docs \
  --title "Overview" \
  --slug "overview" \
  --content "# Overview\n\nWelcome to the API."

# Upload images
kb upload --project-slug api-docs --file ./images/logo.png
```

### Import from GitBook

Use the SDK directly for GitBook import:

```python
from knowledgebook import KnowledgeBook

kb = KnowledgeBook(
    base_url="https://knowledgebook.plutolabs.app",
    access_token="your-token"
)

project = kb.import_from_gitbook(
    gitbook_url="https://example.gitbook.com/site",
    project_name="Imported Project"
)

print(f"Imported: {project.name}")
```

## Development

```bash
# Run tests
pytest

# Run linter
ruff check .

# Build CLI
python setup.py build
```

## License

MIT License - see LICENSE file for details.
