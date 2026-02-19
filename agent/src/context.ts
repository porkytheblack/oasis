/**
 * @oasis/agent - Agent Context Collection
 *
 * Collects runtime and environment information for agent execution context.
 * Node.js-native - no browser dependencies.
 */

import type { OasisAgentConfig, AgentContext, AgentDeviceInfo } from "./types.js";
import { arch, platform, release, freemem, totalmem, cpus } from "node:os";

/**
 * Build the agent execution context from config and environment.
 */
export function buildAgentContext(config: OasisAgentConfig): AgentContext {
  return {
    agentName: config.agentName,
    agentModel: config.agentModel,
    runtime: detectRuntime(),
    runtimeVersion: detectRuntimeVersion(),
    platform: detectPlatform(),
    arch: detectArch(),
  };
}

/**
 * Detect the current runtime (node, deno, bun).
 */
function detectRuntime(): string {
  if (typeof process !== "undefined") {
    if ("Bun" in globalThis) {
      return "bun";
    }
    return "node";
  }
  if ("Deno" in globalThis) {
    return "deno";
  }
  return "unknown";
}

/**
 * Detect the runtime version.
 */
function detectRuntimeVersion(): string {
  if (typeof process !== "undefined" && process.version) {
    return process.version;
  }
  return "unknown";
}

/**
 * Detect the OS platform as an Oasis-compatible string.
 */
export function detectPlatform(): string {
  const os = platform();
  const a = arch();

  const osName =
    os === "darwin" ? "darwin" :
    os === "win32" ? "windows" :
    os === "linux" ? "linux" : os;

  const archName =
    a === "arm64" ? "aarch64" :
    a === "arm" ? "armv7" :
    a === "x64" ? "x86_64" : a;

  return `${osName}-${archName}`;
}

/**
 * Detect the OS architecture.
 */
function detectArch(): string {
  return arch();
}

/**
 * Detect the OS version string.
 */
export function detectOsVersion(): string {
  const os = platform();
  const ver = release();

  if (os === "darwin") {
    return `macOS ${ver}`;
  }
  if (os === "win32") {
    return `Windows ${ver}`;
  }
  if (os === "linux") {
    return `Linux ${ver}`;
  }
  return `${os} ${ver}`;
}

/**
 * Collect agent runtime information (analogous to device info for browser SDK).
 */
export function collectAgentDeviceInfo(config: OasisAgentConfig): AgentDeviceInfo {
  const info: AgentDeviceInfo = {};

  const cpuList = cpus();
  info.cpuCores = cpuList.length;
  info.memoryTotal = totalmem();
  info.memoryFree = freemem();

  const runtime = detectRuntime();
  const runtimeVersion = detectRuntimeVersion();
  info.userAgent = `${runtime}/${runtimeVersion} @oasis/agent/0.1.0 (${config.agentName})`;

  try {
    info.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Timezone detection not available
  }

  try {
    info.locale = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    // Locale detection not available
  }

  return info;
}
