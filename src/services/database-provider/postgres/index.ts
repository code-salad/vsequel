import postgres from 'postgres';
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

export class PostgresProvider implements DatabaseProvider {
  private readonly databaseUrl: string;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  async getAllTableNames(): Promise<Array<{ schema: string; table: string }>> {
    const sql = postgres(this.databaseUrl, { max: 1 });
    try {
      const tables = await sql<
        {
          schema_name: string;
          table_name: string;
        }[]
      > /*sql*/`
        select
          n.nspname as schema_name,
          c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p', 'v')
          and n.nspname not in (
            'pg_catalog',
            'information_schema',
            'pglogical_origin',
            'pglogical',
            'pg_temp_1',
            'pg_toast'
          )
          and n.nspname not like 'pg_toast_temp%'
          and n.nspname not like 'pg_temp%'
          and n.nspname not like 'pg_toast%'
        order by n.nspname, c.relname;
      `;

      return tables.map((t) => ({
        schema: t.schema_name,
        table: t.table_name,
      }));
    } finally {
      await sql.end();
    }
  }

  async getSchema(params: {
    table: string;
    schema?: string;
  }): Promise<TableSchema> {
    const sql = postgres(this.databaseUrl, { max: 1 });
    try {
      // Parse schema from URL parameters (e.g., ?schema=myschema or ?search_path=myschema)
      const urlParts = new URL(this.databaseUrl);
      const urlSchema = urlParts.searchParams.get('schema');

      // Use explicit schema param or schema from URL or default to 'public'
      const schemaToUse = params.schema || urlSchema || 'public';

      // Get table comment
      const tableInfo = await sql<
        {
          table_comment: string | null;
        }[]
      > /*sql*/`
        select
          obj_description(c.oid, 'pg_class') as table_comment
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = ${schemaToUse}
          and c.relname = ${params.table};
      `;

      // Run all queries in parallel
      const [columns, pkRows, fkRows, idxRows] = await Promise.all([
        // Columns
        sql<
          {
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
          }[]
        > /*sql*/`
          select
            c.table_schema,
            c.table_name,
            c.ordinal_position,
            c.column_name,
            c.data_type,
            c.udt_name,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            (c.is_nullable = 'YES') as is_nullable,
            c.column_default,
            pgd.description as column_comment
          from information_schema.columns c
          left join pg_catalog.pg_class pc
            on pc.relname = c.table_name
          left join pg_catalog.pg_namespace pn
            on pn.oid = pc.relnamespace and pn.nspname = c.table_schema
          left join pg_catalog.pg_attribute pa
            on pa.attrelid = pc.oid and pa.attname = c.column_name
          left join pg_catalog.pg_description pgd
            on pgd.objoid = pc.oid and pgd.objsubid = pa.attnum
          where c.table_schema = ${schemaToUse}
            and c.table_name = ${params.table}
          order by c.ordinal_position;
        `,

        // Primary key
        sql<
          {
            constraint_name: string;
            columns: string[];
          }[]
        > /*sql*/`
          select
            tc.constraint_name,
            array_agg(kcu.column_name order by kcu.ordinal_position) as columns
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            using (constraint_name, table_schema, table_name)
          where tc.constraint_type = 'PRIMARY KEY'
            and tc.table_schema = ${schemaToUse}
            and tc.table_name = ${params.table}
          group by tc.constraint_name;
        `,

        // Foreign keys
        sql<
          {
            constraint_name: string;
            columns: string[];
            foreign_table_schema: string;
            foreign_table_name: string;
            foreign_columns: string[];
            update_rule: string | null;
            delete_rule: string | null;
          }[]
        > /*sql*/`
          select
            tc.constraint_name,
            array_agg(kcu.column_name order by kcu.ordinal_position) as columns,
            ccu.table_schema  as foreign_table_schema,
            ccu.table_name    as foreign_table_name,
            array_agg(ccu.column_name order by kcu.ordinal_position) as foreign_columns,
            rc.update_rule,
            rc.delete_rule
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            using (constraint_name, table_schema, table_name)
          join information_schema.referential_constraints rc
            on rc.constraint_name = tc.constraint_name
           and rc.constraint_schema = tc.constraint_schema
          join information_schema.constraint_column_usage ccu
            on ccu.constraint_name = tc.constraint_name
           and ccu.constraint_schema = tc.constraint_schema
          where tc.constraint_type = 'FOREIGN KEY'
            and tc.table_schema = ${schemaToUse}
            and tc.table_name = ${params.table}
          group by tc.constraint_name, ccu.table_schema, ccu.table_name, rc.update_rule, rc.delete_rule
          order by tc.constraint_name;
        `,

        // Indexes
        sql<
          {
            index_name: string;
            is_unique: boolean;
            is_primary: boolean;
            index_def: string;
          }[]
        > /*sql*/`
          select
            i.relname as index_name,
            ix.indisunique as is_unique,
            ix.indisprimary as is_primary,
            pg_get_indexdef(ix.indexrelid) as index_def
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_index ix on ix.indrelid = c.oid
          join pg_class i on i.oid = ix.indexrelid
          where n.nspname = ${schemaToUse}
            and c.relname = ${params.table}
          order by i.relname;
        `,
      ]);

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
          ? { name: pkRows[0].constraint_name, columns: pkRows[0].columns }
          : null;

      const foreignKeys: ForeignKey[] = fkRows.map((r) => ({
        name: r.constraint_name,
        columns: r.columns,
        referencedSchema: r.foreign_table_schema,
        referencedTable: r.foreign_table_name,
        referencedColumns: r.foreign_columns,
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
        comment: tableInfo[0]?.table_comment ?? null,
        columns: columnSchemas,
        primaryKey,
        foreignKeys,
        indexes,
      };
    } finally {
      await sql.end();
    }
  }

  async getAllSchemas(): Promise<TableSchema[]> {
    // Get all table names using the existing method
    const tables = await this.getAllTableNames();

    // Pull schema for each table using the existing getSchema method
    const tablePromises = tables.map(({ schema, table }) =>
      this.getSchema({ table, schema })
    );

    const results = await Promise.all(tablePromises);
    return results;
  }

  async getSampleData(params: {
    table: string;
    limit: number;
    schema?: string;
  }): Promise<Record<string, unknown>[]> {
    const sql = postgres(this.databaseUrl, { max: 1 });
    try {
      // Parse schema from URL parameters (e.g., ?schema=myschema or ?search_path=myschema)
      const urlParts = new URL(this.databaseUrl);
      const urlSchema = urlParts.searchParams.get('schema');

      // Use explicit schema param or schema from URL or default to 'public'
      const schemaToUse = params.schema || urlSchema || 'public';
      const limitToUse = params.limit;

      const result = await sql.unsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${schemaToUse}"."${params.table}" LIMIT ${limitToUse}`
      );

      return result;
    } finally {
      await sql.end();
    }
  }

  private buildTableIdentifier = (table: TableReference): string => {
    return `${table.schema ? `"${table.schema}".` : ''}"${table.table}"`;
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
          columns.push(`${tableAlias}."${column.name}" AS "${alias}"`);
        } else {
          // No conflict, use simple column reference
          columns.push(`${tableAlias}."${column.name}"`);
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
        return `${fromTable}."${fromCol}" = ${toTable}."${toCol}"`;
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
    const connection = postgres(this.databaseUrl, { max: 1 });
    try {
      const result = await connection.unsafe<Record<string, unknown>[]>(sql);
      return result;
    } finally {
      await connection.end();
    }
  };

  safeQuery = async (sql: string): Promise<Record<string, unknown>[]> => {
    const connection = postgres(this.databaseUrl, { max: 1 });
    let result: Record<string, unknown>[] = [];

    try {
      // Use postgres built-in transaction method that auto-rollbacks on error
      await connection.begin(async (transaction) => {
        result = await transaction.unsafe<Record<string, unknown>[]>(sql);
        // Intentionally throw to trigger rollback
        throw new Error('ROLLBACK_INTENTIONAL');
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'ROLLBACK_INTENTIONAL') {
        // This was our intentional rollback, return the result
        return result;
      }
      // Re-throw actual errors
      throw error;
    } finally {
      await connection.end();
    }

    return result;
  };
}
