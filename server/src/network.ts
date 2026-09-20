import { networkInterfaces } from 'node:os';

/**
 * Which address the phones in the room should type.
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
