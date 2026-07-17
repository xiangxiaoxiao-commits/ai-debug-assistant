export interface ExtractedFlow {
  raw: string;
  messageId?: string;
  messageCreatedAt?: string;
}

/** Extract all <flow>...</flow> blocks from text (trimmed).
 *  Streaming: if an unclosed <flow> exists at end of input, include it as partial. */
export function extractFlows(text: string): string[] {
  const results: string[] = [];
  const closedRe = /<flow>([\s\S]*?)<\/flow>/gi;
  let match: RegExpExecArray | null;
  while ((match = closedRe.exec(text)) !== null) {
    const raw = match[1].replace(/^\n+/, '').replace(/\n+$/, '');
    if (raw) results.push(raw);
  }
  // Streaming: check for unclosed <flow> (last <flow> with no corresponding </flow>)
  const lastOpen = text.lastIndexOf('<flow>');
  if (lastOpen !== -1) {
    const afterOpen = text.slice(lastOpen + '<flow>'.length);
    if (!/<\/flow>/i.test(afterOpen)) {
      const raw = afterOpen.replace(/^\n+/, '').replace(/\n+$/, '');
      if (raw) results.push(raw);
    }
  }
  return results;
}

/** Remove all <flow>...</flow> blocks from text (including unclosed streaming ones).
 *  Collapses 3+ consecutive newlines into 2. */
export function stripFlows(text: string): string {
  // Remove closed blocks
  let result = text.replace(/<flow>[\s\S]*?<\/flow>/gi, '');
  // Remove unclosed <flow> and everything after it
  const lastOpen = result.lastIndexOf('<flow>');
  if (lastOpen !== -1 && !/<\/flow>/i.test(result.slice(lastOpen))) {
    result = result.slice(0, lastOpen);
  }
  return result.replace(/\n{3,}/g, '\n\n').trim();
}
