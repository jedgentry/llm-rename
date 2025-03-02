// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as tiktoken from 'tiktoken';

// Output channel for log messages.
const outputChannel = vscode.window.createOutputChannel("LLM Rename");
const goal = `I want a list of suggestions to rename the symbol`;

const returnAndWarnings = `to follow best practices in readability. 

The list should be separated on a new line and organized from the best fitting rename to the worst fitting rename. 
Keep your results at 5 suggestions max.

You must infer what best practices would be based on the context provided below. That would include based on 
programming names and up to date libraries in addition to the context given. You are given the complete context of 
this symbol. If you are not confident return only one answer that is the same as the symbol name given to you. If you 
are given function arguments in addition to the symbol only rename the symbol.

The following is additional context to help you rename:

`;

// New function that reads only the text within the given range in each location.
async function getContentFromLocations(locations: vscode.Location[]): Promise<string[]> {
    const contentPromises = locations.map(async (location) => {
        const document = await vscode.workspace.openTextDocument(location.uri);
        // Get the text only within the specified range.
        return document.getText(location.range);
    });

    return Promise.all(contentPromises);
}

// Updated getEnclosingFunction to accept a vscode.Location.
async function getEnclosingFunction(
    location: vscode.Location
): Promise<vscode.DocumentSymbol | undefined> {
    // Open the document using the uri from the location.
    const document = await vscode.workspace.openTextDocument(location.uri);
    // Use the start of the range for the lookup.
    const position = location.range.start;

    // Retrieve all symbols in the document.
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    );
    if (!symbols) {
        return undefined;
    }

    // Recursively search symbols for the enclosing function or method.
    const findEnclosing = (symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined => {
        for (const symbol of symbols) {
            if (symbol.range.contains(position)) {
                if (
                    symbol.kind === vscode.SymbolKind.Function ||
                    symbol.kind === vscode.SymbolKind.Method
                ) {
                    return symbol;
                }
                if (symbol.children.length > 0) {
                    const childFunction = findEnclosing(symbol.children);
                    if (childFunction) {
                        return childFunction;
                    }
                }
            }
        }
        return undefined;
    };

    return findEnclosing(symbols);
}

// New helper function to post to an OpenAI endpoint.
async function postToOpenAi(endpoint: string, apiKey: string, prompt: string): Promise<any> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            prompt: prompt,
            max_tokens: 150 // adjust as needed
        })
    });
    return response.json();
}

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        console.error('No active text editor found.');
        return;
    }
    
    // Retrieve configuration values
    const config = vscode.workspace.getConfiguration("llmRename");
    const endpoint = config.get<string>("endpoint", "");
    const apiKey = config.get<string>("apiKey", "");

    const document = editor.document;
    const position = editor.selection.active;

    // Create (or reveal) a terminal and output the reference count.
    const terminal = vscode.window.createTerminal('Reference Count');
    terminal.show();

    try {
        const refLocations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            document.uri,
            position,
            { includeDeclaration: true }
        );
		const defLocations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            document.uri,
            position
        );

		var locations = [...refLocations, ...defLocations].filter(
			(obj, index, self) => self.findIndex(o => o.uri === obj.uri) === index
		);

        const count = locations ? locations.length : 0;
		console.log("Found %d locations.", count);

        let symbolResolution: Promise<vscode.DocumentSymbol | undefined>[] = [];
        // Use the new function to get content based on range.
		let symbolToRename: string = "";
        for (const location of locations) {
			if(symbolToRename === "")
				symbolToRename = document.getText(location.range);

            symbolResolution.push(getEnclosingFunction(location));
        }

		// Await for all promises in finalLocs to complete.
        const resolvedSymbols = await Promise.all(symbolResolution);
        const resolvedSymbolLocations = resolvedSymbols
            .filter((symbol): symbol is vscode.DocumentSymbol => symbol !== undefined)
            .map(symbol => new vscode.Location(document.uri, symbol.range));
        let result = await getContentFromLocations(resolvedSymbolLocations);
		
		// build prompt.
		const llmSubmission = goal + symbolToRename + returnAndWarnings + "```" + result.join("\n") + "```"
		const encoding = tiktoken.encoding_for_model("o3-mini");
		outputChannel.append("Input token count: " + encoding.encode(llmSubmission).length);

		//if(apiKey === "" || endpoint === "")
		//	throw Error("Unable to contact endpoint, no configuration, aborting.")

        // Example: Post to the OpenAI endpoint.
        //const openAiResponse = await postToOpenAi(endpoint, apiKey, llmSubmission);
        //const suggestions = openAiResponse.split("\n");
		const suggestions = ["suggestion1", "suggestion2", "suggestion3"];
		
		// New: Create a decoration type for inline suggestions.
		const suggestionDecorationType = vscode.window.createTextEditorDecorationType({
			after: {
				margin: '1em',
				color: 'gray',
				fontStyle: 'italic'
			}
		});
		
		// New: Build the decoration to display suggestions.
		// Using the current selection range (or adjust as needed for the symbol range).
		const editor = vscode.window.activeTextEditor;
		if(!editor)
		{
			throw Error("Editor not defined!");
		}

		const decorationRange = new vscode.Range(editor.selection.active, editor.selection.active);
		const joinedSuggestions = suggestions.join(" | ");
		editor.setDecorations(suggestionDecorationType, [{
			range: decorationRange,
			renderOptions: {
				after: {
					contentText: ` ${joinedSuggestions}`
				}
			}
		}]);
		
		// New: Show QuickPick for user to select a suggestion.
		const selectedSuggestion = await vscode.window.showQuickPick(suggestions, {
			placeHolder: "Select a new name for the symbol"
		});
		if (selectedSuggestion) {
			// Determine the symbol range; falls back to cursor position if not found.
			const symbolRange = document.getWordRangeAtPosition(position) ||
                new vscode.Range(position, position);
			editor.edit(editBuilder => {
				editBuilder.replace(symbolRange, selectedSuggestion);
			});
		}
		
		// Prompt suggestions to user.
    } catch (error) {
        console.error('Error executing reference provider:', error);
    }
}

// This method is called when your extension is deactivated.
export function deactivate() {}
