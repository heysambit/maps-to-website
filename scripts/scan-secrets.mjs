import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ignored = new Set(['.git', 'node_modules', '.astro', 'dist', 'playwright-report', 'test-results']);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|pk)_(?:live|prod)_[A-Za-z0-9]{16,}\b/,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{24,}["']/i,
];
const findings = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else {
      const content = await readFile(path, 'utf8').catch(() => '');
      if (patterns.some((pattern) => pattern.test(content))) findings.push(path);
    }
  }
}
await scan(process.cwd());
if (findings.length) {
  console.error(`Potential secret pattern found in: ${findings.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Secret scan passed (repository source only).');
}
