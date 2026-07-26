# Setup configuration for Python SDK
from setuptools import setup, find_packages

setup(
    name="knowledgebook",
    version="1.0.0",
    description="Official KnowledgeBook Python SDK",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="KnowledgeBook Team",
    author_email="team@knowledgebook.app",
    url="https://github.com/knowledgebook/sdk-python",
    project_urls={
        "Documentation": "https://knowledgebook.plutolabs.app/docs",
        "Source": "https://github.com/knowledgebook/sdk-python",
        "Issues": "https://github.com/knowledgebook/sdk-python/issues",
    },
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
        "pydantic>=2.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "ruff>=0.0.292",
            "mypy>=1.4.0",
        ],
        "web3": [
            "web3>=6.0.0",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    keywords="knowledgebook, sdk, documentation, api, mcp, web3",
)
