const TELEGRAM_MAX_LENGTH = 4096;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToHtml(md: string): string {
  let text = md;

  // Code blocks first (before escaping)
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    codeBlocks.push(`<pre>${escapeHtml(code.trimEnd())}</pre>`);
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // Inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINE${inlineCodes.length - 1}\x00`;
  });

  // Escape remaining HTML
  text = escapeHtml(text);

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Italic
  text = text.replace(/\*(.+?)\*/g, "<i>$1</i>");

  // Headings → bold
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Restore code blocks
  text = text.replace(/\x00CODEBLOCK(\d+)\x00/g, (_m, i) => codeBlocks[Number(i)]);
  text = text.replace(/\x00INLINE(\d+)\x00/g, (_m, i) => inlineCodes[Number(i)]);

  return text.trim();
}

export function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > TELEGRAM_MAX_LENGTH) {
    let splitAt = remaining.lastIndexOf("\n\n", TELEGRAM_MAX_LENGTH);
    if (splitAt === -1 || splitAt < TELEGRAM_MAX_LENGTH / 2) {
      splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_LENGTH);
    }
    if (splitAt === -1 || splitAt < TELEGRAM_MAX_LENGTH / 2) {
      splitAt = TELEGRAM_MAX_LENGTH;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function formatCostFooter(_costUsd: number, durationMs: number, numTurns: number): string {
  const secs = Math.round(durationMs / 1000);
  const duration = secs > 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`;
  return `\n\n<i>\u{23F1} ${duration} | ${numTurns} turns</i>`;
}
