#!/usr/bin/env bash
#
# Molthub CLI — setup, test, and manage your dev environment
#
# Usage:
#   bash scripts/setup.sh [COMMAND] [OPTIONS]
#
# Commands:
#   setup      Full dev environment setup (default if no command given)
#   doctor     Check that all services are healthy
#   deploy     Deploy a test bot via the API
#   status     Check deployment status of a bot
#   list       List all bot instances
#   destroy    Delete a bot instance
#   logs       Tail API server logs
#
# Options:
#   --debug    Verbose output for diagnosing issues
#   --help     Show this help message
#

set -euo pipefail

# ─── Globals ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FLAG_NO_START=false
FLAG_FORCE=false
FLAG_DEBUG=false

COMPOSE_CMD=""
PREREQ_FAILED=false
STEP_COUNT=0

API_URL="${API_URL:-http://localhost:4000}"
API_HTTP_CODE="0"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ─── Logging ─────────────────────────────────────────────────────────────────

log_ok()   { printf "  ${GREEN}[OK]${RESET}    %s\n" "$1"; }
log_skip() { printf "  ${BLUE}[SKIP]${RESET}  %s\n" "$1"; }
log_fail() { printf "  ${RED}[FAIL]${RESET}  %s\n" "$1"; }
log_warn() { printf "  ${YELLOW}[WARN]${RESET}  %s\n" "$1"; }
log_info() { printf "  ${DIM}[....]${RESET}  %s\n" "$1"; }

log_step() {
    STEP_COUNT=$((STEP_COUNT + 1))
    printf "\n${BOLD}[%d] %s${RESET}\n" "$STEP_COUNT" "$1"
}

log_debug() {
    if $FLAG_DEBUG; then
        printf "  ${DIM}[DEBUG] %s${RESET}\n" "$1"
    fi
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

# Run a command, suppressing output unless --debug or failure
run_cmd() {
    local desc="$1"
    shift
    log_info "$desc"
    log_debug "Running: $*"

    local start_time
    start_time=$(date +%s)

    local output
    local exit_code=0
    if $FLAG_DEBUG; then
        "$@" 2>&1 | while IFS= read -r line; do printf "  ${DIM}  | %s${RESET}\n" "$line"; done
        exit_code=${PIPESTATUS[0]}
    else
        output=$("$@" 2>&1) || exit_code=$?
    fi

    local end_time
    end_time=$(date +%s)
    local elapsed=$((end_time - start_time))

    if $FLAG_DEBUG; then
        log_debug "Completed in ${elapsed}s (exit code: $exit_code)"
    fi

    if [ $exit_code -ne 0 ]; then
        log_fail "$desc"
        if ! $FLAG_DEBUG && [ -n "${output:-}" ]; then
            printf "\n${RED}--- Command output ---${RESET}\n"
            printf "%s\n" "$output"
            printf "${RED}--- End output ---${RESET}\n\n"
        fi
        printf "  ${YELLOW}Tip: Re-run with --debug for verbose output${RESET}\n"
        return 1
    fi

    log_ok "$desc"
    return 0
}

# Check if a command exists
has_cmd() {
    command -v "$1" &>/dev/null
}

# Extract major version number from version string (e.g., "v18.19.0" -> 18)
parse_major_version() {
    echo "$1" | grep -oE '[0-9]+' | head -1
}

# Check if a port is in use. Returns 0 if in use, 1 if free.
port_in_use() {
    local port="$1"
    if has_cmd ss; then
        ss -tlnp 2>/dev/null | grep -q ":${port} " && return 0
    elif has_cmd lsof; then
        lsof -i ":${port}" -sTCP:LISTEN &>/dev/null && return 0
    elif has_cmd netstat; then
        netstat -tlnp 2>/dev/null | grep -q ":${port} " && return 0
    fi
    return 1
}

# Check if we're running inside WSL
is_wsl() {
    grep -qi microsoft /proc/version 2>/dev/null
}

# Make an API call. Writes response body to API_BODY and HTTP code to API_HTTP_CODE.
# Usage: api_call GET "/path" [json_body]
#        then read $API_HTTP_CODE and $API_BODY
api_call() {
    local method="$1"
    local path="$2"
    local data="${3:-}"

    local url="${API_URL}${path}"
    log_debug "API ${method} ${url}"
    if [ -n "$data" ]; then
        log_debug "Body: $data"
    fi

    local tmpfile
    tmpfile=$(mktemp)
    local errfile
    errfile=$(mktemp)

    local curl_args=(-s -w '\n%{http_code}' -X "$method" -H "Content-Type: application/json")
    if [ -n "$data" ]; then
        curl_args+=(-d "$data")
    fi

    local response
    if ! response=$(curl "${curl_args[@]}" "$url" 2>"$errfile"); then
        local curl_err
        curl_err=$(cat "$errfile")
        rm -f "$tmpfile" "$errfile"
        log_debug "curl error: $curl_err"
        API_BODY=""
        API_HTTP_CODE="0"
        return 1
    fi
    rm -f "$tmpfile" "$errfile"

    # Last line is the HTTP status code
    API_HTTP_CODE=$(echo "$response" | tail -1)
    API_BODY=$(echo "$response" | sed '$d')

    log_debug "HTTP $API_HTTP_CODE"
    if $FLAG_DEBUG && [ -n "$API_BODY" ]; then
        log_debug "Response: $(echo "$API_BODY" | head -c 500)"
    fi

    # Also echo the body for backward compat with $() capture
    echo "$API_BODY"
    return 0
}

# Check if API is reachable
check_api() {
    # Call directly (not in subshell) so API_HTTP_CODE propagates
    api_call GET "/health" > /dev/null 2>&1 || true

    if [ "$API_HTTP_CODE" = "0" ]; then
        return 1
    fi
    return 0
}

# Require the API to be running, exit with helpful message if not
require_api() {
    if ! check_api; then
        log_fail "Cannot reach API at ${API_URL}"
        printf "\n"
        printf "  The API server must be running for this command.\n"
        printf "  Start it with one of:\n"
        printf "\n"
        printf "    ${BOLD}pnpm dev${RESET}                           # Both API + Web\n"
        printf "    ${BOLD}pnpm --filter @molthub/api dev${RESET}     # API only\n"
        printf "\n"
        printf "  Or run full setup:  ${BOLD}bash scripts/setup.sh${RESET}\n"
        printf "\n"
        exit 1
    fi
}

# Pretty-print JSON (uses python if available, jq if available, fallback raw)
pp_json() {
    if has_cmd jq; then
        jq '.' 2>/dev/null || cat
    elif has_cmd python3; then
        python3 -m json.tool 2>/dev/null || cat
    else
        cat
    fi
}

# ─── Argument Parsing ────────────────────────────────────────────────────────

COMMAND=""
CMD_ARGS=()

parse_args() {
    # First pass: extract command and global flags
    while [[ $# -gt 0 ]]; do
        case "$1" in
            setup|doctor|deploy|status|list|destroy|logs)
                COMMAND="$1"
                shift
                ;;
            --no-start)
                FLAG_NO_START=true
                shift
                ;;
            --force)
                FLAG_FORCE=true
                shift
                ;;
            --debug)
                FLAG_DEBUG=true
                shift
                ;;
            --help|-h)
                if [ -n "$COMMAND" ]; then
                    # Command-specific help
                    CMD_ARGS+=("--help")
                    shift
                else
                    print_usage
                    exit 0
                fi
                ;;
            -*)
                # Pass unknown flags to command
                CMD_ARGS+=("$1")
                shift
                ;;
            *)
                # Positional args go to command
                CMD_ARGS+=("$1")
                shift
                ;;
        esac
    done

    # Default command is setup
    if [ -z "$COMMAND" ]; then
        COMMAND="setup"
    fi
}

