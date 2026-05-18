// CORTI 200.8 — Cabinet driver tests.
//
// Exercises the stub driver against all 4 profiles plus the HAL
// wrapper. All tests run under `environment: node` — no DOM
// dependencies, no real serial-port I/O.

import { describe, it, expect, beforeEach } from 'vitest';
import { CabinetDriver, HardwareAbstractionLayer, LIGHTING_PATTERNS } from '../src/cabinet-driver.js';
import { PROFILES, listProfiles, getProfile } from '../src/profiles.js';

describe('CabinetDriver — connect / disconnect lifecycle', () => {
  let drv: CabinetDriver;
  beforeEach(() => { drv = new CabinetDriver(); });

  it('starts disconnected', () => {
    expect(drv.isConnected()).toBe(false);
    expect(drv.getPort()).toBe(null);
  });

  it('connect() returns true on first call, false on re-entry', () => {
    expect(drv.connect('/dev/tty.usbserial-1')).toBe(true);
    expect(drv.isConnected()).toBe(true);
    expect(drv.getPort()).toBe('/dev/tty.usbserial-1');
    expect(drv.connect('/dev/tty.usbserial-2')).toBe(false);
  });

  it('disconnect() flips state back to idle', () => {
    drv.connect('/dev/tty.usbserial-1');
    expect(drv.disconnect()).toBe(true);
    expect(drv.isConnected()).toBe(false);
    expect(drv.getPort()).toBe(null);
  });

  it('disconnect() returns false when never connected', () => {
    expect(drv.disconnect()).toBe(false);
  });
});

describe('CabinetDriver — spin / lighting / audio commands', () => {
  let drv: CabinetDriver;
  beforeEach(() => {
    drv = new CabinetDriver(getProfile('bally-pro-series')!);
    drv.connect('/dev/tty.usbserial-1');
  });

  it('sendSpinCommand accepts 5x4 stops on Bally profile', () => {
    const stops = [[0,1,2,3], [4,5,6,7], [8,9,10,11], [12,13,14,15], [16,17,18,19]];
    expect(drv.sendSpinCommand(stops)).toBe(true);
  });

  it('rejects sendSpinCommand with wrong reel count', () => {
    const stops = [[0,1,2], [3,4,5]];
    expect(drv.sendSpinCommand(stops)).toBe(false);
  });

  it('sendSpinCommand fails when disconnected', () => {
    drv.disconnect();
    expect(drv.sendSpinCommand([[0]])).toBe(false);
  });

  it('triggerLighting accepts known patterns', () => {
    for (const p of LIGHTING_PATTERNS) {
      expect(drv.triggerLighting(p)).toBe(true);
    }
  });

  it('playAudio rejects out-of-range channel', () => {
    expect(drv.playAudio('win-big', 0)).toBe(true);
    expect(drv.playAudio('win-big', 99)).toBe(false);
  });

  it('records events in chronological order', () => {
    drv.clearEvents();
    drv.sendSpinCommand([[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[16,17,18,19]]);
    drv.triggerLighting('win-flash');
    drv.playAudio('win-big');
    const ev = drv.getEvents();
    expect(ev.map((e) => e.kind)).toEqual(['spin', 'lighting', 'audio']);
  });

  it('readInput returns null in stub mode', () => {
    expect(drv.readInput()).toBe(null);
  });

  it('injectInput appends synthetic press to event log', () => {
    drv.clearEvents();
    drv.injectInput('spin');
    expect(drv.getEvents()[0]!.kind).toBe('input');
  });

  it('readInput returns null when disconnected', () => {
    drv.disconnect();
    expect(drv.readInput()).toBe(null);
  });
});

describe('Cabinet profiles registry', () => {
  it('exposes exactly 4 starter profiles', () => {
    expect(listProfiles().length).toBe(4);
  });

  it('every profile has the 4 required manufacturers', () => {
    const mans = listProfiles().map((p) => p.manufacturer).sort();
    expect(mans).toEqual(['Aristocrat', 'Bally', 'IGT', 'Konami']);
  });

  it('every profile declares reels + rows + resolution', () => {
    for (const p of listProfiles()) {
      expect(p.reels).toBeGreaterThanOrEqual(3);
      expect(p.rows).toBeGreaterThanOrEqual(3);
      expect(p.resolution.length).toBe(2);
      expect(p.lightingZones.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('getProfile returns null for unknown id', () => {
    expect(getProfile('nope')).toBe(null);
  });

  it('all 4 profile ids match the PROFILES keys', () => {
    expect(Object.keys(PROFILES).sort()).toEqual([
      'aristocrat-helix', 'bally-pro-series', 'igt-crystal-curve', 'konami-synkros',
    ]);
  });
});

describe('HAL — Hardware Abstraction Layer', () => {
  it('forwards spin / light / audio commands to underlying driver', () => {
    const drv = new CabinetDriver(getProfile('igt-crystal-curve')!);
    drv.connect('/dev/null');
    const hal = new HardwareAbstractionLayer(drv);
    expect(hal.spin([[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14]])).toBe(true);
    expect(hal.light('attract-loop')).toBe(true);
    expect(hal.audio('spin-classic')).toBe(true);
    expect(hal.input()).toBe(null);
    expect(drv.getEvents().map((e) => e.kind)).toEqual(['connect', 'spin', 'lighting', 'audio']);
  });
});
