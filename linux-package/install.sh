#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo "    Pi Coding Suite - Linux Installer"
echo "=================================================="

# 1. Determine install prefix: /usr/local if root, or ~/.local if non-root
if [ "$(id -u)" -eq 0 ]; then
    INSTALL_PREFIX="${INSTALL_PREFIX:-/usr/local}"
else
    INSTALL_PREFIX="${INSTALL_PREFIX:-$HOME/.local}"
fi

BIN_DIR="$INSTALL_PREFIX/bin"
LIB_DIR="$INSTALL_PREFIX/lib/pi-agent"

echo "[1/4] Preparing directories..."
echo "  -> Target binary directory:  $BIN_DIR"
echo "  -> Target library directory: $LIB_DIR"

mkdir -p "$BIN_DIR"
mkdir -p "$LIB_DIR"

echo "[2/4] Installing Pi Terminal Coding Agent..."
if [ -d "$SCRIPT_DIR/lib" ]; then
    echo "  -> Copying agent bundle files..."
    cp -rL "$SCRIPT_DIR/lib/"* "$LIB_DIR/"
else
    echo "  [!] Warning: Source lib directory not found at $SCRIPT_DIR/lib" >&2
fi

# Create launcher executable
cat << 'LAUNCHER' > "$BIN_DIR/pi"
#!/usr/bin/env bash
PI_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib/pi-agent" && pwd)"

if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js (>= 22) is required to run pi." >&2
    exit 1
fi

exec node "$PI_LIB_DIR/cli.js" "$@"
LAUNCHER

chmod +x "$BIN_DIR/pi"
chmod +x "$LIB_DIR/cli.js" 2>/dev/null || true

# Global symlink if running as root or /usr/local/bin is writable
if [ -w /usr/local/bin ] && [ "$BIN_DIR" != "/usr/local/bin" ]; then
    ln -sf "$BIN_DIR/pi" /usr/local/bin/pi 2>/dev/null && echo "  -> Created global symlink: /usr/local/bin/pi" || true
fi

echo "  -> Terminal coding agent installed at: $BIN_DIR/pi"

# Verify node and agent version
if command -v node >/dev/null 2>&1; then
    if [ -f "$LIB_DIR/cli.js" ]; then
        AGENT_VERSION=$(node "$LIB_DIR/cli.js" --version 2>/dev/null || echo "installed")
        echo "  -> Pi agent verification: version $AGENT_VERSION"
    fi
else
    echo "  [!] Warning: Node.js (>= 22) is required but not found in PATH." >&2
fi

# Check PATH and update rc files if needed
if [[ ":$PATH:" != *":$BIN_DIR:"* ]] && ! command -v pi >/dev/null 2>&1; then
    echo "  [!] Notice: $BIN_DIR is not yet in your current shell's PATH."
    if [ -f "$HOME/.bashrc" ] && ! grep -q '\.local/bin' "$HOME/.bashrc"; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
        echo "  [+] Added '$HOME/.local/bin' to $HOME/.bashrc"
    fi
    if [ -f "$HOME/.zshrc" ] && ! grep -q '\.local/bin' "$HOME/.zshrc"; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
        echo "  [+] Added '$HOME/.local/bin' to $HOME/.zshrc"
    fi
    echo "  [!] To use 'pi' immediately in this terminal session, run:"
    echo "      export PATH=\"$BIN_DIR:\$PATH\""
else
    echo "  -> 'pi' command is available in PATH."
fi

# Initialize ~/.pi/agent/models.json template if not present
PI_AGENT_DIR="$HOME/.pi/agent"
mkdir -p "$PI_AGENT_DIR"
if [ ! -f "$PI_AGENT_DIR/models.json" ]; then
    cat << 'MODEL_CONF' > "$PI_AGENT_DIR/models.json"
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        
      ]
    }
  }
}
MODEL_CONF
    echo "  -> Initialized default models template: $PI_AGENT_DIR/models.json"
fi

# 3. Check VS Code and install extension
echo "[3/4] Checking VS Code environment..."
if command -v code >/dev/null 2>&1; then
    echo "  -> VS Code detected: $(command -v code)"

    # Find VSIX package in script directory
    VSIX_FILE=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.vsix" | head -n 1)

    if [ -n "$VSIX_FILE" ] && [ -f "$VSIX_FILE" ]; then
        echo "  -> Removing existing conflicting extensions..."
        for ext in GitHub.copilot GitHub.copilot-chat ms-vscode.vscode-websearchforcopilot clockzinc.pi-vscode-ui zenteiq.pi-vscode-ui zenteiq.ziq-vscode-ui; do
            if code --list-extensions 2>/dev/null | grep -iq "^${ext}$"; then
                echo "     Uninstalling conflicting extension: $ext..."
                code --uninstall-extension "$ext" 2>&1 || true
            fi
        done

        echo "  -> Installing latest Pi Coding Assistant extension ($(basename "$VSIX_FILE"))..."
        code --install-extension "$VSIX_FILE" --force

        echo "  -> Installed Pi extension verification:"
        code --list-extensions 2>/dev/null | grep -iE "(ziq|pi-vscode)" || echo "     zenteiq.ziq-vscode-ui installed."
    else
        echo "  [!] No .vsix file found in $SCRIPT_DIR"
    fi
else
    echo "  [!] VS Code CLI ('code') not found in PATH. Skipping VS Code extension installation."
    echo "      You can manually install the extension via: code --install-extension <path-to-vsix>"
fi

echo "[4/4] Installation Complete!"
echo "=================================================="
echo "Next Steps:"
echo " 1. If 'pi' is not recognized in your current shell, reload your shell or run:"
echo "    export PATH=\"$BIN_DIR:\$PATH\""
echo " 2. In VS Code, reload the window to load the new extension:"
echo "    Ctrl+Shift+P -> 'Developer: Reload Window'"
echo "=================================================="