print_usage() {
    cat <<'EOF'

  Molthub CLI

  Usage:
    bash scripts/setup.sh [COMMAND] [OPTIONS]

  Commands:
    setup      Full dev environment setup (default)
    doctor     Check that all services are healthy
    deploy     Deploy a test bot via the API (no UI needed)
    status     Check deployment status of a bot instance
    list       List all bot instances
    destroy    Delete a bot instance
    logs       Tail the API server process output

  Global Options:
    --debug    Verbose output — prints API calls, responses, and timings
    --help     Show this help message

  Setup Options:
    --no-start   Set up everything but don't launch dev servers
    --force      Re-run all steps even if already done

  Examples:
    bash scripts/setup.sh                              # Full setup + start
    bash scripts/setup.sh --no-start                   # Setup only
    bash scripts/setup.sh doctor                       # Health check everything
    bash scripts/setup.sh deploy                       # Deploy minimal test bot
    bash scripts/setup.sh deploy --name mybot          # Deploy with custom name
    bash scripts/setup.sh deploy --template builtin-telegram-bot
    bash scripts/setup.sh status <instance-id>         # Check deploy progress
    bash scripts/setup.sh list                         # List all bots
    bash scripts/setup.sh destroy <instance-id>        # Delete a bot
    bash scripts/setup.sh doctor --debug               # Verbose health check

EOF
}

# ─── Banner ──────────────────────────────────────────────────────────────────

print_banner() {
    printf "\n"
    printf "${BOLD}  ╔══════════════════════════════════════╗${RESET}\n"
    printf "${BOLD}  ║           Molthub CLI                 ║${RESET}\n"
    printf "${BOLD}  ╚══════════════════════════════════════╝${RESET}\n"
    printf "\n"

    if $FLAG_DEBUG; then
        printf "  ${YELLOW}Debug mode enabled${RESET}\n"
    fi
}

# ═════════════════════════════════════════════════════════════════════════════
#  COMMAND: doctor
# ═════════════════════════════════════════════════════════════════════════════

