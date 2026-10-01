import React, { useState, useEffect } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';

interface ThinkingBlockProps {
	thinking: string;
	isLive: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ thinking, isLive }) => {
	const [isOpen, setIsOpen] = useState(isLive);

	// Keep the active reasoning segment visible while streaming, then collapse it
	// when the segment completes so long reasoning never dominates the transcript.
	useEffect(() => {
		setIsOpen(isLive);
	}, [isLive]);

	if (!thinking || thinking.trim().length === 0) {
		if (!isLive) return null;
	}

	return (
		<Collapsible.Root open={isOpen} onOpenChange={setIsOpen} className="thinking-block">
			<Collapsible.Trigger asChild>
				<button className="thinking-trigger" type="button" aria-label="Toggle thinking details">
					<div className="thinking-trigger-left">
						<i className={`codicon ${isLive ? 'codicon-sparkle codicon-spin' : 'codicon-sparkle'}`} />
						<span>{isLive ? 'Thinking…' : 'Thought'}</span>
					</div>
					<i className={`codicon codicon-chevron-${isOpen ? 'down' : 'right'} thinking-chevron`} />
				</button>
			</Collapsible.Trigger>
			<Collapsible.Content className="thinking-content">
				<div className="thinking-inner">
					{thinking || (isLive ? 'Analyzing context and formulating response…' : '')}
				</div>
			</Collapsible.Content>
		</Collapsible.Root>
	);
};
