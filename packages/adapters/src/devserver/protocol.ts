/** HTTP protocol between the dev server's vault middleware and HttpFileSystem. */
export const DEV_VAULT_BASE = '/__vault';

export type DevVaultOp = 'read' | 'write' | 'list' | 'stat' | 'mkdir' | 'move' | 'delete';
