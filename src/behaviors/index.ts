/**
 * Faza 3 — Symbol Behavior Plugin Layer: Barrel Export
 *
 * Single import point for consumers:
 *   import { BehaviorRegistry, WildBehavior, Effect, ... } from '../behaviors/index.js';
 */

// Core types
export type {
  Effect,
  EffectScope,
  SpinState,
  LockedPosition,
  CollectedCoin,
  BehaviorContext,
  SymbolBehaviorConfig,
  SymbolBehavior,
} from './types.js';
export {
  createSpinState,
  isMultiplierEffect,
  isTransformEffect,
  isFeatureTrigger,
} from './types.js';

// Pipeline
export {
  applyEffect,
  applyEffects,
  tickLockedPositions,
  restoreLockedPositions,
  BehaviorPipeline,
} from './pipeline.js';

// Registry
export { BehaviorRegistry, BehaviorRegistryBuilder } from './registry.js';

// Implementations
export { WildBehavior } from './impls/WildBehavior.js';
export { ExpandingWildBehavior } from './impls/ExpandingWildBehavior.js';
export type { ExpandingWildConfig } from './impls/ExpandingWildBehavior.js';
export { StickyWildBehavior } from './impls/StickyWildBehavior.js';
export type { StickyWildConfig } from './impls/StickyWildBehavior.js';
export { WalkingWildBehavior } from './impls/WalkingWildBehavior.js';
export type { WalkingWildConfig, WalkDirection } from './impls/WalkingWildBehavior.js';
export { MultiplierWildBehavior } from './impls/MultiplierWildBehavior.js';
export type { MultiplierWildConfig } from './impls/MultiplierWildBehavior.js';
export { ScatterBehavior } from './impls/ScatterBehavior.js';
export type { ScatterBehaviorConfig } from './impls/ScatterBehavior.js';
export { MysteryBehavior } from './impls/MysteryBehavior.js';
export type { MysteryBehaviorConfig } from './impls/MysteryBehavior.js';
export { CoinBehavior } from './impls/CoinBehavior.js';
export type { CoinBehaviorConfig } from './impls/CoinBehavior.js';
export { MultiplierSymbolBehavior } from './impls/MultiplierSymbolBehavior.js';
export type { MultiplierSymbolConfig, MultiplierTrigger } from './impls/MultiplierSymbolBehavior.js';
export { TransformBehavior } from './impls/TransformBehavior.js';
export type { TransformBehaviorConfig, TransformRule, TransformTrigger } from './impls/TransformBehavior.js';
export { JackpotBehavior } from './impls/JackpotBehavior.js';
export type { JackpotBehaviorConfig, JackpotTrigger } from './impls/JackpotBehavior.js';
