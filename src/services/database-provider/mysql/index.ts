import mysql, { type RowDataPacket } from 'mysql2/promise';
import { default as PQueue } from 'p-queue';
import type {
  ColumnSchema,
  ForeignKey,
  IndexSchema,
  PrimaryKey,
  TableSchema,
} from '../../database/types';
import type {
  DatabaseProvider,
  JoinPath,
  JoinRelation,
  TableReference,
} from '../types';

// MySQL types
interface MySQLTableRow extends RowDataPacket {
  schema_name: string;
  table_name: string;
  table_comment: string | null;
}

interface MySQLColumnRow extends RowDataPacket {
  table_schema: string;
  table_name: string;
  ordinal_position: number;
  column_name: string;
  data_type: string;
  udt_name: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: boolean;
  column_default: string | null;
  column_comment: string | null;
}

interface MySQLPrimaryKeyRow extends RowDataPacket {
  constraint_name: string;
  columns: string | null;
}

interface MySQLForeignKeyRow extends RowDataPacket {
  constraint_name: string;
  columns: string | null;
  foreign_table_schema: string;
  foreign_table_name: string;
  foreign_columns: string | null;
  update_rule: string | null;
  delete_rule: string | null;
}

interface MySQLIndexRow extends RowDataPacket {
  index_name: string;
  is_unique: boolean;
  is_primary: boolean;
  index_def: string;
}

export class MySQLProvider implements DatabaseProvider {
  private readonly databaseUrl: string;
  private readonly maxConcurrency: number;

  constructor(databaseUrl: string, options?: { maxConcurrency?: number }) {
    this.databaseUrl = databaseUrl;
    this.maxConcurrency = options?.maxConcurrency || 10;
  }

  async getAllTableNames({
    shouldShowSystem = false,
  }: {
    shouldShowSystem?: boolean;
  } = {}): Promise<Array<{ schema: string; table: string }>> {
    const connection = await mysql.createConnection(this.databaseUrl);

    try {
      // Parse database name from URL
      const urlParts = new URL(this.databaseUrl);
      const dbName = urlParts.pathname.slice(1); // Remove leading /

      if (!dbName) {
        throw new Error('Database name not found in MySQL URL');
      }

      let query: string;
      let queryParams: string[];

      if (shouldShowSystem) {
        // Include all tables from all schemas including system schemas
        // This will include information_schema, mysql, performance_schema, sys, and user schemas
        query = `
        SELECT 
          TABLE_SCHEMA as schema_name,
          TABLE_NAME as table_name
        FROM information_schema.TABLES
        WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `;
        queryParams = [];
      } else {
        // Only include tables from the specified database schema
        query = `
        SELECT 
          TABLE_SCHEMA as schema_name,
          TABLE_NAME as table_name
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        ORDER BY TABLE_NAME
      `;
        queryParams = [dbName];
      }

      const [tables] = await connection.execute<MySQLTableRow[]>(
        query,
        queryParams
      );

      return tables.map((t) => ({
        schema: t.schema_name,
        table: t.table_name,
      }));
    } finally {
      await connection.end();
    }
  }