cmd_doctor() {
    STEP_COUNT=0
    local all_ok=true

    # ── Check 1: Docker & PostgreSQL ──
    log_step "Docker & PostgreSQL"

    local docker_ok=false
    if docker_ver=$(docker --version 2>/dev/null); then
        log_ok "Docker installed"

        if docker info &>/dev/null; then
            log_ok "Docker daemon running"

            # Detect compose command
            if docker compose version &>/dev/null 2>&1; then
                COMPOSE_CMD="docker compose"
            elif docker-compose --version &>/dev/null 2>&1; then
                COMPOSE_CMD="docker-compose"
            fi

            if [ -n "$COMPOSE_CMD" ]; then
                log_ok "Docker Compose available ($COMPOSE_CMD)"

                # Check postgres container
                local pg_container
                pg_container=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" ps -q postgres 2>/dev/null || echo "")
                if [ -n "$pg_container" ]; then
                    local pg_status
                    pg_status=$(docker inspect -f '{{.State.Status}}' "$pg_container" 2>/dev/null || echo "unknown")
                    if [ "$pg_status" = "running" ]; then
                        if $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" exec -T postgres pg_isready -U molthub &>/dev/null; then
                            log_ok "PostgreSQL container running and healthy"
                            docker_ok=true
                        else
                            log_fail "PostgreSQL container running but not accepting connections"
                            all_ok=false
                        fi
                    else
                        log_fail "PostgreSQL container exists but status: $pg_status"
                        printf "         Fix: ${BOLD}$COMPOSE_CMD up -d postgres${RESET}\n"
                        all_ok=false
                    fi
                else
                    log_fail "PostgreSQL container not found"
                    printf "         Fix: ${BOLD}$COMPOSE_CMD up -d postgres${RESET}\n"
                    all_ok=false
                fi
            else
                log_fail "Docker Compose not available"
                all_ok=false
            fi
        else
            log_fail "Docker daemon not running"
            if is_wsl; then
                printf "         Fix: Open Docker Desktop > Settings > Resources > WSL Integration\n"
            else
                printf "         Fix: ${BOLD}sudo systemctl start docker${RESET}\n"
            fi
            all_ok=false
        fi
    else
        log_fail "Docker not installed"
        all_ok=false
    fi

    # ── Check 1b: OpenClaw Gateway ──
    log_step "OpenClaw Gateway"

    if [ -n "$COMPOSE_CMD" ] && $docker_ok; then
        local gw_container
        gw_container=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" ps -q gateway 2>/dev/null || echo "")
        if [ -n "$gw_container" ]; then
            local gw_status
            gw_status=$(docker inspect -f '{{.State.Status}}' "$gw_container" 2>/dev/null || echo "unknown")
            if [ "$gw_status" = "running" ]; then
                log_ok "Gateway container running"
                if curl -sf -o /dev/null --max-time 3 "http://localhost:18789" 2>/dev/null; then
                    log_ok "Gateway responding on port 18789"
                else
                    log_warn "Gateway container running but port 18789 not responding (may still be starting)"
                fi
            else
                log_fail "Gateway container exists but status: $gw_status"
                printf "         Fix: ${BOLD}$COMPOSE_CMD -f $PROJECT_ROOT/docker-compose.yml up -d gateway${RESET}\n"
                all_ok=false
            fi
        else
            log_warn "Gateway container not found"
            printf "         Fix: ${BOLD}$COMPOSE_CMD -f $PROJECT_ROOT/docker-compose.yml up -d gateway${RESET}\n"
            all_ok=false
        fi
    elif port_in_use 18789; then
        log_ok "Port 18789 is in use (gateway may be running locally)"
    else
        log_warn "OpenClaw Gateway not running (port 18789 free)"
        printf "         Start via Docker: ${BOLD}$COMPOSE_CMD -f $PROJECT_ROOT/docker-compose.yml up -d gateway${RESET}\n"
        printf "         Or locally:       ${BOLD}openclaw gateway --port 18789${RESET}\n"
        all_ok=false
    fi

    # ── Check 2: Database connectivity ──
    log_step "Database connectivity"

    if $docker_ok; then
        # Try a direct SQL query via docker exec
        local db_result
        db_result=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" exec -T postgres psql -U molthub -d molthub -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" -t 2>/dev/null | tr -d '[:space:]') || db_result=""

        if [ -n "$db_result" ] && [ "$db_result" -gt 0 ] 2>/dev/null; then
            log_ok "Database connected ($db_result tables in public schema)"
        elif [ "$db_result" = "0" ]; then
            log_warn "Database connected but no tables found"
            printf "         Fix: ${BOLD}bash scripts/setup.sh setup --no-start${RESET} (runs migrations)\n"
            all_ok=false
        else
            log_fail "Cannot query database"
            all_ok=false
        fi

        # Check key tables exist
        local key_tables=("Workspace" "BotInstance" "Fleet" "DeploymentTarget")
        for table in "${key_tables[@]}"; do
            local exists
            exists=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" exec -T postgres psql -U molthub -d molthub -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');" -t 2>/dev/null | tr -d '[:space:]') || exists="f"
            if [ "$exists" = "t" ]; then
                log_ok "Table \"$table\" exists"
            else
                log_fail "Table \"$table\" missing"
                printf "         Fix: ${BOLD}cd packages/database && DATABASE_URL=postgresql://molthub:molthub@localhost:5432/molthub npx prisma db push${RESET}\n"
                all_ok=false
            fi
        done
    else
        log_skip "Skipping database checks (Docker/PostgreSQL not available)"
    fi

    # ── Check 3: API server ──
    log_step "API server"

    if port_in_use 4000; then
        log_ok "Port 4000 is occupied (API should be running)"

        if check_api; then
            log_ok "API responding at ${API_URL}"

            # Check health endpoint
            api_call GET "/health" > /dev/null || true
            if [ "$API_HTTP_CODE" = "200" ]; then
                log_ok "GET /health returned 200"
            else
                log_warn "GET /health returned HTTP $API_HTTP_CODE"
                if [ -n "$API_BODY" ]; then
                    printf "         Response: %s\n" "$(echo "$API_BODY" | head -c 200)"
                fi
            fi

            # Check onboarding templates
            api_call GET "/onboarding/templates" > /dev/null || true
            if [ "$API_HTTP_CODE" = "200" ]; then
                local template_count
                template_count=$(echo "$API_BODY" | grep -o '"id"' | wc -l)
                log_ok "GET /onboarding/templates returned $template_count templates"
            else
                log_warn "GET /onboarding/templates returned HTTP $API_HTTP_CODE"
            fi

            # Check onboarding status
            api_call GET "/onboarding/status" > /dev/null || true
            if [ "$API_HTTP_CODE" = "200" ]; then
                log_ok "GET /onboarding/status returned 200"
                log_debug "Response: $API_BODY"
            fi

            # Check bot instances endpoint
            api_call GET "/bot-instances" > /dev/null || true
            if [ "$API_HTTP_CODE" = "200" ]; then
                local bot_count
                bot_count=$(echo "$API_BODY" | grep -o '"id"' | wc -l)
                log_ok "GET /bot-instances returned $bot_count instances"
            else
                log_warn "GET /bot-instances returned HTTP $API_HTTP_CODE"
            fi
        else
            log_fail "Port 4000 is in use but API not responding"
            printf "         Something else may be using port 4000\n"
            all_ok=false
        fi
    else
        log_warn "API server not running (port 4000 free)"
        printf "         Start: ${BOLD}pnpm --filter @molthub/api dev${RESET}\n"
        all_ok=false
    fi

    # ── Check 4: Web UI ──
    log_step "Web UI"

    if port_in_use 3000; then
        log_ok "Port 3000 is occupied (Web UI should be running)"
        # Quick check
        local web_code
        web_code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000" 2>/dev/null) || web_code="0"
        if [ "$web_code" = "200" ] || [ "$web_code" = "304" ]; then
            log_ok "Web UI responding at http://localhost:3000"
        else
            log_warn "Web UI returned HTTP $web_code (may still be starting)"
        fi
    else
        log_warn "Web UI not running (port 3000 free)"
        printf "         Start: ${BOLD}pnpm --filter @molthub/web dev${RESET}\n"
        all_ok=false
    fi

    # ── Check 5: Dependencies ──
    log_step "Project dependencies"

    if [ -d "$PROJECT_ROOT/node_modules" ]; then
        log_ok "node_modules exists"
    else
        log_fail "node_modules missing"
        printf "         Fix: ${BOLD}pnpm install${RESET}\n"
        all_ok=false
    fi

    if [ -d "$PROJECT_ROOT/packages/database/node_modules/.prisma" ]; then
        log_ok "Prisma client generated"
    else
        log_warn "Prisma client may not be generated"
        printf "         Fix: ${BOLD}pnpm --filter @molthub/database db:generate${RESET}\n"
    fi

    # ── Check 6: Environment files ──
    log_step "Environment files"

    if [ -f "$PROJECT_ROOT/.env" ]; then
        log_ok "Root .env exists"
    else
        log_warn "Root .env missing"
        printf "         Fix: ${BOLD}cp .env.example .env${RESET}\n"
    fi

    if [ -f "$PROJECT_ROOT/apps/api/.env" ]; then
        log_ok "API .env exists"
        if grep -q "DATABASE_URL" "$PROJECT_ROOT/apps/api/.env"; then
            log_ok "API .env has DATABASE_URL"
        else
            log_fail "API .env missing DATABASE_URL"
            all_ok=false
        fi
        if grep -q "JWT_SECRET" "$PROJECT_ROOT/apps/api/.env"; then
            log_ok "API .env has JWT_SECRET"
        else
            log_fail "API .env missing JWT_SECRET"
            all_ok=false
        fi
    else
        log_fail "API .env missing"
        printf "         Fix: ${BOLD}bash scripts/setup.sh setup --no-start${RESET}\n"
        all_ok=false
    fi

    # ── Summary ──
    printf "\n"
    if $all_ok; then
        printf "  ${GREEN}${BOLD}All checks passed!${RESET}\n\n"
    else
        printf "  ${YELLOW}${BOLD}Some checks failed — see above for fixes.${RESET}\n\n"
    fi
}

# ═════════════════════════════════════════════════════════════════════════════
#  COMMAND: deploy
# ═════════════════════════════════════════════════════════════════════════════

cmd_deploy() {
    local bot_name=""
    local template_id="builtin-minimal-gateway"
    local deploy_type="docker"
    local show_help=false

    # Parse deploy-specific args
    while [[ ${#CMD_ARGS[@]} -gt 0 ]]; do
        case "${CMD_ARGS[0]}" in
            --name)
                bot_name="${CMD_ARGS[1]:-}"
                CMD_ARGS=("${CMD_ARGS[@]:2}")
                ;;
            --template)
                template_id="${CMD_ARGS[1]:-}"
                CMD_ARGS=("${CMD_ARGS[@]:2}")
                ;;
            --type)
                deploy_type="${CMD_ARGS[1]:-}"
                CMD_ARGS=("${CMD_ARGS[@]:2}")
                ;;
            --help)
                show_help=true
                CMD_ARGS=("${CMD_ARGS[@]:1}")
                ;;
            *)
                # If first positional arg and no --name used, treat as name
                if [ -z "$bot_name" ]; then
                    bot_name="${CMD_ARGS[0]}"
                fi
                CMD_ARGS=("${CMD_ARGS[@]:1}")
                ;;
        esac
    done

    if $show_help; then
        cat <<'EOF'

  Deploy a bot instance via the API (no UI needed)

  Usage:
    bash scripts/setup.sh deploy [OPTIONS] [BOT_NAME]

  Options:
    --name <name>          Bot name (default: auto-generated)
    --template <id>        Template ID (default: builtin-minimal-gateway)
    --type <docker|ecs>    Deployment target (default: docker)
    --help                 Show this help

  Available templates:
    builtin-minimal-gateway      Bare-bones API-only (default)
    builtin-coding-assistant     Coding assistant, no channels
    builtin-whatsapp-personal    WhatsApp personal bot
    builtin-telegram-bot         Telegram bot
    builtin-discord-server       Discord server bot
    builtin-slack-workspace      Slack workspace bot
    builtin-multi-channel        Multi-channel bot

  Examples:
    bash scripts/setup.sh deploy                          # Quick test deploy
    bash scripts/setup.sh deploy --name mybot             # Named bot
    bash scripts/setup.sh deploy --template builtin-telegram-bot
    bash scripts/setup.sh deploy --debug                  # See full API exchange

