import { Buffer } from "buffer";

// Quip SDK uses Node's Buffer internally; expose it in the browser.
(globalThis as any).Buffer = Buffer;
(window as any).Buffer = Buffer;

export {};
