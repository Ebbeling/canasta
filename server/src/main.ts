import { createContainer } from './app/container';
import { readConfig } from './config';
import { createCanastaServer } from './http/server';
import { isReachableFromOtherDevices, primaryLanAddress, urlFor } from './network';

/**
 * The Canasta tournament server.
 *
 * Opens a database, serves the built PWA and an API over the local network,
 * prints where to find it, and stops cleanly when asked.
 */

const config = readConfig();

function line(text = ''): void {
  process.stdout.write(`${text}\n`);
}

async function main(): Promise<void> {
  line();
  line('Canasta Tournament Server');
  line();

  const container = createContainer({
    databasePath: config.databasePath,
    basePath: config.basePath,
    origin: {
      publicUrl: config.publicUrl,
      host: config.host,
      port: config.port,
    },
  });
  line(`  ✓ Database geopend    ${config.databasePath}`);

  const server = createCanastaServer(container, config);

  try {
    await server.listen();
  } catch (error) {
    const reason = error as NodeJS.ErrnoException;
    line();
    if (reason.code === 'EADDRINUSE') {
      line(`  ✗ Poort ${config.port} is al in gebruik.`);
      line('    Stop de andere server, of kies een andere poort:');
      line(`      node server/dist/main.js --port ${config.port + 1}`);
    } else if (reason.code === 'EACCES') {
      line(`  ✗ Geen toestemming om poort ${config.port} te openen.`);
      line('    Kies een poort boven 1024.');
    } else {
      line(`  ✗ De server kon niet starten: ${reason.message}`);
    }
    container.close();
    process.exitCode = 1;
    return;
  }

  const port = server.address()?.port ?? config.port;
  line('  ✓ HTTP-server gestart');
  line('  ✓ Live-verbinding (SSE) actief');

  const lan = primaryLanAddress();

  line();
  line('Lokaal:');
  line(`  ${urlFor('localhost', port, config.basePath)}`);
  line();

  if (lan) {
    line('Netwerk:');
    line(`  ${urlFor(lan.address, port, config.basePath)}   (${lan.name})`);
    line();
    line('Andere apparaten op dezelfde WiFi kunnen deze URL openen.');
  } else {
    line('Netwerk:');
    line('  Geen netwerkadres gevonden. Dit apparaat lijkt niet met een');
    line('  netwerk verbonden, dus tafels kunnen er nu niet bij.');
  }

  // The address every QR code will carry. Printed because it is the one thing
  // that has to be right for a phone to reach this server, and because getting
  // it wrong is silent otherwise. No token is ever printed.
  const origin = container.origin();
  line();
  line('Tafels koppelen via:');
  line(`  ${origin}`);

  if (!isReachableFromOtherDevices(origin)) {
    line();
    line('Let op: dit adres werkt alleen op deze laptop, dus een QR-code is nu');
    line('niet te scannen vanaf een telefoon.');
  }

  if (config.host === '127.0.0.1' || config.host === 'localhost') {
    line();
    line('Let op: de server luistert alleen op localhost (--host 127.0.0.1),');
    line('dus andere apparaten kunnen er niet bij.');
  }

  line();
  line('Stoppen met Ctrl+C.');
  line();

  let stopping = false;

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;

    line();
    line(`Server wordt gestopt (${signal})…`);
    await server.close();
    container.close();
    line('Database gesloten.');
    line('Server gestopt.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  // Windows delivers Ctrl+C as SIGINT only when a console is attached; this is
  // the belt to that braces when the launcher pipes our output.
  process.on('SIGHUP', () => void shutdown('SIGHUP'));
}

void main();