EOF
        return 0
    fi

    require_api

    # Auto-generate name if not provided
    if [ -z "$bot_name" ]; then
        bot_name="test-$(date +%s | tail -c 7)"
    fi

    STEP_COUNT=0

    # ── Step 1: Verify template ──
    log_step "Checking template: ${template_id}"

    local templates_body
    api_call GET "/onboarding/templates" > /dev/null || true
    local templates_body="$API_BODY"
    if [ "$API_HTTP_CODE" != "200" ]; then
        log_fail "Failed to fetch templates (HTTP $API_HTTP_CODE)"
        printf "  Response: %s\n" "$templates_body"
        exit 1
    fi

    if echo "$templates_body" | grep -q "\"$template_id\""; then
        log_ok "Template \"$template_id\" found"
    else
        log_fail "Template \"$template_id\" not found"
        printf "\n  Available templates:\n"
        echo "$templates_body" | grep -oP '"id":"[^"]+"|"name":"[^"]+"' | paste - - | while IFS= read -r line; do
            local tid tname
            tid=$(echo "$line" | grep -oP '"id":"[^"]+"' | cut -d'"' -f4)
            tname=$(echo "$line" | grep -oP '"name":"[^"]+"' | cut -d'"' -f4)
            printf "    %-35s %s\n" "$tid" "$tname"
        done
        printf "\n"
        exit 1
    fi

    # ── Step 2: Preview config ──
    log_step "Previewing configuration"

    local preview_body
    api_call POST "/onboarding/preview" "{\"templateId\":\"$template_id\"}" > /dev/null || true
    local preview_body="$API_BODY"
    if [ "$API_HTTP_CODE" = "200" ] || [ "$API_HTTP_CODE" = "201" ]; then
        log_ok "Config preview generated"
        if $FLAG_DEBUG; then
            printf "\n  ${DIM}Preview:${RESET}\n"
            echo "$preview_body" | pp_json | while IFS= read -r line; do printf "  ${DIM}  %s${RESET}\n" "$line"; done
            printf "\n"
        fi
    else
        log_warn "Preview failed (HTTP $API_HTTP_CODE) — proceeding anyway"
        log_debug "Response: $preview_body"
    fi

    # ── Step 3: Deploy ──
    log_step "Deploying bot: ${bot_name}"

    local deploy_payload
    deploy_payload=$(cat <<JSONEOF
{
  "botName": "$bot_name",
  "templateId": "$template_id",
  "deploymentTarget": {
    "type": "$deploy_type"
  }
}
JSONEOF
    )

    printf "\n"
    printf "  ${BOLD}Deployment config:${RESET}\n"
    printf "    Name:       ${CYAN}$bot_name${RESET}\n"
    printf "    Template:   ${CYAN}$template_id${RESET}\n"
    printf "    Target:     ${CYAN}$deploy_type${RESET}\n"
    printf "\n"

    local deploy_body
    api_call POST "/onboarding/deploy" "$deploy_payload" > /dev/null || true
    local deploy_body="$API_BODY"

    if [ "$API_HTTP_CODE" = "200" ] || [ "$API_HTTP_CODE" = "201" ]; then
        log_ok "Deploy request accepted"

        local instance_id
        instance_id=$(echo "$deploy_body" | grep -oP '"instanceId"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4)
        local fleet_id
        fleet_id=$(echo "$deploy_body" | grep -oP '"fleetId"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4)

        printf "\n"
        printf "  ${GREEN}${BOLD}Bot deployed successfully!${RESET}\n"
        printf "\n"
        printf "  ${BOLD}Instance ID:${RESET}  $instance_id\n"
        printf "  ${BOLD}Fleet ID:${RESET}     $fleet_id\n"
        printf "\n"
        printf "  ${BOLD}Next steps:${RESET}\n"
        printf "    Check status:  ${BOLD}bash scripts/setup.sh status $instance_id${RESET}\n"
        printf "    List all bots: ${BOLD}bash scripts/setup.sh list${RESET}\n"
        printf "    Delete bot:    ${BOLD}bash scripts/setup.sh destroy $instance_id${RESET}\n"
        printf "\n"

        # ── Step 4: Poll status ──
        log_step "Polling deployment status"

        local max_polls=10
        local poll=0
        while [ $poll -lt $max_polls ]; do
            sleep 2
            local status_body
            api_call GET "/onboarding/deploy/$instance_id/status" > /dev/null || true
            local status_body="$API_BODY"

            if [ "$API_HTTP_CODE" = "200" ]; then
                local bot_status
                bot_status=$(echo "$status_body" | grep -oP '"status"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4)
                local bot_health
                bot_health=$(echo "$status_body" | grep -oP '"health"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4)
                local bot_error
                bot_error=$(echo "$status_body" | grep -oP '"error"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4 || echo "")

                printf "\r  ${DIM}[....]${RESET}  Status: %-12s Health: %-10s" "$bot_status" "$bot_health"

                if [ "$bot_status" = "RUNNING" ]; then
                    printf "\n"
                    log_ok "Bot is RUNNING (health: $bot_health)"
                    break
                elif [ "$bot_status" = "ERROR" ] || [ "$bot_status" = "STOPPED" ]; then
                    printf "\n"
                    log_warn "Bot status: $bot_status"
                    if [ -n "$bot_error" ]; then
                        printf "  ${RED}Error: %s${RESET}\n" "$bot_error"
                    fi
                    # Show the steps breakdown
                    if $FLAG_DEBUG; then
                        printf "\n  ${DIM}Full status response:${RESET}\n"
                        echo "$status_body" | pp_json | while IFS= read -r line; do printf "  ${DIM}  %s${RESET}\n" "$line"; done
                    fi
                    break
                fi
            else
                log_debug "Status poll returned HTTP $API_HTTP_CODE"
            fi

            poll=$((poll + 1))
        done

        if [ $poll -eq $max_polls ]; then
            printf "\n"
            log_info "Still deploying... check later with:"
            printf "    ${BOLD}bash scripts/setup.sh status $instance_id${RESET}\n"
        fi

        printf "\n"

    elif [ "$API_HTTP_CODE" = "400" ]; then
        log_fail "Deploy rejected (HTTP 400)"
        printf "\n  ${RED}Error:${RESET} "
        echo "$deploy_body" | grep -oP '"message"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4
        printf "\n"
        exit 1

    else
        log_fail "Deploy failed (HTTP $API_HTTP_CODE)"
        printf "\n  ${RED}Response:${RESET}\n"
        echo "$deploy_body" | pp_json
        printf "\n"

        if [ "$API_HTTP_CODE" = "500" ]; then
            printf "  ${YELLOW}This is a server error. Debug with:${RESET}\n"
            printf "    1. Check API logs:  ${BOLD}bash scripts/setup.sh logs${RESET}\n"
            printf "    2. Run doctor:      ${BOLD}bash scripts/setup.sh doctor --debug${RESET}\n"
            printf "    3. Re-run deploy:   ${BOLD}bash scripts/setup.sh deploy --debug${RESET}\n"
            printf "\n"
            printf "  ${YELLOW}Common causes of 500 on deploy:${RESET}\n"
            printf "    - PostgreSQL is not running\n"
            printf "    - Database schema is out of date (run setup)\n"
            printf "    - Duplicate bot name (try a different --name)\n"
            printf "\n"
        fi
        exit 1
    fi
}

# ═════════════════════════════════════════════════════════════════════════════
#  COMMAND: status
# ═════════════════════════════════════════════════════════════════════════════

cmd_status() {
    local instance_id="${CMD_ARGS[0]:-}"

    if [ -z "$instance_id" ] || [ "$instance_id" = "--help" ]; then
        cat <<'EOF'

  Check deployment status of a bot instance

  Usage:
    bash scripts/setup.sh status <instance-id>

  Example:
    bash scripts/setup.sh status clx1abc2def3ghi4

EOF
        if [ "$instance_id" = "--help" ]; then
            return 0
        fi
        printf "  ${RED}Error: instance ID is required${RESET}\n\n"
        exit 1
    fi

    require_api

    STEP_COUNT=0
    log_step "Fetching status for $instance_id"

    # Try onboarding status endpoint first
    local status_body
    api_call GET "/onboarding/deploy/$instance_id/status" > /dev/null || true
    local status_body="$API_BODY"

    if [ "$API_HTTP_CODE" = "200" ]; then
        local bot_status
        bot_status=$(echo "$status_body" | grep -oP '"status"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4)
        local bot_health
        bot_health=$(echo "$status_body" | grep -oP '"health"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4)
        local bot_error
        bot_error=$(echo "$status_body" | grep -oP '"error"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4 || echo "")

        printf "\n"
        printf "  ${BOLD}Instance:${RESET}  $instance_id\n"
        printf "  ${BOLD}Status:${RESET}    $bot_status\n"
        printf "  ${BOLD}Health:${RESET}    $bot_health\n"
        if [ -n "$bot_error" ] && [ "$bot_error" != "null" ]; then
            printf "  ${BOLD}Error:${RESET}     ${RED}$bot_error${RESET}\n"
        fi

        # Print deployment steps
        printf "\n  ${BOLD}Deployment steps:${RESET}\n"
        # Parse steps from JSON array
        echo "$status_body" | grep -oP '"name"\s*:\s*"[^"]+"|"status"\s*:\s*"[^"]+"' | paste - - | while IFS= read -r line; do
            local step_name step_status
            step_name=$(echo "$line" | grep -oP '"name"\s*:\s*"[^"]+' | cut -d'"' -f4)
            step_status=$(echo "$line" | grep -oP '"status"\s*:\s*"[^"]+' | tail -1 | cut -d'"' -f4)

            case "$step_status" in
                completed)   printf "    ${GREEN}[done]${RESET}       %s\n" "$step_name" ;;
                in_progress) printf "    ${YELLOW}[running]${RESET}    %s\n" "$step_name" ;;
                pending)     printf "    ${DIM}[pending]${RESET}    %s\n" "$step_name" ;;
                *)           printf "    [%s]  %s\n" "$step_status" "$step_name" ;;
            esac
        done
        printf "\n"

    elif [ "$API_HTTP_CODE" = "400" ]; then
        log_fail "Instance not found: $instance_id"
        printf "  Check your instance ID with: ${BOLD}bash scripts/setup.sh list${RESET}\n\n"
        exit 1
    else
        log_fail "Failed to fetch status (HTTP $API_HTTP_CODE)"
        if [ -n "$status_body" ]; then
            printf "  Response: %s\n\n" "$status_body"
        fi
        exit 1
    fi

    # Also fetch the full bot instance details
    local detail_body
    api_call GET "/bot-instances/$instance_id" > /dev/null || true
    local detail_body="$API_BODY"
    if [ "$API_HTTP_CODE" = "200" ] && $FLAG_DEBUG; then
        printf "  ${DIM}Full instance details:${RESET}\n"
        echo "$detail_body" | pp_json | while IFS= read -r line; do printf "  ${DIM}  %s${RESET}\n" "$line"; done
        printf "\n"
    fi
}

# ═════════════════════════════════════════════════════════════════════════════
#  COMMAND: list
# ═════════════════════════════════════════════════════════════════════════════

cmd_list() {
    if [ "${CMD_ARGS[0]:-}" = "--help" ]; then
        cat <<'EOF'

  List all bot instances

  Usage:
    bash scripts/setup.sh list

EOF
        return 0
    fi

    require_api

    STEP_COUNT=0
    log_step "Fetching bot instances"

    local body
    api_call GET "/bot-instances" > /dev/null || true
    local body="$API_BODY"

    if [ "$API_HTTP_CODE" != "200" ]; then
        log_fail "Failed to list bots (HTTP $API_HTTP_CODE)"
        if [ -n "$body" ]; then
            printf "  Response: %s\n" "$body"
        fi
        exit 1
    fi

    # Check if empty
    if [ "$body" = "[]" ] || [ -z "$body" ]; then
        printf "\n  ${DIM}No bot instances found.${RESET}\n"
        printf "  Deploy one with: ${BOLD}bash scripts/setup.sh deploy${RESET}\n\n"
        return 0
    fi

    # Parse and display as table
    printf "\n"
    printf "  ${BOLD}%-28s %-20s %-12s %-12s %-20s${RESET}\n" "INSTANCE ID" "NAME" "STATUS" "HEALTH" "TEMPLATE"
    printf "  ${DIM}%-28s %-20s %-12s %-12s %-20s${RESET}\n" "----------------------------" "--------------------" "------------" "------------" "--------------------"

    # Extract fields from JSON array — each bot is on one "block"
    # Use a simple approach: grep all fields and paste them together
    local ids names statuses healths templates
    ids=$(echo "$body" | grep -oP '"id"\s*:\s*"[^"]+' | cut -d'"' -f4)
    names=$(echo "$body" | grep -oP '"name"\s*:\s*"[^"]+' | cut -d'"' -f4)
    statuses=$(echo "$body" | grep -oP '"status"\s*:\s*"[^"]+' | cut -d'"' -f4)
    healths=$(echo "$body" | grep -oP '"health"\s*:\s*"[^"]+' | cut -d'"' -f4)
    templates=$(echo "$body" | grep -oP '"templateId"\s*:\s*"[^"]*' | cut -d'"' -f4)

    paste <(echo "$ids") <(echo "$names") <(echo "$statuses") <(echo "$healths") <(echo "$templates") | while IFS=$'\t' read -r id name status health template; do
        local status_color="$RESET"
        case "$status" in
            RUNNING)  status_color="$GREEN" ;;
            CREATING|RECONCILING|PENDING) status_color="$YELLOW" ;;
            ERROR|STOPPED|DEGRADED) status_color="$RED" ;;
        esac

        local health_color="$RESET"
        case "$health" in
            HEALTHY)  health_color="$GREEN" ;;
            DEGRADED) health_color="$YELLOW" ;;
            UNHEALTHY) health_color="$RED" ;;
        esac

        printf "  %-28s %-20s ${status_color}%-12s${RESET} ${health_color}%-12s${RESET} %-20s\n" \
            "$id" "$name" "$status" "$health" "${template:-none}"
    done

    local count
    count=$(echo "$ids" | wc -l)
    printf "\n  ${DIM}$count instance(s) total${RESET}\n\n"
}

