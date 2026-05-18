// CORTI 200.8 — Cabinet hardware driver stub.
//
// Mock interface to slot-cabinet hardware. The studio game runner
// drives a single instance of this class regardless of which physical
// cabinet is plugged in (Hardware Abstraction Layer). Production
// builds swap the stub for a real serial-port / GPIO driver without
// changing any game code.
//
// All methods are synchronous + side-effect-free in stub mode so
// vitest can exercise them under `environment: node`.

export type CabinetButton = 'spin' | 'max-bet' | 'cashout' | 'collect' | 'bet-up' | 'bet-down' | 'menu';

export interface CabinetProfile {
  /** Unique cabinet id, e.g. 'bally-pro-series'. */
  id: string;
  /** Human-readable name (manufacturer + model). */
  name: string;
  manufacturer: 'Bally' | 'IGT' | 'Konami' | 'Aristocrat';
  model: string;
  reels: number;
  rows: number;
  /** Native screen resolution width × height in pixels. */
  resolution: [number, number];
  /** Whether this cabinet has an articulated topper / wheel. */
  hasTopper: boolean;
  /** RGB LED zones controllable via triggerLighting(). */
  lightingZones: string[];
  /** Speaker channel count. */
  speakerChannels: number;
}

export interface CabinetEvent {
  kind: 'connect' | 'disconnect' | 'spin' | 'lighting' | 'audio' | 'input';
  timestamp: number;
  detail?: unknown;
}

/** Default lighting patterns the studio can trigger. */
export const LIGHTING_PATTERNS = [
  'idle-breathe', 'spin-chase', 'win-flash', 'big-win-pulse',
  'jackpot-cascade', 'free-spins-rainbow', 'attract-loop',
] as const;
export type LightingPattern = typeof LIGHTING_PATTERNS[number];

/**
 * Mock driver class — captures all interactions in an event log so
 * tests can verify the sequence the studio sends to the cabinet.
 */
export class CabinetDriver {
  private connected = false;
  private port: string | null = null;
  private profile: CabinetProfile | null = null;
  private events: CabinetEvent[] = [];

  constructor(profile?: CabinetProfile) {
    this.profile = profile ?? null;
  }

  /** Attach to a serial / virtual port. Placeholder — no real I/O. */
  connect(port: string): boolean {
    if (this.connected) return false;
    this.port = port;
    this.connected = true;
    this.events.push({ kind: 'connect', timestamp: Date.now(), detail: { port } });
    return true;
  }

  /** Disconnect — flips state to idle. */
  disconnect(): boolean {
    if (!this.connected) return false;
    this.events.push({ kind: 'disconnect', timestamp: Date.now() });
    this.connected = false;
    this.port = null;
    return true;
  }

  /** Send physical reel stops. stops[reel] = array of symbol indices. */
  sendSpinCommand(stops: number[][]): boolean {
    if (!this.connected) return false;
    if (this.profile && stops.length !== this.profile.reels) return false;
    this.events.push({ kind: 'spin', timestamp: Date.now(), detail: { stops } });
    return true;
  }

  /** Trigger a named LED pattern across one or more zones. */
  triggerLighting(pattern: LightingPattern | string, zones?: string[]): boolean {
    if (!this.connected) return false;
    this.events.push({ kind: 'lighting', timestamp: Date.now(), detail: { pattern, zones: zones ?? [] } });
    return true;
  }

  /** Route an audio cue to the cabinet speakers. */
  playAudio(cueId: string, channel = 0): boolean {
    if (!this.connected) return false;
    if (this.profile && channel >= this.profile.speakerChannels) return false;
    this.events.push({ kind: 'audio', timestamp: Date.now(), detail: { cueId, channel } });
    return true;
  }

  /** Sample a physical button press. Returns null when no button held. */
  readInput(): CabinetButton | null {
    if (!this.connected) return null;
    // Stub — production impl polls GPIO. Use injectInput() in tests.
    return null;
  }

  /** Test-only — push a synthetic button press into the event log. */
  injectInput(btn: CabinetButton): void {
    this.events.push({ kind: 'input', timestamp: Date.now(), detail: { button: btn } });
  }

  /** Whether driver is currently bound to a port. */
  isConnected(): boolean { return this.connected; }

  /** The active port string (or null). */
  getPort(): string | null { return this.port; }

  /** The profile this driver was constructed with. */
  getProfile(): CabinetProfile | null { return this.profile; }

  /** Copy of the captured event log. */
  getEvents(): CabinetEvent[] { return [...this.events]; }

  /** Wipe the event log — used between test runs. */
  clearEvents(): void { this.events = []; }
}

/**
 * Hardware abstraction wrapper — game runs identically regardless of
 * which CabinetDriver instance is plugged in.
 */
export class HardwareAbstractionLayer {
  constructor(private driver: CabinetDriver) {}
  spin(stops: number[][]): boolean { return this.driver.sendSpinCommand(stops); }
  light(pattern: string): boolean { return this.driver.triggerLighting(pattern); }
  audio(cueId: string): boolean { return this.driver.playAudio(cueId); }
  input(): CabinetButton | null { return this.driver.readInput(); }
}
