import { command, oneOf, option, string } from 'cmd-ts';
import { DatabaseService } from '../../services/database';
import type { TableReference } from '../../services/database-provider/types';
import { dbOption, handleCliError } from '../utils';

export const joinCommand = command({
  name: 'join',
  description: `Discover optimal join paths between multiple database tables.
  
  This command analyzes foreign key relationships to find the shortest path
  to join multiple tables together. Essential for complex queries and understanding
  table relationships in your database schema.
  
  Examples:
    vsequel join --db postgresql://localhost/mydb --tables users,orders
    vsequel join --db mysql://localhost/mydb --tables products,categories,suppliers --output sql
    vsequel join --db postgresql://localhost/mydb --tables public.users,public.profiles,public.settings`,
  args: {
    db: dbOption,
    tables: option({
      type: string,
      long: 'tables',
      short: 't',
      description: `Comma-separated list of table names to join. Supports schema-qualified names
        (e.g., 'schema.table'). The command will find the shortest path to connect all tables.`,
    }),
    output: option({
      type: oneOf(['json', 'sql']),
      long: 'output',
      short: 'o',
      defaultValue: () => 'json' as const,
      description: `Join path output format (default: json):
        • json - Detailed join path information with relationship metadata
        • sql - Ready-to-use SQL query with proper JOIN syntax and conditions`,
    }),
  },
  handler: async ({ db, tables, output }): Promise<void> => {
    try {
      const databaseService = DatabaseService.fromUrl(db);

      // Parse tables string into TableReference array
      const tableList = tables.split(',').map((t) => {
        const parts = t.trim().split('.');
        if (parts.length === 2) {
          return { schema: parts[0], table: parts[1] };
        }
        // Default to public schema for PostgreSQL, need to handle MySQL differently
        return { schema: 'public', table: parts[0] };
      }) as TableReference[];

      const results = await databaseService.getTableJoins({
        tables: tableList,
        maxDepth: 6,
      });

      if (results.length === 0) {
        console.error('No join path found between the specified tables');
        process.exit(1);
      }

      if (output === 'sql') {
        // Output the generated SQL for the shortest path (first result)
        console.log(results[0]?.sql || '');
      } else {
        // JSON output - show all possible paths
        console.log(
          JSON.stringify(
            results.map((r) => r.joinPath),
            null,
            2
          )
        );
      }
    } catch (error) {
      handleCliError(error);
    }
  },
});
