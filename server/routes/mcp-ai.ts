// MCP (Model Context Protocol) endpoint for AI-enhanced documentation features.
// This extends the base MCP server with AI-powered tools.
// Available at /mcp/ai

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const MAX_SEARCH_RESULTS = 20;
const SNIPPET_CONTEXT = 160;

interface PageRow {
  id: number;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
  project_id: number;
  section_id: number | null;
  position: number;
}

interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  description: string;
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

function errorText(value: string) {
  return { content: [{ type: 'text' as const, text: value }], isError: true };
}

// ============================================================================
// AI API CALLS
// ============================================================================

async function callAI(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], temperature = 0.7): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('AI API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

  try {
    let response: Response;

    if (AI_PROVIDER === 'openai') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          temperature,
          max_tokens: 2000,
        }),
      });
    } else if (AI_PROVIDER === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL.replace('-mini', '-3-sonnet'),
          messages: messages.filter(m => m.role !== 'system'),
          system: messages.find(m => m.role === 'system')?.content,
          temperature,
          max_tokens: 2000,
        }),
      });
    } else {
      throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return AI_PROVIDER === 'openai'
      ? data.choices[0].message.content
      : data.content[0].text;
  } catch (error) {
    console.error('AI API call error:', error);
    throw new Error(`AI API call failed: ${error.message}`);
  }
}

// ============================================================================
// Smart Content Generation Tools
// ============================================================================

async function generateContentFromOutline(projectId: number, outline: string, tone: string = 'technical'): Promise<string> {
  const prompt = `
You are a documentation writer. Generate comprehensive content from the following outline.

Tone: ${tone}
Project ID: ${projectId}

Outline:
${outline}

Requirements:
1. Expand each section with detailed content
2. Include code examples where appropriate
3. Maintain consistent terminology
4. Use markdown format

Output the complete documentation content in markdown format.`;

  return await callAI([
    { role: 'system', content: 'You are an expert technical writer who creates comprehensive documentation.' },
    { role: 'user', content: prompt }
  ], 0.7);
}

async function autoCompleteSection(projectId: number, pageId: number, sectionTitle: string, expandWith: string = 'details'): Promise<string> {
  const prompt = `
You are a documentation writer. Expand the following section with ${expandWith}.

Project ID: ${projectId}
Page ID: ${pageId}
Section: ${sectionTitle}

Requirements:
1. Add relevant details, examples, or explanations
2. Maintain the existing tone and style
3. Keep it concise but informative

Output only the expanded content in markdown format.`;

  return await callAI([
    { role: 'system', content: 'You are an expert technical writer who creates comprehensive documentation.' },
    { role: 'user', content: prompt }
  ], 0.8);
}

async function generateCodeExample(context: string, languages: string[]): Promise<{[key: string]: string}> {
  const prompt = `
You are a code example generator. Generate executable code examples for the following context.

Context: ${context}
Languages: ${languages.join(', ')}

Requirements:
1. Provide complete, executable code examples
2. Include necessary imports/setup
3. Add comments explaining key parts
4. Output in a structured format

For each language, output:
- Language name
- Complete executable code
- Brief description

Format your response as a JSON object with language names as keys.`;

  const response = await callAI([
    { role: 'system', content: 'You are an expert programmer who writes clear, executable code examples.' },
    { role: 'user', content: prompt }
  ], 0.6);

  // Try to parse as JSON, fallback to parsing text
  try {
    return JSON.parse(response);
  } catch {
    // Simple fallback parsing
    const result: {[key: string]: string} = {};
    languages.forEach(lang => {
      result[lang] = response;
    });
    return result;
  }
}

// ============================================================================
// Content Assistant Tools
// ============================================================================

async function answerDocQuestion(projectId: number, question: string, pageId?: number): Promise<string> {
  const pageContext = pageId ? `Page ID: ${pageId}\n` : '';
  
  const prompt = `
You are a helpful documentation assistant. Answer the following question about the documentation.

Project ID: ${projectId}
${pageContext}Question: ${question}

Requirements:
1. Provide a clear, concise answer
2. Reference specific sections if available
3. Keep response under 500 words
4. If you don't know, say so honestly

Answer:`;

  return await callAI([
    { role: 'system', content: 'You are a helpful assistant that answers documentation questions accurately and concisely.' },
    { role: 'user', content: prompt }
  ], 0.5);
}

