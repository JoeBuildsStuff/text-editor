"use client";
import { useState, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { streamPythonExecution } from "@/lib/python-executor";
import { buildProcessExitMessage, formatStderrChunk } from "@/lib/python-output";
import { EXECUTION_MODES, type ExecutionMode } from "@/lib/execution-modes";

type HistoryItem = {
  id: number;
  command: string;
  output: string;
  mode: ExecutionMode;
  isExecuting?: boolean;
};

type ActiveExecution = {
  commandId: number;
  controller: AbortController;
};

export default function TerminalPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ExecutionMode>("python");
  // Track the command we can abort (e.g., when user types `clear`).
  const abortControllerRef = useRef<ActiveExecution | null>(null);
  const nextIdRef = useRef<number>(0);

  async function handleCommand(cmd: string) {
    const normalizedInput = cmd.replace(/\r\n/g, "\n");
    const trimmed = normalizedInput.trim();
    if (!trimmed) return;

    if (trimmed === "clear") {
      // Cancel any ongoing execution
      abortControllerRef.current?.controller.abort();
      abortControllerRef.current = null;
      setHistory([]);
      return;
    }

    const executionMode = mode;
    // Create a unique ID for this command
    const commandId = nextIdRef.current++;
    const commandForDisplay = normalizedInput.trimEnd();

    // Add command to history with empty output, marked as executing
    setHistory((h) => [
      ...h,
      {
        id: commandId,
        command: commandForDisplay,
        output: "",
        isExecuting: true,
        mode: executionMode,
      },
    ]);

    // Create abort controller for this execution
    const abortController = new AbortController();
    abortControllerRef.current = { controller: abortController, commandId };

    let outputBuffer = "";
    let finalized = false;

    const updateCommandHistory = (updater: (item: HistoryItem) => HistoryItem) => {
      setHistory((h) =>
        h.map((item) => {
          if (item.id === commandId) {
            return updater(item);
          }
          return item;
        })
      );
    };

    const syncOutput = () => {
      updateCommandHistory((item) => ({ ...item, output: outputBuffer }));
    };

    const appendChunk = (chunk: string) => {
      outputBuffer += chunk;
      syncOutput();
    };

    const finalizeCommand = (finalChunk?: string) => {
      if (finalized) return;
      finalized = true;
      if (finalChunk) {
        outputBuffer += finalChunk;
      }
      updateCommandHistory((item) => ({ ...item, output: outputBuffer, isExecuting: false }));
      if (abortControllerRef.current?.commandId === commandId) {
        abortControllerRef.current = null;
      }
    };

    try {
      await streamPythonExecution(
        normalizedInput,
        {
          onStdout: (chunk) => {
            appendChunk(chunk);
          },
          onStderr: (chunk) => {
            appendChunk(formatStderrChunk(chunk));
          },
          onExit: (exitCode) => {
            finalizeCommand(buildProcessExitMessage(exitCode));
          },
          onErrorEvent: (message) => {
            const prefix = outputBuffer ? "\n" : "";
            finalizeCommand(`${prefix}[Error: ${message}]`);
          },
        },
        { signal: abortController.signal, mode: executionMode }
      );
    } catch (error) {
      const isAbortError = error instanceof DOMException && error.name === "AbortError";
      const errorMessage = isAbortError
        ? "Execution cancelled"
        : error instanceof Error
          ? error.message
          : "Unknown error occurred";
      const prefix = outputBuffer ? "\n" : "";
      finalizeCommand(`${prefix}[Error: ${errorMessage}]`);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCommand(input);
      setInput("");
    }
  }

  const placeholder =
    mode === "python"
      ? "Type Python code and press Enter (or 'clear' to clear history)"
      : "Type shell commands and press Enter (or 'clear' to reset)";

  return (
    <div className="h-full w-full flex flex-col font-mono">
      <div className="flex items-center gap-2 pb-2">
        <div className="text-xs uppercase text-muted-foreground">Mode</div>
        <Select value={mode} onValueChange={(value) => setMode(value as ExecutionMode)}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXECUTION_MODES.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "python" ? "Python" : "Bash shell"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col flex-1 overflow-auto justify-end pb-2">
        <div className="flex flex-col space-y-2">
          {/* Show oldest command at top, newest at bottom */}
          {history.map((item) => (
            <div key={item.id} className="flex flex-col">
              <Separator className="my-2 w-full" />
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground mt-0.5">$</span>
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wide">
                      {item.mode === "python" ? "PYTHON" : "BASH"}
                    </span>
                    {item.isExecuting && (
                      <span className="animate-pulse">Running…</span>
                    )}
                  </div>
                  <span className="whitespace-pre-wrap break-words text-sm">{item.command}</span>
                </div>
              </div>
              {item.output && (
                <div className="whitespace-pre-wrap text-sm mt-1">{item.output}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div>
        <Textarea
          className="w-full"
          rows={1}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          autoFocus
        />
      </div>
    </div>
  );
}
