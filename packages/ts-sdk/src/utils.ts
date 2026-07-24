/**
 * Utility functions for KnowledgeBook SDK
 */

import { KnowledgeBook } from './index';

/**
 * Create a new KnowledgeBook instance with default configuration
 */
export function createClient(config: {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}): KnowledgeBook {
  return new KnowledgeBook({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    accessToken: config.accessToken
  });
}

/**
 * Format a project URL from project slug
 */
export function getProjectUrl(baseUrl: string, projectSlug: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/${projectSlug}`;
}

/**
 * Parse project slug from URL
 */
export function getProjectSlugFromUrl(url: string): string | null {
  const match = url.match(/\/([a-z0-9-]+)$/);
  return match ? match[1] : null;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate a random session ID for MCP connections
 */
export function generateSessionId(): string {
  return `kb-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`;
}

/**
 * Debounce function for rapid API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: any = null;
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Retry function for failed requests
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
}
