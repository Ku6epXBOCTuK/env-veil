import * as vscode from 'vscode';

const protectedEnvViewType = 'envVeil.protectedEnv';

function getWebviewContent(webview: vscode.Webview): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Env Veil</title>
</head>
<body>
  <main>
    <h1>Env Veil</h1>
    <p>Extension scaffold is running. Protected preview is not implemented yet.</p>
  </main>
</body>
</html>`;
}

class ScaffoldCustomTextEditorProvider implements vscode.CustomTextEditorProvider {
  public resolveCustomTextEditor(
    _document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): void {
    void token;
    webviewPanel.webview.options = {
      enableScripts: false,
      enableForms: false,
      enableCommandUris: false,
      localResourceRoots: [],
    };
    webviewPanel.webview.html = getWebviewContent(webviewPanel.webview);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      protectedEnvViewType,
      new ScaffoldCustomTextEditorProvider(),
    ),
  );
}
