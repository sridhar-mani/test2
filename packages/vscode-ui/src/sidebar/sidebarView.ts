import { WorkspaceContext } from '../context/workspace';
import * as vscode from 'vscode';
import { ModelManager } from '../runtime/modelManager';
import { PiSettings } from '../config/settings';
import { getZiqRuntimeHost, type ZiqRuntimeAttachment } from '../runtime/runtimeHost';
import type { PromptAttachment } from '../runtime/runtimeServices';
import { logPi } from '../backend-bridge';
import type { ChatMessage } from './types';
import { getWebviewHtml } from './webviewHtml';

export type { ChatMessage } from './types';

export class PiSidebarViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'pi-assistant-sidebar';

	private readonly _extensionUri: vscode.Uri;
	private readonly _modelManager: ModelManager;
	private _view?: vscode.WebviewView;
	private _abortController?: AbortController;
	private _currentSessionId?: string;
	private _runtimeAttachment?: ZiqRuntimeAttachment;
	private _streamSequence = 0;
	private _activeStreamId?: string;
	private _startNewSessionOnNextMessage = false;
	private _webviewMessageQueue: Promise<void> = Promise.resolve();

	private queueWebviewMessage(message: Record<string, unknown>, phase?: string): void {
		this._webviewMessageQueue = this._webviewMessageQueue
			.then(async () => {
				const webview = this._view?.webview;
				if (!webview) {
					logPi(`Webview IPC dropped phase=${phase || String(message.type)} reason=no-webview`);
					return;
				}
				try {
					const delivered = await webview.postMessage(message);
					logPi(
						`Webview IPC phase=${phase || String(message.type)} type=${String(message.type)} streamId=${String(message.streamId || "none")} delivered=${delivered}`,
					);
				} catch (error) {
					logPi(
						`Webview IPC FAILED phase=${phase || String(message.type)} type=${String(message.type)} streamId=${String(message.streamId || "none")} error=${error instanceof Error ? error.message : String(error)}`,
					);
				}
			})
			.catch((error) => {
				logPi(`Webview IPC queue FAILED error=${error instanceof Error ? error.message : String(error)}`);
			});
	}

	constructor(extensionUri: vscode.Uri, modelManager: ModelManager) {
		this._extensionUri = extensionUri;
		this._modelManager = modelManager;
		this._modelManager.onDidChangeModels(() => {
			this.postModelUpdate();
		});
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		const codiconUri = webviewView.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'assets', 'codicons', 'codicon.css')
		);
		const scriptUri = webviewView.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
		);

		webviewView.webview.html = getWebviewHtml(codiconUri, scriptUri, webviewView.webview.cspSource);
		this.postModelUpdate();

		webviewView.webview.onDidReceiveMessage(async (message: Record<string, unknown>) => {
			const command = String(message.command || '');
			switch (command) {
				case 'ready':
					this.postModelUpdate();
					this.hydrateSessionOnReady();
					break;
				case 'sendMessage':
					await this.handleUserMessage(
						String(message.text || ''),
						(message.history as ChatMessage[]) || [],
						Array.isArray(message.attachments) ? (message.attachments as PromptAttachment[]) : [],
						typeof message.editEntryId === 'string' ? message.editEntryId : undefined,
						message.mode === 'queue' || message.mode === 'steer' ? message.mode : 'send',
					);
					break;
				case 'createSkill': {
					const name = await vscode.window.showInputBox({ prompt: 'Skill name', placeHolder: 'review-pr' });
					if (!name) break;
					const description = await vscode.window.showInputBox({ prompt: 'Skill description', value: 'Reusable coding workflow' });
					if (!description) break;
					try {
						const skillPath = await (await getZiqRuntimeHost()).createSkill(
							name,
							description,
							`# ${name}\\n\\nTODO: Describe the workflow, constraints, and validation steps this skill should follow.\\n`,
						);
						const document = await vscode.workspace.openTextDocument(skillPath);
						await vscode.window.showTextDocument(document, { preview: false });
						vscode.window.showInformationMessage(`Ziq skill created: ${name}`);
					} catch (error) {
						vscode.window.showErrorMessage(`Failed to create skill: ${error instanceof Error ? error.message : String(error)}`);
					}
					break;
				}
				case 'compact':
					await this.handleCompaction();
					break;
				case 'stopGeneration':
					this.stopGeneration();
					break;
				case 'clearSession':
					await this.clearSession();
					break;
				case 'newSession':
					await this.startNewSession();
					break;
				case 'streamDebug':
					logPi(
						`Webview streamDebug phase=${String(message.phase || 'unknown')} messageType=${String(message.messageType || 'none')} streamId=${String(message.streamId || 'none')} currentStreamId=${String(message.currentStreamId || 'none')} row=${String(message.rowPresent ?? 'na')} body=${String(message.bodyPresent ?? 'na')} chars=${Number(message.chars || 0)} domChars=${Number(message.domChars || 0)} preview=${typeof message.preview === 'string' ? JSON.stringify(message.preview.slice(0, 120)) : '""'}`,
					);
					break;
				case 'selectModel':
					await this._modelManager.promptSelectModel();
					break;
				case 'switchModel':
					if (typeof message.modelId === 'string') {
						await this.switchModel(message.modelId);
					}
					break;
				case 'addModel':
					await this._modelManager.promptAddModel();
					break;
				case 'syncOllama':
					await this._modelManager.syncOllama(true);
					break;
				case 'openTerminal':
					vscode.commands.executeCommand('pi.openTerminalAgent');
					break;
				case 'openSettings':
					vscode.commands.executeCommand('workbench.action.openSettings', '@ext:zenteiq.ziq-vscode-ui');
					break;
				case 'attachContextPicker':
					await this.handleAttachContextPicker();
					break;
				case 'mergeWorktree': {
					try {
						await (await getZiqRuntimeHost()).mergeActiveWorktree();
						await this.postSessionInfo();
						vscode.window.showInformationMessage('Ziq: Worktree merged into the workspace.');
					} catch (error) {
						vscode.window.showErrorMessage('Ziq: Could not merge worktree: ' + (error instanceof Error ? error.message : String(error)));
					}
					break;
				}
				case 'discardWorktree': {
					const answer = await vscode.window.showWarningMessage('Discard all changes in the active Ziq worktree?', { modal: true }, 'Discard');
					if (answer === 'Discard') {
						try {
							await (await getZiqRuntimeHost()).discardActiveWorktree();
							await this.postSessionInfo();
						} catch (error) {
							vscode.window.showErrorMessage('Ziq: Could not discard worktree: ' + (error instanceof Error ? error.message : String(error)));
						}
					}
					break;
				}

				case 'getEditorContext':
					this.handleGetEditorContext();
					break;
				case 'openFileReference': {
					if (typeof message.path !== 'string') break;
					try {
						const uri = WorkspaceContext.toUri(message.path);
						const document = await vscode.workspace.openTextDocument(uri);
						const line = typeof message.line === 'number' ? Math.max(1, Math.floor(message.line)) : undefined;
						const character = typeof message.character === 'number' ? Math.max(1, Math.floor(message.character)) : 1;
						const position = line !== undefined
							? new vscode.Position(Math.min(line - 1, Math.max(0, document.lineCount - 1)), Math.max(0, character - 1))
							: undefined;
						await vscode.window.showTextDocument(document, {
							preview: false,
							selection: position ? new vscode.Range(position, position) : undefined,
						});
					} catch (error) {
						vscode.window.showWarningMessage(
							`Could not open file reference "${message.path}": ${error instanceof Error ? error.message : String(error)}`,
						);
					}
					break;
				}
				case 'runInTerminal':
					if (typeof message.code === 'string') {
						let term = vscode.window.terminals.find(t => t.name === 'Ziq Terminal');
						if (!term) {
							term = vscode.window.createTerminal('Ziq Terminal');
						}
						term.show();
						term.sendText(message.code);
					}
					break;
				case 'insertCode': {
					const editor = vscode.window.activeTextEditor;
					if (editor && typeof message.code === 'string') {
						await editor.edit(editBuilder => {
							editBuilder.insert(editor.selection.active, message.code as string);
						});
					} else {
						vscode.window.showWarningMessage('No active editor open to insert code.');
					}
					break;
				}
				case 'copyCode':
					if (typeof message.code === 'string') {
						await vscode.env.clipboard.writeText(message.code);
						vscode.window.showInformationMessage('Code copied to clipboard.');
					}
					break;
			}
		});
	}

	public refresh(): void {
		this.postModelUpdate();
	}

	private async postModelUpdate(): Promise<void> {
		if (!this._view) return;
		const fallback = this._modelManager.getAllModels();
		let models = fallback;
		let activeModelId = this._modelManager.getActiveModel()?.id || '';
		let activeModelName = this._modelManager.getActiveModel()?.name || 'Select a Model';
		try {
			const host = await getZiqRuntimeHost();
			const catalog = host.getAllProviderModelChoices();
			if (catalog.length > 0) {
				models = catalog.map((model) => ({
					id: model.provider + '/' + model.id,
					name: model.name,
					provider: model.provider,
					reasoning: model.reasoning,
					details: model.reasoning ? 'Reasoning' : undefined,
				}));
				const configured = PiSettings.activeModel;
				const active = models.find((model) => model.id === configured) || models.find((model) => model.id.split('/').pop() === configured);
				if (active) {
					activeModelId = active.id;
					activeModelName = active.name;
				}
			}
		} catch {
			// Runtime may not be started during activation; fall back to the legacy model manager.
		}
		const isOnline = this._modelManager.isOllamaOnline;

		this._view.webview.postMessage({
			type: 'updateModels',
			activeModelId,
			activeModelName,
			models,
			isOllamaOnline: isOnline,
		});
	}

	private async getRuntimeAttachment(): Promise<ZiqRuntimeAttachment> {
		if (this._runtimeAttachment) return this._runtimeAttachment;
		const host = await getZiqRuntimeHost();
		if (this._startNewSessionOnNextMessage) {
			await host.createNewSession();
			this._startNewSessionOnNextMessage = false;
		}
		this._runtimeAttachment = await host.attachLocal();
		this._currentSessionId = this._runtimeAttachment.sessionId;
		this.postSessionInfo();
		return this._runtimeAttachment;
	}

	private async postSessionInfo(): Promise<void> {
		try {
			const host = await getZiqRuntimeHost();
			const summary = host.describeSession();
			const worktree = host.getActiveWorktree();
			this.queueWebviewMessage({
				type: 'sessionInfo',
				sessionId: summary.sessionId,
				name: summary.name,
				worktree: worktree?.isIsolated ? { path: worktree.worktreePath, branch: worktree.branchName } : undefined,
			}, 'session_info');
		} catch (error) {
			logPi(`Failed to publish session info: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async startNewSession(): Promise<void> {
		this._abortController?.abort();
		this._runtimeAttachment?.dispose();
		this._runtimeAttachment = undefined;
		this._currentSessionId = undefined;
		this._activeStreamId = undefined;
		this._startNewSessionOnNextMessage = false;
		const host = await getZiqRuntimeHost();
		await host.createNewSession();
		this._runtimeAttachment = await host.attachLocal();
		this._currentSessionId = this._runtimeAttachment.sessionId;
		await this.postSessionInfo();
		this._view?.webview.postMessage({
			type: 'restoreHistory',
			messages: [],
		});
	}

	private async switchModel(modelId: string): Promise<void> {
		await PiSettings.setActiveModel(modelId);
		this.postModelUpdate();
		if (!this._currentSessionId) return;

		try {
			this.stopGeneration();
			const attachment = await this.getRuntimeAttachment();
			await attachment.setModel(modelId);
			logPi(`Applied model switch to existing Pi session session=${this._currentSessionId} model=${modelId}`);
		} catch (error) {
			logPi(`Model switch failed: ${error instanceof Error ? error.message : String(error)}`);
			this._view?.webview.postMessage({
				type: 'error',
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async clearSession(): Promise<void> {
		const sessionId = this._currentSessionId;
		this._currentSessionId = undefined;
		this._activeStreamId = undefined;
		this._runtimeAttachment?.dispose();
		this._runtimeAttachment = undefined;
		if (sessionId) {
			try {
				await (await getZiqRuntimeHost()).removeSession();
			} catch (error) {
				logPi(`Failed to destroy sidebar session=${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this._startNewSessionOnNextMessage = true;
		logPi("Sidebar session cleared; next message will create a new Pi session");
	}

	private stopGeneration(): void {
		if (this._runtimeAttachment) {
			void this._runtimeAttachment.abort().catch(() => {});
		}
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = undefined;
		}
		if (this._view) {
			this._view.webview.postMessage({ type: 'generationStopped', streamId: this._activeStreamId });
			this._activeStreamId = undefined;
		}
	}

	private async handleUserMessage(
		prompt: string,
		history: ChatMessage[],
		attachments: PromptAttachment[] = [],
		editEntryId?: string,
		mode: 'send' | 'queue' | 'steer' = 'send',
	): Promise<void> {
		if (!this._view) return;

		const activeModel = this._modelManager.getActiveModel();
		logPi(`Sidebar user message received promptLength=${prompt.length} historyTurns=${history.length} activeModel=${activeModel?.id || "none"} promptPreview=${JSON.stringify(prompt.slice(0, 120))}`);
		if (!activeModel) {
			this._view.webview.postMessage({
				type: 'error',
				message: 'No model selected. Please select a model in the dropdown above.',
			});
			return;
		}

		if (this._abortController) {
			if (mode === 'send') {
				logPi('Sidebar ignored send while another Pi generation is still active');
				return;
			}
			const attachment = await this.getRuntimeAttachment();
			if (mode === 'steer') await attachment.steer(prompt);
			else await attachment.followUp(prompt);
			this.queueWebviewMessage({ type: 'queueAccepted', mode }, 'queue_accepted');
			return;
		}

		this._abortController = new AbortController();
		const signal = this._abortController.signal;
		const streamId = String(++this._streamSequence);
		this._activeStreamId = streamId;
		logPi(`Sidebar stream started streamId=${streamId}`);

		this.queueWebviewMessage({
			type: 'streamStart',
			streamId,
			modelName: activeModel.name,
		}, 'stream_start');

		try {
			const attachment = await this.getRuntimeAttachment();
			this._currentSessionId = attachment.sessionId;
			await attachment.setModel(activeModel.id);
			logPi(`Sidebar attached to live Pi session session=${this._currentSessionId} streamId=${streamId}`);

			logPi(`Sidebar subscribing to Pi session events session=${this._currentSessionId} streamId=${streamId}`);
			let thinkingDeltaCount = 0;
			let textDeltaCount = 0;
			let currentAssistantThinkingLength = 0;
			let currentAssistantTextLength = 0;
			let currentAssistantThinkingPreview = '';
			let currentAssistantTextPreview = '';
			let currentAssistantThinkingText = '';
			let currentAssistantText = '';
			let pendingThinkingDelta = '';
			let pendingTextDelta = '';
			let deltaTimer: ReturnType<typeof setTimeout> | undefined;

			const flushStreamDeltas = (): void => {
				if (deltaTimer) {
					clearTimeout(deltaTimer);
					deltaTimer = undefined;
				}
				if (pendingThinkingDelta) {
					const delta = pendingThinkingDelta;
					pendingThinkingDelta = '';
					this.queueWebviewMessage({ type: 'streamThinkingDelta', streamId, text: delta }, 'thinking_delta');
				}
				if (pendingTextDelta) {
					const delta = pendingTextDelta;
					pendingTextDelta = '';
					this.queueWebviewMessage({ type: 'streamDelta', streamId, text: delta }, 'text_delta');
				}
			};

			const scheduleStreamDeltas = (): void => {
				if (deltaTimer) return;
				deltaTimer = setTimeout(flushStreamDeltas, 50);
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const unsubscribe = attachment.subscribe((event: any) => {
				if (signal.aborted) return;
				if (event.type === 'queue_update') {
					this.queueWebviewMessage({
						type: 'queueUpdate',
						steering: Array.isArray(event.steering) ? event.steering : [],
						followUp: Array.isArray(event.followUp) ? event.followUp : [],
					}, 'queue_update');
				} else if (event.type === 'message_update') {
					const assistantMessageEvent = event.assistantMessageEvent;
					if (!assistantMessageEvent) return;
					if (assistantMessageEvent.type === 'thinking_start' || assistantMessageEvent.type === 'thinking_end') {
						logPi(`Sidebar Pi assistant event=${assistantMessageEvent.type} session=${this._currentSessionId} streamId=${streamId}`);
					}
					switch (assistantMessageEvent.type) {
						case 'thinking_start':
							this.queueWebviewMessage({ type: 'streamThinkingStart', streamId, segmentId: `thinking-${streamId}-${thinkingDeltaCount + 1}` }, 'thinking_start');
							break;
						case 'thinking_delta':
							if (typeof assistantMessageEvent.delta === 'string' && assistantMessageEvent.delta.length > 0) {
								thinkingDeltaCount++;
								currentAssistantThinkingLength += assistantMessageEvent.delta.length;
								if (currentAssistantThinkingPreview.length < 200) currentAssistantThinkingPreview += assistantMessageEvent.delta;
								if (thinkingDeltaCount === 1 || thinkingDeltaCount % 25 === 0) {
									logPi(`Sidebar Pi thinking_delta streamId=${streamId} count=${thinkingDeltaCount} chars=${assistantMessageEvent.delta.length}`);
								}
								currentAssistantThinkingText += assistantMessageEvent.delta;
								pendingThinkingDelta += assistantMessageEvent.delta;
								scheduleStreamDeltas();
							}
							break;
						case 'thinking_end':
							this.queueWebviewMessage({
								type: 'streamThinkingEnd',
								streamId,
								text: assistantMessageEvent.content || '',
							}, 'thinking_end');
							break;
						case 'text_delta':
							if (typeof assistantMessageEvent.delta === 'string' && assistantMessageEvent.delta.length > 0) {
								textDeltaCount++;
								currentAssistantTextLength += assistantMessageEvent.delta.length;
								if (currentAssistantTextPreview.length < 200) currentAssistantTextPreview += assistantMessageEvent.delta;
								if (textDeltaCount === 1 || textDeltaCount % 25 === 0) {
									logPi(`Sidebar Pi text_delta streamId=${streamId} count=${textDeltaCount} chars=${assistantMessageEvent.delta.length}`);
								}
								currentAssistantText += assistantMessageEvent.delta;
								pendingTextDelta += assistantMessageEvent.delta;
								scheduleStreamDeltas();
							}
							break;
					}
				} else if (event.type === 'tool_execution_start') {
					this.queueWebviewMessage({
						type: 'toolExecutionStart',
						streamId,
						toolCallId: event.toolCallId || 'unknown',
						toolName: event.toolName || 'tool',
						args: event.args,
					}, 'tool_execution_start');
				} else if (event.type === 'tool_execution_update') {
					let preview = '';
					const partial = event.partialResult;
					if (typeof partial?.content?.map === 'function') {
						preview = partial.content.map((item: any) => item?.text || '').join('\n');
					} else if (typeof partial === 'string') {
						preview = partial;
					} else if (partial !== undefined) {
						try { preview = JSON.stringify(partial); } catch { preview = String(partial); }
					}
					this.queueWebviewMessage({
						type: 'toolExecutionUpdate',
						streamId,
						toolCallId: event.toolCallId || 'unknown',
						toolName: event.toolName || 'tool',
						partialResult: preview.slice(0, 1600),
					}, 'tool_execution_update');
				} else if (event.type === 'tool_execution_end') {
					let resultText = '';
					if (typeof event.result?.content?.[0]?.text === 'string') {
						resultText = event.result.content.map((c: any) => c.text || '').join('\n');
					} else if (typeof event.result?.content === 'string') {
						resultText = event.result.content;
					} else if (typeof event.result === 'string') {
						resultText = event.result;
					} else if (event.result !== undefined && event.result !== null) {
						resultText = JSON.stringify(event.result, null, 2);
					}
					const safeResult = resultText.length > 8000 ? resultText.slice(0, 8000) + '\n… output truncated for UI performance.' : resultText;
					this.queueWebviewMessage({
						type: 'toolExecutionEnd',
						streamId,
						toolCallId: event.toolCallId || 'unknown',
						toolName: event.toolName || 'tool',
						result: safeResult,
						details: event.result?.details,
						isError: Boolean(event.isError),
					}, 'tool_execution_end');
				} else if (event.type === 'compaction_start') {
					this.queueWebviewMessage({ type: 'compactionStart', streamId }, 'compaction_start');
				} else if (event.type === 'compaction_end') {
					const compactionEvent = event as any;
					this.queueWebviewMessage({
						type: 'compactionDone',
						streamId,
						summary: compactionEvent.result?.summary || 'Context compacted.',
						savedCount: history.length,
					}, 'compaction_end');
				}
			});

			try {
				logPi(`Sidebar Pi prompt start session=${this._currentSessionId}`);
				const files = attachments.filter((item): item is Extract<PromptAttachment, { kind: 'file' }> => item.kind === 'file').map((item) => item.path);
				const images = attachments
					.filter((item): item is Extract<PromptAttachment, { kind: 'image' }> => item.kind === 'image')
					.map((item) => ({ type: 'image' as const, data: item.data, mimeType: item.mimeType }));
				const promptOptions = {
					...(files.length > 0 ? { files } : {}),
					...(images.length > 0 ? { images } : {}),
				};
				if (attachment.isStreaming()) {
					await attachment.steer(prompt);
					await attachment.waitForIdle();
				} else if (editEntryId) {
					await attachment.editMessage(editEntryId, prompt, promptOptions);
				} else {
					await attachment.prompt(prompt, promptOptions);
				}
				await this.postSessionInfo();
				await this.restoreCurrentSessionHistory();
				logPi(`Sidebar Pi prompt completed session=${this._currentSessionId}`);
				logPi(`Sidebar final stream state streamId=${streamId} thinkingChars=${currentAssistantThinkingLength} textChars=${currentAssistantTextLength} thinkingPreview=${JSON.stringify(currentAssistantThinkingPreview.slice(0, 200))} textPreview=${JSON.stringify(currentAssistantTextPreview.slice(0, 200))}`);
			} finally {
				unsubscribe();
			}
			flushStreamDeltas();
			this.queueWebviewMessage({
				type: 'streamEnd',
				streamId,
				text: currentAssistantText,
				thinkingDeltaCount,
				textDeltaCount,
			}, 'stream_end');
			this._activeStreamId = undefined;
		} catch (err: unknown) {
			const failedSessionId = this._currentSessionId;
			this._currentSessionId = undefined;
			logPi(`Sidebar Pi request FAILED session=${failedSessionId || "none"} error=${err instanceof Error ? err.message : String(err)}`);
			if (signal.aborted) {
				this.queueWebviewMessage({
					type: 'streamEnd',
					streamId,
					thinkingDeltaCount: 0,
					textDeltaCount: 0,
				}, 'stream_end_aborted');
				this._activeStreamId = undefined;
			} else {
				const msg = err instanceof Error ? err.message : String(err);
				this.queueWebviewMessage({
					type: 'error',
					streamId,
					message: msg,
				}, 'error');
			}
		} finally {
			this._abortController = undefined;
		}
	}

	private async hydrateSessionOnReady(): Promise<void> {
		if (!this._view) return;
		try {
			const attachment = await this.getRuntimeAttachment();
			this._currentSessionId = attachment.sessionId;
			await this.restoreCurrentSessionHistory();
		} catch (err) {
			logPi(`Failed to hydrate live Pi session on ready: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async restoreCurrentSessionHistory(): Promise<void> {
		if (!this._view) return;
		const host = await getZiqRuntimeHost();
		const history = host.getSessionHistory();
		const restored = history.map((message) => ({
			id: message.entryId,
			entryId: message.entryId,
			role: message.role,
			content: message.content,
			timestamp: message.timestamp,
		}));
		this._view.webview.postMessage({ type: 'restoreHistory', messages: restored });
	}

	private restoreSessionHistory(messages: readonly any[]): void {
		if (!this._view) return;
		const restored = messages
			.filter((message) => message?.role === 'user' || message?.role === 'assistant')
			.map((message) => {
				const content = Array.isArray(message.content)
					? message.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text || '').join('')
					: typeof message.content === 'string' ? message.content : '';
				const thinkingBlock = Array.isArray(message.content)
					? message.content.find((b: any) => b?.type === 'thinking')
					: undefined;
				const thinking = typeof thinkingBlock?.thinking === 'string'
					? thinkingBlock.thinking
					: typeof thinkingBlock?.text === 'string'
					? thinkingBlock.text
					: undefined;
				return {
					role: message.role,
					content,
					thinking,
					timestamp: message.timestamp || Date.now(),
					id: String(message.id || Date.now()),
				};
			})
			.filter((message) => message.content.length > 0 || (typeof message.thinking === 'string' && message.thinking.length > 0));
		if (restored.length > 0) {
			logPi(`Restoring ${restored.length} persisted sidebar messages`);
			this._view.webview.postMessage({ type: 'restoreHistory', messages: restored });
		}
	}

	private async handleCompaction(): Promise<void> {
		if (!this._view) return;
		if (!this._currentSessionId) {
			vscode.window.showInformationMessage('Ziq: No active Pi session to compact.');
			return;
		}
		try {
			const attachment = await this.getRuntimeAttachment();
			logPi(`Manual Pi compaction requested session=${this._currentSessionId}`);
			await attachment.compact();
			logPi(`Manual Pi compaction completed session=${this._currentSessionId}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logPi(`Manual Pi compaction FAILED session=${this._currentSessionId} error=${message}`);
			this.queueWebviewMessage({ type: 'error', message: `Compaction failed: ${message}` }, 'compaction_error');
		}
	}

	private handleGetEditorContext(): void {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const doc = editor.document;
			const sel = editor.selection;
			const selectedText = !sel.isEmpty ? doc.getText(sel) : '';
			const relPath = vscode.workspace.asRelativePath(doc.uri);
			this._view?.webview.postMessage({
				type: 'addContextItem',
				item: {
					id: 'active-' + Date.now(),
					name: relPath + (!sel.isEmpty ? ` (${sel.start.line + 1}-${sel.end.line + 1})` : ''),
					path: relPath,
					content: selectedText || doc.getText(),
					icon: 'codicon-file-code',
					type: 'file',
				},
			});
		} else {
			vscode.window.showInformationMessage('No active editor file detected.');
		}
	}


	private imageMimeType(uri: vscode.Uri): string | undefined {
		const ext = uri.path.toLowerCase().split('.').pop() || '';
		const mimeByExtension: Record<string, string> = {
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			webp: 'image/webp',
			gif: 'image/gif',
			bmp: 'image/bmp',
		};
		return mimeByExtension[ext];
	}

	private async handleAttachContextPicker(): Promise<void> {
		interface ContextOption extends vscode.QuickPickItem {
			action: string;
		}

		const activeEditor = vscode.window.activeTextEditor;
		const activeDocName = activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : undefined;
		const hasSelection = activeEditor && !activeEditor.selection.isEmpty;

		const options: ContextOption[] = [
			{
				label: '$(file) Attach File...',
				description: 'Attach a file as a native Pi file input',
				action: 'file',
			},
			{
				label: '$(file-media) Attach Image...',
				description: 'Attach an image for vision-capable models',
				action: 'image',
			},
			{
				label: '$(file-code) Active Editor File',
				description: activeDocName || 'No open file',
				detail: hasSelection ? 'Attach selected code lines' : 'Attach complete file content',
				action: 'activeEditor',
			},
			{
				label: '$(search) Choose Workspace File...',
				description: 'Search & attach any file across workspace',
				detail: 'Quickly find and attach files by filename',
				action: 'workspaceFile',
			},
			{
				label: '$(warning) Diagnostics & Problems',
				description: 'Active compiler / linter issues',
				detail: 'Attach active errors and warnings to prompt fixes',
				action: 'diagnostics',
			},
			{
				label: '$(folder-opened) Browse File from Disk...',
				description: 'Open file system picker',
				detail: 'Attach arbitrary file from your machine',
				action: 'browseFile',
			},
		];

		const chosen = await vscode.window.showQuickPick(options, {
			placeHolder: 'Select context to attach to conversation',
			ignoreFocusOut: true,
		});
		if (!chosen) return;

		if (chosen.action === 'image') {
			const picked = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: { Images: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
			});
			if (picked?.[0]) {
				const mimeType = this.imageMimeType(picked[0]);
				if (!mimeType) {
					vscode.window.showWarningMessage('Unsupported image type.');
					return;
				}
				const bytes = await vscode.workspace.fs.readFile(picked[0]);
				this._view?.webview.postMessage({
					type: 'addContextItem',
					item: {
						id: 'image-' + Date.now(),
						name: vscode.workspace.asRelativePath(picked[0]),
						path: picked[0].fsPath,
						content: '',
						data: Buffer.from(bytes).toString('base64'),
						mimeType,
						icon: 'codicon-file-media',
						type: 'image',
						nativeAttachment: true,
					},
				});
			}
		} else if (chosen.action === 'file') {
			const picked = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
			});
			if (picked?.[0]) {
				this._view?.webview.postMessage({
					type: 'addContextItem',
					item: {
						id: 'file-' + Date.now(),
						name: vscode.workspace.asRelativePath(picked[0]),
						path: picked[0].fsPath,
						content: '',
						icon: 'codicon-file',
						type: 'file',
						nativeAttachment: true,
					},
				});
			}
		} else if (chosen.action === 'activeEditor') {
			this.handleGetEditorContext();
		} else if (chosen.action === 'workspaceFile') {
			const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**,**/.git/**,**/dist/**,**/build/**', 60);
			const fileItems = uris.map(u => ({
				label: vscode.workspace.asRelativePath(u),
				uri: u,
			}));
			const pickedFile = await vscode.window.showQuickPick(fileItems, {
				placeHolder: 'Type to filter workspace files...',
				ignoreFocusOut: true,
			});
			if (pickedFile) {
				try {
					const bytes = await vscode.workspace.fs.readFile(pickedFile.uri);
					const content = Buffer.from(bytes).toString('utf8');
					this._view?.webview.postMessage({
						type: 'addContextItem',
						item: {
							id: 'ws-' + Date.now(),
							name: pickedFile.label,
							path: pickedFile.uri.fsPath,
							content: '',
							icon: 'codicon-file',
							type: 'file',
						},
					});
				} catch (e: unknown) {
					const msg = e instanceof Error ? e.message : String(e);
					vscode.window.showErrorMessage(`Failed to read file: ${msg}`);
				}
			}
		} else if (chosen.action === 'diagnostics') {
			const allDiags = vscode.languages.getDiagnostics();
			const lines: string[] = [];
			for (const [uri, diags] of allDiags) {
				if (diags.length > 0) {
					const rel = vscode.workspace.asRelativePath(uri);
					for (const d of diags) {
						const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
						lines.push(`[${sev}] ${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} - ${d.message}`);
					}
				}
			}
			if (lines.length > 0) {
				this._view?.webview.postMessage({
					type: 'addContextItem',
					item: {
						id: 'diag-' + Date.now(),
						name: `Problems (${lines.length})`,
						path: 'diagnostics',
						content: lines.slice(0, 30).join('\n'),
						icon: 'codicon-warning',
						type: 'text',
					},
				});
			} else {
				vscode.window.showInformationMessage('No active problems or errors found in workspace.');
			}
		} else if (chosen.action === 'browseFile') {
			const picked = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
			});
			if (picked && picked[0]) {
				try {
					const rel = vscode.workspace.asRelativePath(picked[0]);
					this._view?.webview.postMessage({
						type: 'addContextItem',
						item: {
							id: 'browse-' + Date.now(),
							name: rel,
							path: picked[0].fsPath,
							content: '',
							icon: 'codicon-file',
							type: 'file',
							nativeAttachment: true,
						},
					});
				} catch (e: unknown) {
					const msg = e instanceof Error ? e.message : String(e);
					vscode.window.showErrorMessage(`Failed to read file: ${msg}`);
				}
			}
		}
	}
}
