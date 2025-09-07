import type { DatabaseProvider } from '../database-provider';
import { MySQLProvider, PostgresProvider } from '../database-provider';
import type {
  JoinPath,
  JoinRelation,
  TableReference,
} from '../database-provider/types';
import { generatePlantumlSchema } from '../plantuml/generator';
import type { ForeignKey, TableSchema } from './types';

// Re-export types for external use
export type {
  ColumnSchema,
  ForeignKey,
  IndexSchema,
  PrimaryKey,
  TableSchema,
} from './types';

// Main DatabaseService class that uses database providers
export class DatabaseService {
  private provider: DatabaseProvider;
  private providerName: 'postgres' | 'mysql';
  private relationDetails?: Map<string, JoinRelation[]>;

  constructor({ provider }: { provider: DatabaseProvider }) {
    this.provider = provider;
    // Detect provider type based on instance
    if (provider instanceof PostgresProvider) {
      this.providerName = 'postgres';
    } else if (provider instanceof MySQLProvider) {
      this.providerName = 'mysql';
    } else {
      // Default fallback, could be extended for custom providers
      this.providerName = 'postgres';
    }
  }

  static fromUrl(databaseUrl: string): DatabaseService {
    const provider = DatabaseService.createProvider(databaseUrl);
    return new DatabaseService({ provider });
  }

