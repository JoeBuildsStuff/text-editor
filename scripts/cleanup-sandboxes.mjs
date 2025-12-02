#!/usr/bin/env node

/**
 * Python Sandbox Cleanup Script
 * 
 * This script performs garbage collection on user sandbox directories:
 * - Removes sandboxes that haven't been accessed in TTL_HOURS (default: 24 hours)
 * - Enforces a maximum size limit per sandbox (default: 500MB)
 * - Can be run as a cron job or manually
 * 
 * Usage:
 *   node scripts/cleanup-sandboxes.mjs [options]
 * 
 * Options:
 *   --dry-run     Show what would be deleted without actually deleting
 *   --ttl=HOURS   Time-to-live in hours (default: 24)
 *   --max-size=MB Maximum size per sandbox in MB (default: 500)
 *   --verbose     Show detailed output
 * 
 * Environment variables:
 *   PYTHON_SANDBOX_DIR  Path to sandbox root (default: ./server/python-sandbox)
 *   SANDBOX_TTL_HOURS   TTL in hours (default: 24)
 *   SANDBOX_MAX_SIZE_MB Maximum size in MB (default: 500)
 * 
 * Example cron entry (run every hour):
 *   0 * * * * cd /path/to/text-editor && node scripts/cleanup-sandboxes.mjs >> /var/log/sandbox-cleanup.log 2>&1
 */

import { readdir, stat, rm } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, "..")

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  dryRun: args.includes("--dry-run"),
  verbose: args.includes("--verbose"),
  ttlHours: parseInt(
    args.find((a) => a.startsWith("--ttl="))?.split("=")[1] ||
      process.env.SANDBOX_TTL_HOURS ||
      "24",
    10
  ),
  maxSizeMB: parseInt(
    args.find((a) => a.startsWith("--max-size="))?.split("=")[1] ||
      process.env.SANDBOX_MAX_SIZE_MB ||
      "500",
    10
  ),
}

const SANDBOX_ROOT =
  process.env.PYTHON_SANDBOX_DIR || path.join(PROJECT_ROOT, "server", "python-sandbox")

const TTL_MS = options.ttlHours * 60 * 60 * 1000
const MAX_SIZE_BYTES = options.maxSizeMB * 1024 * 1024

function log(message, ...rest) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`, ...rest)
}

function verboseLog(message, ...rest) {
  if (options.verbose) {
    log(message, ...rest)
  }
}

async function getDirectorySize(dirPath) {
  return new Promise((resolve) => {
    const du = spawn("du", ["-sb", dirPath])
    let output = ""
    du.stdout.on("data", (data) => {
      output += data.toString()
    })
    du.on("close", () => {
      const match = output.match(/^(\d+)/)
      resolve(match ? parseInt(match[1], 10) : 0)
    })
    du.on("error", () => resolve(0))
  })
}

async function getLastAccessTime(dirPath) {
  // Check the most recent mtime of any file in the directory
  let mostRecent = 0

  async function walkDir(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        try {
          const stats = await stat(fullPath)
          const mtime = stats.mtime.getTime()
          if (mtime > mostRecent) {
            mostRecent = mtime
          }
          if (entry.isDirectory()) {
            await walkDir(fullPath)
          }
        } catch {
          // Ignore inaccessible files
        }
      }
    } catch {
      // Ignore inaccessible directories
    }
  }

  await walkDir(dirPath)

  // If no files found, use directory's own mtime
  if (mostRecent === 0) {
    try {
      const stats = await stat(dirPath)
      mostRecent = stats.mtime.getTime()
    } catch {
      mostRecent = Date.now() // Assume recent if we can't determine
    }
  }

  return mostRecent
}

async function cleanupSandboxes() {
  log("Starting sandbox cleanup...")
  log(`Configuration: TTL=${options.ttlHours}h, MaxSize=${options.maxSizeMB}MB, DryRun=${options.dryRun}`)

  let entries
  try {
    entries = await readdir(SANDBOX_ROOT, { withFileTypes: true })
  } catch (error) {
    if (error.code === "ENOENT") {
      log("Sandbox root does not exist, nothing to clean up.")
      return { deleted: 0, skipped: 0, errors: 0 }
    }
    throw error
  }

  const now = Date.now()
  const results = {
    deleted: 0,
    skipped: 0,
    errors: 0,
    freedBytes: 0,
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    // Skip special files like .gitkeep
    if (entry.name.startsWith(".")) {
      verboseLog(`Skipping hidden entry: ${entry.name}`)
      continue
    }

    const sandboxPath = path.join(SANDBOX_ROOT, entry.name)
    verboseLog(`Checking sandbox: ${entry.name}`)

    try {
      const [sizeBytes, lastAccess] = await Promise.all([
        getDirectorySize(sandboxPath),
        getLastAccessTime(sandboxPath),
      ])

      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2)
      const ageMs = now - lastAccess
      const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1)

      let shouldDelete = false
      let reason = ""

      // Check TTL
      if (ageMs > TTL_MS) {
        shouldDelete = true
        reason = `expired (${ageHours}h old, TTL=${options.ttlHours}h)`
      }

      // Check size limit
      if (sizeBytes > MAX_SIZE_BYTES) {
        shouldDelete = true
        reason = `oversized (${sizeMB}MB, limit=${options.maxSizeMB}MB)`
      }

      if (shouldDelete) {
        if (options.dryRun) {
          log(`[DRY RUN] Would delete ${entry.name}: ${reason} (${sizeMB}MB)`)
        } else {
          log(`Deleting ${entry.name}: ${reason} (${sizeMB}MB)`)
          await rm(sandboxPath, { recursive: true, force: true })
        }
        results.deleted++
        results.freedBytes += sizeBytes
      } else {
        verboseLog(`Keeping ${entry.name}: age=${ageHours}h, size=${sizeMB}MB`)
        results.skipped++
      }
    } catch (error) {
      log(`Error processing ${entry.name}:`, error.message)
      results.errors++
    }
  }

  const freedMB = (results.freedBytes / (1024 * 1024)).toFixed(2)
  log(`Cleanup complete: ${results.deleted} deleted, ${results.skipped} kept, ${results.errors} errors`)
  log(`Space freed: ${freedMB}MB`)

  return results
}

// Run the cleanup
cleanupSandboxes()
  .then((results) => {
    process.exit(results.errors > 0 ? 1 : 0)
  })
  .catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })
