import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { Profile } from './profile';
import type { ScriptOverrides } from './script-draft';
import type { SceneChoice } from './scene-assets';
import type { CaptionMode } from '../../shared/caption-plan';
import type { VisualEffect } from '../../shared/visual-effects';
import type { PlatformId } from '../../shared/platform-presets';
import type { PackId } from './packs';
import type { VideoScript } from './script';

export const desktop = isTauri();
export interface NativeMedia {
  kind: 'native'; id: string; path: string; mediaKind: 'video' | 'image'; name: string; source: string;
}
export interface DesktopProjectV1 {
  version: 1; idea: string; profile: Profile; scriptOverrides: ScriptOverrides;
  sceneChoices: SceneChoice[]; captionMode: CaptionMode; captionOverrides: Record<number, string>;
  voiceOn: boolean; visualEffect: VisualEffect; timing: string | null; savedAt: string;
  platform?: PlatformId;
  credit?: boolean;
  pack?: PackId;
  // AI Director plan takes (optional: pre-plan project files still open).
  // Re-derived via buildProductionPlan on load; validated with the same
  // guards as the browser session (bad keys/array → defaults).
  planSeeds?: Record<number, number>;
  approvedShots?: boolean[];
  baseScript?: VideoScript | null;
  renderPlan?: Record<string, unknown> | null;
}
export interface ProjectResult { path: string; project: DesktopProjectV1 }
export const projectFingerprint = (project: object) => JSON.stringify(project, (key, value) => ['savedAt', 'baseScript', 'renderPlan'].includes(key) ? undefined : value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
export const nativeMediaUrl = (path: string) => convertFileSrc(path);
export const importNativeMedia = () => invoke<NativeMedia | null>('import_media');
export const saveDesktopProject = (project: DesktopProjectV1) => invoke<ProjectResult | null>('save_project', { project });
export const openDesktopProject = () => invoke<ProjectResult | null>('open_project');
export const initialDesktopProject = () => invoke<ProjectResult | null>('initial_project');
export const showInFolder = (path: string) => invoke('show_in_folder', { path });
export const confirmDiscard = (message: string) => invoke<boolean>('confirm_discard', { message });