  async getSchema(params: {
    table: string;
    schema?: string;
  }): Promise<TableSchema> {
    const connection = await mysql.createConnection(this.databaseUrl);

    try {
      // Parse database name from URL
      const urlParts = new URL(this.databaseUrl);
      const defaultSchema = urlParts.pathname.slice(1); // Remove leading /

      // Use explicit schema param or default schema from URL
      const schemaToUse = params.schema || defaultSchema;

      if (!schemaToUse) {
        throw new Error('Schema name not found in MySQL URL or params');
      }

      // Get table comment
      const [tableInfo] = await connection.execute<MySQLTableRow[]>(
        `
        SELECT 
          TABLE_SCHEMA as schema_name,
          TABLE_NAME as table_name,
          TABLE_COMMENT as table_comment
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      `,
        [schemaToUse, params.table]
      );

      if (tableInfo.length === 0) {
        throw new Error(`Table ${schemaToUse}.${params.table} not found`);
      }

      // Run all queries in parallel
      const [columnsResult, pkResult, fkResult, idxResult] = await Promise.all([
        // Columns
        connection.execute<MySQLColumnRow[]>(
          `
          SELECT 
            TABLE_SCHEMA as table_schema,
            TABLE_NAME as table_name,
            ORDINAL_POSITION as ordinal_position,
            COLUMN_NAME as column_name,
            DATA_TYPE as data_type,
            COLUMN_TYPE as udt_name,
            CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
            NUMERIC_PRECISION as numeric_precision,
            NUMERIC_SCALE as numeric_scale,
            IF(IS_NULLABLE = 'YES', true, false) as is_nullable,
            COLUMN_DEFAULT as column_default,
            COLUMN_COMMENT as column_comment
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `,
          [schemaToUse, params.table]
        ),

        // Primary key
        connection.execute<MySQLPrimaryKeyRow[]>(
          `
          SELECT 
            tc.CONSTRAINT_NAME as constraint_name,
            GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) as columns
          FROM information_schema.TABLE_CONSTRAINTS tc
          JOIN information_schema.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND tc.TABLE_SCHEMA = ?
            AND tc.TABLE_NAME = ?
          GROUP BY tc.CONSTRAINT_NAME
        `,
          [schemaToUse, params.table]
        ),

        // Foreign keys
        connection.execute<MySQLForeignKeyRow[]>(
          `
          SELECT 
            tc.CONSTRAINT_NAME as constraint_name,
            GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) as columns,
            kcu.REFERENCED_TABLE_SCHEMA as foreign_table_schema,
            kcu.REFERENCED_TABLE_NAME as foreign_table_name,
            GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) as foreign_columns,
            rc.UPDATE_RULE as update_rule,
            rc.DELETE_RULE as delete_rule
          FROM information_schema.TABLE_CONSTRAINTS tc
          JOIN information_schema.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
          JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
            ON rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            AND rc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA
          WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND tc.TABLE_SCHEMA = ?
            AND tc.TABLE_NAME = ?
          GROUP BY tc.CONSTRAINT_NAME, kcu.REFERENCED_TABLE_SCHEMA, 
                   kcu.REFERENCED_TABLE_NAME, rc.UPDATE_RULE, rc.DELETE_RULE
        `,
          [schemaToUse, params.table]
        ),

        // Indexes
        connection.execute<MySQLIndexRow[]>(
          `
          SELECT 
            INDEX_NAME as index_name,
            IF(NON_UNIQUE = 0, true, false) as is_unique,
            IF(INDEX_NAME = 'PRIMARY', true, false) as is_primary,
            CONCAT('INDEX ', INDEX_NAME, ' ON ', TABLE_NAME, 
                   ' (', GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX), ')') as index_def
          FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = ?
          GROUP BY INDEX_NAME, NON_UNIQUE, TABLE_NAME
          ORDER BY INDEX_NAME
        `,
          [schemaToUse, params.table]
        ),
      ]);

      const [columns] = columnsResult;
      const [pkRows] = pkResult;
      const [fkRows] = fkResult;
      const [idxRows] = idxResult;

      const columnSchemas: ColumnSchema[] = columns.map((r) => ({
        schema: r.table_schema,
        table: r.table_name,
        name: r.column_name,
        ordinalPosition: Number(r.ordinal_position),
        dataType: r.data_type,
        udtName: r.udt_name ?? null,
        maxLength: r.character_maximum_length ?? null,
        numericPrecision: r.numeric_precision ?? null,
        numericScale: r.numeric_scale ?? null,
        isNullable: !!r.is_nullable,
        default: r.column_default ?? null,
        comment: r.column_comment ?? null,
      }));

      const primaryKey: PrimaryKey | null =
        pkRows.length > 0 && pkRows[0]
          ? {
              name: pkRows[0].constraint_name,
              columns: pkRows[0].columns ? pkRows[0].columns.split(',') : [],
            }
          : null;

      const foreignKeys: ForeignKey[] = fkRows.map((r) => ({
        name: r.constraint_name,
        columns: r.columns ? r.columns.split(',') : [],
        referencedSchema: r.foreign_table_schema,
        referencedTable: r.foreign_table_name,
        referencedColumns: r.foreign_columns
          ? r.foreign_columns.split(',')
          : [],
        onUpdate: r.update_rule ?? null,
        onDelete: r.delete_rule ?? null,
      }));

      const indexes: IndexSchema[] = idxRows.map((r) => ({
        name: r.index_name,
        isUnique: !!r.is_unique,
        isPrimary: !!r.is_primary,
        definition: r.index_def,
      }));

      return {
        schema: schemaToUse,
        name: params.table,
        comment: tableInfo[0]?.table_comment || null,
        columns: columnSchemas,
        primaryKey,
        foreignKeys,
        indexes,
      };
    } finally {
      await connection.end();
    }
  }

