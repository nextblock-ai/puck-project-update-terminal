```
# VSCode Extension

This extension provides an interface to interact with a code enhancement and bug fix agent. It allows users to ask questions and receive suggestions for code changes directly within their editor.

## Features

- Terminal interface for interacting with the agent.
- Animated progress bar during processing.
- Support for managing project files and settings.
- Auto-update code based on agent suggestions (toggleable).

## Usage

1. Install the extension in VSCode.
2. Open the command palette (Ctrl+Shift+P) and search for "Project Source Code update agent".
3. Select the command to open the terminal interface.
4. Type your questions or requests in the terminal, and the agent will provide suggestions for code updates.
5. Use the various commands available in the terminal to manage the project files and settings.

## Commands

- `clear` - Clear the terminal.
- `reset` - Reset the conversation with the agent.
- `open` - Set file buffer to open VSCode files.
- `all` - Reset the project files to all files.
- `list` - List all project files.
- `summary` - Show summary information.
- `load <path>` - Load a project from a different path.
- `add <path>` - Add a file or directory to the project.
- `addopen` - Add all open files to the project.
- `remove <path>` - Remove a file from the project.
- `tokens <num>` - Set the number of tokens to generate.
- `*` - Toggle auto-updates.
- `help` - Show help.

## Requirements

- VSCode 1.60.0 or later.

## Known Issues

- None.

## Release Notes

### 1.0.0

Initial release of the extension.