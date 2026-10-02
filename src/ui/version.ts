/**
 * The game's version, written in one place, `package.json` (decision 0068). Shown on the list of
 * game types and on the About screen; the itch.io zip is named after it too.
 */

import { version } from '../../package.json';

/** The game's version, as `package.json` has it: MAJOR.MINOR.PATCH. */
export const VERSION: string = version;
