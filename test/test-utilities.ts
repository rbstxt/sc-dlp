import path from 'path';
import crypto from 'crypto';

// vitest snapshots do not handle ArrayBuffers properly by default
export const arrayBufferSerializer = {
  serialize: (value: any, config: any, indentation: any, depth: any, refs: any, printer: any) => {
    const hash = crypto.createHash('sha256').update(new Uint8Array(value)).digest('hex');
    return `ArrayBuffer [SHA-256 ${hash}]`;
  },
  test: (val: any) => val instanceof ArrayBuffer
};

export const getFixturePath = (name: string) => path.join(__dirname, 'fixtures', name);
