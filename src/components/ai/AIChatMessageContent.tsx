import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = { content: string };

const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
  const pattern = /(\*\*[^*]+\*\*|\`[^\`]+\`|\*[^*]+\*)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) nodes.push(<strong key={keyPrefix + index}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) nodes.push(<code key={keyPrefix + index} className="rounded bg-[var(--vyra-bg-hover)] px-1 py-0.5 font-mono text-[0.92em] text-[var(--vyra-text-primary)]">{token.slice(1, -1)}</code>);
    else nodes.push(<em key={keyPrefix + index}>{token.slice(1, -1)}</em>);
    cursor = match.index + token.length;
    index += 1;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
};

export const AIChatMessageContent = ({ content }: Props) => {
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
  const blocks: React.ReactNode[] = [];
  const parts = content.split(/```([^\n]*)\n([\s\S]*?)```/g);
  let codeIndex = 0;

  for (let partIndex = 0; partIndex < parts.length;) {
    const textPart = parts[partIndex++];
    if (textPart) {
      const lines = textPart.split('\n');
      let lineIndex = 0;
      while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (!line.trim()) { lineIndex += 1; continue; }
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          const Heading = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
          blocks.push(<Heading key={'h' + blocks.length} className="mb-2 mt-3 font-semibold text-[var(--vyra-text-primary)]">{renderInline(heading[2], 'h' + blocks.length)}</Heading>);
          lineIndex += 1;
          continue;
        }
        if (/^\s*[-*]\s+/.test(line)) {
          const items: string[] = [];
          while (lineIndex < lines.length && /^\s*[-*]\s+/.test(lines[lineIndex])) {
            items.push(lines[lineIndex].replace(/^\s*[-*]\s+/, ''));
            lineIndex += 1;
          }
          blocks.push(<ul key={'ul' + blocks.length} className="my-2 list-disc space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, 'li' + blocks.length + '-' + itemIndex)}</li>)}</ul>);
          continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const items: string[] = [];
          while (lineIndex < lines.length && /^\s*\d+[.)]\s+/.test(lines[lineIndex])) {
            items.push(lines[lineIndex].replace(/^\s*\d+[.)]\s+/, ''));
            lineIndex += 1;
          }
          blocks.push(<ol key={'ol' + blocks.length} className="my-2 list-decimal space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, 'ol' + blocks.length + '-' + itemIndex)}</li>)}</ol>);
          continue;
        }
        const paragraph: string[] = [];
        while (lineIndex < lines.length && lines[lineIndex].trim() && !/^#{1,3}\s+/.test(lines[lineIndex]) && !/^\s*[-*]\s+/.test(lines[lineIndex]) && !/^\s*\d+[.)]\s+/.test(lines[lineIndex])) {
          paragraph.push(lines[lineIndex]);
          lineIndex += 1;
        }
        blocks.push(<p key={'p' + blocks.length} className="my-2 whitespace-pre-wrap">{renderInline(paragraph.join('\n'), 'p' + blocks.length)}</p>);
      }
    }

    if (partIndex < parts.length) {
      const language = parts[partIndex++]?.trim() || 'code';
      const code = parts[partIndex++] ?? '';
      const currentCodeIndex = codeIndex++;
      blocks.push(
        <div key={'code' + currentCodeIndex} className="my-3 overflow-hidden rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg)]">
          <div className="flex items-center justify-between border-b border-[var(--vyra-border)] px-3 py-2">
            <span className="text-[10px] font-medium text-[var(--vyra-text-muted)]">{language}</span>
            <button type="button" onClick={() => {
              if (!navigator.clipboard?.writeText) return;
              void navigator.clipboard.writeText(code.replace(/\n$/, '')).then(() => setCopiedBlock(currentCodeIndex)).catch(() => setCopiedBlock(null));
            }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]" aria-label="Copy code">
              {copiedBlock === currentCodeIndex ? <Check size={12} /> : <Copy size={12} />}
              {copiedBlock === currentCodeIndex ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <pre className="max-w-full overflow-x-auto p-3 text-xs leading-5 text-[var(--vyra-text-primary)]"><code className="font-mono">{code.replace(/\n$/, '')}</code></pre>
        </div>,
      );
    }
  }

  return <div className="min-w-0 break-words [overflow-wrap:anywhere]">{blocks}</div>;
};
