/* tslint:disable */
/* eslint-disable */

/**
 * An imported user key with the admitted parameters it belongs to.
 */
export class ScopedKey {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Opens the 32-byte object private key of one envelope with its context bytes.
     */
    open_object(envelope: Uint8Array, context: Uint8Array): Uint8Array;
}

/**
 * Imports an opened grant key under the admitted parameters and clears `plain`.
 * Refuses a key whose policy is not exactly the expected scope and epochs.
 */
export function import_key(parameters: Uint8Array, context: Uint8Array, fingerprint: Uint8Array, kind: string, scope: string, epochs: BigUint64Array, plain: Uint8Array): ScopedKey;

/**
 * Issues the encoded key for a scope from the bucket private key and clears `bucket_key`.
 * Refuses parameters that the bucket key does not derive, like the node's issuer.
 */
export function issue_key(bucket_key: Uint8Array, parameters: Uint8Array, context: Uint8Array, fingerprint: Uint8Array, kind: string, scope: string, epochs: BigUint64Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_scopedkey_free: (a: number, b: number) => void;
    readonly import_key: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: any) => [number, number, number];
    readonly issue_key: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => [number, number, number];
    readonly scopedkey_open_object: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
