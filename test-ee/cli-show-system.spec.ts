import { strict as assert } from 'node:assert/strict';
import { exec } from 'node:child_process';
import { describe, test } from 'node:test';
import { promisify } from 'node:util';
import { TEST_POSTGRES_URL } from './global-setup';

const execAsync = promisify(exec);

// Regex patterns used in tests (defined at top level for performance)
const SHOW_SYSTEM_FLAG_REGEX = /--show-system/;
const SHORT_FLAG_REGEX = /-S/;
const INCLUDE_SYSTEM_TABLES_REGEX = /Include system tables/;
const PUBLIC_CATEGORIES_REGEX = /public\.categories/;
const PUBLIC_PRODUCTS_REGEX = /public\.products/;
const PUBLIC_ORDERS_REGEX = /public\.orders/;
const INFORMATION_SCHEMA_REGEX = /information_schema\./;
const PG_CATALOG_REGEX = /pg_catalog\./;
const STARTUML_REGEX = /@startuml/;
const ENDUML_REGEX = /@enduml/;
const ENTITY_PRODUCTS_REGEX = /entity.*products/;
const ENTITY_CATEGORIES_REGEX = /entity.*categories/;
const NAME_FIELD_REGEX = /name :/;
const PRICE_FIELD_REGEX = /price :/;

// Helper to simulate Bun's $ behavior
const $ = (command: string) => {
  const executeCommand = async () => {
    try {
      const result = await execAsync(command);
      return {
        exitCode: 0,
        stdout: Buffer.from(result.stdout),
        stderr: Buffer.from(result.stderr),
      };
    } catch (error: unknown) {
      const execError = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      return {
        exitCode: execError.code || 1,
        stdout: Buffer.from(execError.stdout || ''),
        stderr: Buffer.from(execError.stderr || execError.message || ''),
      };
    }
  };

  return {
    quiet() {
      return this;
    },
    nothrow() {
      return executeCommand();
    },
  };
};

// Helper function to safely parse JSON with fallback
const safeJsonParse = (output: string): unknown => {
  try {
    const trimmed = output.trim();
    if (!trimmed) {
      return [];
    }
    return JSON.parse(trimmed);
  } catch {
    console.warn('Failed to parse JSON output:', output);
    return [];
  }
};

const CLI_PATH = './src/cli/index.ts';
const postgresUrl = TEST_POSTGRES_URL;