# ═════════════════════════════════════════════════════════════════════════════
#  COMMAND: destroy
# ═════════════════════════════════════════════════════════════════════════════

cmd_destroy() {
    local instance_id="${CMD_ARGS[0]:-}"

    if [ -z "$instance_id" ] || [ "$instance_id" = "--help" ]; then
        cat <<'EOF'

  Delete a bot instance

  Usage:
    bash scripts/setup.sh destroy <instance-id>

  Example:
    bash scripts/setup.sh destroy clx1abc2def3ghi4

EOF
        if [ "$instance_id" = "--help" ]; then
            return 0
        fi
        printf "  ${RED}Error: instance ID is required${RESET}\n\n"
        exit 1
    fi

    require_api

    STEP_COUNT=0
    log_step "Deleting instance $instance_id"

    # First, get the instance to confirm it exists
    local detail_body
    api_call GET "/bot-instances/$instance_id" > /dev/null || true
    local detail_body="$API_BODY"
    if [ "$API_HTTP_CODE" != "200" ]; then
        log_fail "Instance not found: $instance_id"
        printf "  Check your instance ID with: ${BOLD}bash scripts/setup.sh list${RESET}\n\n"
        exit 1
    fi

    local bot_name
    bot_name=$(echo "$detail_body" | grep -oP '"name"\s*:\s*"[^"]+' | head -1 | cut -d'"' -f4)
    log_info "Found bot: $bot_name ($instance_id)"

    # Delete it
    local delete_body
    api_call DELETE "/bot-instances/$instance_id" > /dev/null || true
    local delete_body="$API_BODY"

    if [ "$API_HTTP_CODE" = "200" ] || [ "$API_HTTP_CODE" = "204" ]; then
        log_ok "Deleted bot \"$bot_name\" ($instance_id)"
    else
        log_fail "Failed to delete (HTTP $API_HTTP_CODE)"
        if [ -n "$delete_body" ]; then
            printf "  Response: %s\n" "$delete_body"
        fi
        exit 1
    fi
    printf "\n"
}

