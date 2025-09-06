import { command, option } from 'cmd-ts';
import { DatabaseService } from '../../services/database';
import { dbOption, handleCliError, listOutputType } from '../utils';

export const listCommand = command({
  name: 'list',
  description: `List all tables available in the database.
  
  This command discovers and displays all tables across all schemas in your database.
  Tables are shown in the format 'schema.table' for clarity.
  Useful for exploring database structure and finding specific tables.
  
  Examples:
    vsequel list --db postgresql://localhost/mydb
    vsequel list --db mysql://localhost/mydb --output json
    vsequel list --db postgresql://localhost/mydb > table-list.txt`,
  args: {
    db: dbOption,
    output: option({
      type: listOutputType,
      long: 'output',
      short: 'o',
      defaultValue: () => 'simple' as const,
      description: `Table listing output format (default: simple):
        • simple - One table name per line (schema.table), easy to read and pipe to other commands
        • json - Array of table names (schema.table) in JSON format for programmatic processing`,
    }),
  },
  handler: async ({ db, output }): Promise<void> => {
    try {
      const databaseService = DatabaseService.fromUrl(db);
      const schemas = await databaseService.getAllSchemas();
      const tableNames = schemas.map(
        (schema) => `${schema.schema}.${schema.name}`
      );

      if (output === 'json') {
        console.log(JSON.stringify(tableNames, null, 2));
      } else {
        for (const tableName of tableNames) {
          console.log(tableName);
        }
      }
    } catch (error) {
      handleCliError(error);
    }
  },
});
