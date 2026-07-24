# Plugin Architecture

KnowledgeBook supports a flexible plugin system for extending functionality.

## Plugin System Overview

KnowledgeBook's plugin system allows you to:

- Add custom API endpoints
- Implement additional authentication methods
- Customize content processing
- Extend MCP tools
- Modify UI components (via Nuxt modules)

## Plugin Types

### 1. API Plugins

Add new REST API endpoints.

**File:** `server/plugins/api.ts`

```typescript
export default defineNuxtPlugin((nuxtApp) => {
  // Register custom API route
  useServerAPI().get("/custom/endpoint", async (event) => {
    return { message: "Hello from plugin!" };
  });
});
```

### 2. Auth Plugins

Implement custom authentication.

**File:** `server/plugins/auth.ts`

```typescript
export default defineNuxtPlugin((nuxtApp) => {
  // Register custom auth provider
  nuxtApp.hook("auth:configure", (config) => {
    config.providers.push({
      id: "custom",
      name: "Custom Auth",
      login: async (credentials) => {
        // Custom login logic
        return { token: "custom-token" };
      }
    });
  });
});
```

### 3. Content Plugins

Process content before rendering.

**File:** `server/plugins/content.ts`

```typescript
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("content:process", (content) => {
    // Add custom processing
    content.html = content.html.replace(
      /:::note:::(.*?):::note:::/gs,
      '<div class="note">$1</div>'
    );
    return content;
  });
});
```

### 4. MCP Plugins

Extend MCP server with custom tools.

**File:** `server/plugins/mcp.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("mcp:configure", (server: McpServer) => {
    // Register custom MCP tool
    server.registerTool("custom_tool", {
      title: "Custom Tool",
      description: "A custom MCP tool",
      inputSchema: { param: z.string() }
    }, async ({ param }) => {
      return { content: [{ type: "text", text: `Result: ${param}` }] };
    });
  });
});
```

## Plugin Structure

### Basic Plugin

```typescript
// server/plugins/my-plugin.ts
export default defineNuxtPlugin((nuxtApp) => {
  console.log("Plugin loaded!");
  
  // Hook into Nuxt lifecycle
  nuxtApp.hook("pages:extend", (pages) => {
    pages.push({
      name: "custom",
      path: "/custom",
      meta: { layout: "default" },
      file: "~/pages/custom.vue"
    });
  });
});
```

### Advanced Plugin with DI

```typescript
// server/plugins/database-plugin.ts
import { Database } from "~/server/utils/database";

export default defineNuxtPlugin((nuxtApp) => {
  // Register service in DI container
  const db = new Database();
  nuxtApp.provide("db", db);
  
  // Register global middleware
  nuxtApp.hook("middleware:resolve", (middleware) => {
    middleware.push({
      name: "auth-check",
      middleware: "~/middleware/auth-check.ts"
    });
  });
});
```

## Plugin Configuration

### nuxt.config.ts

```typescript
export default defineNuxtConfig({
  plugins: [
    "~/server/plugins/api.ts",
    "~/server/plugins/auth.ts",
    "~/server/plugins/content.ts",
    "~/server/plugins/mcp.ts"
  ],
  
  // Plugin options
  myPlugin: {
    enabled: true,
    customOption: "value"
  }
});
```

## Plugin Hooks

Available hooks for plugins:

| Hook | Description |
|------|-------------|
| `pages:extend` | Add custom pages |
| `middleware:resolve` | Add custom middleware |
| `router:extend` | Modify router config |
| `components:scan` | Scan for custom components |
| `auth:configure` | Configure auth providers |
| `content:process` | Process content |
| `mcp:configure` | Configure MCP server |

## Plugin Load Order

Plugins load in this order:

1. Core plugins (built-in)
2. User plugins (from `plugins/` directory)
3. Module plugins (from modules)
4. Server plugins (from `server/plugins/`)

## Plugin Examples

### 1. Rate Limiter Plugin

