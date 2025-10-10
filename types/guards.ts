import { type YAMLError } from 'yaml';
import { ITrojanProxy, IVmessProxy } from './proxy.type.d.ts';

/**
 * Checks if the given object is a Error from the YAML library.
 * @param obj The object to check.
 * @returns True if the object is a YAMLError, false otherwise.
 */
export function isYAMLError(obj: unknown): obj is YAMLError {
  return obj !== null && typeof obj === 'object' && 'code' in obj;
}

/**
 * Checks if the given object is a Vmess Proxy.
 * @param obj The object to check.
 * @returns True if the object is an IVmessProxy, false otherwise.
 */
export function isVmess(obj: unknown): obj is IVmessProxy {
  return obj !== null && typeof obj === 'object' && 'uuid' in obj;
}

/**
 * Checks if the given object is a Trojan Proxy.
 * @param obj The object to check.
 * @returns True if the object is an ITrojanProxy, false otherwise.
 */
export function isTrojan(obj: unknown): obj is ITrojanProxy {
  return obj !== null && typeof obj === 'object' && 'password' in obj;
}
