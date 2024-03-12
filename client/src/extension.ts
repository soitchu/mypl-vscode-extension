/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { spawn } from 'child_process';
import * as path from 'path';
import { workspace, ExtensionContext, languages, TextEdit, Range, Position } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'mypl' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'languageServerExample',
		'Language Server Example',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

async function getPrettyPrintedCode(code: string) {
	const myplPath = workspace.getConfiguration("mypl").get("myplExecutablePath") as string;

	return new Promise((resolve, reject) => {
		const child = spawn('python', [myplPath, `--print`]);
		
		child.stdout?.on("data", function (data: Buffer) {
			resolve(data.toString());
		});

		child.stdout?.on("error", function (data: Buffer) {
			reject(data.toString());
		});

		child.stdout.on("close", function (data: Buffer) {
			resolve("");
		});

		child.stdin.write(code);
		child.stdin.end();
	});

}

languages.registerDocumentFormattingEditProvider('mypl', {
	async provideDocumentFormattingEdits(document) {

		const formattedCode = await getPrettyPrintedCode(document.getText()) as string;

		if(formattedCode.startsWith("Parser Error") || formattedCode.startsWith("Lexer Error") || formattedCode.startsWith("Print Error")) {
			return [];
		}

		return [TextEdit.replace(
			new Range(
				document.lineAt(0).range.start,
				document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
			), formattedCode)];
	}
});

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