  async getAllSchemas({
    shouldShowSystem = false,
  }: {
    shouldShowSystem?: boolean;
  } = {}): Promise<TableSchema[]> {
    // Get all table names using the existing method
    const tables = await this.getAllTableNames({ shouldShowSystem });

    // Use PQueue to limit concurrent database operations
    const queue = new PQueue({ concurrency: this.maxConcurrency });

    // Queue all schema fetching operations
    const results = await Promise.all(
      tables.map(({ schema, table }) =>
        queue.add(async (): Promise<TableSchema> => {
          return await this.getSchema({ table, schema });
        })
      )
    );

    // Filter out any void results (defensive programming)
    return results.filter(
      (result): result is TableSchema => result !== undefined
    );
  }

  async getSampleData(params: {
    table: string;
    limit: number;
    schema?: string;
  }): Promise<Record<string, unknown>[]> {
    const connection = await mysql.createConnection(this.databaseUrl);

    try {
      // Parse default database name from URL
      const urlParts = new URL(this.databaseUrl);
      const defaultSchema = urlParts.pathname.slice(1); // Remove leading /

      // Use explicit schema param or default schema from URL
      const schemaToUse = params.schema || defaultSchema || null;
      const limitToUse = params.limit;

      let query: string;
      let queryParams: string[];

      if (schemaToUse) {
        query = `SELECT * FROM \`${schemaToUse}\`.\`${params.table}\` LIMIT ${limitToUse}`;
        queryParams = [];
      } else {
        query = `SELECT * FROM \`${params.table}\` LIMIT ${limitToUse}`;
        queryParams = [];
      }

      const [rows] = await connection.execute<RowDataPacket[]>(
        query,
        queryParams
      );
      return rows as Record<string, unknown>[];
    } finally {
      await connection.end();
    }
  }

