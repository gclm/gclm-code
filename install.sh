#!/usr/bin/env bash
set -euo pipefail

# Gclm Code source installer (optional path)
# Recommended install: npm i -g @gclm/gclm-code

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

REPO="${GCLM_REPO_URL:-https://github.com/gclm/gclm-code.git}"
INSTALL_DIR="${GCLM_INSTALL_DIR:-$HOME/gclm-code}"
BUN_MIN_VERSION="1.3.11"

info()  { printf "${CYAN}[*]${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}[+]${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}[!]${RESET} %s\n" "$*"; }
fail()  { printf "${RED}[x]${RESET} %s\n" "$*"; exit 1; }

header() {
  echo ""
  printf "${BOLD}${CYAN}"
  cat << 'ART'
   ____      _                ____          _
  / ___| ___| |_ __ ___      / ___|___   __| | ___
 | |  _ / __| | '_ ` _ \____| |   / _ \ / _` |/ _ \
 | |_| | (__| | | | | | |____| |__| (_) | (_| |  __/
  \____|\___|_|_| |_| |_|     \____\___/ \__,_|\___|

ART
  printf "${RESET}"
  printf "${DIM}  Gclm Code source installer${RESET}\n"
  printf "${DIM}  Recommended: npm i -g @gclm/gclm-code${RESET}\n"
  echo ""
}

check_os() {
  case "$(uname -s)" in
    Darwin) OS="macos" ;;
    Linux)  OS="linux" ;;
    *)      fail "Unsupported OS: $(uname -s). macOS or Linux required." ;;
  esac
  ok "OS: $(uname -s) $(uname -m)"
}

check_git() {
  if ! command -v git &>/dev/null; then
    fail "git is not installed. Install it first."
  fi
  ok "git: $(git --version | head -1)"
}

version_gte() {
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]
}

check_bun() {
  if command -v bun &>/dev/null; then
    local ver
    ver="$(bun --version 2>/dev/null || echo "0.0.0")"
    if version_gte "$ver" "$BUN_MIN_VERSION"; then
      ok "bun: v${ver}"
      return
    fi
    warn "bun v${ver} found but v${BUN_MIN_VERSION}+ required. Upgrading..."
  else
    info "bun not found. Installing..."
  fi
  install_bun
}

install_bun() {
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun &>/dev/null; then
    fail "bun installation succeeded but binary not found on PATH. Add ~/.bun/bin to PATH."
  fi
  ok "bun: v$(bun --version) (just installed)"
}

clone_repo() {
  if [ -d "$INSTALL_DIR" ]; then
    warn "$INSTALL_DIR already exists"
    if [ -d "$INSTALL_DIR/.git" ]; then
      info "Pulling latest changes..."
      git -C "$INSTALL_DIR" pull --ff-only origin main 2>/dev/null || warn "Pull failed, continuing with existing copy"
    fi
  else
    info "Cloning repository..."
    git clone --depth 1 "$REPO" "$INSTALL_DIR"
  fi
  ok "Source: $INSTALL_DIR"
}

install_deps() {
  info "Installing dependencies..."
  cd "$INSTALL_DIR"
  bun install --frozen-lockfile 2>/dev/null || bun install
  ok "Dependencies installed"
}

build_binary() {
  info "Building Gclm Code..."
  cd "$INSTALL_DIR"
  bun run build
  ok "Binary built: $INSTALL_DIR/cli"
}

link_binary() {
  local link_dir="$HOME/.local/bin"
  mkdir -p "$link_dir"

  ln -sf "$INSTALL_DIR/cli" "$link_dir/gc"
  ln -sf "$INSTALL_DIR/cli" "$link_dir/claude"
  ok "Symlinked: $link_dir/gc and $link_dir/claude"

  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$link_dir"; then
    warn "$link_dir is not on your PATH"
    printf "${YELLOW}Add to shell profile:${RESET}\n"
    printf "${BOLD}  export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}\n"
  fi
}

header
info "Starting source installation..."

check_os
check_git
check_bun

clone_repo
install_deps
build_binary
link_binary

echo ""
printf "${GREEN}${BOLD}Installation complete!${RESET}\n"
printf "${BOLD}Run:${RESET} ${CYAN}gc${RESET} or ${CYAN}claude${RESET}\n"
printf "${DIM}Source: $INSTALL_DIR${RESET}\n"
printf "${DIM}Binary: $INSTALL_DIR/cli${RESET}\n"
printf "${DIM}Links: ~/.local/bin/gc, ~/.local/bin/claude${RESET}\n"
