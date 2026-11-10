import { create } from 'zustand';
import { INITIAL_CODE } from './examples';
import type { Diagnostic } from '../core/types';

export interface LogEntry { id: number; time: string; kind: 'info' | 'success' | 'error' | 'warning'; message: string }
interface StudioState {
  code: string;
  name: string;
  projectId: string;
  dirty: boolean;
  masterVolume: number;
  diagnostics: Diagnostic[];
  logs: LogEntry[];
  setCode(code: string): void;
  setName(name: string): void;
  setMasterVolume(value: number): void;
  setDiagnostics(diagnostics: Diagnostic[]): void;
  log(kind: LogEntry['kind'], message: string): void;
  clearLogs(): void;
  saved(): void;
  load(code: string, name: string, projectId: string, masterVolume?: number): void;
}
let logId = 1;
export const useStudio = create<StudioState>((set) => ({
  code: INITIAL_CODE, name: 'afterhours', projectId: crypto.randomUUID(), dirty: false, masterVolume: 0.7,
  diagnostics: [], logs: [{ id: 0, time: '--:--:--', kind: 'info', message: 'M.O.N.O. v0.1 / El motor se inicia al pulsar PLAY.' }],
  setCode: (code) => set({ code, dirty: true }),
  setName: (name) => set({ name, dirty: true }),
  setMasterVolume: (masterVolume) => set({ masterVolume, dirty: true }),
  setDiagnostics: (diagnostics) => set({ diagnostics }),
  log: (kind, message) => set((s) => ({ logs: [...s.logs.slice(-199), { id: logId++, kind, message, time: new Date().toLocaleTimeString('es', { hour12: false }) }] })),
  clearLogs: () => set({ logs: [] }),
  saved: () => set({ dirty: false }),
  load: (code, name, projectId, masterVolume = 0.7) => set({ code, name, projectId, masterVolume, dirty: false, diagnostics: [] }),
}));