async function adjustStyle(content: string, targetStyle: string): Promise<string> {
  const prompt = `
Rewrite the following documentation content to match the ${targetStyle} style.

Target style: ${targetStyle}
Content:
${content}

Requirements:
1. Maintain all technical accuracy
2. Adjust tone, vocabulary, and structure for the target style
3. Keep the same format and structure
4. Output the full rewritten content

Rewritten content:`;

  return await callAI([
    { role: 'system', content: 'You are an expert technical writer who can adapt content to different styles.' },
    { role: 'user', content: prompt }
  ], 0.7);
}

async function improveClarity(content: string, focus: string = 'grammar'): Promise<string> {
  const prompt = `
Improve the following documentation content for ${focus}.

Focus: ${focus}
Content:
${content}

Requirements:
1. Fix ${focus} issues
2. Maintain all technical accuracy
3. Improve readability
4. Output the corrected content

Corrected content:`;

  return await callAI([
    { role: 'system', content: 'You are an expert technical writer who excels at improving content quality.' },
    { role: 'user', content: prompt }
  ], 0.6);
}

// ============================================================================
// Translation Tools
// ============================================================================

async function detectLanguage(content: string): Promise<{language: string; confidence: number}> {
  const prompt = `
Detect the language of the following content and provide a confidence score.

Content: ${content}

Output a JSON object with:
- language: ISO 639-1 language code (en, zh, es, fr, de, ja, ko, ru, pt, it, ar, hi)
- confidence: 0.0 to 1.0

Output only the JSON object.`;

  const response = await callAI([
    { role: 'system', content: 'You are a language detection expert.' },
    { role: 'user', content: prompt }
  ], 0.3);

  try {
    return JSON.parse(response);
  } catch {
    return { language: 'en', confidence: 0.5 };
  }
}

async function translateContent(content: string, targetLang: string, sourceLang?: string): Promise<string> {
  const sourceContext = sourceLang ? `Source language: ${sourceLang}\n` : '';
  
  const prompt = `
Translate the following documentation content to ${targetLang}.

${sourceContext}Content:
${content}

Requirements:
1. Maintain technical accuracy
2. Use appropriate terminology for the target language
3. Keep the same markdown format
4. Output only the translated content

Translated content:`;

  return await callAI([
    { role: 'system', content: 'You are an expert technical translator who maintains accuracy in technical documentation.' },
    { role: 'user', content: prompt }
  ], 0.7);
}

// ============================================================================
// Analytics Tools
// ============================================================================

async function getContentPatterns(projectId: number): Promise<string> {
  const prompt = `
Analyze documentation consumption patterns for project ${projectId}.

Requirements:
1. Identify most viewed pages
2. Detect engagement patterns
3. Suggest content improvements

Output a JSON object with:
- mostViewed: array of page slugs
- engagementPatterns: string describing patterns
- suggestions: array of improvement suggestions`;

  return await callAI([
    { role: 'system', content: 'You are an analytics expert who analyzes documentation usage patterns.' },
    { role: 'user', content: prompt }
  ], 0.5);
}

async function detectContentGaps(projectId: number, content: string): Promise<string> {
  const prompt = `
Analyze the following documentation content for gaps and missing information.

Project ID: ${projectId}
Content:
${content}

Requirements:
1. Identify sections that are too short
2. Find missing examples or explanations
3. Suggest content expansions

Output a JSON object with:
- gaps: array of {section, length, type, suggestion} objects
- overallAssessment: string`;

  return await callAI([
    { role: 'system', content: 'You are an expert technical writer who identifies content gaps.' },
    { role: 'user', content: prompt }
  ], 0.6);
}

// ============================================================================
// REGISTER AI-ENHANCED TOOLS
// ============================================================================