  private static createProvider(databaseUrl: string): DatabaseProvider {
    const url = databaseUrl.toLowerCase();

    if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
      return new PostgresProvider(databaseUrl);
    }
    if (url.startsWith('mysql://') || url.startsWith('mysql2://')) {
      return new MySQLProvider(databaseUrl);
    }
    throw new Error(
      `Unsupported database URL: ${databaseUrl}. Supported: postgresql://, postgres://, mysql://, mysql2://`
    );
  }

  getAllTableNames = async (): Promise<
    Array<{ schema: string; table: string }>
  > => {
    return await this.provider.getAllTableNames();
  };

  getSchema = async ({
    table,
    schema,
  }: {
    table: string;
    schema?: string;
  }): Promise<TableSchema> => {
    return await this.provider.getSchema({ table, schema });
  };

  getAllSchemas = async (): Promise<TableSchema[]> => {
    return await this.provider.getAllSchemas();
  };

  getSampleData = async ({
    table,
    schema,
    limit = 10,
  }: {
    table: string;
    schema?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> => {
    return await this.provider.getSampleData({ table, schema, limit });
  };

  getProvider = (): 'postgres' | 'mysql' => {
    return this.providerName;
  };

  getTableContext = async ({
    table,
    schema,
  }: {
    table: string;
    schema?: string;
  }): Promise<{
    schema: TableSchema;
    sampleData: Record<string, unknown>[];
  }> => {
    // this will return table schema and sample data
    const result = await Promise.all([
      this.getSchema({ table, schema }),
      this.getSampleData({ table, schema }),
    ]);
    return { schema: result[0], sampleData: result[1] };
  };

  private buildRelationshipGraph = ({
    allSchemas,
  }: {
    allSchemas: TableSchema[];
  }) => {
    try {
      const graph = new Map<string, Set<string>>();
      const relationDetails = new Map<string, JoinRelation[]>();
      const tableKey = (schema: string, table: string) => `${schema}.${table}`;

      this.validateSchemas(allSchemas);

      for (const tableSchema of allSchemas) {
        this.processTableSchema(tableSchema, graph, relationDetails, tableKey);
      }

      return { graph, relationDetails, tableKey };
    } catch (error) {
      console.error('Error building relationship graph:', error);
      throw error;
    }
  };

  private validateSchemas = (allSchemas: TableSchema[]) => {
    if (!(allSchemas && Array.isArray(allSchemas))) {
      throw new Error('Invalid schemas: must be a non-empty array');
    }
  };

  private processTableSchema = (
    tableSchema: TableSchema,
    graph: Map<string, Set<string>>,
    relationDetails: Map<string, JoinRelation[]>,
    tableKey: (schema: string, table: string) => string
  ) => {
    if (!(tableSchema?.schema && tableSchema.name)) {
      console.warn('Skipping invalid table schema:', tableSchema);
      return;
    }

    const fromKey = tableKey(tableSchema.schema, tableSchema.name);
    if (!graph.has(fromKey)) {
      graph.set(fromKey, new Set());
    }

    if (!tableSchema.foreignKeys || tableSchema.foreignKeys.length === 0) {
      return;
    }

    for (const fk of tableSchema.foreignKeys) {
      this.processForeignKey(
        tableSchema,
        fk,
        fromKey,
        graph,
        relationDetails,
        tableKey
      );
    }
  };

  private processForeignKey = (
    tableSchema: TableSchema,
    fk: ForeignKey,
    fromKey: string,
    graph: Map<string, Set<string>>,
    relationDetails: Map<string, JoinRelation[]>,
    tableKey: (schema: string, table: string) => string
  ) => {
    try {
      if (!this.isValidForeignKey(fk)) {
        console.warn('Skipping invalid foreign key:', fk);
        return;
      }

      const toKey = tableKey(fk.referencedSchema, fk.referencedTable);
      this.addBidirectionalEdge(fromKey, toKey, graph);

      const isNullable = this.checkColumnsNullable(tableSchema, fk);
      this.storeRelationDetails(
        tableSchema,
        fk,
        fromKey,
        toKey,
        isNullable,
        relationDetails
      );
    } catch (error) {
      console.error(
        `Error processing foreign key for table ${tableSchema.schema}.${tableSchema.name}:`,
        error
      );
    }
  };

  private isValidForeignKey = (fk: ForeignKey): boolean => {
    return !!(
      fk.referencedSchema &&
      fk.referencedTable &&
      fk.columns &&
      fk.referencedColumns
    );
  };

  private addBidirectionalEdge = (
    fromKey: string,
    toKey: string,
    graph: Map<string, Set<string>>
  ) => {
    graph.get(fromKey)?.add(toKey);
    if (!graph.has(toKey)) {
      graph.set(toKey, new Set());
    }
    graph.get(toKey)?.add(fromKey);
  };

  private checkColumnsNullable = (
    tableSchema: TableSchema,
    fk: ForeignKey
  ): boolean => {
    try {
      const fkColumns =
        tableSchema.columns?.filter((col) => fk.columns.includes(col.name)) ||
        [];
      return fkColumns.some((col) => col.isNullable);
    } catch (error) {
      console.warn('Error checking nullable columns:', error);
      return false;
    }
  };

  private storeRelationDetails = (
    tableSchema: TableSchema,
    fk: ForeignKey,
    fromKey: string,
    toKey: string,
    isNullable: boolean,
    relationDetails: Map<string, JoinRelation[]>
  ) => {
    const relationKey = `${fromKey}->${toKey}`;
    const reverseRelationKey = `${toKey}->${fromKey}`;

    const relation: JoinRelation = {
      from: {
        schema: tableSchema.schema,
        table: tableSchema.name,
        columns: [...fk.columns],
      },
      to: {
        schema: fk.referencedSchema,
        table: fk.referencedTable,
        columns: [...fk.referencedColumns],
      },
      isNullable,
    };

    const reverseRelation: JoinRelation = {
      from: {
        schema: fk.referencedSchema,
        table: fk.referencedTable,
        columns: [...fk.referencedColumns],
      },
      to: {
        schema: tableSchema.schema,
        table: tableSchema.name,
        columns: [...fk.columns],
      },
      isNullable: false,
    };

    if (!relationDetails.has(relationKey)) {
      relationDetails.set(relationKey, []);
    }
    relationDetails.get(relationKey)?.push(relation);

    if (!relationDetails.has(reverseRelationKey)) {
      relationDetails.set(reverseRelationKey, []);
    }
    relationDetails.get(reverseRelationKey)?.push(reverseRelation);
  };

  private shouldTerminatePathSearch = (
    startTime: number,
    allValidPaths: Array<{
      pathTables: Set<string>;
      usedRelations: JoinRelation[];
    }>,
    maxTime: number,
    maxPaths: number
  ): boolean => {
    if (Date.now() - startTime > maxTime) {
      console.warn(
        'Join path computation timeout reached, returning partial results'
      );
      return true;
    }
    return allValidPaths.length >= maxPaths;
  };

  private addValidPath = (
    currentPath: Set<string>,
    currentRelations: JoinRelation[],
    seenPathSignatures: Set<string>,
    allValidPaths: Array<{
      pathTables: Set<string>;
      usedRelations: JoinRelation[];
    }>
  ) => {
    const pathSig = this.createPathSignature(currentPath, currentRelations);
    if (!seenPathSignatures.has(pathSig)) {
      seenPathSignatures.add(pathSig);
      allValidPaths.push({
        pathTables: new Set(currentPath),
        usedRelations: [...currentRelations],
      });
    }
  };

  private processNextTableConnection = (
    nextTable: string,
    restOfTables: string[],
    currentConnected: Set<string>,
    currentPath: Set<string>,
    currentRelations: JoinRelation[],
    depth: number,
    graph: Map<string, Set<string>>,
    relationDetails: Map<string, JoinRelation[]>,
    maxDepth: number,
    inputTableKeys: string[],
    maxPaths: number,
    findAllConnections: (
      connected: Set<string>,
      remaining: string[],
      path: Set<string>,
      relations: JoinRelation[],
      pathDepth: number
    ) => void,
    allValidPaths: Array<{
      pathTables: Set<string>;
      usedRelations: JoinRelation[];
    }>
  ) => {
    const pathsToTarget = this.findAllPathsFromSetToTarget({
      connectedTables: currentConnected,
      targetTable: nextTable,
      graph,
      relationDetails,
      maxDepth: maxDepth - depth,
      visited: currentPath,
    });

    const limitedPaths = pathsToTarget.slice(
      0,
      Math.max(1, maxPaths / inputTableKeys.length)
    );

    for (const pathResult of limitedPaths) {
      if (allValidPaths.length >= maxPaths) {
        break;
      }

      const newConnected = new Set([
        ...currentConnected,
        ...pathResult.pathTables,
      ]);
      const newPath = new Set([...currentPath, ...pathResult.pathTables]);
      const newRelations = [...currentRelations, ...pathResult.usedRelations];

      findAllConnections(
        newConnected,
        restOfTables,
        newPath,
        newRelations,
        depth + pathResult.usedRelations.length
      );
    }
  };

  private findAllPathsBetweenTables = ({
    inputTableKeys,
    graph,
    relationDetails,
    maxDepth,
  }: {
    inputTableKeys: string[];
    graph: Map<string, Set<string>>;
    relationDetails: Map<string, JoinRelation[]>;
    maxDepth: number;
  }): Array<{ pathTables: Set<string>; usedRelations: JoinRelation[] }> => {
    const allValidPaths: Array<{
      pathTables: Set<string>;
      usedRelations: JoinRelation[];
    }> = [];

    // Early termination limits to prevent excessive computation
    const MAX_PATHS = 50; // Limit total number of paths to explore
    const MAX_COMPUTATION_TIME = 30_000; // 30 seconds timeout
    const startTime = Date.now();

    // Early deduplication using path signatures
    const seenPathSignatures = new Set<string>();

    // For multiple tables, find all ways to connect them
    const findAllConnections = (
      currentConnected: Set<string>,
      remainingTables: string[],
      currentPath: Set<string>,
      currentRelations: JoinRelation[],
      depth: number
    ) => {
      if (
        this.shouldTerminatePathSearch(
          startTime,
          allValidPaths,
          MAX_COMPUTATION_TIME,
          MAX_PATHS
        )
      ) {
        return;
      }

      if (remainingTables.length === 0) {
        this.addValidPath(
          currentPath,
          currentRelations,
          seenPathSignatures,
          allValidPaths
        );
        return;
      }

      if (depth >= maxDepth) {
        return;
      }

      const nextTable = remainingTables[0];
      if (!nextTable) {
        return;
      }

      this.processNextTableConnection(
        nextTable,
        remainingTables.slice(1),
        currentConnected,
        currentPath,
        currentRelations,
        depth,
        graph,
        relationDetails,
        maxDepth,
        inputTableKeys,
        MAX_PATHS,
        findAllConnections,
        allValidPaths
      );
    };

    // Start with first table
    const startTable = inputTableKeys[0];
    if (!startTable) {
      return [];
    }

    findAllConnections(
      new Set([startTable]),
      inputTableKeys.slice(1),
      new Set([startTable]),
      [],
      0
    );

    // Sort by efficiency (fewer joins first)
    return allValidPaths.sort(
      (a, b) => a.usedRelations.length - b.usedRelations.length
    );
  };

  private findAllPathsFromSetToTarget = ({
    connectedTables,
    targetTable,
    graph,
    relationDetails,
    maxDepth,
    visited,
  }: {
    connectedTables: Set<string>;
    targetTable: string;
    graph: Map<string, Set<string>>;
    relationDetails: Map<string, JoinRelation[]>;
    maxDepth: number;
    visited: Set<string>;
  }): Array<{ pathTables: Set<string>; usedRelations: JoinRelation[] }> => {
    const allPaths: Array<{
      pathTables: Set<string>;
      usedRelations: JoinRelation[];
    }> = [];

    for (const startTable of connectedTables) {
      const paths = this.findAllPathsFromSource({
        start: startTable,
        target: targetTable,
        graph,
        relationDetails,
        maxDepth,
        visited,
      });
      allPaths.push(...paths);
    }

    return allPaths;
  };

  private findAllPathsFromSource = ({
    start,
    target,
    graph,
    relationDetails,
    maxDepth,
    visited,
  }: {
    start: string;
    target: string;
    graph: Map<string, Set<string>>;
    relationDetails: Map<string, JoinRelation[]>;
    maxDepth: number;
    visited: Set<string>;
  }): Array<{ pathTables: Set<string>; usedRelations: JoinRelation[] }> => {
    const allPaths: Array<{
      pathTables: Set<string>;
      usedRelations: JoinRelation[];
    }> = [];

    // Store relationDetails for access in nested function
    this.relationDetails = relationDetails;

    this.dfsPathSearch({
      currentPath: [start],
      currentVisited: new Set([start]),
      target,
      graph,
      visited,
      maxDepth,
      depth: 0,
      allPaths,
    });

    return allPaths;
  };

  private dfsPathSearch = ({
    currentPath,
    currentVisited,
    target,
    graph,
    visited,
    maxDepth,
    depth,
    allPaths,
  }: {
    currentPath: string[];
    currentVisited: Set<string>;
    target: string;
    graph: Map<string, Set<string>>;
    visited: Set<string>;
    maxDepth: number;
    depth: number;
    allPaths: Array<{ pathTables: Set<string>; usedRelations: JoinRelation[] }>;
  }) => {
    if (this.shouldStopDfsSearch(depth, maxDepth, allPaths)) {
      return;
    }

    const current = currentPath.at(-1);
    if (!current) {
      return;
    }

    if (this.isTargetReached(current, target, currentPath)) {
      this.addFoundPath(currentPath, allPaths);
      return;
    }

    this.exploreDfsNeighbors({
      current,
      target,
      graph,
      currentPath,
      currentVisited,
      visited,
      maxDepth,
      depth,
      allPaths,
    });
  };

  private shouldStopDfsSearch = (
    depth: number,
    maxDepth: number,
    allPaths: Array<{ pathTables: Set<string>; usedRelations: JoinRelation[] }>
  ): boolean => {
    return depth > maxDepth || allPaths.length >= 20;
  };

  private isTargetReached = (
    current: string,
    target: string,
    currentPath: string[]
  ): boolean => {
    return current === target && currentPath.length > 1;
  };

  private addFoundPath = (
    currentPath: string[],
    allPaths: Array<{ pathTables: Set<string>; usedRelations: JoinRelation[] }>
  ) => {
    const pathTables = new Set(currentPath);
    const relations = this.extractRelationsFromPath(currentPath);
    allPaths.push({ pathTables, usedRelations: relations });
  };

  private exploreDfsNeighbors = ({
    current,
    target,
    graph,
    currentPath,
    currentVisited,
    visited,
    maxDepth,
    depth,
    allPaths,
  }: {
    current: string;
    target: string;
    graph: Map<string, Set<string>>;
    currentPath: string[];
    currentVisited: Set<string>;
    visited: Set<string>;
    maxDepth: number;
    depth: number;
    allPaths: Array<{ pathTables: Set<string>; usedRelations: JoinRelation[] }>;
  }) => {
    const neighbors = graph.get(current) || new Set();
    const sortedNeighbors = this.sortNeighborsByTarget(neighbors, target);

    for (const neighbor of sortedNeighbors) {
      if (
        this.shouldSkipNeighbor(
          neighbor,
          currentVisited,
          visited,
          currentPath,
          depth,
          maxDepth,
          graph,
          target
        )
      ) {
        continue;
      }

      const newPath = [...currentPath, neighbor];
      const newVisited = new Set([...currentVisited, neighbor]);

      this.dfsPathSearch({
        currentPath: newPath,
        currentVisited: newVisited,
        target,
        graph,
        visited,
        maxDepth,
        depth: depth + 1,
        allPaths,
      });
    }
  };

  private sortNeighborsByTarget = (
    neighbors: Set<string>,
    target: string
  ): string[] => {
    return Array.from(neighbors).sort((a, b) => {
      if (a === target) {
        return -1;
      }
      if (b === target) {
        return 1;
      }
      return 0;
    });
  };

  private shouldSkipNeighbor = (
    neighbor: string,
    currentVisited: Set<string>,
    visited: Set<string>,
    currentPath: string[],
    depth: number,
    maxDepth: number,
    graph: Map<string, Set<string>>,
    target: string
  ): boolean => {
    if (currentVisited.has(neighbor) || visited.has(neighbor)) {
      return true;
    }

    if (currentPath.length > 1 && depth > maxDepth / 2) {
      const hasDirectConnection = graph.get(neighbor)?.has(target);
      if (!hasDirectConnection && neighbor !== target) {
        return true;
      }
    }

    return false;
  };

  private extractRelationsFromPath = (path: string[]): JoinRelation[] => {
    const relations: JoinRelation[] = [];

    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      if (from && to) {
        const relationKey = `${from}->${to}`;
        const relationList = this.relationDetails?.get(relationKey);
        if (relationList?.[0]) {
          relations.push(relationList[0]);
        }
      }
    }

    return relations;
  };

  private createPathSignature = (
    pathTables: Set<string>,
    relations: JoinRelation[]
  ): string => {
    const tablesSig = Array.from(pathTables).sort().join(',');
    const relationsSig = relations
      .map(
        (r) =>
          `${r.from.schema}.${r.from.table}:${r.from.columns.join(',')}→${r.to.schema}.${r.to.table}:${r.to.columns.join(',')}`
      )
      .sort()
      .join('|');
    return `${tablesSig}::${relationsSig}`;
  };

  private processJoinPath = async (
    joinPath: JoinPath
  ): Promise<{ joinPath: JoinPath; sql: string }> => {
    try {
      this.validateJoinPath(joinPath);
      const tableSchemas = await this.fetchTableSchemas(joinPath);
      this.validateTableSchemas(tableSchemas, joinPath);
      const sql = this.generateSqlForPath(joinPath, tableSchemas);

      return { joinPath, sql };
    } catch (error) {
      console.error('Error processing join path:', error);
      throw error;
    }
  };

  private validateJoinPath = (joinPath: JoinPath) => {
    if (!joinPath.tables || joinPath.tables.length === 0) {
      throw new Error('Invalid join path: empty tables array');
    }
  };

  private fetchTableSchemas = async (joinPath: JoinPath) => {
    return await Promise.all(
      joinPath.tables.map(async (table) => {
        try {
          return await this.getSchema({
            table: table.table,
            schema: table.schema,
          });
        } catch (error) {
          throw new Error(
            `Failed to get schema for table ${table.schema ? `${table.schema}.` : ''}${table.table}: ${(error as Error).message}`
          );
        }
      })
    );
  };

  private validateTableSchemas = (
    tableSchemas: TableSchema[],
    joinPath: JoinPath
  ) => {
    for (let i = 0; i < tableSchemas.length; i++) {
      const schema = tableSchemas[i];
      if (!schema?.columns || schema.columns.length === 0) {
        const table = joinPath.tables[i];
        throw new Error(
          `Invalid schema for table ${table?.schema ? `${table.schema}.` : ''}${table?.table}: no columns found`
        );
      }
    }
  };

  private generateSqlForPath = (
    joinPath: JoinPath,
    tableSchemas: TableSchema[]
  ): string => {
    const sql = this.provider.generateJoinSQL({
      joinPath,
      tableSchemas,
    });

    if (!sql || sql.trim().length === 0) {
      throw new Error('Failed to generate SQL: empty query result');
    }

    return sql;
  };

  private findAllJoinPaths = async ({
    tables,
    maxDepth = 6,
  }: {
    tables: TableReference[];
    maxDepth?: number;
  }): Promise<JoinPath[]> => {
    if (tables.length === 0) {
      return [];
    }

    if (tables.length === 1) {
      return [
        {
          tables,
          relations: [],
          inputTablesCount: 1,
          totalTablesCount: 1,
          totalJoins: 0,
        },
      ];
    }

    // Build relationship graph
    const allSchemas = await this.getAllSchemas();
    const { graph, tableKey, relationDetails } = this.buildRelationshipGraph({
      allSchemas,
    });

    const inputTableKeys = tables.map((t) => tableKey(t.schema, t.table));
    const allPaths = this.findAllPathsBetweenTables({
      inputTableKeys,
      graph,
      relationDetails,
      maxDepth, // Use the passed maxDepth parameter
    });

    // Convert results to output format
    return allPaths
      .map((path) => {
        const resultTables: TableReference[] = Array.from(path.pathTables)
          .map((key) => {
            const parts = key.split('.');
            const schema = parts[0] || '';
            const table = parts[1] || '';
            return { schema, table };
          })
          .filter((t) => t.schema && t.table);

        return {
          tables: resultTables,
          relations: path.usedRelations,
          inputTablesCount: tables.length,
          totalTablesCount: resultTables.length,
          totalJoins: path.usedRelations.length,
        };
      })
      .sort((a, b) => a.totalJoins - b.totalJoins); // Sort by number of joins (shortest first)
  };

  getTableJoins = async ({
    tables,
    maxDepth = 6,
  }: {
    tables: TableReference[];
    maxDepth?: number;
  }): Promise<
    {
      joinPath: JoinPath;
      sql: string;
    }[]
  > => {
    try {
      // Input validation
      if (!(tables && Array.isArray(tables))) {
        throw new Error('Invalid input: tables must be a non-empty array');
      }

      if (tables.length === 0) {
        return [];
      }

      // Validate table references
      for (const table of tables) {
        if (!table || typeof table.table !== 'string' || !table.table.trim()) {
          throw new Error(
            'Invalid table reference: table name is required and must be a non-empty string'
          );
        }
        if (
          table.schema &&
          (typeof table.schema !== 'string' || !table.schema.trim())
        ) {
          throw new Error(
            'Invalid table reference: schema must be a non-empty string if provided'
          );
        }
      }

      const joinPaths = await this.findAllJoinPaths({ tables, maxDepth });

      if (!joinPaths || joinPaths.length === 0) {
        return [];
      }

      // Generate SQL for each join path using provider-specific SQL generation
      const results = await Promise.all(
        joinPaths.map(async (joinPath) => this.processJoinPath(joinPath))
      );

      return results;
    } catch (error) {
      console.error('Error in getTableJoins:', error);
      throw error;
    } finally {
      // Clean up memory by clearing relationDetails
      this.relationDetails = undefined;
    }
  };

  getPlantuml = async ({
    type = 'full',
  }: {
    type?: 'full' | 'simple';
  } = {}): Promise<string> => {
    const schemas = await this.getAllSchemas();
    const plantumlResult = generatePlantumlSchema({ schema: schemas });
    return type === 'simple' ? plantumlResult.simplified : plantumlResult.full;
  };

  safeQuery = async (params: { sql: string }) => {
    return await this.provider.safeQuery(params.sql);
  };
}
