import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ModelEntry, ChatMessage, AttachedContext, WebviewIncomingMessage, ExecutionItem, ToolCallRecord } from './types';
import { getVsCodeApi } from './vscode';
import { ModelSelector } from './components/ModelSelector';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';

interface WebviewPersistedState {
	messages?: ChatMessage[];
	attachedContexts?: AttachedContext[];
}

async function fileToBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = '';
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
	}
	return btoa(binary);
}

export const App: React.FC = () => {
	const vscode = getVsCodeApi();
	const savedState = (vscode.getState() as WebviewPersistedState) || {};

	const [models, setModels] = useState<ModelEntry[]>([]);
	const [activeModelId, setActiveModelId] = useState<string>('');
	const [isOllamaOnline, setIsOllamaOnline] = useState<boolean>(false);

	const [messages, setMessages] = useState<ChatMessage[]>(savedState.messages || []);
	const [attachedContexts, setAttachedContexts] = useState<AttachedContext[]>(savedState.attachedContexts || []);
	const [prompt, setPrompt] = useState<string>('');
	const [sessionName, setSessionName] = useState<string>('New Session');
	const [worktree, setWorktree] = useState<{ path: string; branch: string } | undefined>();
	const [editingEntryId, setEditingEntryId] = useState<string | undefined>();
	const [sendMode, setSendMode] = useState<'send' | 'queue' | 'steer'>('send');
	const [queuedMessages, setQueuedMessages] = useState<string[]>([]);

	const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [turnIndicator, setTurnIndicator] = useState<string>('Ready');
		const [streamingContent, setStreamingContent] = useState<string>('');
	const [liveActivity, setLiveActivity] = useState<ExecutionItem[]>([]);
	const [, setActiveStreamId] = useState<string | null>(null);
	const isGeneratingRef = useRef(false);

	const latestStreamRef = useRef<{ thinking: string; content: string }>({ thinking: '', content: '' });
	const skipNextStreamEndRef = useRef(false);
		const liveActivityRef = useRef<ExecutionItem[]>([]);
	const activityFlushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
	const activityFlushPendingRef = useRef(false);

	const scheduleActivityRender = (): void => {
		if (activityFlushPendingRef.current) return;
		activityFlushPendingRef.current = true;
		activityFlushTimerRef.current = setTimeout(() => {
			activityFlushPendingRef.current = false;
			activityFlushTimerRef.current = undefined;
			setLiveActivity([...liveActivityRef.current]);
		}, 50);
	};

	// Persist chat state across tab switches and window reloads
	useEffect(() => {
		const persistedContexts = attachedContexts
			.filter((context) => context.type !== 'image')
			.map(({ data: _data, ...context }) => context);
		vscode.setState({ messages, attachedContexts: persistedContexts });
	}, [messages, attachedContexts, vscode]);

	// Handle incoming messages from VS Code
	useEffect(() => {
		const handleMessage = (event: MessageEvent<WebviewIncomingMessage>) => {
			const msg = event.data;
			if (!msg || !msg.type) return;

			switch (msg.type) {
				case 'queueAccepted':
					setTurnIndicator(msg.mode === 'queue' ? 'Queued' : 'Steering…');
					setSendMode('send');
					break;

				case 'queueUpdate':
					setQueuedMessages([...msg.steering, ...msg.followUp]);
					break;

				case 'updateModels':
					setModels(msg.models || []);
					if (msg.activeModelId) setActiveModelId(msg.activeModelId);
					setIsOllamaOnline(Boolean(msg.isOllamaOnline));
					break;

				case 'streamStart':
					isGeneratingRef.current = true;
					setIsGenerating(true);
					setActiveStreamId(msg.streamId || String(Date.now()));
					setTurnIndicator('Thinking…');
					latestStreamRef.current = { thinking: '', content: '' };
					liveActivityRef.current = [];
					setLiveActivity([]);
					setStreamingContent('');
					break;

				case 'streamThinkingStart': {
					const segmentId = msg.segmentId || `thinking-${Date.now()}-${Math.random()}`;
					liveActivityRef.current.push({
						id: segmentId,
						kind: 'thinking',
						status: 'streaming',
						text: '',
						startedAt: Date.now(),
					});
					setTurnIndicator('Thinking…');
					scheduleActivityRender();
					break;
				}

				case 'streamThinkingDelta': {
					const delta = msg.text || '';
					if (!delta) break;
					latestStreamRef.current.thinking += delta;
					const active = [...liveActivityRef.current].reverse().find((item): item is Extract<ExecutionItem, { kind: 'thinking' }> => item.kind === 'thinking' && item.status === 'streaming');
					if (active) active.text += delta;
					setTurnIndicator('Thinking…');
					scheduleActivityRender();
					break;
				}

				case 'streamThinkingEnd': {
					const active = [...liveActivityRef.current].reverse().find((item): item is Extract<ExecutionItem, { kind: 'thinking' }> => item.kind === 'thinking' && item.status === 'streaming');
					if (active) {
						if (typeof msg.text === 'string' && msg.text.length > active.text.length) active.text = msg.text;
						active.status = 'complete';
						active.endedAt = Date.now();
					}
					setTurnIndicator('Generating…');
					scheduleActivityRender();
					break;
				}

				case 'streamDelta': {
					const delta = msg.text || '';
					if (!delta) break;
					latestStreamRef.current.content += delta;
					setStreamingContent((current) => current + delta);
					setTurnIndicator('Generating…');
					break;
				}

				case 'toolExecutionStart': {
					const kind: ToolCallRecord['kind'] = msg.toolName === 'run_subagent' ? 'subagent' : 'tool';
					const record: ToolCallRecord = {
						id: msg.toolCallId,
						kind,
						name: msg.toolName,
						args: msg.args,
						status: 'running',
						startedAt: Date.now(),
					};
					liveActivityRef.current.push(record);
					setTurnIndicator(kind === 'subagent' ? 'Running subagent…' : `Running ${msg.toolName}…`);
					scheduleActivityRender();
					break;
				}

				case 'toolExecutionUpdate': {
					const record = liveActivityRef.current.find((item): item is ToolCallRecord => item.kind === 'tool' || item.kind === 'subagent' ? item.id === msg.toolCallId : false);
					if (record) {
						const partial = msg.partialResult;
						const preview = partial?.content?.map?.((part: any) => part?.text || '').join('\n')
							|| (typeof partial === 'string' ? partial : partial ? JSON.stringify(partial) : '');
						record.result = preview.slice(0, 1600);
					}
					scheduleActivityRender();
					break;
				}

				case 'toolExecutionEnd': {
					const record = liveActivityRef.current.find((item): item is ToolCallRecord => (item.kind === 'tool' || item.kind === 'subagent') && item.id === msg.toolCallId);
					if (record) {
						record.status = msg.isError ? 'error' : 'completed';
						record.result = msg.result;
						record.details = msg.details;
						record.isError = msg.isError;
						record.endedAt = Date.now();
					}
					setTurnIndicator('Generating…');
					scheduleActivityRender();
					break;
				}

				case 'streamEnd': {
					isGeneratingRef.current = false;
					setIsGenerating(false);
					if (skipNextStreamEndRef.current) {
						skipNextStreamEndRef.current = false;
						latestStreamRef.current = { thinking: '', content: '' };
						liveActivityRef.current = [];
						setLiveActivity([]);
						setStreamingContent('');
						setActiveStreamId(null);
						break;
					}
					setTurnIndicator('Ready');
					const finalContent = typeof msg.text === 'string' ? msg.text : latestStreamRef.current.content;
					const finalActivity = liveActivityRef.current.map((item) =>
						item.kind === 'thinking' && item.status === 'streaming'
							? { ...item, status: 'complete' as const, endedAt: Date.now() }
							: { ...item },
					);
					const finalToolCalls = finalActivity.filter((item): item is ToolCallRecord => item.kind === 'tool' || item.kind === 'subagent');
					if (finalContent || finalActivity.length > 0) {
						setMessages((prev) => [
							...prev,
							{
								id: String(Date.now()),
								role: 'assistant',
								content: finalContent,
								toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
								activity: finalActivity.length > 0 ? finalActivity : undefined,
								timestamp: Date.now(),
							},
						]);
					}
					latestStreamRef.current = { thinking: '', content: '' };
					liveActivityRef.current = [];
					setLiveActivity([]);
					setStreamingContent('');
					setActiveStreamId(null);
					break;
				}

				case 'generationStopped':
					isGeneratingRef.current = false;
					setIsGenerating(false);
					setTurnIndicator('Ready');
					setActiveStreamId(null);
					break;

				case 'sessionInfo':
					setSessionName(msg.name || 'New Session');
					setWorktree(msg.worktree);
					break;

				case 'restoreHistory':
					if (Array.isArray(msg.messages) && msg.messages.length > 0) {
						if (isGeneratingRef.current) skipNextStreamEndRef.current = true;
						setMessages(msg.messages);
						vscode.setState({ messages: msg.messages, attachedContexts });
						setEditingEntryId(undefined);
					}
					break;

				case 'addContextItem':
					if (msg.item) {
						setAttachedContexts((prev) => {
							const existing = prev.findIndex((c) => c.name === msg.item.name);
							if (existing >= 0) {
								const copy = [...prev];
								copy[existing] = msg.item;
								return copy;
							}
							return [...prev, msg.item];
						});
					}
					break;

				case 'editorContext':
					if (msg.fileName) {
						const ctx: AttachedContext = {
							id: `editor-${Date.now()}`,
							name: `${msg.fileName}${msg.selectedText ? ` (${msg.startLine}-${msg.endLine})` : ''}`,
							path: msg.fileName,
							content: msg.selectedText || msg.fullText || '',
							icon: 'codicon-file-code',
							type: 'file',
						};
						setAttachedContexts((prev) => [...prev, ctx]);
					}
					break;

				case 'compactionStart':
					setTurnIndicator('Compacting…');
					break;

				case 'compactionDone':
					setTurnIndicator('Ready');
					if (msg.summary) {
						setMessages((prev) => [
							...prev,
							{
								id: String(Date.now()),
								role: 'system',
								content: msg.summary || 'Context compacted.',
								timestamp: Date.now(),
							},
						]);
					}
					break;

				case 'error':
					isGeneratingRef.current = false;
					setIsGenerating(false);
					setTurnIndicator('Error');
					setMessages((prev) => [
						...prev,
						{
							id: String(Date.now()),
							role: 'system',
							content: `Error: ${msg.message}`,
							timestamp: Date.now(),
						},
					]);
					break;

			}
		};

		window.addEventListener('message', handleMessage);
		// Notify extension host that webview is ready
		vscode.postMessage({ command: 'ready' });

		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const handleSend = useCallback(() => {
		const rawText = prompt.trim();
		if (!rawText && attachedContexts.length === 0) return;

		const nativeFiles = attachedContexts
			.filter((context) => context.nativeAttachment && context.type === 'file' && context.path)
			.map((context) => ({ kind: 'file' as const, path: context.path!, name: context.name }));
		const nativeImages = attachedContexts
			.filter((context) => context.nativeAttachment && context.type === 'image' && context.data && context.mimeType)
			.map((context) => ({ kind: 'image' as const, data: context.data!, mimeType: context.mimeType!, name: context.name }));
		const inlineContexts = attachedContexts.filter((context) => !context.nativeAttachment || context.type === 'text');

		let fullPrompt = rawText;
		if (inlineContexts.length > 0) {
			const contextBlocks = inlineContexts
				.map((context) => `=== Context: ${context.name} (${context.type}) ===\n\`\`\`\n${context.content}\n\`\`\``)
				.join('\n\n');
			const promptInstruction = rawText || 'Please review the attached context and fulfill the user request.';
			fullPrompt = `Provided context:\n\n${contextBlocks}\n\nTask:\n${promptInstruction}`;
		} else if (!fullPrompt && (nativeFiles.length > 0 || nativeImages.length > 0)) {
			fullPrompt = 'Please review the attached files/images and fulfill the user request.';
		}

		const userTurn: ChatMessage = {
			id: String(Date.now()),
			entryId: editingEntryId,
			role: 'user',
			content: [
				rawText,
				...nativeFiles.map((attachment) => `[Attached file: ${attachment.name}]`),
				...nativeImages.map((attachment) => `[Attached image: ${attachment.name}]`),
				...inlineContexts.map((context) => `[Attached: ${context.name}]`),
			].filter(Boolean).join('\n') || 'Attached context',
			timestamp: Date.now(),
		};

		const editedIndex = editingEntryId ? messages.findIndex((item) => item.entryId === editingEntryId) : -1;
		const nextHistory = editedIndex >= 0
			? [...messages.slice(0, editedIndex), userTurn]
			: [...messages, userTurn];
		setMessages(nextHistory);
		setPrompt('');
		setAttachedContexts([]);
		setEditingEntryId(undefined);

		vscode.postMessage({
			command: 'sendMessage',
			text: fullPrompt,
			history: nextHistory,
			attachments: [...nativeFiles, ...nativeImages],
			editEntryId: editingEntryId,
			mode: editingEntryId ? 'send' : sendMode,
		});
	}, [prompt, attachedContexts, messages, vscode, editingEntryId, sendMode]);

	const handleDropFiles = useCallback(async (files: FileList | File[]) => {
		for (const file of Array.from(files).slice(0, 5)) {
			try {
				if (file.type.startsWith('image/')) {
					const data = await fileToBase64(file);
					setAttachedContexts((prev) => [...prev, {
						id: `image-${Date.now()}-${Math.random()}`,
						name: file.name || 'Pasted image',
						content: '',
						data,
						mimeType: file.type,
						icon: 'codicon-file-media',
						type: 'image',
						nativeAttachment: true,
					}]);
				} else if (file.size <= 300_000) {
					const content = await file.text();
					setAttachedContexts((prev) => [...prev, {
						id: `drop-${Date.now()}-${Math.random()}`,
						name: file.name || 'Dropped file',
						content,
						icon: 'codicon-file',
						type: 'text',
					}]);
				} else {
					setMessages((prev) => [...prev, {
						id: String(Date.now()),
						role: 'system',
						content: `Skipped ${file.name}: dropped text files are limited to 300 KB.`,
						timestamp: Date.now(),
					}]);
				}
			} catch (error) {
				setMessages((prev) => [...prev, {
					id: String(Date.now()),
					role: 'system',
					content: `Could not attach ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
					timestamp: Date.now(),
				}]);
			}
		}
	}, []);

	const handleStop = useCallback(() => {
		vscode.postMessage({ command: 'stopGeneration' });
		setIsGenerating(false);
		setTurnIndicator('Ready');
	}, []);

	const handleSelectModel = useCallback((modelId: string) => {
		setActiveModelId(modelId);
		vscode.postMessage({ command: 'switchModel', modelId });
	}, []);

	const handleAddModel = useCallback(() => {
		vscode.postMessage({ command: 'addModel' });
	}, []);

	const handleSyncOllama = useCallback(() => {
		vscode.postMessage({ command: 'syncOllama' });
	}, []);

	const handleEditMessage = useCallback((message: ChatMessage) => {
		setEditingEntryId(message.entryId);
		setPrompt(message.content);
		setSendMode('send');
	}, []);

	const handleNewSession = useCallback(() => {
		vscode.postMessage({ command: 'newSession' });
		setMessages([]);
		setAttachedContexts([]);
		setStreamingContent('');
		liveActivityRef.current = [];
		setLiveActivity([]);
		setTurnIndicator('Ready');
		setSessionName('New Session');
		setWorktree(undefined);
		setEditingEntryId(undefined);
		setSendMode('send');
		vscode.setState({});
	}, [vscode]);

	const handleClearSession = handleNewSession;


	const handleQuickCommand = useCallback((cmd: string) => {
		if (cmd === '/compact') {
			vscode.postMessage({ command: 'compact', history: messages });
			return;
		}
		if (cmd === '/terminal') {
			vscode.postMessage({ command: 'openTerminal' });
			return;
		}
		if (cmd === '/clear') {
			handleClearSession();
			return;
		}
		const promptMap: Record<string, string> = {
			'/explain': 'Explain the architecture and main logic of this code in detail.',
			'/fix': 'Diagnose any bugs, syntax errors, or potential runtime issues and provide corrected implementations.',
			'/test': 'Generate comprehensive unit tests covering edge cases, assertions, and mocks for this code.',
			'/docs': 'Generate production-ready documentation, JSDoc/docstrings, and usage examples for this code.',
		};
		if (promptMap[cmd]) {
			if (attachedContexts.length === 0) {
				vscode.postMessage({ command: 'getEditorContext' });
			}
			setPrompt(promptMap[cmd]);
		}
	}, [attachedContexts.length, messages, handleClearSession]);

	return (
		<div className="assistant-shell">
			<header className="assistant-header">
				<div className="brand-row">
					<div className="brand">
						<div className="brand-mark" aria-hidden="true">
							<i className="codicon codicon-sparkle" />
						</div>
						<div className="brand-copy">
							<strong>Ziq</strong>
							<span>AI coding assistant</span>
							<small className="session-name">{sessionName}</small>
						</div>
					</div>
					<div className="header-actions">
						<button
							type="button"
							className="icon-button"
							onClick={handleAddModel}
							title="Add custom model"
							aria-label="Add custom model"
						>
							<i className="codicon codicon-add" />
						</button>
						<button
							type="button"
							className="icon-button"
							onClick={handleClearSession}
							title="Start a new session"
							aria-label="Start a new session"
						>
							<i className="codicon codicon-new-file" />
						</button>
						<button
							type="button"
							className="icon-button"
							onClick={() => vscode.postMessage({ command: 'openSettings' })}
							title="Settings"
							aria-label="Settings"
						>
							<i className="codicon codicon-settings-gear" />
						</button>
					</div>
				</div>

				<ModelSelector
					models={models}
					activeModelId={activeModelId}
					isOllamaOnline={isOllamaOnline}
					onSelectModel={handleSelectModel}
					onAddModel={handleAddModel}
					onSyncOllama={handleSyncOllama}
				/>
			</header>

			{worktree && (
				<div className="worktree-banner" role="status">
					<div className="worktree-copy">
						<strong>Isolated worktree</strong>
						<span>{worktree.branch}</span>
					</div>
					<div className="worktree-actions">
						<button type="button" onClick={() => vscode.postMessage({ command: 'mergeWorktree' })}>Merge</button>
						<button type="button" onClick={() => vscode.postMessage({ command: 'discardWorktree' })}>Discard</button>
					</div>
				</div>
			)}

			<MessageList
				messages={messages}
				onEditMessage={handleEditMessage}
				streamingContent={streamingContent}
				isGenerating={isGenerating}
				liveActivity={liveActivity}
				onSuggestionClick={handleQuickCommand}
				onAttachClick={() => vscode.postMessage({ command: 'attachContextPicker' })}
				onOpenTerminal={() => vscode.postMessage({ command: 'openTerminal' })}
			/>

			{queuedMessages.length > 0 && (
				<div className="queue-strip" role="status">
					<strong>{queuedMessages.length} queued</strong>
					{queuedMessages.slice(0, 3).map((item, index) => (
						<span key={index} className="queue-item">{item}</span>
					))}
				</div>
			)}
			<Composer
				prompt={prompt}
				sendMode={sendMode}
				onSendModeChange={setSendMode}
				onCreateSkill={() => vscode.postMessage({ command: 'createSkill' })}
				onPromptChange={setPrompt}
				onSend={handleSend}
				onStop={handleStop}
				isGenerating={isGenerating}
				turnIndicator={turnIndicator}
				turnCount={messages.filter((m) => m.role === 'user').length}
				attachedContexts={attachedContexts}
				onRemoveContext={(id) => setAttachedContexts((prev) => prev.filter((c) => c.id !== id))}
				onAttachContext={() => vscode.postMessage({ command: 'attachContextPicker' })}
				onDropFiles={handleDropFiles}
				onQuickCommand={handleQuickCommand}
			/>
		</div>
	);
};
