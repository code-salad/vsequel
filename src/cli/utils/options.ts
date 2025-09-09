import { flag, option, string } from 'cmd-ts';

/**
 * Shared database option used across multiple commands
 */
export const dbOption = option({
  type: string,
  long: 'db',
  short: 'd',
  description: 'Database connection URL',
});

/**
 * Shared system tables flag used across multiple commands
 */
export const showSystemOption = flag({
  long: 'show-system',
  short: 'S',
  defaultValue: () => false,
  description:
    'Include system tables and schemas in the output (e.g., information_schema, pg_catalog, mysql)',
});
