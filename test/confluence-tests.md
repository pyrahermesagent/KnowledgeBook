# Confluence XML Import Tests

This directory contains test files for the Confluence XML import functionality.

## Test Files

### sample-page.xml
A sample Confluence page export with:
- Basic page structure (title, content, version)
- Code macro
- Panel (info/warning/note) macros
- Table macro
- Expand macro

### sample-space-export.xml
A sample full Confluence space export with:
- Multiple pages
- Page hierarchy
- Common Confluence formatting patterns

## Running Tests

To test the Confluence import functionality:

```bash
# Test direct XML parsing
node -e "
const { parseConfluenceXml, pageToMarkdown } = require('./server/utils/confluence');
const fs = require('fs');
const xml = fs.readFileSync('./test/sample-page.xml', 'utf8');
const result = parseConfluenceXml(xml);
console.log(JSON.stringify(result, null, 2));
"
```

## Expected Behavior

1. **Basic Import**: Should parse Confluence XML and extract pages
2. **Macro Handling**: Should convert Confluence macros to appropriate markdown:
   - Code blocks → fenced code blocks with language
   - Panels → blockquotes with type indicators
   - Expand macros → HTML details/summary
   - Tables → markdown tables
3. **Error Handling**: Should gracefully report invalid XML and missing content
4. **Directory Import**: Should handle both single-page and multi-page exports

## Confluence Macros Supported

| Macro | Output |
|-------|--------|
| `code` | Fenced code block with language |
| `panel` / `info` / `warning` / `note` | Blockquote with type indicator |
| `expand` | HTML `<details><summary>` |
| `table` | Markdown table |
| `anchor` | HTML anchor tag |
| `tabs` | Multiple details blocks |

## Test Coverage

- [x] Basic XML parsing
- [x] Macro conversion
- [x] Panel macros (info, warning, note)
- [x] Code blocks with language detection
- [x] Table parsing
- [x] Expandable sections
- [x] Error handling for malformed XML
- [x] Directory-based imports