```typescript
// server/plugins/rate-limiter.ts
const rateLimitMap = new Map<string, number>();

export default defineNuxtPlugin((nuxtApp) => {
  const rateLimit = (key: string, limit: number = 100, windowMs: number = 60000) => {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    const timestamps = rateLimitMap.get(key) || [];
    const validTimestamps = timestamps.filter(t => t > windowStart);
    
    if (validTimestamps.length >= limit) {
      return false;
    }
    
    validTimestamps.push(now);
    rateLimitMap.set(key, validTimestamps);
    return true;
  };
  
  nuxtApp.hook("request:start", (event) => {
    const key = event.node.req.socket.remoteAddress;
    if (!rateLimit(key)) {
      throw createError({
        statusCode: 429,
        message: "Too many requests"
      });
    }
  });
});
```

### 2. Caching Plugin

```typescript
// server/plugins/cache.ts
const cache = new Map<string, any>();

export default defineNuxtPlugin((nuxtApp) => {
  const cacheService = {
    get: (key: string) => cache.get(key),
    set: (key: string, value: any, ttl: number = 3600000) => {
      cache.set(key, { value, expiry: Date.now() + ttl });
    },
    clear: (key: string) => cache.delete(key)
  };
  
  nuxtApp.provide("cache", cacheService);
});
```

### 3. Logging Plugin

```typescript
// server/plugins/logging.ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("request:end", (event) => {
    const duration = event.timing?.duration || 0;
    console.log(`${event.node.req.method} ${event.node.req.url} - ${duration}ms`);
  });
  
  nuxtApp.hook("error:render", (event) => {
    console.error(`Error: ${event.error.message}`);
  });
});
```

## Testing Plugins

### Unit Test

```typescript
// tests/plugins/api.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineNuxtPlugin } from "#app";

describe("API Plugin", () => {
  it("registers custom API route", () => {
    const plugin = defineNuxtPlugin((nuxtApp) => {
      nuxtApp.hook("pages:extend", (pages) => {
        pages.push({
          name: "custom",
          path: "/custom",
          file: "~/pages/custom.vue"
        });
      });
    });
    
    expect(plugin).toBeDefined();
  });
});
```

### Integration Test

```typescript
// tests/integration/plugin.test.ts
import { describe, it, expect } from "vitest";
import { mountSuspended } from "@nuxt/test-utils";

describe("Custom Plugin", () => {
  it("renders custom component", async () => {
    const wrapper = await mountSuspended("/custom");
    expect(wrapper.html()).toContain("Custom Component");
  });
});
```

## Plugin Best Practices

1. **Keep plugins focused** - Each plugin should do one thing well
2. **Use DI container** - Inject services via `nuxtApp.provide()`
3. **Handle errors gracefully** - Don't crash the app if plugin fails
4. **Document hooks** - Document all hooks your plugin uses
5. **Test thoroughly** - Write unit and integration tests
6. **Follow naming conventions** - Use kebab-case for file names

## Plugin Publishing

### Package Structure

```
my-plugin/
├── package.json
├── README.md
├── server/
│   └── plugins/
│       └── my-plugin.ts
└── types/
    └── index.d.ts
```

### package.json

```json
{
  "name": "knowledgebook-plugin-my-feature",
  "version": "1.0.0",
  "main": "server/plugins/my-plugin.ts",
  "keywords": [
    "knowledgebook",
    "plugin",
    "mcp"
  ],
  "peerDependencies": {
    "nuxt": "^3.17.0",
    "@modelcontextprotocol/sdk": "^1.29.0"
  }
}
```

## Troubleshooting

### Plugin Not Loading

- Check file location: `server/plugins/` or `plugins/`
- Verify export: `export default defineNuxtPlugin(...)`
- Check for syntax errors
- Restart dev server

### Hook Not Called

- Verify hook name matches documentation
- Check plugin load order
- Ensure hook is registered before the event fires

### Type Errors

- Add proper type definitions
- Import types from `#app`
- Use `defineNuxtPlugin` for typing

## Support

For plugin development questions:
- Check [Plugin Documentation](https://nuxt.com/docs)
- Review [MCP SDK docs](https://modelcontextprotocol.io)
- Join [Developer Discord](https://discord.gg/knowledgebook)
