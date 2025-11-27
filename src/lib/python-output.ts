export function formatStderrChunk(chunk: string) {
  return chunk.replace(/^/gm, (line) => `[stderr] ${line}`);
}

export function buildProcessExitMessage(exitCode: number | null) {
  const normalizedCode = typeof exitCode === "number" ? exitCode : "unknown";
  return `\n[Process exited with code ${normalizedCode}]`;
}