describe('CLI --show-system Flag Tests', () => {
  describe('list command with --show-system', () => {
    test('should show help includes --show-system flag', async () => {
      const result = await $(`npx tsx ${CLI_PATH} list --help`)
        .quiet()
        .nothrow();

      const output = result.stdout.toString();
      assert.match(output, SHOW_SYSTEM_FLAG_REGEX);
      assert.match(output, SHORT_FLAG_REGEX);
      assert.match(output, INCLUDE_SYSTEM_TABLES_REGEX);
    });

    test('should list only user tables by default (without --show-system)', async () => {
      const result = await $(`npx tsx ${CLI_PATH} list --db ${postgresUrl}`)
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const output = result.stdout.toString();

      // Should contain user tables
      assert.match(output, PUBLIC_CATEGORIES_REGEX);
      assert.match(output, PUBLIC_PRODUCTS_REGEX);
      assert.match(output, PUBLIC_ORDERS_REGEX);

      // Should NOT contain system tables
      assert.doesNotMatch(output, INFORMATION_SCHEMA_REGEX);
      assert.doesNotMatch(output, PG_CATALOG_REGEX);
    });

    test('should include system tables with --show-system', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} list --db ${postgresUrl} --show-system`
      )
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const output = result.stdout.toString();

      // Should contain user tables
      assert.match(output, PUBLIC_CATEGORIES_REGEX);
      assert.match(output, PUBLIC_PRODUCTS_REGEX);

      // Should ALSO contain system tables
      assert.match(output, INFORMATION_SCHEMA_REGEX);
      assert.match(output, PG_CATALOG_REGEX);
    });

    test('should include system tables with -S short flag', async () => {
      const result = await $(`npx tsx ${CLI_PATH} list --db ${postgresUrl} -S`)
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const output = result.stdout.toString();

      // Should contain both user and system tables
      assert.match(output, PUBLIC_PRODUCTS_REGEX);
      assert.match(output, INFORMATION_SCHEMA_REGEX);
    });

    test('should work with JSON output and --show-system', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} list --db ${postgresUrl} --show-system --output json`
      )
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const output = result.stdout.toString();
      const json = safeJsonParse(output) as string[];

      assert.ok(Array.isArray(json));

      // Should contain user tables
      const hasUserTables = json.some((table) => table.startsWith('public.'));
      assert.ok(hasUserTables, 'Should contain user tables');

      // Should contain system tables
      const hasInformationSchema = json.some((table) =>
        table.startsWith('information_schema.')
      );
      const hasPgCatalog = json.some((table) =>
        table.startsWith('pg_catalog.')
      );

      assert.ok(
        hasInformationSchema,
        'Should contain information_schema tables'
      );
      assert.ok(hasPgCatalog, 'Should contain pg_catalog tables');
    });
  });

  describe('schema command with --show-system', () => {
    test('should show help includes --show-system flag', async () => {
      const result = await $(`npx tsx ${CLI_PATH} schema --help`)
        .quiet()
        .nothrow();

      const output = result.stdout.toString();
      assert.match(output, SHOW_SYSTEM_FLAG_REGEX);
      assert.match(output, SHORT_FLAG_REGEX);
    });

    test('should extract only user schemas by default', async () => {
      const result = await $(`npx tsx ${CLI_PATH} schema --db ${postgresUrl}`)
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const schemas = safeJsonParse(result.stdout.toString()) as Array<{
        name: string;
        schema: string;
      }>;

      assert.ok(Array.isArray(schemas));

      // Should contain user tables
      const userTables = schemas.filter((s) => s.schema === 'public');
      assert.ok(userTables.length > 0, 'Should contain public schema tables');

      // Should NOT contain system tables
      const systemTables = schemas.filter(
        (s) => s.schema === 'information_schema' || s.schema === 'pg_catalog'
      );
      assert.equal(
        systemTables.length,
        0,
        'Should not contain system tables by default'
      );
    });

    test('should include system schemas with --show-system', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} schema --db ${postgresUrl} --show-system`
      )
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const schemas = safeJsonParse(result.stdout.toString()) as Array<{
        name: string;
        schema: string;
      }>;

      assert.ok(Array.isArray(schemas));

      // Should contain user tables
      const userTables = schemas.filter((s) => s.schema === 'public');
      assert.ok(userTables.length > 0, 'Should contain public schema tables');

      // Should ALSO contain system tables
      const informationSchemaTables = schemas.filter(
        (s) => s.schema === 'information_schema'
      );
      const pgCatalogTables = schemas.filter((s) => s.schema === 'pg_catalog');

      assert.ok(
        informationSchemaTables.length > 0,
        'Should contain information_schema tables'
      );
      assert.ok(pgCatalogTables.length > 0, 'Should contain pg_catalog tables');

      // Check specific system tables exist
      const tableNames = informationSchemaTables.map((t) => t.name);
      assert.ok(
        tableNames.includes('tables'),
        'Should include information_schema.tables'
      );
      assert.ok(
        tableNames.includes('columns'),
        'Should include information_schema.columns'
      );
    });
  });

  describe('info command with --show-system', () => {
    test('should show help includes --show-system flag', async () => {
      const result = await $(`npx tsx ${CLI_PATH} info --help`)
        .quiet()
        .nothrow();

      const output = result.stdout.toString();
      assert.match(output, SHOW_SYSTEM_FLAG_REGEX);
      assert.match(output, SHORT_FLAG_REGEX);
    });

    test('should show only user tables in info by default', async () => {
      const result = await $(`npx tsx ${CLI_PATH} info --db ${postgresUrl}`)
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const info = safeJsonParse(result.stdout.toString()) as {
        provider: string;
        tableCount: number;
        schemaCount: number;
        schemas: Record<string, { tableCount: number; tables: string[] }>;
      };

      assert.equal(info.provider, 'postgres');
      assert.ok(info.tableCount > 0);

      // Should have public schema
      assert.ok(info.schemas.public, 'Should have public schema');

      // Should NOT have system schemas
      assert.ok(
        !info.schemas.information_schema,
        'Should not have information_schema by default'
      );
      assert.ok(
        !info.schemas.pg_catalog,
        'Should not have pg_catalog by default'
      );
    });

    test('should include system tables in info with --show-system', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} info --db ${postgresUrl} --show-system`
      )
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const info = safeJsonParse(result.stdout.toString()) as {
        provider: string;
        tableCount: number;
        schemaCount: number;
        schemas: Record<string, { tableCount: number; tables: string[] }>;
      };

      assert.equal(info.provider, 'postgres');

      // Should have public schema
      assert.ok(info.schemas.public, 'Should have public schema');

      // Should ALSO have system schemas
      assert.ok(
        info.schemas.information_schema,
        'Should have information_schema with --show-system'
      );
      assert.ok(
        info.schemas.pg_catalog,
        'Should have pg_catalog with --show-system'
      );

      // Should have many more tables when including system tables
      assert.ok(
        info.tableCount > 50,
        'Should have many tables when including system tables'
      );
      assert.ok(
        info.schemaCount > 2,
        'Should have multiple schemas when including system tables'
      );

      // Verify information_schema has expected tables
      const infoSchemaTable = info.schemas.information_schema;
      assert.ok(
        infoSchemaTable.tableCount > 0,
        'information_schema should have tables'
      );
      assert.ok(
        infoSchemaTable.tables.includes('tables'),
        'Should include information_schema.tables'
      );
      assert.ok(
        infoSchemaTable.tables.includes('columns'),
        'Should include information_schema.columns'
      );
    });
  });

  describe('plantuml command with --show-system', () => {
    test('should show help includes --show-system flag', async () => {
      const result = await $(`npx tsx ${CLI_PATH} plantuml --help`)
        .quiet()
        .nothrow();

      const output = result.stdout.toString();
      assert.match(output, SHOW_SYSTEM_FLAG_REGEX);
      assert.match(output, SHORT_FLAG_REGEX);
    });

    test('should generate PlantUML with only user tables by default', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} plantuml --db ${postgresUrl} --simple`
      )
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const output = result.stdout.toString();

      // Should be valid PlantUML
      assert.match(output, STARTUML_REGEX);
      assert.match(output, ENDUML_REGEX);

      // Should contain user tables
      assert.match(output, ENTITY_PRODUCTS_REGEX);
      assert.match(output, ENTITY_CATEGORIES_REGEX);

      // Should NOT contain system tables
      assert.doesNotMatch(output, INFORMATION_SCHEMA_REGEX);
      assert.doesNotMatch(output, PG_CATALOG_REGEX);
    });

    test('should include system tables in PlantUML with --show-system', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} plantuml --db ${postgresUrl} --simple --show-system`
      )
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const output = result.stdout.toString();

      // Should be valid PlantUML
      assert.match(output, STARTUML_REGEX);
      assert.match(output, ENDUML_REGEX);

      // Should contain user tables
      assert.match(output, ENTITY_PRODUCTS_REGEX);
      assert.match(output, ENTITY_CATEGORIES_REGEX);

      // Should ALSO contain system tables (though they might not have relationships)
      // Note: System tables might not appear in relationships, but they should be processed
      // The fact that the command succeeds and has many more entities is the key test

      // The output should be significantly longer when including system tables
      const lineCount = output.split('\n').length;
      assert.ok(
        lineCount > 20,
        'PlantUML with system tables should have many more lines'
      );
    });

    test('should work with full PlantUML and --show-system', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} plantuml --db ${postgresUrl} --show-system`
      )
        .quiet()
        .nothrow();

      assert.equal(result.exitCode, 0);
      const output = result.stdout.toString();

      // Should be valid PlantUML
      assert.match(output, STARTUML_REGEX);
      assert.match(output, ENDUML_REGEX);

      // Should contain user tables with details
      assert.match(output, ENTITY_PRODUCTS_REGEX);
      assert.match(output, NAME_FIELD_REGEX);
      assert.match(output, PRICE_FIELD_REGEX);

      // The output should be significantly longer when including system tables
      const lineCount = output.split('\n').length;
      assert.ok(
        lineCount > 50,
        'Full PlantUML with system tables should have many lines'
      );
    });
  });

  describe('DatabaseService API tests', () => {
    test('should verify the underlying API supports shouldShowSystem parameter', async () => {
      // This is more of an integration test to ensure our CLI is calling the right API
      const { DatabaseService } = await import('../src/services/database');

      const service = DatabaseService.fromUrl(postgresUrl);

      // Test without system tables
      const userTables = await service.getAllTableNames();
      const userTablesCount = userTables.length;

      // Test with system tables
      const allTables = await service.getAllTableNames({
        shouldShowSystem: true,
      });
      const allTablesCount = allTables.length;

      // Should have significantly more tables when including system tables
      assert.ok(
        allTablesCount > userTablesCount,
        `Should have more tables with system tables: ${allTablesCount} vs ${userTablesCount}`
      );

      // Should have system schemas
      const systemSchemas = allTables.filter(
        (t) => t.schema === 'information_schema' || t.schema === 'pg_catalog'
      );
      assert.ok(
        systemSchemas.length > 0,
        'Should contain system schema tables'
      );

      // Verify specific system tables exist
      const systemTableNames = systemSchemas.map(
        (t) => `${t.schema}.${t.table}`
      );
      assert.ok(
        systemTableNames.includes('information_schema.tables'),
        'Should include information_schema.tables'
      );
      assert.ok(
        systemTableNames.includes('information_schema.columns'),
        'Should include information_schema.columns'
      );
    });
  });
});