  private buildTableIdentifier = (table: TableReference): string => {
    return `${table.schema ? `\`${table.schema}\`.` : ''}\`${table.table}\``;
  };

  private buildSelectColumns = ({
    tables,
    schemas,
  }: {
    tables: TableReference[];
    schemas: TableSchema[];
  }): string[] => {
    const columns: string[] = [];
    const columnNameCounts = new Map<string, number>();

    // First pass: count column name occurrences to identify conflicts
    tables.forEach((table, index) => {
      const schema = schemas[index];
      if (!(table && schema?.columns)) {
        return;
      }

      for (const column of schema.columns) {
        const count = columnNameCounts.get(column.name) || 0;
        columnNameCounts.set(column.name, count + 1);
      }
    });

    // Second pass: build SELECT clause with aliases where needed
    tables.forEach((table, index) => {
      const schema = schemas[index];
      if (!(table && schema?.columns)) {
        return;
      }

      const tableAlias = this.buildTableIdentifier(table);
      for (const column of schema.columns) {
        const hasConflict = (columnNameCounts.get(column.name) || 0) > 1;
        if (hasConflict) {
          // Use table-prefixed alias for conflicting columns
          const alias = `${table.schema ? `${table.schema}_` : ''}${table.table}_${column.name}`;
          columns.push(`${tableAlias}.\`${column.name}\` AS \`${alias}\``);
        } else {
          // No conflict, use simple column reference
          columns.push(`${tableAlias}.\`${column.name}\``);
        }
      }
    });

    return columns;
  };

  private buildJoinCondition = (relation: JoinRelation): string => {
    // Validate column arrays have same length and are not empty
    if (!(relation.from.columns && relation.to.columns)) {
      throw new Error(
        `Invalid join relation: missing columns in relation from ${relation.from.table} to ${relation.to.table}`
      );
    }

    if (
      relation.from.columns.length === 0 ||
      relation.to.columns.length === 0
    ) {
      throw new Error(
        `Invalid join relation: empty column arrays in relation from ${relation.from.table} to ${relation.to.table}`
      );
    }

    if (relation.from.columns.length !== relation.to.columns.length) {
      throw new Error(
        `Invalid join relation: column count mismatch between ${relation.from.table} (${relation.from.columns.length}) and ${relation.to.table} (${relation.to.columns.length})`
      );
    }

    const fromTable = this.buildTableIdentifier(relation.from);
    const toTable = this.buildTableIdentifier(relation.to);

    return relation.from.columns
      .map((fromCol, idx) => {
        const toCol = relation.to.columns[idx];
        if (!(fromCol && toCol)) {
          throw new Error(
            `Invalid join relation: null/undefined column in relation from ${relation.from.table} to ${relation.to.table}`
          );
        }
        return `${fromTable}.\`${fromCol}\` = ${toTable}.\`${toCol}\``;
      })
      .join(' AND ');
  };

  generateJoinSQL = ({
    joinPath,
    tableSchemas,
  }: {
    joinPath: JoinPath;
    tableSchemas: TableSchema[];
  }): string => {
    // Build SELECT clause
    const selectColumns = this.buildSelectColumns({
      tables: joinPath.tables,
      schemas: tableSchemas,
    });
    const selectClause = `SELECT\n  ${selectColumns.join(',\n  ')}`;

    // Build FROM clause
    const firstTable = joinPath.tables[0];
    if (!firstTable) {
      return '';
    }
    const fromClause = `FROM ${this.buildTableIdentifier(firstTable)}`;

    // Build JOIN clauses
    const joinStatements = joinPath.relations.map((relation) => {
      const toTable = this.buildTableIdentifier(relation.to);
      const joinCondition = this.buildJoinCondition(relation);
      return `JOIN ${toTable} ON ${joinCondition}`;
    });

    if (joinStatements.length === 0) {
      return `${selectClause}\n${fromClause}`;
    }

    return `${selectClause}\n${fromClause}\n${joinStatements.join('\n')}`;
  };

  query = async (sql: string): Promise<Record<string, unknown>[]> => {
    const mysqlLib = await import('mysql2/promise');
    const connection = await mysqlLib.createConnection(this.databaseUrl);
    try {
      const [rows] = await connection.execute(sql);
      return rows as Record<string, unknown>[];
    } finally {
      await connection.end();
    }
  };

  safeQuery = async (sql: string): Promise<Record<string, unknown>[]> => {
    const mysqlLib = await import('mysql2/promise');
    const connection = await mysqlLib.createConnection(this.databaseUrl);

    try {
      // Start transaction
      await connection.query('BEGIN');

      // Execute the query
      const [rows] = await connection.query(sql);

      // Rollback the transaction
      await connection.query('ROLLBACK');

      // For MySQL, INSERT/UPDATE/DELETE operations return result metadata, not rows
      // We should return empty array for consistency with PostgreSQL behavior
      if (Array.isArray(rows)) {
        return rows as Record<string, unknown>[];
      }
      // For INSERT/UPDATE/DELETE operations, return empty array
      return [];
    } catch (error) {
      // Ensure rollback on error
      try {
        await connection.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
      throw error;
    } finally {
      await connection.end();
    }
  };
}