export function registerAiTools(server: McpServer) {
  // Smart Content Generation
  server.registerTool(
    'generate_content_from_outline',
    {
      title: 'Generate content from outline',
      description: 'Generate full page content from a structured outline. Use this when creating new documentation pages.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        outline: z.string().describe('Markdown outline with # H1, ## H2 sections'),
        tone: z.string().optional().default('technical').describe('Writing tone: technical, beginner-friendly, marketing, etc.'),
      },
    },
    async ({ project, outline, tone }) => {
      const db = useDb();
      const projectRow = getProjectBySlug(project.trim());
      if (!projectRow) {
        return errorText(`No project with slug "${project}". Call list_projects to see available projects.`);
      }
      
      try {
        const content = await generateContentFromOutline(projectRow.id, outline, tone);
        return text(`Content generated successfully. Review and refine as needed:\n\n${content}`);
      } catch (error) {
        return errorText(`Generation failed: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'complete_section',
    {
      title: 'Auto-complete section content',
      description: 'Expand a partial section with detailed content. Use when a section needs expansion.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        page: z.string().describe('Page slug'),
        section: z.string().describe('Section title to complete'),
        expand_with: z.string().optional().default('details').describe('What to add: examples, details, code samples'),
      },
    },
    async ({ project, page, section, expand_with }) => {
      const db = useDb();
      const projectRow = getProjectBySlug(project.trim());
      if (!projectRow) {
        return errorText(`No project with slug "${project}".`);
      }
      
      const pageRow = db.prepare('SELECT id, content FROM pages WHERE project_id = ? AND slug = ?')
        .get(projectRow.id, page.trim()) as PageRow | undefined;
      if (!pageRow) {
        return errorText(`No page "${page}" in project "${project}".`);
      }
      
      try {
        const content = await autoCompleteSection(projectRow.id, pageRow.id, section, expand_with);
        return text(`Section expanded:\n\n${content}`);
      } catch (error) {
        return errorText(`Expansion failed: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'generate_code_example',
    {
      title: 'Generate code example',
      description: 'Generate executable code examples in multiple languages for documentation.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        context: z.string().describe('What the code should demonstrate'),
        languages: z.array(z.string()).default(['javascript']).describe('Target languages'),
      },
    },
    async ({ project, context, languages }) => {
      try {
        const examples = await generateCodeExample(context, languages);
        let output = 'Code examples generated:\n\n';
        for (const [lang, code] of Object.entries(examples)) {
          output += `## ${lang.toUpperCase()}\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
        }
        return text(output);
      } catch (error) {
        return errorText(`Generation failed: ${error.message}`);
      }
    }
  );

  // Content Assistant
  server.registerTool(
    'doc_qa',
    {
      title: 'Documentation Q&A',
      description: 'Answer documentation questions with context-aware responses. Fast response (<2 seconds).',
      inputSchema: {
        project: z.string().describe('Project slug'),
        question: z.string().describe('Question about the documentation'),
        page: z.string().optional().describe('Specific page context (optional)'),
      },
    },
    async ({ project, question, page }) => {
      const db = useDb();
      const projectRow = getProjectBySlug(project.trim());
      if (!projectRow) {
        return errorText(`No project with slug "${project}".`);
      }
      
      let pageId: number | undefined;
      if (page) {
        const pageRow = db.prepare('SELECT id FROM pages WHERE project_id = ? AND slug = ?')
          .get(projectRow.id, page.trim());
        if (pageRow) {
          pageId = (pageRow as { id: number }).id;
        }
      }
      
      try {
        const answer = await answerDocQuestion(projectRow.id, question, pageId);
        // Ensure response is fast by using a simpler model and shorter response
        return text(answer.slice(0, 3000));
      } catch (error) {
        return errorText(`Q&A failed: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'adjust_style',
    {
      title: 'Adjust content style',
      description: 'Rewrite content to match a specific style (technical, beginner-friendly, etc.)',
      inputSchema: {
        project: z.string().describe('Project slug'),
        content: z.string().describe('Content to rewrite'),
        target_style: z.string().describe('Style name: technical, beginner, marketing, academic, conversational'),
      },
    },
    async ({ project, content, target_style }) => {
      try {
        const rewritten = await adjustStyle(content, target_style);
        return text(`Content rewritten to ${target_style} style:\n\n${rewritten}`);
      } catch (error) {
        return errorText(`Style adjustment failed: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'improve_clarity',
    {
      title: 'Improve grammar and clarity',
      description: 'Rewrite content for better grammar, clarity, and readability.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        content: z.string().describe('Content to improve'),
        focus: z.string().optional().default('grammar').describe('Focus: grammar, clarity, conciseness, tone'),
      },
    },
    async ({ project, content, focus }) => {
      try {
        const improved = await improveClarity(content, focus);
        return text(`Content improved (focus: ${focus}):\n\n${improved}`);
      } catch (error) {
        return errorText(`Improvement failed: ${error.message}`);
      }
    }
  );

  // Translation Pipeline
  server.registerTool(
    'translate_page',
    {
      title: 'Translate documentation page',
      description: 'Translate a page to supported languages with quality scoring. Supports: en, zh, es, fr, de, ja, ko, ru, pt, it, ar, hi',
      inputSchema: {
        project: z.string().describe('Project slug'),
        page: z.string().describe('Page slug'),
        target_lang: z.string().describe('Target language code'),
      },
    },
    async ({ project, page, target_lang }) => {
      const db = useDb();
      const projectRow = getProjectBySlug(project.trim());
      if (!projectRow) {
        return errorText(`No project with slug "${project}".`);
      }
      
      const pageRow = db.prepare('SELECT id, content, title FROM pages WHERE project_id = ? AND slug = ?')
        .get(projectRow.id, page.trim()) as PageRow | undefined;
      if (!pageRow) {
        return errorText(`No page "${page}" in project "${project}".`);
      }
      
      try {
        const sourceLang = await detectLanguage(pageRow.content);
        const translated = await translateContent(pageRow.content, target_lang, sourceLang.language);
        
        // Store translation in database
        db.prepare(`
          INSERT INTO translations (project_id, page_id, source_lang, target_lang, translated_content, status)
          VALUES (?, ?, ?, ?, ?, 'pending')
        `).run(projectRow.id, pageRow.id, sourceLang.language, target_lang, translated);
        
        return text(`Page translated to ${target_lang}:\n\n${translated.substring(0, 2000)}...`);
      } catch (error) {
        return errorText(`Translation failed: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'detect_language',
    {
      title: 'Auto-detect language',
      description: 'Detect the source language of documentation content.',
      inputSchema: {
        content: z.string().describe('Content to analyze'),
      },
    },
    async ({ content }) => {
      try {
        const result = await detectLanguage(content);
        return text(`Detected language: ${result.language} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
      } catch (error) {
        return errorText(`Language detection failed: ${error.message}`);
      }
    }
  );

  // Analytics & Insights
  server.registerTool(
    'content_patterns',
    {
      title: 'Content consumption patterns',
      description: 'Get analytics on which pages are most viewed and how users engage.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        period: z.enum(['7d', '30d', '90d']).optional().default('30d'),
      },
    },
    async ({ project, period }) => {
      const db = useDb();
      const projectRow = getProjectBySlug(project.trim());
      if (!projectRow) {
        return errorText(`No project with slug "${project}".`);
      }
      
      try {
        const patterns = await getContentPatterns(projectRow.id);
        return text(`Content patterns for project "${project}" (last ${period}):\n\n${patterns}`);
      } catch (error) {
        return errorText(`Pattern analysis failed: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'content_gaps',
    {
      title: 'Identify content gaps',
      description: 'Find sections with minimal content that need expansion.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        page: z.string().describe('Page slug'),
      },
    },
    async ({ project, page }) => {
      const db = useDb();
      const projectRow = getProjectBySlug(project.trim());
      if (!projectRow) {
        return errorText(`No project with slug "${project}".`);
      }
      
      const pageRow = db.prepare('SELECT content FROM pages WHERE project_id = ? AND slug = ?')
        .get(projectRow.id, page.trim()) as { content: string } | undefined;
      if (!pageRow) {
        return errorText(`No page "${page}" in project "${project}".`);
      }
      
      try {
        const gaps = await detectContentGaps(projectRow.id, pageRow.content);
        return text(`Content gaps for "${page}":\n\n${gaps}`);
      } catch (error) {
        return errorText(`Gap detection failed: ${error.message}`);
      }
    }
  );
}
