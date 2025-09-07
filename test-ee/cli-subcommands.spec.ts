import { strict as assert } from 'node:assert/strict';
import { exec } from 'node:child_process';
import { describe, test } from 'node:test';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

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

// Top-level regex patterns for performance
const VSEQUEL_TOOL_PATTERN = /Database ERD extraction tool/;
const SUBCOMMANDS_PATTERN = /where.*<subcommand>.*can be one of:/;
const SCHEMA_PATTERN = /schema/;
const TABLE_PATTERN = /table/;
const LIST_PATTERN = /list/;
const SAMPLE_PATTERN = /sample/;
const CONTEXT_PATTERN = /context/;
const JOIN_PATTERN = /join/;
const INFO_PATTERN = /info/;
const SAFE_QUERY_PATTERN = /safe-query/;
const EXTRACT_FULL_SCHEMA_PATTERN = /Extract complete database schema/;
const OUTPUT_OPTION_PATTERN = /--output, -o/;
const JSON_PATTERN = /json/;
const _PLANTUML_PATTERN = /plantuml/;
const GET_SCHEMA_TABLE_PATTERN =
  /Get detailed schema information for a specific table/;
const TABLE_OPTION_PATTERN = /--table, -t/;
const SCHEMA_OPTION_PATTERN = /--schema, -s/;
const WITH_SAMPLE_PATTERN = /--with-sample/;
const LIST_TABLE_NAMES_PATTERN = /List all tables available in the database/;
const SIMPLE_PATTERN = /simple/;
const GET_SAMPLE_DATA_PATTERN =
  /Extract sample data rows from a specific table/;
const LIMIT_PATTERN = /--limit, -l/;
const GET_SCHEMA_SAMPLE_PATTERN =
  /Get comprehensive table context including schema definition and sample data/;
const FIND_JOIN_PATH_PATTERN =
  /Discover optimal join paths between multiple database tables/;
const TABLES_OPTION_PATTERN = /--tables, -t/;
const SQL_PATTERN = /sql/;
const SHOW_DATABASE_INFO_PATTERN =
  /Display comprehensive database connection and structure information/;
const DB_OPTION_PATTERN = /--db, -d/;
const DATABASE_URL_REQUIRED_PATTERN = /No value provided for --db/;
const TABLE_REQUIRED_PATTERN = /No value provided for --table/;
const TABLES_REQUIRED_PATTERN = /No value provided for --tables/;
const SQL_REQUIRED_PATTERN = /No value provided for --sql/;
const SAFE_QUERY_HELP_PATTERN =
  /Execute SQL queries safely in read-only transactions with automatic rollback/;
const UNKNOWN_COMMAND_PATTERN = /Not a valid subcommand name/;
const UNKNOWN_ARGUMENTS_PATTERN = /Unknown arguments/;
const PUBLIC_SCHEMA_PATTERN = /public\./;
const PUBLIC_CATEGORIES_PATTERN = /public\.categories/;
const PUBLIC_CUSTOMERS_PATTERN = /public\.customers/;
const PUBLIC_ORDERS_PATTERN = /public\.orders/;
const FROM_PATTERN = /FROM/;
const JOIN_SQL_PATTERN = /JOIN/;
const ON_PATTERN = /ON/;
const CUSTOMERS_PATTERN = /customers/;
const NO_JOIN_PATH_PATTERN = /No join path found between the specified tables/;

const CLI_PATH = './src/cli/index.ts';

