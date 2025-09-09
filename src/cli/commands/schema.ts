import { command } from 'cmd-ts';
import { DatabaseService } from '../../services/database';
import { dbOption, handleCliError, showSystemOption } from '../utils';

export const schemaCommand = command({
  name: 'schema',
  description: `Extract complete database schema in JSON format.
  
  This command analyzes your database structure and returns comprehensive schema data
  including tables, columns, data types, primary/foreign keys, indexes, and relationships
  in JSON format for programmatic processing.
  
  Examples:
    vsequel schema --db postgresql://user:pass@localhost/mydb
    vsequel schema --db mysql://user:pass@localhost/mydb --show-system > schema.json
    vsequel schema --db postgresql://localhost/mydb | jq '.[] | .name'`,
  args: {
    db: dbOption,
    showSystem: showSystemOption,
  },
  handler: async ({ db, showSystem }): Promise<void> => {
    try {
      console.error('Extracting database schema...');

      const databaseService = DatabaseService.fromUrl(db);
      const schemas = await databaseService.getAllSchemas({
        shouldShowSystem: showSystem,
      });

      console.error(`Successfully extracted ${schemas.length} tables`);
      console.log(JSON.stringify(schemas, null, 2));
    } catch (error) {
      handleCliError(error);
    }
  },
});
