import { command } from 'cmd-ts';
import { DatabaseService } from '../../services/database';
import { dbOption, handleCliError, showSystemOption } from '../utils';

export const infoCommand = command({
  name: 'info',
  description: `Display comprehensive database connection and structure information.
  
  This command provides an overview of your database including connection details,
  database type, schema organization, table counts, and structural summary.
  Useful for database discovery and documentation.
  
  Examples:
    vsequel info --db postgresql://localhost/mydb
    vsequel info --db mysql://localhost/mydb --show-system > database-summary.json
    vsequel info --db postgresql://user:pass@remote-host:5432/production_db`,
  args: {
    db: dbOption,
    showSystem: showSystemOption,
  },
  handler: async ({ db, showSystem }): Promise<void> => {
    try {
      const databaseService = DatabaseService.fromUrl(db);

      // Get provider type
      const provider = databaseService.getProvider();

      // Get all table names
      const tables = await databaseService.getAllTableNames({
        shouldShowSystem: showSystem,
      });

      // Group tables by schema
      const schemaMap = new Map<string, string[]>();
      for (const { schema, table } of tables) {
        if (!schemaMap.has(schema)) {
          schemaMap.set(schema, []);
        }
        schemaMap.get(schema)?.push(table);
      }

      // Convert to object for JSON output
      const schemas: Record<string, { tableCount: number; tables: string[] }> =
        {};
      schemaMap.forEach((tableList, schemaName) => {
        schemas[schemaName] = {
          tableCount: tableList.length,
          tables: tableList.sort(),
        };
      });

      const info = {
        provider,
        tableCount: tables.length,
        schemaCount: schemaMap.size,
        schemas,
      };

      console.log(JSON.stringify(info, null, 2));
    } catch (error) {
      handleCliError(error);
    }
  },
});