describe('CLI Subcommands', () => {
  describe('help command', () => {
    test('should show main help when no arguments provided', async () => {
      const result = await $(`npx tsx ${CLI_PATH}`).quiet().nothrow();
      const stdout = result.stdout.toString();

      // Help goes to stdout
      assert.match(stdout, VSEQUEL_TOOL_PATTERN);
      assert.match(stdout, SUBCOMMANDS_PATTERN);
      assert.match(stdout, SCHEMA_PATTERN);
      assert.match(stdout, TABLE_PATTERN);
      assert.match(stdout, LIST_PATTERN);
      assert.match(stdout, SAMPLE_PATTERN);
      assert.match(stdout, CONTEXT_PATTERN);
      assert.match(stdout, JOIN_PATTERN);
      assert.match(stdout, SAFE_QUERY_PATTERN);
      assert.match(stdout, INFO_PATTERN);
    });

    test('should show help for schema subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} schema --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, EXTRACT_FULL_SCHEMA_PATTERN);
      assert.match(output, DB_OPTION_PATTERN);
      assert.match(output, JSON_PATTERN);
    });

    test('should show help for table subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} table --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, GET_SCHEMA_TABLE_PATTERN);
      assert.match(output, TABLE_OPTION_PATTERN);
      assert.match(output, SCHEMA_OPTION_PATTERN);
      assert.match(output, WITH_SAMPLE_PATTERN);
    });

    test('should show help for list subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} list --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, LIST_TABLE_NAMES_PATTERN);
      assert.match(output, OUTPUT_OPTION_PATTERN);
      assert.match(output, SIMPLE_PATTERN);
      assert.match(output, JSON_PATTERN);
    });

    test('should show help for sample subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} sample --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, GET_SAMPLE_DATA_PATTERN);
      assert.match(output, TABLE_OPTION_PATTERN);
      assert.match(output, SCHEMA_OPTION_PATTERN);
      assert.match(output, LIMIT_PATTERN);
    });

    test('should show help for context subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} context --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, GET_SCHEMA_SAMPLE_PATTERN);
      assert.match(output, TABLE_OPTION_PATTERN);
      assert.match(output, SCHEMA_OPTION_PATTERN);
    });

    test('should show help for join subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} join --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, FIND_JOIN_PATH_PATTERN);
      assert.match(output, TABLES_OPTION_PATTERN);
      assert.match(output, SQL_PATTERN);
      assert.match(output, JSON_PATTERN);
    });

    test('should show help for safe-query subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} safe-query --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, SAFE_QUERY_HELP_PATTERN);
      assert.match(output, DB_OPTION_PATTERN);
      assert.match(output, SQL_PATTERN);
    });

    test('should show help for info subcommand', async () => {
      const result = await $(`npx tsx ${CLI_PATH} info --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.match(output, SHOW_DATABASE_INFO_PATTERN);
      assert.match(output, DB_OPTION_PATTERN);
    });
  });

  describe('error handling', () => {
    test('should error when database URL is missing for schema', async () => {
      const result = await $(`npx tsx ${CLI_PATH} schema`).quiet().nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, DATABASE_URL_REQUIRED_PATTERN);
    });

    test('should error when database URL is missing for list', async () => {
      const result = await $(`npx tsx ${CLI_PATH} list`).quiet().nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, DATABASE_URL_REQUIRED_PATTERN);
    });

    test('should error when table is missing for table command', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} table --db postgresql://localhost/test`
      )
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, TABLE_REQUIRED_PATTERN);
    });

    test('should error when table is missing for sample command', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} sample --db postgresql://localhost/test`
      )
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, TABLE_REQUIRED_PATTERN);
    });

    test('should error when table is missing for context command', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} context --db postgresql://localhost/test`
      )
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, TABLE_REQUIRED_PATTERN);
    });

    test('should error when tables is missing for join command', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} join --db postgresql://localhost/test`
      )
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, TABLES_REQUIRED_PATTERN);
    });

    test('should error when database URL is missing for safe-query', async () => {
      const result = await $(`npx tsx ${CLI_PATH} safe-query --sql "SELECT 1"`)
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, DATABASE_URL_REQUIRED_PATTERN);
    });

    test('should error when SQL is missing for safe-query command', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db postgresql://localhost/test`
      )
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, SQL_REQUIRED_PATTERN);
    });

    test('should error for unknown subcommand', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} unknown --db postgresql://localhost/test`
      )
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, UNKNOWN_COMMAND_PATTERN);
    });
  });

  describe('output format validation', () => {
    test('should validate output format for schema command', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} schema --db postgresql://localhost/test --output invalid`
      )
        .quiet()
        .nothrow();
      const output = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(output, UNKNOWN_ARGUMENTS_PATTERN);
    });
  });
});

