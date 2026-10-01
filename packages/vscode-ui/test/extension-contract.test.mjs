import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const packageDir = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
const packageJson = manifest;
const extensionSource = fs.readFileSync(path.join(packageDir, 'src', 'extension.ts'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(packageDir, 'src', 'backend-bridge.ts'), 'utf8');
const toolsSource = fs.readFileSync(path.join(packageDir, 'src', 'tools', 'vscode-tools.ts'), 'utf8');
const sidebarSource = fs.readFileSync(path.join(packageDir, 'src', 'sidebar', 'sidebarView.ts'), 'utf8');
const webviewHtmlSource = fs.readFileSync(path.join(packageDir, 'src', 'sidebar', 'webviewHtml.ts'), 'utf8');
const webviewStylesSource = fs.readFileSync(path.join(packageDir, 'src', 'sidebar', 'webviewStyles.ts'), 'utf8');
const appSource = fs.readFileSync(path.join(packageDir, 'src', 'webview', 'App.tsx'), 'utf8');
const markdownSource = fs.readFileSync(path.join(packageDir, 'src', 'webview', 'components', 'MarkdownView.tsx'), 'utf8');
const messageListSource = fs.readFileSync(path.join(packageDir, 'src', 'webview', 'components', 'MessageList.tsx'), 'utf8');
const runtimeHostSource = fs.readFileSync(path.join(packageDir, 'src', 'runtime', 'runtimeHost.ts'), 'utf8');
const terminalAgentSource = fs.readFileSync(path.join(packageDir, 'src', 'terminal', 'terminalAgent.ts'), 'utf8');
const terminalClientSource = fs.readFileSync(path.join(packageDir, 'src', 'terminal', 'runtimeClient.ts'), 'utf8');
const runtimeServicesSource = fs.readFileSync(path.join(packageDir, 'src', 'runtime', 'runtimeServices.ts'), 'utf8');

const repoRoot = path.resolve(packageDir, '..', '..');
const coreAgentSessionSource = fs.readFileSync(path.join(repoRoot, 'packages', 'core', 'src', 'agent-session.ts'), 'utf8');
const linuxInstallerSource = fs.readFileSync(path.join(repoRoot, 'linux-package', 'install.sh'), 'utf8');
const windowsInstallerSource = fs.readFileSync(path.join(repoRoot, 'windows-package', 'install.ps1'), 'utf8');

test('installers do not seed a hardcoded stale Ollama model', () => {
	assert.ok(!linuxInstallerSource.includes('qwen2.5-coder:7b'));
	assert.ok(!windowsInstallerSource.includes('qwen2.5-coder:7b'));
});

test('Pi command contract is wired from manifest to runtime registration', () => {
	const commands = manifest.contributes?.commands ?? [];
	const commandIds = commands.map((command) => command.command);

	for (const commandId of [
		'pi.openChat',
		'pi.addCustomModel',
		'pi.selectActiveModel',
		'pi.syncOllamaModels',
		'pi.openTerminalAgent',
		'pi.configureSwitchyardModels',
	]) {
		assert.ok(commandIds.includes(commandId), `manifest must contribute ${commandId}`);
		assert.ok(
			extensionSource.includes('registerBackendBridge(context)') &&
				bridgeSource.includes(`registerPiCommand("${commandId}"`),
			`runtime must register ${commandId}`,
		);
		assert.ok(
			(manifest.activationEvents ?? []).includes(`onCommand:${commandId}`),
			`manifest must explicitly activate for ${commandId}`,
		);
	}
});

test('Pi extension points at the bundle produced by the current esbuild entrypoint', () => {
	assert.equal(manifest.main, './dist/extension.js');
	assert.ok(fs.existsSync(path.join(packageDir, '.esbuild.ts')));
});

test('React webview is the shipped sidebar client', () => {
	assert.ok(fs.existsSync(path.join(packageDir, 'src', 'webview', 'index.tsx')));
	assert.ok(appSource.includes("window.addEventListener('message'"));
	assert.ok(appSource.includes("vscode.postMessage({ command: 'ready' })"));
	assert.ok(appSource.includes('}, []);'), 'webview message listener must not restart for every streamed token');
	assert.ok(webviewHtmlSource.includes('<div id="root"></div>'));
	assert.ok(fs.readFileSync(path.join(packageDir, '.esbuild.ts'), 'utf8').includes('./src/webview/index.tsx'));
});

test('Markdown rendering uses block-level Markdown/GFM parsing rather than the legacy regex renderer', () => {
	assert.ok(markdownSource.includes("from 'marked'"));
	assert.ok(markdownSource.includes('gfm: true'));
	assert.ok(markdownSource.includes('renderer.html'));
	assert.ok(markdownSource.includes('renderer.text'));
	assert.ok(markdownSource.includes('file-reference'));
	assert.ok(markdownSource.includes("command: 'openFileReference'"));
	assert.ok(markdownSource.includes('data-ziq-code-action'));
	assert.ok(!markdownSource.includes('function renderInlineMarkdown('));
	assert.ok(webviewStylesSource.includes('.markdown-body table'));
	assert.ok(webviewStylesSource.includes('.markdown-body h1'));
	assert.ok(webviewStylesSource.includes('.markdown-body .file-reference'));
});

test('shipped entrypoint uses the Pi backend and exposes VS Code tools', () => {
	assert.ok(extensionSource.includes("from './backend-bridge'"));
	assert.ok(extensionSource.includes('registerBackendBridge(context)'));
	assert.ok(runtimeHostSource.includes('createVsCodeTools()') || bridgeSource.includes('createVsCodeTools()'));
	for (const tool of [
		'vscode_get_active_editor',
		'vscode_get_diagnostics',
		'vscode_search_workspace',
		'vscode_read_file',
		'vscode_open_file',
		'vscode_save_file',
		'vscode_apply_workspace_edit',
		'vscode_get_hover',
		'vscode_get_definitions',
		'vscode_get_references',
		'vscode_get_workspace_folders',
		'vscode_get_open_editors',
		'vscode_get_selection',
		'vscode_list_directory',
		'vscode_write_file',
		'vscode_create_file',
		'vscode_delete_file',
		'vscode_rename_file',
		'vscode_get_document_symbols',
		'vscode_get_signature_help',
		'vscode_get_type_definition',
		'vscode_get_implementations',
		'vscode_get_declarations',
		'vscode_get_code_actions',
		'vscode_format_document',
		'vscode_get_completions',
		'vscode_get_document_links',
		'vscode_get_configuration',
		'vscode_list_language_model_tools',
		'vscode_invoke_language_model_tool',
	]) {
		assert.ok(toolsSource.includes(`name: '${tool}'`), `VS Code bridge must expose ${tool}`);
	}
	assert.ok(bridgeSource.includes('getAutomaticVsCodeContext()'));
	assert.ok(appSource.includes('streamSnapshot'), 'React webview must support batched streaming snapshots');
	assert.ok(appSource.includes("command: 'compact'"), 'React webview must expose Pi-native compaction');
	assert.ok(messageListSource.includes('MarkdownView'), 'message list must render through the Markdown component');
});

test('VS Code model UI is wired to the active backend bridge', () => {
	const manifestViews = manifest.contributes?.views?.['pi-assistant-container'] ?? [];
	assert.ok(manifestViews.some((view) => view.id === 'pi-assistant-welcome'), 'manifest must contribute the active tree view');
	assert.ok(bridgeSource.includes('registerTreeDataProvider("pi-assistant-welcome"'), 'bridge must register the contributed tree view');
	assert.ok(bridgeSource.includes('registerPiCommand("pi.addCustomModel"'), 'custom model command must be registered');
});

test('VS Code tools expose workspace, editing, and language-service surfaces', () => {
	assert.ok(toolsSource.includes("name: 'vscode_search_text'"), 'VS Code bridge must expose content search');
	assert.ok(toolsSource.includes("name: 'vscode_fetch_url'"), 'VS Code bridge must expose URL inspection');
});

test('VS Code and terminal share one server-owned live Pi runtime', () => {
	assert.ok(extensionSource.includes("startZiqRuntimeHost"), 'extension startup must start the runtime host');
	assert.ok(runtimeHostSource.includes('createVsCodeTools()'), 'runtime host must own the VS Code capability registry');
	assert.ok(runtimeHostSource.includes('customTools: [...createVsCodeTools(), ...createRuntimeAgentTools(this)]'), 'the live AgentSession must receive the complete VS Code and runtime tool surface at runtime creation');
	assert.ok(runtimeHostSource.includes('createUnixServer'), 'runtime host must expose the Pi server transport');
	assert.ok(runtimeHostSource.includes('createUnixServer'), 'runtime host must expose the Pi server transport');
	assert.ok(runtimeHostSource.includes('RoutedSessionHandle'), 'runtime host must expose routed session attachments through pi-server');
	assert.ok(runtimeHostSource.includes('RoutedSessionAttachment'), 'runtime host must expose attachment-scoped session service routing');
	assert.ok(!sidebarSource.includes('backend.createSession('), 'sidebar must not create AgentSession instances');
	assert.ok(!sidebarSource.includes('createVsCodeTools()'), 'sidebar must not own the VS Code tool registry');
	assert.ok(!sidebarSource.includes('SessionManager.create('), 'sidebar must not create SessionManager instances');
	assert.ok(sidebarSource.includes('getRuntimeAttachment('), 'sidebar must attach to the runtime host');
	assert.ok(!bridgeSource.includes('const created = await backend.createSession('), 'Chat Participant must not create a second AgentSession');
	assert.ok(bridgeSource.includes('getZiqRuntimeHost()'), 'Chat Participant must use the runtime host');
	assert.ok(terminalAgentSource.includes('terminal-client.cjs') || terminalAgentSource.includes('runtimeClient.cjs'), 'terminal launcher must use the runtime client');
	assert.ok(!terminalAgentSource.includes('sendText(cmd)'), 'terminal launcher must not invoke the standalone pi CLI');
	assert.ok(terminalAgentSource.includes('socketPath'), 'terminal launcher must pass the live runtime socket');
	assert.ok(terminalClientSource.includes('createUnixTransportFactory'), 'terminal client must use the Pi Unix transport');
	assert.ok(terminalClientSource.includes('AgentController'), 'terminal client must use the routed AgentController service');
});

test('runtime host preserves the pre-merge session and prompt API surface', () => {
	for (const signature of [
		'async createNewSession(',
		'async switchSession(',
		'async renameSession(',
		'async removeSession(',
		'describeSession(): SessionSummary',
		'private async startPrompt(',
		'private async prompt(',
		'private async steer(',
		'private async followUp(',
		'async attachLocal(): Promise<ZiqRuntimeAttachment>',
	]) {
		assert.ok(runtimeHostSource.includes(signature), `runtime host must retain ${signature}`);
	}
});

test('subagent event contract has unique property names', () => {
	const match = runtimeHostSource.match(/type SubagentEvent = \{([\\s\\S]*?)\n\};/);
	assert.ok(match, 'runtime host must declare the subagent event contract');
	const names = [...match[1].matchAll(/^\s*([A-Za-z_$][\\w$]*)\\??:/gm)].map((entry) => entry[1]);
	assert.equal(new Set(names).size, names.length, 'SubagentEvent must not contain duplicate property declarations');
});

test('runtime service removal honors the requested session id', () => {
	assert.ok(
		runtimeHostSource.includes('remove: async (sessionId: string)'),
		'SessionManagement.remove must receive the requested session id',
	);
	assert.ok(
		runtimeHostSource.includes('this.removeSession(sessionId)'),
		'SessionManagement.remove must remove the requested session rather than always removing the active session',
	);
});

test('runtime feature-setting rebuild preserves the active session manager and presentation state', () => {
	const rebuild = runtimeHostSource.match(/private async rebuildSessionForFeatureSettings\(\): Promise<void> \{([\\s\\S]*?)\n\t\}/);
	assert.ok(rebuild, 'runtime host must retain the feature-setting rebuild path');
	assert.ok(
		rebuild[1].includes('this.sessionManager = sessionManager;'),
		'session rebuilds must keep the SessionManager used to create the active AgentSession',
	);
	assert.ok(
		rebuild[1].includes('const sessionServices = this.sessionServices;') &&
			rebuild[1].includes('this.sessionServices = sessionServices;'),
		'session rebuilds must keep replicated presentation state attached',
	);
});

test('runtime host composes VS Code and runtime tools in the live AgentSession', () => {
	assert.ok(
		runtimeHostSource.includes('customTools: [...createVsCodeTools(), ...createRuntimeAgentTools(this)]'),
		'live sessions must receive both VS Code tools and runtime-managed tools',
	);
});
test('Activity Bar sidebar contribution is packagable and has a real icon asset', () => {
	const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
	const ziqContainer = containers.find((entry) => entry.id === 'pi-assistant-container');
	assert.ok(ziqContainer, 'Ziq Activity Bar container must be contributed');
	assert.equal(ziqContainer.icon, 'assets/ziq.svg');
	assert.ok(fs.existsSync(path.join(packageDir, 'assets', 'ziq.svg')), 'Activity Bar icon asset must exist');
});

test('runtime host dependencies and ownership are declared', () => {
	for (const dependency of [
		'@earendil-works/chord',
		'@earendil-works/pi-agent-core',
		'@earendil-works/pi-ai',
		'@earendil-works/pi-server',
	]) {
		assert.ok(packageJson.dependencies?.[dependency], `vscode-ui must declare ${dependency}`);
	}
	assert.ok(runtimeHostSource.includes('customTools: [...createVsCodeTools(), ...createRuntimeAgentTools(this)]'));
});

test('modern sidebar uses the VS Code webview surface', () => {
	assert.ok(manifest.contributes?.views?.['pi-assistant-container']?.some((view) => view.type === 'webview' && view.id === 'pi-assistant-sidebar'));
	assert.ok(webviewHtmlSource.includes('<div id="root"></div>'));
	assert.ok(webviewStylesSource.includes('--vscode-chat-requestBackground'));
	assert.ok(webviewStylesSource.includes('prefers-reduced-motion'));
});


test('VS Code runtime and terminal use one shared presentation contract', () => {
	assert.ok(runtimeHostSource.includes('from "@earendil-works/pi-agent-core"'));
	assert.ok(terminalClientSource.includes('from "@earendil-works/pi-agent-core"'));
	assert.ok(runtimeServicesSource.includes('SessionDirectory'));
	assert.ok(runtimeServicesSource.includes('SessionManagement'));
	assert.ok(runtimeServicesSource.includes('AgentController'));
	assert.ok(runtimeServicesSource.includes('Transcript'));
	assert.ok(!runtimeHostSource.includes('(defineService as any)("pi.session-directory")'));
	assert.ok(!terminalClientSource.includes('defineService<SessionDirectory>("pi.session-directory")'));
});

test('the live Session exposes one shared display name to every client', () => {
	assert.ok(runtimeHostSource.includes('session.sessionName'));
	assert.ok(runtimeHostSource.includes('name: this.sessionDisplayName()'));
	assert.ok(runtimeServicesSource.includes('name: string'));
	assert.ok(terminalClientSource.includes('summary.name'));
	assert.ok(terminalClientSource.includes('Session:'));
});


test('sidebar exposes first-class session and attachment controls', () => {
	assert.ok(appSource.includes("command: 'newSession'"), 'webview must expose an explicit new-session action');
	assert.ok(appSource.includes('sessionName'), 'webview must display the live session name');
	assert.ok(terminalClientSource.includes('SessionDirectory'), 'terminal client must consume the shared session directory');
	assert.ok(terminalClientSource.includes('summary.name'), 'terminal client must display the shared session name');
	assert.ok(terminalClientSource.includes('directory.state.subscribe'), 'terminal client must track renamed session state');
});

test('chat attachments are sent as native Pi prompt inputs', () => {
	assert.ok(sidebarSource.includes('PromptAttachment'), 'sidebar must consume the shared attachment contract');
	assert.ok(sidebarSource.includes('type: "image"') || sidebarSource.includes("type: 'image'"), 'sidebar must construct image inputs');
	assert.ok(sidebarSource.includes('files') && sidebarSource.includes('images'), 'sidebar must route files and images to the runtime prompt');
	assert.ok(c.includes('native file and image attachments'), 'source history should include native attachment implementation');
	assert.ok(runtimeservicesSourceSafe(), 'shared runtime services must define the prompt attachment contract');
});

function runtimeservicesSourceSafe() {
	return runtimeServicesSource.includes('PromptAttachment') &&
		runtimeServicesSource.includes('kind: "file"') &&
		runtimeServicesSource.includes('kind: "image"');
}

test('the attachment picker offers files and images', () => {
	assert.ok(sidebarSource.includes('Attach File...'));
	assert.ok(sidebarSource.includes('Attach Image...'));
	assert.ok(appSource.includes('Attached file:'));
	assert.ok(appSource.includes('Attached image:'));
});


test('resumed sessions use the active compatible model instead of stale persisted selection', () => {
	assert.ok(
		runtimeHostSource.includes('const restoredModel = created.session.model'),
		'runtime host must inspect the model restored from session history',
	);
	assert.ok(
		runtimeHostSource.includes('restoredModel.provider !== target.provider || restoredModel.id !== target.id'),
		'runtime host must detect a persisted model that differs from the active model',
	);
	assert.ok(
		runtimeHostSource.includes('this.modelRuntime.getModel(restoredModel.provider, restoredModel.id)'),
		'runtime host must still validate whether the persisted model exists in the current catalog',
	);
	assert.ok(
		runtimeHostSource.includes('await created.session.setModel(target)'),
		'runtime host must switch resumed sessions to the current target model',
	);
});


test('VS Code exposes agent feature settings', () => {
	const properties = manifest.contributes?.configuration?.properties ?? {};
	for (const key of [
		'pi.agentFeatures.guardrails.enabled',
		'pi.agentFeatures.guardrails.hooksEnabled',
		'pi.agentFeatures.guardrails.defaultTier',
		'pi.agentFeatures.guardrails.evaluatorModel',
		'pi.agentFeatures.switchyard.enabled',
		'pi.agentFeatures.switchyard.efficientModel',
		'pi.agentFeatures.switchyard.capableModel',
		'pi.agentFeatures.switchyard.evaluatorModel',
		'pi.agentFeatures.switchyard.picker',
		'pi.agentFeatures.personalization.enabled',
		'pi.agentFeatures.personalization.autoLearn',
		'pi.agentFeatures.personalization.maxTokens',
		'pi.agentFeatures.semble.enabled',
		'pi.agentFeatures.semble.maxResults',
		'pi.agentFeatures.worktree.enabled',
		'pi.agentFeatures.worktree.rootDir',
		'pi.agentFeatures.worktree.cleanupOnDispose',
	]) {
		assert.ok(properties[key], `manifest must contribute ${key}`);
	}
});


test('VS Code feature settings are mapped into the live Pi SettingsManager', () => {
	assert.ok(runtimeHostSource.includes('SettingsManager.inMemory'));
	assert.ok(runtimeHostSource.includes('readAgentFeatureSettings'));
	assert.ok(runtimeHostSource.includes('settingsManager: this.settingsManager'));
	assert.ok(runtimeHostSource.includes('syncFeatureSettings'));
	assert.ok(extensionSource.includes('affectsConfiguration("pi.agentFeatures")'));
	assert.ok(manifest.contributes.configuration.properties['pi.agentFeatures.guardrails.enabled'].default === true);
	assert.equal(manifest.contributes.configuration.properties['pi.agentFeatures.guardrails.defaultTier'].default, 'ask_every_time');
	assert.ok(packageJson.contributes.commands.some((command) => command.command === 'pi.configureSwitchyardModels'));
	assert.ok(fs.readFileSync(path.join(packageDir, 'src', 'commands', 'index.ts'), 'utf8').includes('getCurrentProviderModelChoices'));
	assert.ok(runtimeHostSource.includes('createVsCodeExtensionUIContext'));
	assert.ok(runtimeHostSource.includes('Allow once'));
	assert.ok(coreAgentSessionSource.includes('ask_every_time'));
});


test('runtime owns checkpoints, edit rewind, queueing, skills, and subagents', () => {
	assert.ok(runtimeHostSource.includes('WorkspaceCheckpointManager'));
	assert.ok(runtimeHostSource.includes('turnCheckpoints'));
	assert.ok(runtimeHostSource.includes('editUserMessage'));
	assert.ok(runtimeHostSource.includes('runSubagent'));
	assert.ok(runtimeHostSource.includes('createSkill'));
	assert.ok(runtimeHostSource.includes('resourceLoader'));
	assert.ok(runtimeHostSource.includes('WorktreeManager'));
	assert.ok(runtimeHostSource.includes('prepareWorktree'));
	assert.ok(runtimeHostSource.includes('toolObserver'));
	assert.ok(runtimeServicesSource.includes('editMessage'));
	assert.ok(coreAgentSessionSource.includes('toolObserver'));
	assert.ok(coreAgentSessionSource.includes('rewindBeforeEntry'));
	assert.ok(coreAgentSessionSource.includes('rewindBeforeEntry'));
	assert.ok(appSource.includes('editingEntryId'));
	assert.ok(appSource.includes('sendMode'));
	assert.ok(appSource.includes('queueUpdate'));
	assert.ok(messageListSource.includes('onEditMessage'));
	assert.ok(sidebarSource.includes("mode === 'queue'") || sidebarSource.includes("mode === 'steer'"));
});

test('experimental features are wired into the live Pi runtime, with worktree explicitly gated', () => {
	assert.ok(runtimeHostSource.includes('readAgentFeatureSettings'));
	assert.ok(runtimeHostSource.includes('settingsManager: this.settingsManager'));
	assert.ok(runtimeHostSource.includes('syncFeatureSettings'));
	assert.ok(manifest.contributes.configuration.properties['pi.agentFeatures.semble.enabled']);
	assert.ok(manifest.contributes.configuration.properties['pi.agentFeatures.switchyard.enabled']);
	assert.ok(manifest.contributes.configuration.properties['pi.agentFeatures.personalization.enabled']);
	assert.ok(manifest.contributes.configuration.properties['pi.agentFeatures.guardrails.enabled']);
	assert.ok(manifest.contributes.configuration.properties['pi.agentFeatures.worktree.enabled']);
	assert.ok(packageJson.contributes.configuration.properties['pi.agentFeatures.worktree.enabled'].description.includes('isolate session file edits'));
});
