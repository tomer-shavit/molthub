# Contributing to Molthub

Thank you for your interest in contributing to Molthub! Molthub is a self-hosted control plane for Moltbot instances, and we welcome contributions from the community.

Please note that this project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## How Can I Contribute?

### Reporting Bugs

- Use [GitHub Issues](https://github.com/tomer-shavit/molthub/issues) with the bug report template.
- Include clear reproduction steps.
- Describe expected vs. actual behavior.
- Include environment info (OS, Node.js version, pnpm version, browser if applicable).

### Suggesting Features

- Use [GitHub Issues](https://github.com/tomer-shavit/molthub/issues) with the feature request template.
- Describe the use case, not just the solution. Explain the problem you are trying to solve.

### Pull Requests

- PRs are welcome for bug fixes, features, documentation, and tests.
- For significant changes, open an issue first to discuss the approach.
- Link to related issues in your PR description.

## Development Setup

### Prerequisites

- **Node.js** 18+
- **pnpm** 8.15+ (`npm install -g pnpm`)
- **Docker & Docker Compose** (for PostgreSQL and Redis)

### Getting Started

```bash
git clone https://github.com/tomer-shavit/molthub.git
cd molthub
pnpm install
cp .env.example .env
pnpm dev:setup    # Starts PostgreSQL + Redis, runs migrations
pnpm dev          # Starts API (port 4000) and Web UI (port 3000)
```

### Project Structure

```
molthub/
├── apps/
│   ├── api/              # NestJS backend (port 4000)
│   └── web/              # Next.js frontend (port 3000)
├── packages/
│   ├── core/             # Zod schemas, shared types, PolicyEngine
│   ├── database/         # Prisma schema + PostgreSQL client
│   ├── adapters-aws/     # AWS SDK integrations
│   ├── cloud-providers/  # Deployment provider abstractions
│   ├── gateway-client/   # Moltbot Gateway client library
│   └── cli/              # CLI tool
```

## Running Tests

```bash
pnpm test                           # All tests
pnpm --filter @molthub/core test    # Core package (Vitest)
pnpm --filter @molthub/api test     # API tests (Jest)
pnpm --filter @molthub/web test:e2e # E2E tests (Playwright)
pnpm build                          # Full build
pnpm lint                           # Lint check
```

## Code Style

- **TypeScript** is used throughout the entire codebase.
- **Prettier** handles formatting (`pnpm format`).
- Follow existing patterns in the codebase.
- Use **Zod** for schema validation.
- Follow **NestJS patterns** for API modules: controller -> service -> repository.

## Commit Messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must use one of the following prefixes:

- `feat: add fleet health endpoint`
- `fix: resolve race condition in reconciler`
- `chore: update dependencies`
- `test: add E2E tests for trace viewer`
- `docs: update API endpoint table`

## Pull Request Process

1. Fork the repo and create a branch from `master`.
2. Make your changes and add tests for new functionality.
3. Ensure all checks pass:
   - `pnpm build`
   - `pnpm test`
   - `pnpm lint`
4. Write a clear PR description that includes:
   - Summary of changes
   - Related issue number (e.g., `Closes #42`)
   - How to test the changes
5. Submit the PR. A maintainer will review it.

## Questions?

Use [GitHub Discussions](https://github.com/tomer-shavit/molthub/discussions) for questions. GitHub Issues are reserved for bug reports and feature requests only.

---

Thank you for contributing to Molthub!