describe('CLI Integration Tests with Mock Database', () => {
  // These tests would require a running database, so we'll skip them in CI
  // but they're useful for local development

  test('should list tables with schema information', async () => {
    const result = await $(`npx tsx ${CLI_PATH} list --db "$TEST_POSTGRES_URL"`)
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      // Should show tables in schema.table format
      assert.match(output, PUBLIC_SCHEMA_PATTERN);
      // Should contain specific tables with schema prefix
      assert.match(output, PUBLIC_CATEGORIES_PATTERN);
      assert.match(output, PUBLIC_CUSTOMERS_PATTERN);
      assert.match(output, PUBLIC_ORDERS_PATTERN);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should list tables in JSON format with schema information', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} list --db "$TEST_POSTGRES_URL" --output json`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output) as string[];

      // Should return array of tables with schema prefix
      assert.ok(Array.isArray(json));
      assert.ok(json.length > 0);

      // Should contain tables in schema.table format
      const hasPublicCategories = json.some(
        (table) => table === 'public.categories'
      );
      const hasPublicCustomers = json.some(
        (table) => table === 'public.customers'
      );
      const hasPublicOrders = json.some((table) => table === 'public.orders');

      assert.ok(hasPublicCategories, 'Should contain public.categories');
      assert.ok(hasPublicCustomers, 'Should contain public.customers');
      assert.ok(hasPublicOrders, 'Should contain public.orders');

      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should get table schema', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} table --db "$TEST_POSTGRES_URL" --table customers`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output) as Record<string, unknown>;
      assert.equal(json.name, 'customers');
      assert.ok(json.columns);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should get sample data', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} sample --db "$TEST_POSTGRES_URL" --table customers`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output);
      assert.equal(Array.isArray(json), true);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should get table context', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} context --db "$TEST_POSTGRES_URL" --table customers`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output) as Record<string, unknown>;
      assert.ok(json.schema);
      assert.ok(json.sampleData);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should find join path', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} join --db "$TEST_POSTGRES_URL" --tables orders,customers --output json`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output) as Record<string, unknown>;
      assert.ok(json.tables);
      assert.ok(json.relations);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should generate SQL join statements', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} join --db "$TEST_POSTGRES_URL" --tables orders,customers --output sql`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      assert.match(output, FROM_PATTERN);
      assert.match(output, JOIN_SQL_PATTERN);
      assert.match(output, ON_PATTERN);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should handle single table input for join command', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} join --db "$TEST_POSTGRES_URL" --tables customers --output json`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output);

      // Should return a single join path with one table and no relations
      assert.ok(Array.isArray(json));
      assert.equal(json.length, 1);

      const joinPath = json[0];
      assert.ok(joinPath.tables);
      assert.equal(joinPath.tables.length, 1);
      assert.equal(joinPath.tables[0].table, 'customers');
      assert.ok(joinPath.relations);
      assert.equal(joinPath.relations.length, 0);
      assert.equal(joinPath.totalJoins, 0);

      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should handle single table input for join command with SQL output', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} join --db "$TEST_POSTGRES_URL" --tables customers --output sql`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();

      // Should generate a simple SELECT statement with FROM but no JOINs
      assert.match(output, FROM_PATTERN);
      assert.match(output, CUSTOMERS_PATTERN);
      // Should NOT contain JOIN or ON clauses for single table
      assert.doesNotMatch(output, JOIN_SQL_PATTERN);
      assert.doesNotMatch(output, ON_PATTERN);

      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should handle unconnected tables with no join path found', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} join --db "$TEST_POSTGRES_URL" --tables "public.orders,test_schema.users" --output json`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      // When no join path is found, CLI should exit with error code 1
      assert.equal(result.exitCode, 1);

      const stderr = result.stderr.toString();
      assert.match(stderr, NO_JOIN_PATH_PATTERN);
    }
  });

  test('should execute safe query with SELECT', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} safe-query --db "$TEST_POSTGRES_URL" --sql "SELECT * FROM products LIMIT 3"`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output);
      assert.ok(Array.isArray(json));
      assert.ok(json.length <= 3);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should execute safe query with INSERT (rolled back)', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} safe-query --db "$TEST_POSTGRES_URL" --sql "INSERT INTO products (name, price) VALUES ('test-product', 99.99) RETURNING *"`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output);
      assert.ok(Array.isArray(json));
      assert.equal(json[0]?.name, 'test-product');
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);

      // Verify the insert was rolled back by running another query
      const checkResult = await $(
        `npx tsx ${CLI_PATH} safe-query --db "$TEST_POSTGRES_URL" --sql "SELECT COUNT(*) as count FROM products WHERE name = 'test-product'"`
      )
        .quiet()
        .nothrow();

      const checkJson = JSON.parse(checkResult.stdout.toString());
      assert.equal(Number(checkJson[0]?.count), 0);
    }
  });

  test('should execute safe query with UPDATE (rolled back)', async () => {
    const result = await $(
      `npx tsx ${CLI_PATH} safe-query --db "$TEST_POSTGRES_URL" --sql "UPDATE products SET price = 999.99 WHERE id = 1 RETURNING *"`
    )
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output);
      assert.ok(Array.isArray(json));
      if (json.length > 0) {
        assert.equal(Number(json[0]?.price), 999.99);
      }
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });

  test('should get database info', async () => {
    const result = await $(`npx tsx ${CLI_PATH} info --db "$TEST_POSTGRES_URL"`)
      .quiet()
      .nothrow();

    if (process.env.TEST_POSTGRES_URL) {
      const output = result.stdout.toString();
      const json = safeJsonParse(output) as Record<string, unknown>;
      assert.equal(json.provider, 'postgres');
      assert.ok(typeof json.tableCount === 'number' && json.tableCount > 0);
      assert.ok(json.schemas);
      if (result.exitCode !== 0) {
        console.error('Command failed with exit code:', result.exitCode);
        console.error('Stderr:', result.stderr.toString());
        console.error('Stdout:', result.stdout.toString());
      }
      assert.equal(result.exitCode, 0);
    }
  });
});
