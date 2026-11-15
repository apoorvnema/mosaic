import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import plugin from './index.js';

RuleTester.describe = describe;
RuleTester.it = it;

const core = '/repo/packages/core/src/store/index.ts';
const options = [{ allow: ['yjs'] }];
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

tester.run('no-platform-imports-in-core', plugin.rules['no-platform-imports-in-core'], {
  valid: [
    { filename: core, options, code: "import { x } from '../platform/index';" },
    { filename: core, options, code: "import * as Y from 'yjs';" },
    { filename: core, options, code: "export * from './types';" },
    // The rule only governs core's src directory.
    {
      filename: '/repo/packages/adapters/src/node/fs.ts',
      options,
      code: "import fs from 'node:fs';",
    },
    {
      filename: '/repo/packages/core/test/support/sqlite.ts',
      options,
      code: "import D from 'better-sqlite3';",
    },
  ],
  invalid: [
    ...["import fs from 'node:fs';", "import fs from 'fs';", "import path from 'path/posix';"].map(
      (code) => ({
        filename: core,
        options,
        code,
        errors: [{ messageId: 'platform' }],
      }),
    ),
    {
      filename: core,
      options,
      code: "import React from 'react';",
      errors: [{ messageId: 'platform' }],
    },
    {
      filename: core,
      options,
      code: "import { readFile } from '@tauri-apps/plugin-fs';",
      errors: [{ messageId: 'platform' }],
    },
    {
      filename: core,
      options,
      code: "import { x } from '@mosaic/adapters/node';",
      errors: [{ messageId: 'platform' }],
    },
    {
      filename: core,
      options,
      code: "import D from 'better-sqlite3';",
      errors: [{ messageId: 'platform' }],
    },
    {
      filename: core,
      options,
      code: "const fs = require('node:fs');",
      errors: [{ messageId: 'platform' }],
    },
    {
      filename: core,
      options,
      code: "const m = await import('react-dom');",
      errors: [{ messageId: 'platform' }],
    },
    {
      filename: core,
      options,
      code: "export { x } from 'node:crypto';",
      errors: [{ messageId: 'platform' }],
    },
    // Unknown packages fail closed until someone vouches for them.
    {
      filename: core,
      options,
      code: "import _ from 'lodash';",
      errors: [{ messageId: 'notAllowed' }],
    },
    // Relative imports may not climb out of packages/core/src.
    {
      filename: core,
      options,
      code: "import { x } from '../../../adapters/src/node/index';",
      errors: [{ messageId: 'escapes' }],
    },
    {
      filename: core,
      options,
      code: "import { x } from '../../test/support/sqlite';",
      errors: [{ messageId: 'escapes' }],
    },
  ],
});
