import type { Express } from 'express';

/* Provide declarations for both extensioned and extension-less module paths,
   since different TS/bundler environments may resolve either form */
declare module './dev/mount-api.js' {
  export default function mount(app: Express): void;
}

declare module './dev/mount-api' {
  export default function mount(app: Express): void;
}