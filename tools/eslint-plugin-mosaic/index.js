// @ts-check
import { builtinModules } from 'node:module';

const NODE_BUILTINS = new Set(builtinModules);

/**
 * Core must stay pure: no DOM, no React, no platform. This rule is an allowlist,
 * not a blocklist — a core file may import relative paths inside packages/core/src
 * and the handful of pure packages named in `allow`. Everything else fails,
 * including packages nobody has thought to ban yet.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const noPlatformImportsInCore = {
  meta: {
    type: 'problem',
    docs: { description: 'packages/core may only import pure, platform-free modules' },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      platform:
        "'{{source}}' is platform-specific and cannot be imported from packages/core. Put it behind an adapter interface in packages/core/src/platform and implement it in packages/adapters.",
      notAllowed:
        "'{{source}}' is not on the allowlist of pure packages for packages/core. If it has no DOM, node or platform dependency, add it to the rule's `allow` option in eslint.config.js and record why in an ADR.",
      escapes:
        "'{{source}}' reaches outside packages/core/src. Core depends on nothing else in the repo.",
    },
  },
  create(context) {
    const allow = new Set(context.options[0]?.allow ?? []);
    const filename = context.filename.replace(/\\/g, '/');
    const marker = '/packages/core/src/';
    const at = filename.lastIndexOf(marker);
    if (at === -1) return {};
    // Directory depth of this file below src/, to detect `../` climbing out of it.
    const depth = filename.slice(at + marker.length).split('/').length - 1;

    /** @param {import('estree').Node} node @param {unknown} source */
    function check(node, source) {
      if (typeof source !== 'string') return;
      if (source.startsWith('.')) {
        let level = 0;
        for (const part of source.split('/')) {
          if (part === '..') level--;
          else if (part !== '.') level++;
          if (-level > depth)
            return context.report({ node, messageId: 'escapes', data: { source } });
        }
        return;
      }
      const name = source.startsWith('@')
        ? source.split('/').slice(0, 2).join('/')
        : source.split('/')[0];
      if (allow.has(source) || allow.has(name ?? '')) return;
      const isPlatform =
        source.startsWith('node:') ||
        NODE_BUILTINS.has(name ?? '') ||
        /^(react|react-dom|@tauri-apps\/.*|@mosaic\/(adapters|ui)|better-sqlite3|.*wa-sqlite|electron)$/.test(
          name ?? '',
        );
      context.report({ node, messageId: isPlatform ? 'platform' : 'notAllowed', data: { source } });
    }

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) =>
        check(node, node.source.type === 'Literal' ? node.source.value : undefined),
      CallExpression(node) {
        const arg = node.arguments[0];
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          arg?.type === 'Literal'
        ) {
          check(node, arg.value);
        }
      },
    };
  },
};

export default {
  meta: { name: 'eslint-plugin-mosaic' },
  rules: { 'no-platform-imports-in-core': noPlatformImportsInCore },
};
