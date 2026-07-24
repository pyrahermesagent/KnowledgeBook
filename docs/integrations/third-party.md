# Third-Party Integrations

KnowledgeBook integrates with various tools and platforms to extend functionality.

## Claude Code / MCP Clients

Connect Claude Code or any MCP client to your KnowledgeBook instance.

### Claude Code Setup

```bash
claude mcp add --transport http knowledgebook https://knowledgebook.plutolabs.app/mcp
```

### Manual Configuration

Add to Claude Code settings (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "knowledgebook": {
      "type": "http",
      "url": "https://knowledgebook.plutolabs.app/mcp"
    }
  }
}
```

### Other MCP Clients

**Tabby:**
```json
{
  "mcpServers": [
    {
      "name": "knowledgebook",
      "url": "https://knowledgebook.plutolabs.app/mcp"
    }
  ]
}
```

**Goose:**
```json
{
  "mcpServers": {
    "knowledgebook": {
      "type": "http",
      "url": "https://knowledgebook.plutolabs.app/mcp"
    }
  }
}
```

## GitHub Actions CI/CD

Automate documentation builds and deployments.

### Basic Workflow

```yaml
name: Build and Deploy Documentation

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build documentation
        run: npm run build
        env:
          NODE_ENV: production
      
      - name: Upload to KnowledgeBook
        run: |
          curl -X POST https://knowledgebook.plutolabs.app/api/projects/import-gitbook \
            -H "Authorization: Bearer ${{ secrets.KNOWLEDGEBOOK_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "gitbook_url": "${{ github.repositoryUrl }}",
              "project_name": "${{ github.event.repository.name }}",
              "project_description": "Generated from GitHub"
            }'
```

## Webhook Integration

Receive real-time updates when documentation changes.

### Configure Webhook

```bash
# Use the SDK to register a webhook
from knowledgebook import KnowledgeBook

kb = KnowledgeBook(
    base_url="https://knowledgebook.plutolabs.app",
    access_token="your-token"
)

# Subscribe to project updates
response = kb.session.post(
    "https://webhook.site/register",
    json={
        "event": "project.updated",
        "project_slug": "my-project",
        "callback_url": "https://your-app.com/webhooks/knowledgebook"
    }
)
```

### Webhook Payload

```json
{
  "event": "project.updated",
  "project_slug": "my-project",
  "timestamp": "2024-01-15T10:30:00Z",
  "changed_pages": ["overview", "api-reference"],
  "action": "update"
}
```

## Zapier Integration

Connect KnowledgeBook to 5000+ apps via Zapier.

### Workflow Examples

1. **New Page → Slack**
   - Trigger: New page created
   - Action: Send to Slack channel

2. **Project Created → Trello**
   - Trigger: New project created
   - Action: Create Trello card

3. **Documentation Update → Discord**
   - Trigger: Page updated
   - Action: Post to Discord webhook

### Setup Steps

1. Create a Zapier account
2. Connect KnowledgeBook as a webhook trigger
3. Configure the action app (Slack, Trello, Discord, etc.)
4. Test the zap

## IFTTT Integration

Use IFTTT to connect KnowledgeBook with smart devices.

### Example Applets

1. **New Documentation → Smart Light**
   - Trigger: New page created
   - Action: Change smart light color

2. **Project Update → Smart Speaker**
   - Trigger: Project updated
   - Action: Announce on Google Home

## Airtable Integration

Synchronize KnowledgeBook projects with Airtable.

### Sync Workflow

```python
from knowledgebook import KnowledgeBook
import airtable

kb = KnowledgeBook(
    base_url="https://knowledgebook.plutolabs.app",
    access_token="your-token"
)

airtable_client = airtable.Airtable("app123", "key123")
base = airtable_client.table("KnowledgeBook")

# Sync projects
projects = kb.list_projects()
for proj in projects["projects"]:
    base.insert({
        "Name": proj["name"],
        "Slug": proj["slug"],
        "Description": proj.get("description", ""),
        "Role": proj.get("role", "member")
    })
```

## Google Sheets Integration

Export KnowledgeBook content to Google Sheets.

### Export Script

```python
from knowledgebook import KnowledgeBook
from googleapiclient.discovery import build
from google.oauth2.service_account import Credentials

# Setup Google Sheets API
credentials = Credentials.from_service_account_file(
    "service-account.json",
    scopes=["https://www.googleapis.com/auth/spreadsheets"]
)
service = build("sheets", "v4", credentials=credentials)

# Get KnowledgeBook data
kb = KnowledgeBook(
    base_url="https://knowledgebook.plutolabs.app",
    access_token="your-token"
)

projects = kb.list_projects()
pages = kb.list_pages("my-project")

# Write to Google Sheets
spreadsheet_id = "your-spreadsheet-id"
batch_update = {
    "requests": [{
        "updateSheetProperties": {
            "properties": {"title": "KnowledgeBook Export"},
            "fields": "title"
        }
    }]
}

service.spreadsheets().batchUpdate(
    spreadsheetId=spreadsheet_id,
    body=batch_update
).execute()
```

## Notion Integration

Import KnowledgeBook pages into Notion.

### Import Workflow

```python
from knowledgebook import KnowledgeBook
import requests

