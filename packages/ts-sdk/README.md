# @knowledgebook/sdk - TypeScript/JavaScript SDK

Official KnowledgeBook SDK for TypeScript and JavaScript projects.

## Installation

```bash
npm install @knowledgebook/sdk
# or
yarn add @knowledgebook/sdk
# or
pnpm add @knowledgebook/sdk
```

## Usage

### Basic Setup

```typescript
import { KnowledgeBook } from '@knowledgebook/sdk';

// Create a client instance
const kb = new KnowledgeBook({
  baseUrl: 'https://knowledgebook.plutolabs.app',
  accessToken: 'your-access-token' // Optional, for authenticated endpoints
});
```

### Projects

```typescript
// List all projects
const projects = await kb.listProjects();
console.log(projects);

// Get a specific project
const project = await kb.getProject('my-project');
console.log(project.name);

// Create a new project
const newProject = await kb.createProject({
  name: 'My New Project',
  description: 'Project description',
  accent_color: '#34c759'
});
```

### Sections & Pages

```typescript
// List sections
const sections = await kb.listSections('my-project');

// Create a section
const section = await kb.createSection('my-project', {
  title: 'API Reference',
  position: 2
});

// Create a page
const page = await kb.createPage('my-project', {
  title: 'Getting Started',
  slug: 'getting-started',
  content: '# Getting Started\n\nThis is my content.',
  section_id: section.id,
  position: 1
});
```

### Web3 Authentication

```typescript
// Login with wallet
const { token, user } = await kb.loginWithWallet(
  '0x123...',
  'Login to KnowledgeBook',
  signature
);

// Set NFT ownership for project
await kb.setNftOwnership(
  'my-project',
  '0xContract...',
  123,
  'ethereum',
  '0xOwner...'
);
```

### MCP Integration

```typescript
// List projects via MCP
const projectsText = await kb.listProjectsMcp();
console.log(projectsText);

// Search documentation
const searchResults = await kb.searchMcp('authentication', 'docs');
console.log(searchResults);
```

### Theme Management

```typescript
// Get project theme
const theme = await kb.getTheme('my-project');

// Update theme
await kb.updateTheme('my-project', {
  accent_color: '#34c759',
  font_family: 'Inter',
  bg_color: '#ffffff'
});
```

## Browser Usage

```typescript
import { KnowledgeBook } from '@knowledgebook/sdk/dist/browser.js';

const kb = new KnowledgeBook({
  baseUrl: 'https://knowledgebook.plutolabs.app',
  accessToken: 'your-token'
});
```

## Node.js Usage

```typescript
import { KnowledgeBook } from '@knowledgebook/sdk';

const kb = new KnowledgeBook({
  baseUrl: 'https://knowledgebook.plutolabs.app'
});

// Use the SDK
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Build for browser
npm run build:browser

# Run tests
npm test

# Lint
npm run lint

# Lint and fix
npm run lint:fix
```

## API Reference

See the [full API documentation](https://github.com/knowledgebook/docs/blob/main/api/rest.md) for complete endpoint reference.

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## License

MIT License - see LICENSE file for details.

## Support

- 📚 [Documentation](https://knowledgebook.plutolabs.app/docs)
- 💬 [Community Forum](https://forum.knowledgebook.app)
- 🐛 [GitHub Issues](https://github.com/knowledgebook/sdk-js/issues)