# ═════════════════════════════════════════════════════════════════════════════
#  COMMAND: logs
# ═════════════════════════════════════════════════════════════════════════════

cmd_logs() {
    if [ "${CMD_ARGS[0]:-}" = "--help" ]; then
        cat <<'EOF'

  Tail API server process logs

  Usage:
    bash scripts/setup.sh logs

  This finds the running NestJS API process and tails its output.
  Press Ctrl+C to stop.

EOF
        return 0
    fi

    printf "\n  ${BOLD}Looking for API server process...${RESET}\n\n"

    # Find the NestJS process
    local api_pid
    api_pid=$(pgrep -f "node.*dist/src/main" 2>/dev/null | head -1) || true

    if [ -z "$api_pid" ]; then
        api_pid=$(pgrep -f "nest start" 2>/dev/null | head -1) || true
    fi

    if [ -z "$api_pid" ]; then
        log_fail "API server process not found"
        printf "  Start the API first: ${BOLD}pnpm --filter @molthub/api dev${RESET}\n\n"
        exit 1
    fi

    log_ok "Found API process (PID: $api_pid)"
    printf "\n  ${DIM}Note: Only new output will appear. If nothing shows, trigger an API call.${RESET}\n"
    printf "  ${DIM}Press Ctrl+C to stop.${RESET}\n\n"

    # Try to tail the process output via /proc/fd (Linux)
    if [ -r "/proc/$api_pid/fd/1" ]; then
        tail -f "/proc/$api_pid/fd/1" "/proc/$api_pid/fd/2" 2>/dev/null
    else
        printf "  ${YELLOW}Cannot access process output directly.${RESET}\n"
        printf "  ${YELLOW}Run the API in the foreground to see logs:${RESET}\n"
        printf "    ${BOLD}pnpm --filter @molthub/api dev${RESET}\n\n"
    fi
}

# ═════════════════════════════════════════════════════════════════════════════
#  COMMAND: setup (original full setup flow)
# ═════════════════════════════════════════════════════════════════════════════

cmd_setup() {
    STEP_COUNT=0

    if $FLAG_DEBUG; then
        log_debug "Project root: $PROJECT_ROOT"
        log_debug "OS: $(uname -s) $(uname -r)"
        log_debug "Shell: $BASH_VERSION"
        log_debug "WSL: $(is_wsl && echo 'yes' || echo 'no')"
    fi

    check_prerequisites
    setup_env_files
    start_postgres
    start_gateway
    install_deps
    setup_database
    build_packages
    check_dev_ports
    start_dev_servers
}

# ─── Setup substeps (unchanged) ─────────────────────────────────────────────

check_prerequisites() {
    log_step "Checking prerequisites"
    PREREQ_FAILED=false

    # Git
    if has_cmd git; then
        local git_ver
        git_ver=$(git --version 2>/dev/null | head -1)
        log_ok "git ($git_ver)"
        log_debug "Path: $(which git)"
    else
        log_fail "git is not installed"
        printf "         Install: ${BOLD}https://git-scm.com/downloads${RESET}\n"
        PREREQ_FAILED=true
    fi

    # Node.js >= 18
    if has_cmd node; then
        local node_ver
        node_ver=$(node --version 2>/dev/null)
        local node_major
        node_major=$(parse_major_version "$node_ver")
        log_debug "Node version: $node_ver (major: $node_major)"
        if [ "$node_major" -ge 18 ] 2>/dev/null; then
            log_ok "node $node_ver"
        else
            log_fail "node $node_ver (need >= 18)"
            printf "         Upgrade: ${BOLD}nvm install 18${RESET} or download from ${BOLD}https://nodejs.org${RESET}\n"
            PREREQ_FAILED=true
        fi
    else
        log_fail "node is not installed (need >= 18)"
        printf "         Install: ${BOLD}https://nodejs.org${RESET} or ${BOLD}nvm install 18${RESET}\n"
        PREREQ_FAILED=true
    fi

    # pnpm
    if has_cmd pnpm; then
        local pnpm_ver
        pnpm_ver=$(pnpm --version 2>/dev/null)
        log_ok "pnpm $pnpm_ver"
        log_debug "Path: $(which pnpm)"
    else
        log_fail "pnpm is not installed"
        printf "         Install: ${BOLD}npm install -g pnpm@8.15.0${RESET}\n"
        printf "         Or:      ${BOLD}corepack enable && corepack prepare pnpm@8.15.0 --activate${RESET}\n"
        PREREQ_FAILED=true
    fi

    # Docker — use `docker --version` as the real check since WSL may have
    # a shim that makes `command -v docker` succeed but the binary still fails
    local docker_ver
    if docker_ver=$(docker --version 2>/dev/null); then
        log_debug "$docker_ver"

        # Check if Docker daemon is running
        if docker info &>/dev/null; then
            log_ok "docker (daemon running)"
        else
            log_fail "docker is installed but the daemon is not running"
            if is_wsl; then
                printf "         Open Docker Desktop and enable WSL integration:\n"
                printf "         ${BOLD}Docker Desktop > Settings > Resources > WSL Integration${RESET}\n"
            else
                printf "         Start Docker: ${BOLD}sudo systemctl start docker${RESET}\n"
                printf "         Or open ${BOLD}Docker Desktop${RESET}\n"
            fi
            PREREQ_FAILED=true
        fi
    else
        log_fail "docker is not installed or not working"
        if is_wsl; then
            printf "         Install Docker Desktop and enable WSL integration:\n"
            printf "         ${BOLD}https://docs.docker.com/desktop/wsl/${RESET}\n"
        else
            printf "         Install: ${BOLD}https://docs.docker.com/get-docker/${RESET}\n"
        fi
        PREREQ_FAILED=true
    fi

    # Docker Compose (only check if Docker itself works)
    if ! $PREREQ_FAILED || docker --version &>/dev/null; then
        if docker compose version &>/dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
            local compose_ver
            compose_ver=$(docker compose version --short 2>/dev/null || docker compose version 2>/dev/null)
            log_ok "docker compose ($compose_ver)"
        elif docker-compose --version &>/dev/null 2>&1; then
            COMPOSE_CMD="docker-compose"
            local compose_ver
            compose_ver=$(docker-compose --version 2>/dev/null | head -1)
            log_ok "docker-compose ($compose_ver)"
        else
            log_fail "docker compose is not available"
            printf "         Install: ${BOLD}https://docs.docker.com/compose/install/${RESET}\n"
            PREREQ_FAILED=true
        fi
    else
        log_fail "docker compose (skipped — docker not working)"
        PREREQ_FAILED=true
    fi

    if $PREREQ_FAILED; then
        printf "\n  ${RED}${BOLD}Fix the issues above and re-run this script.${RESET}\n\n"
        exit 1
    fi
}