kb = KnowledgeBook(
    base_url="https://knowledgebook.plutolabs.app",
    access_token="your-token"
)

# Get KnowledgeBook page
page = kb.get_page("my-project", "overview")

# Create Notion page
notion_headers = {
    "Authorization": f"Bearer {notion_token}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
}

notion_data = {
    "parent": {"page_id": parent_page_id},
    "properties": {
        "title": [{"text": {"content": page.title}}]
    },
    "children": [{
        "object": "block",
        "paragraph": {
            "text": [{"type": "text", "text": {"content": page.content}}]
        }
    }]
}

response = requests.post(
    "https://api.notion.com/v1/pages",
    headers=notion_headers,
    json=notion_data
)
```

## Slack Integration

Send KnowledgeBook updates to Slack channels.

### Slack App Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add "incoming-webhook" permission
3. Install to workspace
4. Copy webhook URL

### Webhook Payload

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "Documentation Updated"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Project:* `my-project`\n*Page:* `overview`\n*Updated by:* `John Doe`"
      }
    }
  ]
}
```

## Discord Integration

Post KnowledgeBook updates to Discord servers.

### Discord Webhook Setup

1. Go to Discord server settings
2. Create webhook in Integrate section
3. Copy webhook URL

### Example Post

```python
import requests

discord_webhook = "https://discord.com/api/webhooks/..."
discord_data = {
    "content": "New documentation update!",
    "embeds": [{
        "title": "API Reference Updated",
        "description": "Check out the latest changes to the API docs.",
        "url": "https://knowledgebook.plutolabs.app/my-project/api-reference"
    }]
}

requests.post(discord_webhook, json=discord_data)
```

## Telegram Integration

Send KnowledgeBook updates to Telegram.

### Telegram Bot Setup

1. Create bot via @BotFather on Telegram
2. Get bot token
3. Get chat ID

### Example Post

```python
import requests

telegram_token = "your-bot-token"
chat_id = "your-chat-id"
telegram_url = f"https://api.telegram.org/bot{telegram_token}/sendMessage"

telegram_data = {
    "chat_id": chat_id,
    "text": "📚 New documentation update!\n\nProject: my-project\nPage: overview\n\nView: https://knowledgebook.plutolabs.app/my-project/overview"
}

requests.post(telegram_url, data=telegram_data)
```

## Azure DevOps Integration

Connect KnowledgeBook to Azure DevOps pipelines.

### Pipeline Example

```yaml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeJS@10
    inputs:
      nodeVersion: '20'
  
  - script: |
      npm install
      npm run build
    displayName: 'Build Documentation'
  
  - task: CmdLine@2
    inputs:
      script: |
        curl -X POST $(KNOWLEDGEBOOK_URL)/api/projects/import-gitbook \
          -H "Authorization: Bearer $(KNOWLEDGEBOOK_TOKEN)" \
          -d '{"gitbook_url": "$(Build.Repository.Uri)"}'
    displayName: 'Upload to KnowledgeBook'
```

## AWS Lambda Integration

Serverless KnowledgeBook updates.

### Lambda Function

```python
import boto3
import requests
import json

def lambda_handler(event, context):
    # Get KnowledgeBook client
    kb = boto3.client("secretsmanager")
    secrets = json.loads(kb.get_secret_value(SecretId="knowledgebook")["SecretString"])
    
    # Process event
    if event.get("detail", {}).get("event") == "project.updated":
        # Trigger update workflow
        requests.post(
            secrets["callback_url"],
            json={
                "project_slug": event["detail"]["project_slug"],
                "action": "sync"
            }
        )
    
    return {"statusCode": 200, "body": "OK"}
```

## Custom Webhook Handler

Create your own webhook receiver.

### Example Flask App

```python
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route("/webhooks/knowledgebook", methods=["POST"])
def knowledgebook_webhook():
    data = request.json
    
    if data["event"] == "project.updated":
        # Handle project update
        process_update(data)
    elif data["event"] == "page.created":
        # Handle new page
        notify_team(data)
    
    return jsonify({"status": "received"})

def process_update(data):
    project_slug = data["project_slug"]
    pages = data.get("changed_pages", [])
    
    # Your update logic here
    print(f"Processing updates for {project_slug}: {pages}")

def notify_team(data):
    # Send to team Slack/Teams
    slack_webhook = "https://hooks.slack.com/..."
    requests.post(slack_webhook, json={
        "text": f"New page created: {data['page']}"
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
```

## Troubleshooting

### Common Issues

1. **MCP Connection Failed**
   - Check KnowledgeBook URL is correct
   - Verify MCP endpoint is accessible
   - Ensure no firewall blocking requests

2. **API Rate Limiting**
   - Implement exponential backoff
   - Use caching where possible
   - Respect rate limit headers

3. **Authentication Errors**
   - Verify API key/token is valid
   - Check token expiration
   - Ensure proper header format

### Debug Tips

- Enable verbose logging
- Check response headers for rate limits
- Use SDK's built-in retry mechanism
- Monitor API usage in KnowledgeBook dashboard

## Support

For integration questions:
- Check integration-specific docs
- Visit [Community Forum](https://forum.knowledgebook.app)
- Contact support@knowledgebook.app
