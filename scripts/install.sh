#!/usr/bin/env bash
#
# Clawster Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/tomer-shavit/clawster/master/scripts/install.sh | bash
#
# This script will:
# 1. Check prerequisites (Node.js 18+, pnpm, git)
# 2. Clone the Clawster repository
# 3. Install dependencies
# 4. Run the setup wizard
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/tomer-shavit/clawster.git"
INSTALL_DIR="${CLAWSTER_INSTALL_DIR:-$HOME/clawster}"

echo -e "${BLUE}🚀 Clawster Installer${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

error() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}Warning: $1${NC}"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo -e "${BLUE}→ $1${NC}"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# Check prerequisites
# -----------------------------------------------------------------------------

echo "Checking prerequisites..."
echo ""

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        success "Node.js $(node -v)"
    else
        error "Node.js 18+ required (found $(node -v)). Install from https://nodejs.org"
    fi
else
    error "Node.js not found. Install Node.js 18+ from https://nodejs.org"
fi

# Check pnpm
if command_exists pnpm; then
    success "pnpm $(pnpm -v)"
else
    warn "pnpm not found. Installing pnpm..."
    npm install -g pnpm || error "Failed to install pnpm. Run: npm install -g pnpm"
    success "pnpm installed"
fi

# Check git
if command_exists git; then
    success "git $(git --version | cut -d' ' -f3)"
else
    error "git not found. Install git from https://git-scm.com"
fi

# Check Docker (optional)
if command_exists docker; then
    if docker info >/dev/null 2>&1; then
        success "Docker (running)"
    else
        warn "Docker installed but not running (optional, needed for deploying bots)"
    fi
else
    warn "Docker not found (optional, needed for deploying bots)"
fi

echo ""

# -----------------------------------------------------------------------------
# Clone or update repository
# -----------------------------------------------------------------------------

if [ -d "$INSTALL_DIR" ]; then
    echo "Found existing installation at $INSTALL_DIR"
    # Auto-update if --non-interactive flag is passed or stdin is not a terminal
    if [[ "$*" == *"--non-interactive"* ]] || [ ! -t 0 ]; then
        info "Updating repository..."
        cd "$INSTALL_DIR"
        git pull origin master || warn "Could not update, continuing with existing version"
    else
        read -p "Update existing installation? [Y/n] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            info "Skipping clone, using existing installation"
        else
            info "Updating repository..."
            cd "$INSTALL_DIR"
            git pull origin master || warn "Could not update, continuing with existing version"
        fi
    fi
else
    info "Cloning Clawster to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR" || error "Failed to clone repository"
    success "Repository cloned"
fi

cd "$INSTALL_DIR"

# -----------------------------------------------------------------------------
# Install dependencies
# -----------------------------------------------------------------------------

info "Installing dependencies (this may take a minute)..."
pnpm install || error "Failed to install dependencies"
success "Dependencies installed"

# -----------------------------------------------------------------------------
# Generate Prisma client and build all packages
# -----------------------------------------------------------------------------

info "Generating Prisma client..."
cd packages/database && pnpm prisma generate && cd ../..
success "Prisma client generated"

info "Building all packages..."
pnpm build || error "Failed to build packages"
success "All packages built"

# -----------------------------------------------------------------------------
# Run setup
# -----------------------------------------------------------------------------

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Run the setup command
node packages/cli/dist/index.js setup "$@"

# -----------------------------------------------------------------------------
# Post-install message
# -----------------------------------------------------------------------------

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Clawster installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Installation directory: $INSTALL_DIR"
echo ""
echo "Quick commands:"
echo "  cd $INSTALL_DIR && pnpm dev     # Start development servers"
echo "  cd $INSTALL_DIR && pnpm cli     # Run CLI commands"
echo ""
echo "To add clawster to your PATH, add this to your ~/.bashrc or ~/.zshrc:"
echo "  alias clawster='node $INSTALL_DIR/packages/cli/dist/index.js'"
echo ""
