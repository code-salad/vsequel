import { command, option, string } from 'cmd-ts';
import { DatabaseService } from '../../services/database';
import { dbOption, handleCliError } from '../utils';

export const safeQueryCommand = command({
  name: 'safe-query',
  description: `Execute SQL queries safely in read-only transactions with automatic rollback.
  
  This command runs your SQL queries in a safe environment where all changes are
  automatically rolled back, preventing any accidental data modifications. Perfect
  for testing queries, exploring data, or running analysis without risk.
  
  Examples:
    vsequel safe-query --db postgresql://localhost/mydb --sql "SELECT * FROM users LIMIT 5"
    vsequel safe-query --db mysql://localhost/mydb --sql "SELECT COUNT(*) FROM products"
    vsequel safe-query --db postgresql://localhost/mydb --sql "INSERT INTO test_table (name) VALUES ('test') RETURNING *"`,
  args: {
    db: dbOption,
    sql: option({
      type: string,
      long: 'sql',
      short: 's',
      description: `SQL query to execute safely. Supports SELECT, INSERT, UPDATE, DELETE operations.
        All changes are automatically rolled back - no data will be permanently modified.`,
    }),
  },
  handler: async ({ db, sql }): Promise<void> => {
    try {
      const databaseService = DatabaseService.fromUrl(db);
      const result = await databaseService.safeQuery({ sql });

      // Ensure we always output valid JSON, even for empty results
      const output = result;
      console.log(JSON.stringify(output, null, 2));
    } catch (error) {
      handleCliError(error);
    }
  },
});