setup_env_files() {
    log_step "Setting up environment files"

    # Root .env
    if [ -f "$PROJECT_ROOT/.env" ]; then
        log_skip "Root .env already exists"
        if ! grep -q "DATABASE_URL" "$PROJECT_ROOT/.env"; then
            log_warn "Root .env is missing DATABASE_URL"
        fi
    else
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
            log_ok "Created .env from .env.example"
        else
            log_warn "No .env.example found, creating minimal .env"
            cat > "$PROJECT_ROOT/.env" <<'ENVEOF'
DATABASE_URL=postgresql://molthub:molthub@localhost:5432/molthub
API_URL=http://localhost:4000
PORT=4000
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
ENVEOF
            log_ok "Created minimal .env"
        fi
    fi

    # API .env
    if [ -f "$PROJECT_ROOT/apps/api/.env" ]; then
        log_skip "API .env already exists"
        local missing_keys=""
        if ! grep -q "DATABASE_URL" "$PROJECT_ROOT/apps/api/.env"; then
            missing_keys="${missing_keys} DATABASE_URL"
        fi
        if ! grep -q "JWT_SECRET" "$PROJECT_ROOT/apps/api/.env"; then
            missing_keys="${missing_keys} JWT_SECRET"
        fi
        if [ -n "$missing_keys" ]; then
            log_warn "API .env is missing:${missing_keys}"
            printf "         Check ${BOLD}apps/api/.env.example${RESET} for reference\n"
        fi
    else
        cat > "$PROJECT_ROOT/apps/api/.env" <<'ENVEOF'
DATABASE_URL=postgresql://molthub:molthub@localhost:5432/molthub
JWT_SECRET=molthub-dev-jwt-secret-change-in-production-min32chars
PORT=4000
DEFAULT_DEPLOYMENT_TARGET=docker
ENVEOF
        log_ok "Created apps/api/.env with dev defaults"
    fi

    # Ensure DEFAULT_DEPLOYMENT_TARGET is set in existing API .env
    if [ -f "$PROJECT_ROOT/apps/api/.env" ] && ! grep -q "DEFAULT_DEPLOYMENT_TARGET" "$PROJECT_ROOT/apps/api/.env"; then
        echo "DEFAULT_DEPLOYMENT_TARGET=docker" >> "$PROJECT_ROOT/apps/api/.env"
        log_ok "Added DEFAULT_DEPLOYMENT_TARGET=docker to API .env"
    fi
}

start_postgres() {
    log_step "Starting PostgreSQL"

    if port_in_use 5432; then
        local container_id
        container_id=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" ps -q postgres 2>/dev/null || echo "")

        if [ -n "$container_id" ]; then
            local container_status
            container_status=$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || echo "unknown")
            log_debug "Existing postgres container: $container_id (status: $container_status)"

            if [ "$container_status" = "running" ]; then
                if $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" exec -T postgres pg_isready -U molthub &>/dev/null; then
                    log_skip "PostgreSQL is already running and healthy"
                    return 0
                else
                    log_info "PostgreSQL container running but not ready, waiting..."
                fi
            else
                log_info "PostgreSQL container exists but not running, starting..."
                $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" up -d postgres
            fi
        else
            log_warn "Port 5432 is in use by another process (not our Docker container)"
            printf "         Either stop that process or change the port in docker-compose.yml\n"
            if has_cmd ss; then
                log_debug "Port 5432 usage: $(ss -tlnp 2>/dev/null | grep ':5432 ')"
            fi
            printf "\n  ${RED}Cannot proceed without PostgreSQL on port 5432.${RESET}\n\n"
            exit 1
        fi
    else
        log_info "Starting PostgreSQL container..."
        $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" up -d postgres 2>&1 | while IFS= read -r line; do log_debug "$line"; done || true

        local container_id
        container_id=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" ps -q postgres 2>/dev/null || echo "")
        if [ -z "$container_id" ]; then
            log_fail "Failed to start PostgreSQL container"
            printf "\n  ${DIM}Docker Compose logs:${RESET}\n"
            $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" logs postgres 2>&1 | tail -20
            exit 1
        fi
    fi

    local max_attempts=30
    local attempt=0
    log_info "Waiting for PostgreSQL to accept connections..."
    while [ $attempt -lt $max_attempts ]; do
        if $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" exec -T postgres pg_isready -U molthub &>/dev/null; then
            log_ok "PostgreSQL is ready (took ~${attempt}s)"
            return 0
        fi
        attempt=$((attempt + 1))
        log_debug "Attempt $attempt/$max_attempts..."
        sleep 1
    done

    log_fail "PostgreSQL did not become ready after ${max_attempts}s"
    printf "\n  ${DIM}Docker Compose logs:${RESET}\n"
    $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" logs --tail=30 postgres 2>&1
    printf "\n  ${YELLOW}Try: ${BOLD}$COMPOSE_CMD down && $COMPOSE_CMD up -d postgres${RESET}\n\n"
    exit 1
}

