import { strict as assert } from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DatabaseService } from '../src/services/database';
import type { TableReference } from '../src/services/database-provider/types';
import { TEST_MYSQL_URL, TEST_POSTGRES_URL } from './global-setup';

// Use the global test database URLs
const postgresUrl = TEST_POSTGRES_URL;
const mysqlUrl = TEST_MYSQL_URL;
const MYSQL_DB = 'reflect_erd';

describe('docker integration tests', () => {
  describe('PostgreSQL tests', () => {
    test(
      'should connect and pull schema from PostgreSQL',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(postgresUrl);

        const schema = await db.getAllSchemas();
        assert.ok(schema);
        assert.ok(schema.length > 0);

        // Verify expected tables exist
        const tableNames = schema.map((t) => t.name);
        assert.ok(tableNames.includes('categories'));
        assert.ok(tableNames.includes('customers'));
        assert.ok(tableNames.includes('products'));
        assert.ok(tableNames.includes('orders'));
        assert.ok(tableNames.includes('order_items'));
      }
    );

    test(
      'should pull sample data from PostgreSQL table',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(postgresUrl);

        const sampleData = await db.getSampleData({
          table: 'products',
          schema: 'public',
        });

        assert.ok(Array.isArray(sampleData));
        assert.ok(sampleData.length > 0);
        assert.ok(sampleData.length <= 10);

        // Verify data structure
        if (sampleData[0]) {
          assert.ok('id' in sampleData[0]);
          assert.ok('name' in sampleData[0]);
          assert.ok('price' in sampleData[0]);
        }
      }
    );

    test('should handle PostgreSQL views', { timeout: 15_000 }, async () => {
      const db = DatabaseService.fromUrl(postgresUrl);

      const schema = await db.getAllSchemas();
      const view = schema.find((t) => t.name === 'order_summary');

      // Views are returned as regular tables in the schema
      assert.ok(view);
      assert.equal(view?.name, 'order_summary');
    });

    test(
      'should handle multiple PostgreSQL schemas',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(postgresUrl);

        const schema = await db.getAllSchemas();

        // Check for both public and test_schema
        const publicTables = schema.filter((t) => t.schema === 'public');
        const testSchemaTables = schema.filter(
          (t) => t.schema === 'test_schema'
        );

        assert.ok(publicTables.length > 0);
        assert.ok(testSchemaTables.length > 0);

        // Verify test_schema.users exists
        const usersTable = schema.find(
          (t) => t.schema === 'test_schema' && t.name === 'users'
        );
        assert.ok(usersTable);
      }
    );

    test(
      'should find shortest join path between two directly connected tables',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(postgresUrl);

        const tables: TableReference[] = [
          { schema: 'public', table: 'orders' },
          { schema: 'public', table: 'customers' },
        ];

        const results = await db.getTableJoins({ tables });
        assert.ok(results);
        assert.ok(results.length > 0);

        const path = results[0]?.joinPath;

        assert.ok(path);
        assert.equal(path?.tables.length, 2);
        assert.equal(path?.relations.length, 1);
        assert.equal(path?.totalJoins, 1);

        // Check the relation details
        const relation = path?.relations[0];
        assert.equal(relation?.from.table, 'orders');
        assert.ok(relation?.from.columns.includes('customer_id'));
        assert.equal(relation?.to.table, 'customers');
        assert.ok(relation?.to.columns.includes('id'));
      }
    );

    test(
      'should find path with intermediate table',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(postgresUrl);

        const tables: TableReference[] = [
          { schema: 'public', table: 'orders' },
          { schema: 'public', table: 'products' },
        ];

        const results = await db.getTableJoins({ tables });
        assert.ok(results);
        assert.ok(results.length > 0);

        const path = results[0]?.joinPath;

        assert.ok(path);
        assert.ok(path?.tables.length > 2); // Should include order_items
        assert.ok(path?.relations.length >= 2);

        // Verify intermediate table is included
        const tableNames = path?.tables.map((t: TableReference) => t.table);
        assert.ok(tableNames.includes('order_items'));
      }
    );

    test('should connect multiple tables', { timeout: 15_000 }, async () => {
      const db = DatabaseService.fromUrl(postgresUrl);

      const tables: TableReference[] = [
        { schema: 'public', table: 'customers' },
        { schema: 'public', table: 'orders' },
        { schema: 'public', table: 'products' },
      ];

      const results = await db.getTableJoins({ tables });
      assert.ok(results);
      assert.ok(results.length > 0);

      const path = results[0]?.joinPath;

      assert.ok(path);
      assert.equal(path?.inputTablesCount, 3);
      assert.ok(path?.totalTablesCount >= 3);
      assert.ok(path?.relations.length >= 2);
    });

    test('should handle single table input', { timeout: 15_000 }, async () => {
      const db = DatabaseService.fromUrl(postgresUrl);

      const tables: TableReference[] = [
        { schema: 'public', table: 'customers' },
      ];

      const results = await db.getTableJoins({ tables });
      assert.ok(results);
      assert.ok(results.length > 0);

      const path = results[0]?.joinPath;

      assert.ok(path);
      assert.equal(path?.tables.length, 1);
      assert.equal(path?.relations.length, 0);
      assert.equal(path?.totalJoins, 0);
    });

    test(
      'should return empty array for empty input',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(postgresUrl);

        const tables: TableReference[] = [];

        const result = await db.getTableJoins({ tables });

        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
      }
    );

    test(
      'should handle tables from different schemas',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(postgresUrl);

        const tables: TableReference[] = [
          { schema: 'public', table: 'orders' },
          { schema: 'test_schema', table: 'users' },
        ];

        const result = await db.getTableJoins({ tables });

        // These tables aren't connected, so should return empty array
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
      }
    );
  });

  describe('MySQL tests', () => {
    test(
      'should connect and pull schema from MySQL',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const schema = await db.getAllSchemas();
        assert.ok(schema);
        assert.ok(schema.length > 0);

        // Verify expected tables exist
        const tableNames = schema.map((t) => t.name);
        assert.ok(tableNames.includes('categories'));
        assert.ok(tableNames.includes('customers'));
        assert.ok(tableNames.includes('products'));
        assert.ok(tableNames.includes('orders'));
        assert.ok(tableNames.includes('order_items'));
        assert.ok(tableNames.includes('product_reviews'));
        assert.ok(tableNames.includes('page_views'));
      }
    );

    test(
      'should pull sample data from MySQL table',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const sampleData = await db.getSampleData({
          table: 'customers',
          schema: MYSQL_DB,
        });

        assert.ok(Array.isArray(sampleData));
        assert.equal(sampleData.length, 5); // We inserted 5 customers

        // Verify data structure
        if (sampleData[0]) {
          assert.ok('id' in sampleData[0]);
          assert.ok('email' in sampleData[0]);
          assert.ok('first_name' in sampleData[0]);
          assert.ok('last_name' in sampleData[0]);
        }
      }
    );

    test('should handle MySQL views', { timeout: 15_000 }, async () => {
      const db = DatabaseService.fromUrl(mysqlUrl);

      const schema = await db.getAllSchemas();
      const view = schema.find((t) => t.name === 'order_summary');

      // Views are returned as regular tables in the schema
      assert.ok(view);
      assert.equal(view?.name, 'order_summary');
    });

    test('should handle empty MySQL table', { timeout: 15_000 }, async () => {
      const db = DatabaseService.fromUrl(mysqlUrl);

      // inventory_logs table is empty
      const sampleData = await db.getSampleData({
        table: 'inventory_logs',
        schema: MYSQL_DB,
      });

      assert.ok(Array.isArray(sampleData));
      assert.equal(sampleData.length, 0);
    });

    test(
      'should handle MySQL table with foreign keys',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const schema = await db.getAllSchemas();
        const orderItemsTable = schema.find((t) => t.name === 'order_items');

        assert.ok(orderItemsTable);

        // Check foreign key relationships
        const foreignKeys = orderItemsTable?.foreignKeys || [];
        assert.ok(foreignKeys.length > 0);

        // Should have foreign keys to orders and products
        const orderFk = foreignKeys.find((fk) =>
          fk.columns.includes('order_id')
        );
        const productFk = foreignKeys.find((fk) =>
          fk.columns.includes('product_id')
        );

        assert.ok(orderFk);
        assert.ok(productFk);
        assert.equal(orderFk?.referencedTable, 'orders');
        assert.equal(productFk?.referencedTable, 'products');
      }
    );

    test(
      'should find shortest join path between MySQL tables',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const tables: TableReference[] = [
          { schema: MYSQL_DB, table: 'orders' },
          { schema: MYSQL_DB, table: 'customers' },
        ];

        const results = await db.getTableJoins({ tables });
        assert.ok(results);
        assert.ok(results.length > 0);

        const path = results[0]?.joinPath;

        assert.ok(path);
        assert.equal(path?.tables.length, 2);
        assert.equal(path?.relations.length, 1);
        assert.equal(path?.totalJoins, 1);

        // Check the relation details
        const relation = path?.relations[0];
        assert.equal(relation?.from.table, 'orders');
        assert.ok(relation?.from.columns.includes('customer_id'));
        assert.equal(relation?.to.table, 'customers');
        assert.ok(relation?.to.columns.includes('id'));
      }
    );

    test(
      'should find path with intermediate table in MySQL',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const tables: TableReference[] = [
          { schema: MYSQL_DB, table: 'orders' },
          { schema: MYSQL_DB, table: 'products' },
        ];

        const results = await db.getTableJoins({ tables });
        assert.ok(results);
        assert.ok(results.length > 0);

        const path = results[0]?.joinPath;

        assert.ok(path);
        assert.ok(path?.tables.length > 2); // Should include order_items
        assert.ok(path?.relations.length >= 2);

        // Verify intermediate table is included
        const tableNames = path?.tables.map((t: TableReference) => t.table);
        assert.ok(tableNames.includes('order_items'));
      }
    );

    test(
      'should connect multiple MySQL tables',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const tables: TableReference[] = [
          { schema: MYSQL_DB, table: 'customers' },
          { schema: MYSQL_DB, table: 'orders' },
          { schema: MYSQL_DB, table: 'products' },
          { schema: MYSQL_DB, table: 'categories' },
        ];

        const results = await db.getTableJoins({ tables });
        assert.ok(results);
        assert.ok(results.length > 0);

        const path = results[0]?.joinPath;

        assert.ok(path);
        assert.equal(path?.inputTablesCount, 4);
        assert.ok(path?.totalTablesCount >= 4);
        assert.ok(path?.relations.length >= 3);
      }
    );

    test(
      'should handle nullable foreign keys in MySQL',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const tables: TableReference[] = [
          { schema: MYSQL_DB, table: 'products' },
          { schema: MYSQL_DB, table: 'categories' },
        ];

        const results = await db.getTableJoins({ tables });
        assert.ok(results);
        assert.ok(results.length > 0);

        const path = results[0]?.joinPath;

        assert.ok(path);
        assert.equal(path?.relations.length, 1);

        // Check if nullable FK is detected
        const relation = path?.relations[0];
        if (
          relation?.from.table === 'products' &&
          relation?.from.columns.includes('category_id')
        ) {
          // category_id might be nullable in products table
          assert.ok(relation?.isNullable !== undefined);
        }
      }
    );

    test(
      'should handle MySQL single table input',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const tables: TableReference[] = [
          { schema: MYSQL_DB, table: 'customers' },
        ];

        const results = await db.getTableJoins({ tables });
        assert.ok(results);
        assert.ok(results.length > 0);

        const path = results[0]?.joinPath;

        assert.ok(path);
        assert.equal(path?.tables.length, 1);
        assert.equal(path?.relations.length, 0);
        assert.equal(path?.totalJoins, 0);
      }
    );

    test(
      'should return null for unconnected MySQL tables',
      { timeout: 15_000 },
      async () => {
        const db = DatabaseService.fromUrl(mysqlUrl);

        const tables: TableReference[] = [
          { schema: MYSQL_DB, table: 'inventory_logs' },
          { schema: MYSQL_DB, table: 'page_views' },
        ];

        const result = await db.getTableJoins({ tables });

        // If these tables aren't connected through FKs, should return empty array
        // or find a very long path through multiple intermediate tables
        if (result.length > 0) {
          const path = result[0]?.joinPath;
          assert.ok(path?.relations.length > 2); // Long path
        } else {
          assert.ok(Array.isArray(result));
          assert.equal(result.length, 0); // No connection
        }
      }
    );
  });

  describe('Cross-database comparison', () => {
    test(
      'should have similar table structures in both databases',
      { timeout: 30_000 },
      async () => {
        const postgresDb = DatabaseService.fromUrl(postgresUrl);
        const mysqlDb = DatabaseService.fromUrl(mysqlUrl);

        const postgresSchema = await postgresDb.getAllSchemas();
        const mysqlSchema = await mysqlDb.getAllSchemas();

        // Find common tables
        const commonTables = [
          'categories',
          'customers',
          'products',
          'orders',
          'order_items',
        ];

        for (const tableName of commonTables) {
          const pgTable = postgresSchema.find(
            (t) => t.name === tableName && t.schema === 'public'
          );
          const myTable = mysqlSchema.find((t) => t.name === tableName);

          assert.ok(pgTable);
          assert.ok(myTable);

          // Both should have similar column counts (might differ slightly due to DB differences)
          if (pgTable && myTable) {
            assert.ok(
              Math.abs(pgTable.columns.length - myTable.columns.length) <= 2
            );
          }
        }
      }
    );

    test(
      'should retrieve similar sample data from both databases',
      { timeout: 30_000 },
      async () => {
        const postgresDb = DatabaseService.fromUrl(postgresUrl);
        const mysqlDb = DatabaseService.fromUrl(mysqlUrl);

        const pgProducts = await postgresDb.getSampleData({
          table: 'products',
          schema: 'public',
        });

        const myProducts = await mysqlDb.getSampleData({
          table: 'products',
          schema: MYSQL_DB,
        });

        // Both should return the same number of products
        assert.equal(pgProducts.length, 10);
        assert.equal(myProducts.length, 10);

        // Verify first product has same name in both
        if (pgProducts[0] && myProducts[0]) {
          assert.equal(pgProducts[0].name, myProducts[0].name);
          assert.equal(pgProducts[0].price, myProducts[0].price);
        }
      }
    );
  });
});
