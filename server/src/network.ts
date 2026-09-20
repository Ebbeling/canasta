import { networkInterfaces } from 'node:os';

/**
 * Which address the phones in the room should type — and which one a QR code
 * must carry.
 *
 * Never hardcoded, and never guessed from a subnet prefix: the laptop is asked
 * what it actually has. Where there is more than one candidate — a docker
 * bridge, a VPN, a second adapter — the ordinary private ranges win, because
 * those are the ones a phone on the same WiFi can reach.
 */

export interface LanAddress {
  address: string;
  /** The adapter it belongs to, so the organiser can tell WiFi from VPN. */
  name: string;
}

/** True for the RFC1918 ranges a home or club network actually uses. */
function isPrivate(address: string): boolean {
  if (address.startsWith('10.')) return true;
  if (address.startsWith('192.168.')) return true;

  const [first, second] = address.split('.');
  if (first === '172') {
    const block = Number(second);
    return block >= 16 && block <= 31;
  }

  return false;
}

/** Adapters that are almost never the one a phone can reach. */
function looksVirtual(name: string): boolean {
  return /^(vEthernet|Loopback|docker|br-|veth|vmnet|VirtualBox|Hyper-V|ZeroTier|Tailscale|utun|tun|tap)/i.test(
    name,
  );
}

export function lanAddresses(): LanAddress[] {
  const found: LanAddress[] = [];

  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const entry of addresses ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      found.push({ address: entry.address, name });
    }
  }

  return found.sort((a, b) => {
    const score = (entry: LanAddress) =>
      (isPrivate(entry.address) ? 0 : 2) + (looksVirtual(entry.name) ? 1 : 0);
    return score(a) - score(b);
  });
}

/** The address to print, or nothing when this machine is on no network. */
export function primaryLanAddress(): LanAddress | undefined {
  return lanAddresses()[0];
}

export function urlFor(address: string, port: number, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `http://${address}:${port}${base}`;
}

/* --------------------------------------------------- the canonical origin */

/** Binding only to the loopback device means nothing else can reach us. */
export function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

export interface OriginOptions {
  /** What the operator says the world sees. Wins over everything. */
  publicUrl?: string;
  /** The interface the server bound. */
  host: string;
  port: number;
  /** Injected rather than looked up, so this stays a pure function. */
  lan?: LanAddress;
}

/**
 * The one origin every outward-facing link is built from.
 *
 * This exists because the obvious answer is wrong. Building a link from the
 * `Host` header of the request that asked for it means the organiser, who is
 * sitting at `localhost`, gets QR codes pointing at `localhost` — which works
 * on exactly one device in the room, the one that does not need to scan
 * anything. The server knows which addresses it has and which port it bound;
 * the browser does not. So the server decides.
 *
 * In order:
 *
 *  1. An explicit public URL. That is the operator telling us what is in front
 *     of this process — a reverse proxy, a tunnel, a hostname — and no amount
 *     of looking at network adapters can discover it.
 *  2. Loopback binding: nothing but this machine can reach the server, so a LAN
 *     address would be a promise we cannot keep. `localhost` is the honest one.
 *  3. A LAN address, which is the ordinary case and the point of the feature.
 *  4. Nothing found: fall back to `localhost` rather than invent an address.
 *     The server says so at startup, and the tables screen says so too.
 */
export function resolveOrigin({ publicUrl, host, port, lan }: OriginOptions): string {
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  if (isLoopback(host)) return `http://localhost:${port}`;
  if (lan) return `http://${lan.address}:${port}`;
  return `http://localhost:${port}`;
}

/**
 * The link a table device opens, and the only place it is spelled out.
 *
 * The QR code, the copied link and anything added later all come through here,
 * so they cannot drift apart — and none of them has to know what an origin or a
 * base path is.
 */
export function tableJoinUrl(origin: string, basePath: string, token: string): string {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${origin.replace(/\/+$/, '')}${base}table/${token}`;
}

/**
 * Re-exported from the shared contract, not redefined here.
 *
 * The organiser’s screen warns next to the QR code and this server warns in
 * the console; they must mean exactly the same thing by "unreachable".
 */
export { isReachableFromOtherDevices } from '@/net/protocol';