start_gateway() {
    log_step "Starting OpenClaw Gateway"

    # Check if gateway is already running
    if port_in_use 18789; then
        local gw_container
        gw_container=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" ps -q gateway 2>/dev/null || echo "")
        if [ -n "$gw_container" ]; then
            local gw_status
            gw_status=$(docker inspect -f '{{.State.Status}}' "$gw_container" 2>/dev/null || echo "unknown")
            if [ "$gw_status" = "running" ]; then
                log_skip "Gateway is already running on port 18789"
                return 0
            fi
        else
            log_skip "Port 18789 already in use (gateway may be running locally)"
            return 0
        fi
    fi

    log_info "Starting Gateway container..."
    $COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" up -d gateway 2>&1 | while IFS= read -r line; do log_debug "$line"; done || true

    local gw_container
    gw_container=$($COMPOSE_CMD -f "$PROJECT_ROOT/docker-compose.yml" ps -q gateway 2>/dev/null || echo "")
    if [ -z "$gw_container" ]; then
        log_warn "Gateway container did not start (non-fatal — you can start it later)"
        printf "         Start manually: ${BOLD}$COMPOSE_CMD -f $PROJECT_ROOT/docker-compose.yml up -d gateway${RESET}\n"
        return 0
    fi

    # Wait for gateway to be ready (non-blocking — don't fail setup if gateway is slow)
    local max_attempts=15
    local attempt=0
    log_info "Waiting for Gateway to be ready on port 18789..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf -o /dev/null --max-time 2 "http://localhost:18789" 2>/dev/null; then
            log_ok "Gateway is ready (took ~${attempt}s)"
            return 0
        fi
        attempt=$((attempt + 1))
        log_debug "Gateway attempt $attempt/$max_attempts..."
        sleep 2
    done

    log_warn "Gateway not ready after ${max_attempts} attempts (non-fatal)"
    printf "         Check logs: ${BOLD}$COMPOSE_CMD -f $PROJECT_ROOT/docker-compose.yml logs gateway${RESET}\n"
}

install_deps() {
    log_step "Installing dependencies"

    if [ -d "$PROJECT_ROOT/node_modules" ] && ! $FLAG_FORCE; then
        log_skip "Dependencies already installed (use --force to reinstall)"
        return 0
    fi

    if $FLAG_FORCE && [ -d "$PROJECT_ROOT/node_modules" ]; then
        log_info "Force mode: reinstalling dependencies..."
    fi

    run_cmd "pnpm install" pnpm install --dir "$PROJECT_ROOT"
}

setup_database() {
    log_step "Setting up database"

    local db_url
    if [ -f "$PROJECT_ROOT/apps/api/.env" ]; then
        db_url=$(grep '^DATABASE_URL=' "$PROJECT_ROOT/apps/api/.env" | cut -d'=' -f2-)
    fi
    db_url="${db_url:-postgresql://molthub:molthub@localhost:5432/molthub}"
    log_debug "DATABASE_URL=${db_url%%@*}@***"

    export DATABASE_URL="$db_url"

    run_cmd "Generating Prisma client" pnpm --filter @molthub/database db:generate --dir "$PROJECT_ROOT"

    log_info "Pushing database schema..."
    log_debug "Running: npx prisma db push --skip-generate (in packages/database)"

    local output
    local exit_code=0
    if $FLAG_DEBUG; then
        (cd "$PROJECT_ROOT/packages/database" && npx prisma db push --skip-generate 2>&1) | while IFS= read -r line; do printf "  ${DIM}  | %s${RESET}\n" "$line"; done
        exit_code=${PIPESTATUS[0]:-0}
    else
        output=$( (cd "$PROJECT_ROOT/packages/database" && npx prisma db push --skip-generate 2>&1) ) || exit_code=$?
    fi

    if [ $exit_code -ne 0 ]; then
        log_fail "Database schema push failed"
        if [ -n "${output:-}" ]; then
            printf "\n%s\n\n" "$output"
        fi
        printf "  ${YELLOW}Try: ${BOLD}cd packages/database && npx prisma migrate reset${RESET} (WARNING: drops all data)\n"
        printf "  ${YELLOW}Or re-run with: ${BOLD}bash scripts/setup.sh --debug${RESET}\n\n"
        exit 1
    fi

    log_ok "Database schema is up to date"
}

build_packages() {
    log_step "Building packages"

    run_cmd "Building all packages (turbo)" pnpm build --dir "$PROJECT_ROOT"
}

check_dev_ports() {
    log_step "Checking dev server ports"

    local has_conflict=false

    if port_in_use 4000; then
        log_warn "Port 4000 is already in use (API)"
        printf "         The API server may fail to start. Kill the process or change PORT in apps/api/.env\n"
        has_conflict=true
    else
        log_ok "Port 4000 is available (API)"
    fi

    if port_in_use 3000; then
        log_warn "Port 3000 is already in use (Web)"
        printf "         The web server may fail to start. Kill the process using port 3000\n"
        has_conflict=true
    else
        log_ok "Port 3000 is available (Web)"
    fi

    if $has_conflict; then
        log_info "Port conflicts detected but continuing — servers will report errors if ports are busy"
    fi
}

start_dev_servers() {
    log_step "Ready to launch"

    printf "\n"
    printf "  ${GREEN}${BOLD}Setup complete!${RESET}\n"
    printf "\n"
    printf "  ${BOLD}Services:${RESET}\n"
    printf "    PostgreSQL   ${DIM}postgresql://localhost:5432/molthub${RESET}\n"
    printf "    Gateway      ${DIM}ws://localhost:18789${RESET}\n"
    printf "    API          ${DIM}http://localhost:4000${RESET}\n"
    printf "    Web UI       ${DIM}http://localhost:3000${RESET}\n"
    printf "    API Docs     ${DIM}http://localhost:4000/api/docs${RESET}\n"
    printf "\n"

    if $FLAG_NO_START; then
        printf "  ${BOLD}To start development servers:${RESET}\n"
        printf "\n"
        printf "    ${BOLD}pnpm dev${RESET}                           # Both API + Web\n"
        printf "    ${BOLD}pnpm --filter @molthub/api dev${RESET}     # API only\n"
        printf "    ${BOLD}pnpm --filter @molthub/web dev${RESET}     # Web only\n"
        printf "\n"
        printf "  ${BOLD}Then test deployment:${RESET}\n"
        printf "    ${BOLD}bash scripts/setup.sh doctor${RESET}       # Verify everything works\n"
        printf "    ${BOLD}bash scripts/setup.sh deploy${RESET}       # Deploy a test bot\n"
        printf "\n"
        return 0
    fi

    printf "  Starting API + Web dev servers...\n"
    printf "  ${DIM}Press Ctrl+C to stop${RESET}\n"
    printf "\n"

    cd "$PROJECT_ROOT"
    exec pnpm dev
}

# ─── Main Router ─────────────────────────────────────────────────────────────

main() {
    cd "$PROJECT_ROOT"

    case "$COMMAND" in
        setup)   cmd_setup ;;
        doctor)  cmd_doctor ;;
        deploy)  cmd_deploy ;;
        status)  cmd_status ;;
        list)    cmd_list ;;
        destroy) cmd_destroy ;;
        logs)    cmd_logs ;;
        *)
            printf "${RED}Unknown command: %s${RESET}\n" "$COMMAND"
            print_usage
            exit 1
            ;;
    esac
}

# ─── Entry Point ─────────────────────────────────────────────────────────────

parse_args "$@"
print_banner
main
