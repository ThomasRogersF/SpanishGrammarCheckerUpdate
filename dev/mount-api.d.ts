import type { Express } from 'express';

declare module './dev/mount-api.js' {
  export default function mount(app: Express): void;
}