import { command, flag } from 'cmd-ts';
import { DatabaseService } from '../../services/database';
import { dbOption, handleCliError, showSystemOption } from '../utils';

export const plantumlCommand = command({
  name: 'plantuml',
  description: `Generate PlantUML diagram from database schema.
  
  This command analyzes your database structure and generates PlantUML diagram code
  showing table relationships, columns, data types, and constraints.
  
  Examples:
    vsequel plantuml --db postgresql://user:pass@localhost/mydb
    vsequel plantuml --db mysql://user:pass@localhost/mydb -s --show-system > simple-schema.puml
    vsequel plantuml --db postgresql://localhost/mydb --simple > schema.puml`,
  args: {
    db: dbOption,
    showSystem: showSystemOption,
    simple: flag({
      long: 'simple',
      short: 's',
      defaultValue: () => false,
      description: `Generate simplified PlantUML diagram focusing only on relationships.
        When false (default), includes detailed columns, types, and constraints.`,
    }),
  },
  handler: async ({ db, showSystem, simple = false }): Promise<void> => {
    try {
      console.error('Generating PlantUML diagram...');

      const databaseService = DatabaseService.fromUrl(db);

      const result = await databaseService.getPlantuml({
        type: simple ? 'simple' : 'full',
        shouldShowSystem: showSystem,
      });

      console.error(
        `Successfully generated ${simple ? 'simplified' : 'detailed'} PlantUML diagram`
      );
      console.log(result);
    } catch (error) {
      handleCliError(error);
    }
  },
});
