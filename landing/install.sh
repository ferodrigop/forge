#!/bin/sh
# Forge installer — downloads the latest standalone binary from GitHub Releases.
# Usage: curl -fsSL https://forgemcp.dev/install.sh | sh
set -e

REPO="ferodrigop/forge"
INSTALL_DIR="${FORGE_INSTALL_DIR:-$HOME/.local/bin}"

# Detect OS
OS=$(uname -s)
case "$OS" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *)
    echo "Error: Unsupported OS: $OS" >&2
    echo "Forge binaries are available for macOS and Linux." >&2
    exit 1
    ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

BINARY="forge-${os}-${arch}"

# Get latest release tag
echo "Fetching latest Forge release..."
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [ -z "$TAG" ]; then
  echo "Error: Could not determine latest release." >&2
  echo "Check https://github.com/${REPO}/releases" >&2
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${BINARY}"

echo "Downloading Forge ${TAG} (${os}-${arch})..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" -o "${INSTALL_DIR}/forge"
chmod +x "${INSTALL_DIR}/forge"

# Verify
VERSION=$("${INSTALL_DIR}/forge" --version 2>/dev/null || echo "unknown")

echo ""
echo "Forge installed successfully!"
echo "  Binary:  ${INSTALL_DIR}/forge"
echo "  Version: ${VERSION}"
echo ""

# Check if install dir is in PATH
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo "Add ${INSTALL_DIR} to your PATH:"
    echo ""
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo ""
    echo "Add this to your ~/.bashrc or ~/.zshrc to make it permanent."
    ;;
esac
