// Whether a script was run directly (`node scripts/x.mjs`) rather than
// imported by another, also when it is reached through a symbolic link: Node
// names the script by the path it was given, but the module by its real path.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(meta) {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(meta.url));
  } catch {
    return false;
  }
}
