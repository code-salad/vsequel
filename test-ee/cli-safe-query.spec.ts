import { strict as assert } from 'node:assert/strict';
import { exec } from 'node:child_process';
import { describe, test } from 'node:test';
import { promisify } from 'node:util';
import { default as PQueue } from 'p-queue';
import { env } from '../src/config';

const execAsync = promisify(exec);

// Helper function to safely parse JSON with fallback
const safeJsonParse = (output: string): Record<string, unknown>[] => {
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

// Regex constants for performance
const SAFE_QUERY_HELP_REGEX =
  /Execute SQL queries safely in read-only transactions with automatic rollback/;
const DB_URL_REGEX = /--db, -d <str>/;
const SQL_QUERY_REGEX = /--sql, -s <str>/;
const DATABASE_URL_REQUIRED_REGEX = /No value provided for --db/;
const SQL_REQUIRED_REGEX = /No value provided for --sql/;
const ERROR_REGEX = /Error:/;
const LAPTOP_REGEX = /Laptop/i;

// Database operation queue to prevent overwhelming DB with concurrent connections
// Limit to 2 concurrent operations to prevent connection pool exhaustion
const dbQueue = new PQueue({ concurrency: 2 });

// Helper to simulate Bun's $ behavior with queue support
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

  // Check if this command involves database operations
  const isDbCommand =
    command.includes('safe-query') && command.includes('--db');

  return {
    quiet() {
      return this;
    },
    nothrow() {
      // Queue database operations to prevent overwhelming connections
      if (isDbCommand) {
        return dbQueue.add(() => executeCommand());
      }
      return executeCommand();
    },
  };
};

const CLI_PATH = './src/cli/index.ts';
const postgresUrl = process.env.TEST_POSTGRES_URL || env.POSTGRES_URL;
const mysqlUrl = process.env.TEST_MYSQL_URL || env.MYSQL_URL;

