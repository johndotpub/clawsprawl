import { access, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const profilesDir = path.join(root, 'src', 'config', 'profiles');
const localPath = path.join(profilesDir, 'private.local.ts');

const template = `import type { MainframeProfile } from './types';

export const localProfile: MainframeProfile = {
  id: 'private-local',
  label: 'Private Local',
  heroTag: 'ClawSprawl / Private Mainframe',
  heroTitle: 'Private Lab',
  heroDescription:
    'Private local profile. Customize branding for your own environment.',
  statGateway: 'WS :18789',
  statAccess: 'Private Internal',
};
`;

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const hasLocal = await exists(localPath);

if (hasLocal) {
  process.stdout.write('local profile already exists at src/config/profiles/private.local.ts\n');
  process.exit(0);
}

await writeFile(localPath, template, 'utf8');
process.stdout.write('created src/config/profiles/private.local.ts from template\n');
