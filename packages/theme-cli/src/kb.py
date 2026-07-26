#!/usr/bin/env python3
"""
KnowledgeBook CLI - Content Management Tool

A command-line interface for managing KnowledgeBook documentation projects,
sections, and pages.
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from knowledgebook import KnowledgeBook


def get_client(args) -> KnowledgeBook:
    """Create a KnowledgeBook client from CLI arguments."""
    base_url = args.base_url or "https://knowledgebook.plutolabs.app"
    api_key = args.api_key or None
    access_token = args.access_token or None
    
    return KnowledgeBook(
        base_url=base_url,
        api_key=api_key,
        access_token=access_token
    )


def cmd_project(args):
    """Handle project commands."""
    kb = get_client(args)
    
    if args.subcommand == "list":
        projects = kb.list_projects()
        print("Projects:")
        for proj in projects.get("projects", []):
            print(f"  - {proj['name']} ({proj['slug']})")
    
    elif args.subcommand == "get":
        project = kb.get_project(args.slug)
        print(f"Project: {project.name}")
        print(f"Slug: {project.slug}")
        print(f"Description: {project.description or 'N/A'}")
    
    elif args.subcommand == "create":
        data = {
            "name": args.name,
            "description": args.description,
        }
        if args.accent_color:
            data["accent_color"] = args.accent_color
        project = kb.create_project(data)
        print(f"Created project: {project.name}")
    
    elif args.subcommand == "delete":
        kb.delete_project(args.slug)
        print(f"Deleted project: {args.slug}")


def cmd_section(args):
    """Handle section commands."""
    kb = get_client(args)
    
    if args.subcommand == "list":
        sections = kb.list_sections(args.project_slug)
        print("Sections:")
        for sec in sections.get("sections", []):
            print(f"  - {sec['title']} (id: {sec['id']})")
    
    elif args.subcommand == "create":
        data = {"title": args.title, "position": args.position or 0}
        section = kb.create_section(args.project_slug, data)
        print(f"Created section: {section.title}")
    
    elif args.subcommand == "delete":
        kb.delete_section(args.project_slug, args.section_id)
        print(f"Deleted section: {args.section_id}")


def cmd_page(args):
    """Handle page commands."""
    kb = get_client(args)
    
    if args.subcommand == "list":
        pages = kb.list_pages(args.project_slug)
        print("Pages:")
        for page in pages.get("pages", []):
            print(f"  - {page['title']} (slug: {page['slug']})")
    
    elif args.subcommand == "get":
        page = kb.get_page(args.project_slug, args.page_slug)
        print(f"Page: {page.title}")
        print(f"Content:\n{page.content}")
    
    elif args.subcommand == "create":
        data = {
            "title": args.title,
            "slug": args.slug,
            "content": args.content or "",
            "position": args.position or 0
        }
        if args.section_id:
            data["section_id"] = args.section_id
        page = kb.create_page(args.project_slug, data)
        print(f"Created page: {page.title}")
    
    elif args.subcommand == "update":
        data = {"content": args.content}
        if args.title:
            data["title"] = args.title
        page = kb.update_page(args.project_slug, args.page_id, data)
        print(f"Updated page: {page.title}")


def cmd_upload(args):
    """Handle file upload."""
    kb = get_client(args)
    
    if not args.file:
        print("Error: --file is required")
        sys.exit(1)
    
    upload = kb.upload_file(args.project_slug, args.file)
    print(f"Uploaded: {upload.filename}")
    print(f"URL: {upload.url}")


def cmd_theme(args):
    """Handle theme commands."""
    kb = get_client(args)
    
    if args.subcommand == "get":
        theme = kb.get_theme(args.project_slug)
        print("Theme Settings:")
        print(f"  Accent Color: {theme.accent_color}")
        print(f"  Font Family: {theme.font_family}")
        print(f"  Background: {theme.bg_color}")
    
    elif args.subcommand == "update":
        data = {}
        if args.accent_color:
            data["accent_color"] = args.accent_color
        if args.font_family:
            data["font_family"] = args.font_family
        if args.bg_color:
            data["bg_color"] = args.bg_color
        theme = kb.update_theme(args.project_slug, data)
        print(f"Updated theme for: {args.project_slug}")


def cmd_mcp(args):
    """Handle MCP commands."""
    kb = get_client(args)
    
    if args.subcommand == "list":
        result = kb.list_projects_mcp()
        print(result)
    
    elif args.subcommand == "search":
        result = kb.search_mcp(args.query, args.project)
        print(result)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        prog="kb",
        description="KnowledgeBook CLI - Content Management Tool"
    )
    
    # Global options
    parser.add_argument("--base-url", "-u", help="KnowledgeBook base URL")
    parser.add_argument("--api-key", "-k", help="API key for authentication")
    parser.add_argument("--access-token", "-t", help="Access token for authentication")
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Project commands
    project_parser = subparsers.add_parser("project", help="Project management")
    project_parser.add_argument("--subcommand", "-s", 
                                choices=["list", "get", "create", "delete"],
                                required=True)
    project_parser.add_argument("--slug", "-s", help="Project slug")
    project_parser.add_argument("--name", "-n", help="Project name")
    project_parser.add_argument("--description", "-d", help="Project description")
    project_parser.add_argument("--accent-color", "-c", help="Accent color")
    
    # Section commands
    section_parser = subparsers.add_parser("section", help="Section management")
    section_parser.add_argument("--subcommand", "-s",
                                choices=["list", "create", "delete"],
                                required=True)
    section_parser.add_argument("--project-slug", "-p", required=True,
                                help="Project slug")
    section_parser.add_argument("--title", "-t", help="Section title")
    section_parser.add_argument("--position", "-o", type=int, default=0,
                                help="Section position")
    section_parser.add_argument("--section-id", "-i", type=int,
                                help="Section ID")
    
    # Page commands
    page_parser = subparsers.add_parser("page", help="Page management")
    page_parser.add_argument("--subcommand", "-s",
                             choices=["list", "get", "create", "update"],
                             required=True)
    page_parser.add_argument("--project-slug", "-p", required=True,
                             help="Project slug")
    page_parser.add_argument("--page-slug", "-g", help="Page slug")
    page_parser.add_argument("--page-id", "-i", type=int, help="Page ID")
    page_parser.add_argument("--title", "-t", help="Page title")
    page_parser.add_argument("--slug", "-l", help="Page slug")
    page_parser.add_argument("--content", "-c", help="Page content")
    page_parser.add_argument("--section-id", "-n", type=int, help="Section ID")
    page_parser.add_argument("--position", "-o", type=int, default=0,
                             help="Page position")
    
    # Upload command
    upload_parser = subparsers.add_parser("upload", help="Upload file")
    upload_parser.add_argument("--project-slug", "-p", required=True,
                               help="Project slug")
    upload_parser.add_argument("--file", "-f", required=True,
                               help="File to upload")
    
    # Theme commands
    theme_parser = subparsers.add_parser("theme", help="Theme management")
    theme_parser.add_argument("--subcommand", "-s",
                              choices=["get", "update"],
                              required=True)
    theme_parser.add_argument("--project-slug", "-p", required=True,
                              help="Project slug")
    theme_parser.add_argument("--accent-color", "-c", help="Accent color")
    theme_parser.add_argument("--font-family", "-f", help="Font family")
    theme_parser.add_argument("--bg-color", "-b", help="Background color")
    
    # MCP commands
    mcp_parser = subparsers.add_parser("mcp", help="MCP utilities")
    mcp_parser.add_argument("--subcommand", "-s",
                            choices=["list", "search"],
                            required=True)
    mcp_parser.add_argument("--query", "-q", help="Search query")
    mcp_parser.add_argument("--project", "-p", help="Project slug (optional)")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    if args.command == "project":
        cmd_project(args)
    elif args.command == "section":
        cmd_section(args)
    elif args.command == "page":
        cmd_page(args)
    elif args.command == "upload":
        cmd_upload(args)
    elif args.command == "theme":
        cmd_theme(args)
    elif args.command == "mcp":
        cmd_mcp(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
