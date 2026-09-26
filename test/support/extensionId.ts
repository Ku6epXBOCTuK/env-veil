import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface ExtensionManifest {
  readonly publisher: string;
  readonly name: string;
}

const manifestPath = join(__dirname, '..', '..', '..', 'package.json');
const manifest = JSON.parse(
  readFileSync(manifestPath, 'utf8'),
) as ExtensionManifest;

export const extensionId = `${manifest.publisher}.${manifest.name}`;
