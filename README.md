# LLM-Rename VS Code Extension

## Overview
This is still wip pending integration and prompt testing.

LLM-Rename is a Visual Studio Code extension designed to provide renaming suggestions for symbols in your code by leveraging a language model. The extension analyzes your code context to suggest names that follow best practices.

## Features
- Inline renaming suggestions displayed directly in the editor.
- QuickPick menu for selecting a suggested rename.
- Integration with an OpenAI endpoint for generating suggestions.
- Configurable endpoint and API key.

## Usage
1. Install the extension.
2. Open your project in VS Code.
3. Place the cursor on a symbol you want to rename.
4. Trigger the renaming command to view suggestions.
5. Select a suggestion to apply the rename.

## Configuration
Configure the extension settings in VS Code (e.g., in settings.json):
```json
{
  "llmRename.endpoint": "https://api.openai.com/v1/engines/your-engine/completions",
  "llmRename.apiKey": "your-api-key"
}
```

## Development
- Clone the repository.
- Run npm install to install dependencies.
- Launch the extension using VS Code's debugger.
- Refer to `/c:/projects/o3-rename/llm-rename/src/extension.ts` for implementation details.

## License
This project is licensed under the MIT License.