describe('CLI safe-query command', () => {
  describe('help and validation', () => {
    test('should show help for safe-query command', async () => {
      const result = await $(`npx tsx ${CLI_PATH} safe-query --help`)
        .quiet()
        .nothrow();
      const output = result.stdout.toString();

      assert.equal(result.exitCode, 0);
      assert.match(output, SAFE_QUERY_HELP_REGEX);
      assert.match(output, DB_URL_REGEX);
      assert.match(output, SQL_QUERY_REGEX);
    });

    test('should require database URL', async () => {
      const result = await $(`npx tsx ${CLI_PATH} safe-query --sql "SELECT 1"`)
        .quiet()
        .nothrow();
      const stderr = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(stderr, DATABASE_URL_REQUIRED_REGEX);
    });

    test('should require SQL query', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db postgresql://localhost/test`
      )
        .quiet()
        .nothrow();
      const stderr = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(stderr, SQL_REQUIRED_REGEX);
    });

    test('should handle invalid database URL', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db invalid://url --sql "SELECT 1"`
      )
        .quiet()
        .nothrow();
      const stderr = result.stderr.toString();

      assert.ok(result.exitCode !== 0);
      assert.match(stderr, ERROR_REGEX);
    });
  });

  describe('PostgreSQL integration tests', () => {
    test('should execute SELECT query successfully', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "SELECT 1 as test_value"`
      )
        .quiet()
        .nothrow();

      if (postgresUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        assert.equal(json.length, 1);
        assert.equal(json[0]?.test_value, 1);
      }
    });

    test('should execute complex SELECT with JOIN', async () => {
      const sql =
        'SELECT p.name, COUNT(oi.id) as order_count FROM products p LEFT JOIN order_items oi ON p.id = oi.product_id GROUP BY p.id, p.name ORDER BY p.name LIMIT 5';

      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "${sql}"`
      )
        .quiet()
        .nothrow();

      if (postgresUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        assert.ok(json.length <= 5);
        if (json.length > 0) {
          assert.ok('name' in json[0]);
          assert.ok('order_count' in json[0]);
        }
      }
    });

    test('should execute INSERT and rollback automatically', async () => {
      const insertSql =
        "INSERT INTO products (name, price, description) VALUES ('Test Product CLI', 199.99, 'Test Description') RETURNING id, name, price";

      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "${insertSql}"`
      )
        .quiet()
        .nothrow();

      if (postgresUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        assert.equal(json.length, 1);
        assert.equal(json[0]?.name, 'Test Product CLI');
        assert.equal(Number(json[0]?.price), 199.99);

        // Verify the insert was rolled back
        const checkResult = await $(
          `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "SELECT COUNT(*) as count FROM products WHERE name = 'Test Product CLI'"`
        )
          .quiet()
          .nothrow();

        const checkJson = safeJsonParse(checkResult.stdout.toString());
        assert.equal(Number(checkJson[0]?.count), 0);
      }
    });

    test('should execute UPDATE and rollback automatically', async () => {
      const updateSql =
        "UPDATE products SET price = 999.99 WHERE name LIKE '%Laptop%' RETURNING id, name, price";

      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "${updateSql}"`
      )
        .quiet()
        .nothrow();

      if (postgresUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        if (json.length > 0) {
          assert.equal(Number(json[0]?.price), 999.99);
          assert.match(String(json[0]?.name), LAPTOP_REGEX);
        }

        // Verify the update was rolled back
        const checkResult = await $(
          `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "SELECT COUNT(*) as count FROM products WHERE price = 999.99"`
        )
          .quiet()
          .nothrow();

        const checkJson = safeJsonParse(checkResult.stdout.toString());
        assert.equal(Number(checkJson[0]?.count), 0);
      }
    });

    test('should execute DELETE and rollback automatically', async () => {
      const deleteSql =
        "DELETE FROM products WHERE name = 'Non-existent Product' RETURNING id, name";

      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "${deleteSql}"`
      )
        .quiet()
        .nothrow();

      if (postgresUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        // Should return empty array since no rows match
        assert.equal(json.length, 0);
      }
    });

    test('should handle SQL syntax errors gracefully', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "INVALID SQL SYNTAX"`
      )
        .quiet()
        .nothrow();

      if (postgresUrl) {
        const stderr = result.stderr.toString();

        assert.ok(result.exitCode !== 0);
        assert.match(stderr, ERROR_REGEX);
      }
    });

    test('should handle queries with special characters and quotes', async () => {
      const sql = `SELECT 'Hello World' as message, 'Working fine' as quote_test`;

      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "${sql}"`
      )
        .quiet()
        .nothrow();

      if (postgresUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        assert.equal(json.length, 1);
        assert.equal(json[0]?.message, 'Hello World');
        assert.equal(json[0]?.quote_test, 'Working fine');
      }
    });
  });

  describe('MySQL integration tests', () => {
    test('should execute SELECT query on MySQL', async () => {
      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${mysqlUrl}" --sql "SELECT 1 as test_value"`
      )
        .quiet()
        .nothrow();

      if (mysqlUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        assert.equal(json.length, 1);
        assert.equal(json[0]?.test_value, 1);
      }
    });

    test('should execute INSERT and rollback on MySQL', async () => {
      const insertSql =
        "INSERT INTO products (name, price, description) VALUES ('MySQL Test Product', 299.99, 'MySQL Test')";

      const result = await $(
        `npx tsx ${CLI_PATH} safe-query --db "${mysqlUrl}" --sql "${insertSql}"`
      )
        .quiet()
        .nothrow();

      if (mysqlUrl) {
        const output = result.stdout.toString();
        const json = safeJsonParse(output);

        if (result.exitCode !== 0) {
          console.error('Command failed with exit code:', result.exitCode);
          console.error('Stderr:', result.stderr.toString());
          console.error('Stdout:', result.stdout.toString());
        }
        assert.equal(result.exitCode, 0);
        assert.ok(Array.isArray(json));
        // MySQL INSERT without RETURNING should produce empty array
        assert.equal(json.length, 0);

        // Verify the insert was rolled back
        const checkResult = await $(
          `npx tsx ${CLI_PATH} safe-query --db "${mysqlUrl}" --sql "SELECT COUNT(*) as count FROM products WHERE name = 'MySQL Test Product'"`
        )
          .quiet()
          .nothrow();

        const checkJson = safeJsonParse(checkResult.stdout.toString());
        assert.equal(Number(checkJson[0]?.count), 0);
      }
    });
  });

  describe('Cross-database compatibility', () => {
    test('should work with both PostgreSQL and MySQL', async () => {
      if (postgresUrl && mysqlUrl) {
        const sql =
          'SELECT COUNT(*) as table_count FROM information_schema.tables';

        const [postgresResult, mysqlResult] = await Promise.all([
          $(
            `npx tsx ${CLI_PATH} safe-query --db "${postgresUrl}" --sql "${sql}"`
          )
            .quiet()
            .nothrow(),
          $(`npx tsx ${CLI_PATH} safe-query --db "${mysqlUrl}" --sql "${sql}"`)
            .quiet()
            .nothrow(),
        ]);

        // PostgreSQL test
        const postgresJson = JSON.parse(postgresResult.stdout.toString());
        assert.equal(postgresResult.exitCode, 0);
        assert.ok(Array.isArray(postgresJson));
        assert.ok(Number(postgresJson[0]?.table_count) > 0);

        // MySQL test
        const mysqlJson = JSON.parse(mysqlResult.stdout.toString());
        assert.equal(mysqlResult.exitCode, 0);
        assert.ok(Array.isArray(mysqlJson));
        assert.ok(Number(mysqlJson[0]?.table_count) > 0);
      }
    });
  });
});
