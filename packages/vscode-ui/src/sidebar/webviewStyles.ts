export function getWebviewStyles(): string {
	return `
		:root {
			color-scheme: light dark;
			--ui-border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.25)));
			--ui-hover: var(--vscode-list-hoverBackground, rgba(128,128,128,.10));
			--ui-active: var(--vscode-list-activeSelectionBackground, rgba(128,128,128,.16));
			--ui-muted: var(--vscode-descriptionForeground);
			--ui-accent: var(--vscode-textLink-foreground, var(--vscode-focusBorder));
		}
		* { box-sizing: border-box; }
		html, body, #root { width: 100%; height: 100%; margin: 0; padding: 0; }
		body {
			overflow: hidden;
			background: var(--vscode-sideBar-background);
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
			font-size: var(--vscode-font-size, 13px);
		}
		#root {
			display: flex;
			flex-direction: column;
			min-height: 0;
			overflow: hidden;
		}
		.assistant-shell {
			width: 100%;
			height: 100%;
			min-height: 0;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}
		button, textarea, select { font: inherit; }
		button { color: inherit; }
		button:focus-visible, select:focus-visible, textarea:not(.composer-textarea):not(#promptInput):focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
		.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

		.assistant-header {
			padding: 10px 10px 8px;
			border-bottom: 1px solid var(--ui-border);
			background: var(--vscode-sideBar-background);
			flex: 0 0 auto;
		}
		.brand-row, .status-row, .composer-toolbar, .composer-status, .composer-tools, .header-actions {
			display:flex; align-items:center;
		}
		.brand-row { justify-content:space-between; gap:8px; }
		.brand { display:flex; align-items:center; gap:8px; min-width:0; }
		.brand-mark, .welcome-mark {
			display:flex; align-items:center; justify-content:center;
			background: var(--vscode-button-secondaryBackground, var(--ui-active));
			border:1px solid var(--ui-border);
			color:var(--ui-accent);
		}
		.brand-mark { width:26px; height:26px; border-radius:7px; }
		.brand-copy { display:flex; flex-direction:column; min-width:0; }
		.brand-copy strong { font-size:13px; line-height:16px; font-weight:600; }
		.brand-copy span { color:var(--ui-muted); font-size:10px; line-height:13px; }
		.session-name { color:var(--vscode-descriptionForeground); font-size:9px; line-height:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; }
		.header-actions { gap:2px; }
		.icon-button, .quiet-button, .toolbar-button {
			border:1px solid transparent; background:transparent; cursor:pointer;
			display:inline-flex; align-items:center; justify-content:center;
			color:var(--ui-muted); border-radius:5px;
		}
		.icon-button { width:26px; height:26px; }
		.icon-button:hover, .quiet-button:hover, .toolbar-button:hover { color:var(--vscode-foreground); background:var(--ui-hover); }
		.model-picker {
			position:relative; display:flex; align-items:center; gap:6px; height:32px;
			margin-top:8px; padding:0 8px;
			border:1px solid var(--ui-border); border-radius:6px;
			background:var(--vscode-input-background);
		}
		.model-picker:focus-within { border-color:var(--vscode-focusBorder); }
		.model-picker-leading { color:var(--ui-accent); display:flex; }
		.model-picker-trailing { color:var(--ui-muted); display:flex; pointer-events:none; }
		.model-dropdown {
			min-width:0; flex:1; appearance:none; border:0; outline:0;
			background:transparent; color:var(--vscode-input-foreground);
			font-size:12px; cursor:pointer; text-overflow:ellipsis;
		}
		.status-row { justify-content:space-between; min-height:20px; padding:5px 1px 0; }
		.status-text { min-width:0; display:flex; align-items:center; gap:6px; color:var(--ui-muted); font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
		.status-dot { width:6px; height:6px; border-radius:50%; flex:0 0 auto; }
		.dot-online { background:var(--vscode-testing-iconPassed, #73c991); }
		.dot-offline { background:var(--vscode-testing-iconFailed, #f14c4c); }
		.quiet-button { width:22px; height:22px; font-size:11px; }

		.messages-feed { flex:1 1 auto; min-height:0; overflow-y:auto; padding:18px 12px 12px; scroll-behavior:smooth; }
		.welcome { max-width:560px; margin:5vh auto 0; text-align:center; }
		.welcome-mark { width:42px; height:42px; margin:0 auto 12px; border-radius:12px; font-size:20px; }
		.welcome h1 { margin:0; font-size:16px; line-height:22px; font-weight:600; letter-spacing:-.01em; }
		.welcome > p { max-width:360px; margin:6px auto 18px; color:var(--ui-muted); font-size:11px; line-height:17px; }
		.welcomeGrid { display:grid; grid-template-columns:1fr 1fr; gap:7px; text-align:left; }
		.suggestion-card {
			min-width:0; display:flex; align-items:flex-start; gap:9px; padding:10px;
			border:1px solid var(--ui-border); border-radius:7px;
			background:var(--vscode-editor-background); cursor:pointer; text-align:left;
			transition:background .12s ease, border-color .12s ease, transform .12s ease;
		}
		.suggestion-card:hover { background:var(--ui-hover); border-color:var(--vscode-focusBorder); transform:translateY(-1px); }
		.suggestion-card > i { flex:0 0 auto; margin-top:1px; color:var(--ui-accent); font-size:14px; }
		.suggestion-card span { min-width:0; display:flex; flex-direction:column; gap:2px; }
		.suggestion-card strong { font-size:11px; font-weight:600; }
		.suggestion-card small { color:var(--ui-muted); font-size:10px; line-height:14px; }

		.markdown-body { min-width:0; }
		.markdown-body p { margin:0 0 9px; }
		.markdown-body p:last-child { margin-bottom:0; }
		.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin:14px 0 7px; line-height:1.3; font-weight:600; }
		.markdown-body h1 { font-size:1.35em; }
		.markdown-body h2 { font-size:1.22em; }
		.markdown-body h3 { font-size:1.1em; }
		.markdown-body ul, .markdown-body ol { margin:6px 0 10px 20px; padding:0; }
		.markdown-body li { margin:2px 0; }
		.markdown-body blockquote { margin:8px 0; padding:2px 10px; border-left:3px solid var(--ui-border); color:var(--ui-muted); }
		.markdown-body hr { border:0; border-top:1px solid var(--ui-border); margin:12px 0; }
		.markdown-body a { color:var(--ui-accent); text-decoration:underline; text-underline-offset:2px; }
		.markdown-body .file-reference {
			display:inline-flex; align-items:center; gap:4px; max-width:100%; padding:0 2px;
			border:0; border-radius:3px; background:transparent; color:var(--ui-accent); cursor:pointer;
			font:inherit; font-size:inherit; line-height:inherit; vertical-align:baseline; text-align:left;
		}
		.markdown-body .file-reference:hover { background:var(--ui-hover); text-decoration:underline; }
		.markdown-body .file-reference .codicon { font-size:.9em; flex:0 0 auto; }
		.markdown-body .file-reference span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
		.markdown-body table { width:100%; border-collapse:collapse; margin:8px 0 10px; font-size:11px; }
		.markdown-body th, .markdown-body td { border:1px solid var(--ui-border); padding:5px 7px; text-align:left; vertical-align:top; }
		.markdown-body th { background:var(--ui-hover); font-weight:600; }
		.markdown-body tr:nth-child(even) td { background:color-mix(in srgb, var(--ui-hover) 35%, transparent); }
		.markdown-body img { max-width:100%; height:auto; border-radius:5px; }
		.message-card { display:flex; flex-direction:column; gap:5px; margin:0 auto 14px; max-width:720px; }
		.message-card-header { display:flex; align-items:center; gap:5px; color:var(--ui-muted); font-size:10px; font-weight:600; }
		.author-icon { color:var(--ui-accent); }
		.bubble { border-radius:7px; padding:9px 10px; font-size:12px; line-height:1.55; word-break:break-word; }
		.bubble-user { background:var(--vscode-chat-requestBackground, var(--vscode-button-secondaryBackground)); border:1px solid var(--ui-border); }
		.bubble-assistant { background:var(--vscode-editor-background); border:1px solid var(--ui-border); }
		.thinking-block {
			border:1px solid var(--ui-border);
			background:var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
			border-radius:7px;
			overflow:hidden;
			font-size:11px;
			margin:3px 0 6px;
		}
		.thinking-trigger {
			width:100%;
			display:flex;
			align-items:center;
			justify-content:space-between;
			padding:6px 9px;
			background:transparent;
			border:0;
			color:var(--ui-muted);
			font-weight:600;
			cursor:pointer;
			font-size:11px;
		}
		.thinking-trigger:hover {
			color:var(--vscode-foreground);
			background:var(--ui-hover);
		}
		.thinking-trigger-left {
			display:flex;
			align-items:center;
			gap:6px;
		}
		.thinking-chevron {
			font-size:11px;
			opacity:0.75;
		}
		.thinking-content {
			padding:7px 10px 9px 12px;
			border-top:1px solid var(--ui-border);
			color:var(--ui-muted);
			font-size:11px;
			line-height:1.55;
			background:rgba(0,0,0,0.06);
			max-height:150px;
			overflow:auto;
		}
		.thinking-inner {
			white-space:pre-wrap;
			word-break:break-word;
		}
		.context-pills { display:flex; flex-wrap:wrap; gap:4px; padding-bottom:5px; }
		.context-pill { display:flex; align-items:center; gap:5px; max-width:100%; padding:3px 6px; border:1px solid var(--ui-border); border-radius:5px; background:var(--ui-hover); font-size:10px; }
		.context-pill span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
		.context-pill-remove { cursor:pointer; color:var(--ui-muted); }
		.context-pill-remove:hover { color:var(--vscode-errorForeground); }

		.code-block { margin:8px 0; overflow:hidden; border:1px solid var(--ui-border); border-radius:6px; background:var(--vscode-textCodeBlock-background); }
		.code-block-header { display:flex; align-items:center; justify-content:space-between; padding:4px 7px; border-bottom:1px solid var(--ui-border); color:var(--ui-muted); font-size:10px; gap:6px; }
		.code-block-streaming-badge { margin-left:4px; padding:1px 5px; border-radius:3px; background:var(--vscode-charts-blue, #0078d4); color:#fff; font-size:9px; opacity:.8; }
		.code-block-actions { display:flex; gap:2px; margin-left:auto; }
		.code-action-btn { border:0; border-radius:4px; padding:3px 5px; background:transparent; color:var(--ui-muted); cursor:pointer; font-size:10px; display:inline-flex; align-items:center; gap:3px; }
		.code-action-btn:hover { background:var(--ui-hover); color:var(--vscode-foreground); }
		pre { margin:0; padding:9px; overflow:auto; font-family:var(--vscode-editor-font-family, monospace); font-size:11px; line-height:1.5; }
		code { font-family:var(--vscode-editor-font-family, monospace); }

		.execution-timeline { display:flex; flex-direction:column; gap:5px; margin:4px 0 7px; }
		.execution-timeline-item { min-width:0; }
		.execution-timeline-thinking { border-left:2px solid var(--ui-border); padding-left:6px; }
		.tool-call-heading { min-width:0; display:flex; align-items:center; gap:6px; flex:1; }
		.tool-call-kind { color:var(--ui-muted); font-size:9px; font-weight:500; white-space:nowrap; }
		.tool-call-subagent { border-left:2px solid var(--vscode-charts-purple, #a277ff); }
		.tool-call-subagent .tool-call-icon { color:var(--vscode-charts-purple, #a277ff); }
		.tool-call-subagent-prompt { color:var(--ui-muted); font-size:10px; line-height:1.4; padding:1px 0 2px 18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
		.tool-calls-group { display:flex; flex-direction:column; gap:4px; margin:4px 0; }
		.tool-call-card { display:flex; flex-direction:column; gap:4px; padding:5px 8px; border-radius:6px; border:1px solid var(--ui-border); background:var(--vscode-editor-background); font-size:11px; }
		.tool-call-running { border-color:var(--vscode-charts-blue, rgba(0,120,212,.4)); background:color-mix(in srgb, var(--vscode-charts-blue, #0078d4) 6%, var(--vscode-editor-background)); }
		.tool-call-completed { border-color:var(--vscode-testing-iconPassed, rgba(115,201,145,.4)); background:color-mix(in srgb, var(--vscode-testing-iconPassed, #73c991) 5%, var(--vscode-editor-background)); }
		.tool-call-error { border-color:var(--vscode-testing-iconFailed, rgba(241,76,76,.4)); background:color-mix(in srgb, var(--vscode-testing-iconFailed, #f14c4c) 5%, var(--vscode-editor-background)); }
		.tool-call-header { display:flex; align-items:center; gap:6px; }
		.tool-call-icon { font-size:12px; flex:0 0 auto; }
		.tool-call-running .tool-call-icon { color:var(--vscode-charts-blue, #0078d4); }
		.tool-call-completed .tool-call-icon { color:var(--vscode-testing-iconPassed, #73c991); }
		.tool-call-error .tool-call-icon { color:var(--vscode-testing-iconFailed, #f14c4c); }
		.tool-call-name { font-family:var(--vscode-editor-font-family, monospace); font-size:11px; font-weight:600; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
		.tool-call-expand-icon { font-size:11px; color:var(--ui-muted); margin-left:auto; }
		.tool-call-result { color:var(--ui-muted); font-size:10px; line-height:1.45; white-space:pre-wrap; word-break:break-all; padding:3px 0 0 18px; overflow:hidden; max-height:80px; cursor:pointer; }
		.tool-call-result:hover { color:var(--vscode-foreground); }
		.tool-call-body { display:flex; flex-direction:column; gap:6px; padding:4px 0 2px 18px; }
		.tool-call-section { display:flex; flex-direction:column; gap:2px; }
		.tool-call-section-title { font-size:9px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; color:var(--ui-muted); }
		.tool-call-code, .tool-call-result-full { margin:0; padding:6px 8px; border-radius:4px; background:var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2)); border:1px solid var(--ui-border); font-family:var(--vscode-editor-font-family, monospace); font-size:10px; line-height:1.4; max-height:260px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
		@keyframes spin { to { transform:rotate(360deg); } }
		.codicon-modifier-spin { animation:spin 1.2s linear infinite; display:inline-block; }


		.message-edit-button { margin-left:auto; border:0; background:transparent; color:var(--ui-muted); cursor:pointer; padding:2px 4px; border-radius:4px; }
		.message-edit-button:hover { background:var(--ui-hover); color:var(--vscode-foreground); }
		.send-mode-select { height:26px; border:1px solid var(--ui-border); border-radius:5px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); font-size:10px; padding:0 4px; }
				.queue-strip { display:flex; align-items:center; gap:5px; flex-wrap:wrap; padding:4px 8px; margin:0 10px 4px; border:1px solid var(--ui-border); border-radius:6px; background:var(--vscode-textCodeBlock-background); color:var(--ui-muted); font-size:10px; }
		.queue-item { max-width:55%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:2px 5px; border-radius:4px; background:var(--ui-hover); color:var(--vscode-foreground); }
				.worktree-banner { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; margin:0 10px 6px; border:1px solid var(--ui-border); border-radius:7px; background:var(--vscode-editorWidget-background); }
		.worktree-copy { display:flex; flex-direction:column; min-width:0; gap:2px; }
		.worktree-copy strong { font-size:11px; }
		.worktree-copy span { color:var(--ui-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
		.worktree-actions { display:flex; gap:4px; }
		.worktree-actions button { border:1px solid var(--ui-border); border-radius:4px; background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); padding:3px 7px; cursor:pointer; }
		.worktree-actions button:hover { background:var(--vscode-button-secondaryHoverBackground); }

		.composer { flex:0 0 auto; margin-top:auto; padding:8px 10px 10px; background:var(--vscode-sideBar-background); border-top:1px solid var(--ui-border); }
		.composer-shell { border:1px solid var(--ui-border); border-radius:8px; background:var(--vscode-input-background); padding:6px 8px; transition:border-color .12s ease, box-shadow .12s ease; display:flex; flex-direction:column; gap:4px; }
		.composer-shell:focus-within { border-color:var(--vscode-focusBorder); box-shadow:0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder) 35%, transparent); }
		.composer-textarea, textarea#promptInput { width:100%; min-height:38px; max-height:160px; resize:none; border:0 !important; outline:0 !important; box-shadow:none !important; padding:4px 3px 2px; background:transparent !important; color:var(--vscode-input-foreground); font-family:var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); font-size:12px; line-height:17px; box-sizing:border-box; display:block; }
		.composer-textarea:focus, .composer-textarea:focus-visible, textarea#promptInput:focus, textarea#promptInput:focus-visible { border:0 !important; outline:0 !important; box-shadow:none !important; }
		.composer-textarea::placeholder, textarea#promptInput::placeholder { color:var(--vscode-input-placeholderForeground, var(--ui-muted)); }
		.composer-toolbar { justify-content:space-between; gap:8px; padding-top:3px; }
		.composer-tools { min-width:0; gap:3px; overflow:hidden; }
		.toolbar-button { width:25px; height:25px; flex:0 0 auto; }
		.command-chip { border:1px solid transparent; border-radius:4px; background:transparent; color:var(--ui-muted); padding:3px 5px; cursor:pointer; font-size:10px; }
		.command-chip:hover { background:var(--ui-hover); color:var(--vscode-foreground); }
		.composer-status { gap:6px; color:var(--ui-muted); font-size:10px; white-space:nowrap; }
		#turnCounter { opacity:.7; }
		.send-button { width:26px; height:26px; border:0; border-radius:6px; background:var(--vscode-button-background); color:var(--vscode-button-foreground); cursor:pointer; display:flex; align-items:center; justify-content:center; }
		.send-button:hover { background:var(--vscode-button-hoverBackground); }
		.send-button.btn-stop { background:var(--vscode-testing-iconFailed, #f14c4c); }

		@media (max-width: 300px) {
			.welcomeGrid { grid-template-columns:1fr; }
			.command-chip { display:none; }
		}
		@media (prefers-reduced-motion: reduce) {
			*, *::before, *::after { scroll-behavior:auto !important; transition:none !important; animation:none !important; }
		}
	`;
}
