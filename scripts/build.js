import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveBinary(modulePath, friendlyName) {
  try {
    return require.resolve(modulePath);
  } catch (error) {
    throw new Error(
      `Unable to locate the ${friendlyName} CLI (looked for \"${modulePath}\"). ` +
        'Please install project dependencies before running the build command.'
    );
  }
}

async function runNodeBinary(binPath, args = []) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        const command = `node ${binPath} ${args.join(' ')}`.trim();
        reject(new Error(`Build step failed (exit code ${code}) while running: ${command}`));
      }
    });
  });
}

async function main() {
  const tscBin = resolveBinary('typescript/bin/tsc', 'TypeScript');
  await runNodeBinary(tscBin);

  const viteBin = resolveBinary('vite/bin/vite.js', 'Vite');
  await runNodeBinary(viteBin, ['build']);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
