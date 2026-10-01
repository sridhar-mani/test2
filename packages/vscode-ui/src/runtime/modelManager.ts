import * as vscode from 'vscode';
import { PiSettings } from '../config/settings';
import {
	readVscodeCustomModels,
	syncOllamaModels,
	addCustomModel,
	setActiveModelId,
	getActiveModelId,
	normalizeEndpointUrl,
	promptAndAddCustomProvider,
} from '../backend-bridge';

export interface ModelEntry {
	id: string;
	name: string;
	provider: string;
	baseUrl?: string;
	details?: string;
	reasoning?: boolean;
}

export class ModelManager {
	private static instance: ModelManager;
	private isOllamaConnected: boolean = false;
	private _onDidChangeModels = new vscode.EventEmitter<void>();
	readonly onDidChangeModels = this._onDidChangeModels.event;

	private constructor() {
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('pi')) {
				this._onDidChangeModels.fire();
			}
		});
	}

	static getInstance(): ModelManager {
		if (!ModelManager.instance) {
			ModelManager.instance = new ModelManager();
		}
		return ModelManager.instance;
	}

	get isOllamaOnline(): boolean {
		return this.isOllamaConnected || this.getAllModels().some((m) => m.provider === 'ollama');
	}

	async syncOllama(notify: boolean = false): Promise<void> {
		try {
			const models = await syncOllamaModels({ notify });
			this.isOllamaConnected = models.length > 0;
		} catch (err) {
			this.isOllamaConnected = false;
			if (notify) {
				vscode.window.showWarningMessage(`Pi: Could not connect to Ollama at ${PiSettings.ollamaUrl}`);
			}
		}

		// Ensure active model is valid
		const currentActive = PiSettings.activeModel || getActiveModelId();
		const all = this.getAllModels();
		if (!currentActive || !all.some((m) => m.id === currentActive)) {
			if (all.length > 0) {
				await PiSettings.setActiveModel(all[0].id);
				await setActiveModelId(all[0].id);
			}
		}

		this._onDidChangeModels.fire();
	}

	getAllModels(): ModelEntry[] {
		const custom = readVscodeCustomModels();
		return custom.map((m) => {
			const hasReasoning = Boolean(m.thinking || m.reasoning);
			const detailsParts: string[] = [];
			if (m.isOllama) {
				detailsParts.push('Ollama');
			} else if (m.contextWindow) {
				detailsParts.push(`${Math.round(m.contextWindow / 1000)}k ctx`);
			}
			if (hasReasoning) {
				detailsParts.push('Reasoning');
			}
			return {
				id: m.id,
				name: m.name || m.label || m.id,
				provider: m.isOllama ? ('ollama' as const) : ('byom' as const),
				baseUrl: m.baseUrl || m.url,
				reasoning: hasReasoning,
				details: detailsParts.length > 0 ? detailsParts.join(' • ') : undefined,
			};
		});
	}

	getActiveModel(): ModelEntry | undefined {
		const id = PiSettings.activeModel || getActiveModelId();
		const all = this.getAllModels();
		return all.find((m) => m.id === id) || all[0];
	}

	async promptSelectModel(): Promise<void> {
		const all = this.getAllModels();
		if (all.length === 0) {
			const res = await vscode.window.showWarningMessage(
				'No models available. Sync Ollama or add a custom model?',
				'Sync Ollama',
				'Add Model'
			);
			if (res === 'Sync Ollama') await this.syncOllama(true);
			if (res === 'Add Model') await this.promptAddModel();
			return;
		}

		const currentActive = PiSettings.activeModel || getActiveModelId();
		const items = all.map((m) => ({
			label: m.name,
			description: m.provider === 'ollama' ? 'Ollama' : (m.reasoning ? 'Custom (Reasoning)' : 'Custom (BYOM)'),
			detail: m.id === currentActive ? '✓ Currently Active' : (m.details || m.baseUrl),
			modelId: m.id,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select active model for Pi Assistant',
		});

		if (selected) {
			await PiSettings.setActiveModel(selected.modelId);
			await setActiveModelId(selected.modelId);
			this._onDidChangeModels.fire();
			vscode.window.showInformationMessage(`Pi: Active model set to ${selected.label}`);
		}
	}

	async promptAddModel(): Promise<void> {
		await promptAndAddCustomProvider();
		this._onDidChangeModels.fire();
	}
}
