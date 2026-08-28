#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import localtunnel from 'localtunnel';
import qrcode from 'qrcode-terminal';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = new Set();
let stopping = false;
let tunnel = null;

function streamLines(label, stream) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        process.stdout.write(`[${label}] ${line}\n`);
      }
    }
  });
}

function start(label, command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  streamLines(label, child.stdout);
  streamLines(label, child.stderr);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      process.stderr.write(
        `\n${label} se cerró inesperadamente (${signal ?? `código ${code ?? 1}`}).\n`,
      );
      void shutdown(code ?? 1);
    }
  });
  child.on('error', (error) => {
    process.stderr.write(`\nNo se pudo iniciar ${label}: ${error.message}\n`);
    void shutdown(1);
  });
  return child;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // The development process is still booting.
    }
    await delay(500);
  }
  throw new Error(`${label} no respondió en ${url}`);
}

async function isReady(url, expectedText) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) {
      return false;
    }
    return expectedText ? (await response.text()).includes(expectedText) : true;
  } catch {
    return false;
  }
}

async function tunnelPassword() {
  try {
    const response = await fetch('https://loca.lt/mytunnelpassword', {
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? (await response.text()).trim() : null;
  } catch {
    return null;
  }
}

function stopChild(child, signal) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    // It already exited.
  }
}

async function shutdown(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  process.stdout.write('\nCerrando web, API y túnel…\n');
  tunnel?.close();
  tunnel = null;
  for (const child of children) {
    stopChild(child, 'SIGTERM');
  }
  await delay(1_000);
  for (const child of children) {
    stopChild(child, 'SIGKILL');
  }
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

async function main() {
  const apiEnv = { ...process.env, HOST: '127.0.0.1', PORT: '3000' };
  const webEnv = {
    ...process.env,
    PUBLIC_API_URL: '',
    __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: '.loca.lt',
  };

  const [apiAlreadyRunning, webAlreadyRunning] = await Promise.all([
    isReady('http://127.0.0.1:3000/api/health'),
    isReady('http://127.0.0.1:5173/', 'OpenBahía'),
  ]);
  const reusedLocalProcesses = apiAlreadyRunning || webAlreadyRunning;

  if (apiAlreadyRunning) {
    process.stdout.write('[api] Reutilizando la API que ya está activa.\n');
  } else {
    start('api', pnpm, ['--filter', '@openbahia/api', 'dev'], apiEnv);
  }
  if (webAlreadyRunning) {
    process.stdout.write('[web] Reutilizando la web que ya está activa.\n');
  } else {
    start(
      'web',
      pnpm,
      [
        '--filter',
        '@openbahia/web',
        'exec',
        'vite',
        'dev',
        '--host',
        '127.0.0.1',
        '--port',
        '5173',
        '--strictPort',
      ],
      webEnv,
    );
  }

  await Promise.all([
    waitFor('http://127.0.0.1:3000/api/health', 'La API'),
    waitFor('http://127.0.0.1:5173/', 'La web'),
  ]);

  tunnel = await localtunnel({
    port: 5173,
    local_host: '127.0.0.1',
    subdomain: process.env.OPENBAHIA_TUNNEL_NAME,
  });
  tunnel.on('error', (error) => {
    if (!stopping) {
      process.stderr.write(`\nEl túnel HTTPS falló: ${error.message}\n`);
      void shutdown(1);
    }
  });
  tunnel.on('close', () => {
    if (!stopping) {
      process.stderr.write('\nEl túnel HTTPS se cerró inesperadamente.\n');
      void shutdown(1);
    }
  });
  const tunnelUrl = tunnel.url;
  const password = await tunnelPassword();

  process.stdout.write(`\n${'='.repeat(64)}\n`);
  process.stdout.write('OpenBahía está listo\n\n');
  process.stdout.write('Esta computadora: http://127.0.0.1:5173\n');
  process.stdout.write(`Celular (HTTPS + GPS): ${tunnelUrl}\n`);
  if (password) {
    process.stdout.write(`Contraseña del túnel, si la pide: ${password}\n`);
  }
  process.stdout.write('\nPermití “ubicación precisa” en el celular.\n');
  process.stdout.write(
    reusedLocalProcesses
      ? 'Presioná Ctrl+C para cerrar el túnel y los procesos iniciados por este comando.\n'
      : 'Presioná Ctrl+C para cerrar todo.\n',
  );
  process.stdout.write(`${'='.repeat(64)}\n\n`);
  process.stdout.write('Escaneá este QR con el celular:\n\n');
  qrcode.generate(tunnelUrl, { small: true });
  process.stdout.write('\n');

  await new Promise(() => {});
}

main().catch((error) => {
  process.stderr.write(`\nNo se pudo compartir OpenBahía: ${error.message}\n`);
  void shutdown(1);
});
