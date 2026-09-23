package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ExplorerManager handles dynamic database connection pooling and schema/content operations
type ExplorerManager struct {
	BaseConnString string
	pools          map[string]*pgxpool.Pool
	mu             sync.RWMutex
}

// NewExplorerManager initializes a new ExplorerManager
func NewExplorerManager(baseConnString string) *ExplorerManager {
	return &ExplorerManager{
		BaseConnString: baseConnString,
		pools:          make(map[string]*pgxpool.Pool),
	}
}

// getPool retrieves or establishes a dedicated connection pool for the targeted database
func (em *ExplorerManager) getPool(ctx context.Context, dbName string) (*pgxpool.Pool, error) {
	dbName = strings.TrimSpace(dbName)
	if !sanitizeIdentifier(dbName) {
		return nil, fmt.Errorf("invalid database name: %s", dbName)
	}

	em.mu.RLock()
	pool, exists := em.pools[dbName]
	em.mu.RUnlock()

	if exists && pool != nil {
		// Quick ping to check liveness
		pingCtx, pingCancel := context.WithTimeout(ctx, 2*time.Second)
		defer pingCancel()
		if err := pool.Ping(pingCtx); err == nil {
			return pool, nil
		}
	}

	em.mu.Lock()
	defer em.mu.Unlock()

	// Double-check after acquiring write lock
	if pool, exists = em.pools[dbName]; exists && pool != nil {
		pingCtx, pingCancel := context.WithTimeout(ctx, 2*time.Second)
		defer pingCancel()
		if err := pool.Ping(pingCtx); err == nil {
			return pool, nil
		}
		pool.Close()
	}

	// Parse BaseConnString and construct target DB URL
	u, err := url.Parse(em.BaseConnString)
	if err != nil {
		return nil, fmt.Errorf("invalid base connection string: %v", err)
	}

	u.Path = "/" + dbName
	q := u.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "disable")
	}
	u.RawQuery = q.Encode()

	poolConfig, err := pgxpool.ParseConfig(u.String())
	if err != nil {
		return nil, fmt.Errorf("failed to parse pool config: %v", err)
	}

	// Lightweight pool configuration to keep VPS memory near 0
	poolConfig.MaxConns = 5
	poolConfig.MinConns = 0
	poolConfig.MaxConnIdleTime = 2 * time.Minute
	poolConfig.MaxConnLifetime = 10 * time.Minute

	newPool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database %s: %v", dbName, err)
	}

	em.pools[dbName] = newPool
	return newPool, nil
}

// TableSummary model
type TableSummary struct {
	Name          string `json:"name"`
	Schema        string `json:"schema"`
	EstimatedRows int64  `json:"estimated_rows"`
	SizeBytes     int64  `json:"size_bytes"`
}

// ColumnMeta model
type ColumnMeta struct {
	Name         string `json:"name"`
	DataType     string `json:"data_type"`
	UDTName      string `json:"udt_name"`
	IsNullable   bool   `json:"is_nullable"`
	DefaultValue string `json:"default_value"`
	IsPrimaryKey bool   `json:"is_primary_key"`
}

// ListTables returns all user tables in the public schema
func (em *ExplorerManager) ListTables(c *gin.Context) {
	dbName := c.Query("db")
	if dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query param 'db' is required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	sql := `
		SELECT
			t.table_name,
			t.table_schema,
			COALESCE(s.n_live_tup, 0) AS estimated_rows,
			COALESCE(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name)), 0) AS size_bytes
		FROM information_schema.tables t
		LEFT JOIN pg_stat_user_tables s 
			ON s.schemaname = t.table_schema AND s.relname = t.table_name
		WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
		ORDER BY t.table_name ASC;
	`

	rows, err := pool.Query(ctx, sql)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to query tables: %v", err)})
		return
	}
	defer rows.Close()

	tables := []TableSummary{}
	for rows.Next() {
		var item TableSummary
		if err := rows.Scan(&item.Name, &item.Schema, &item.EstimatedRows, &item.SizeBytes); err != nil {
			continue
		}
		tables = append(tables, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"database": dbName,
		"count":    len(tables),
		"tables":   tables,
	})
}

// GetTableSchema returns column definitions and primary key flags for a specific table
func (em *ExplorerManager) GetTableSchema(c *gin.Context) {
	dbName := c.Query("db")
	tableName := c.Query("table")
	if dbName == "" || tableName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query params 'db' and 'table' are required"})
		return
	}

	if !sanitizeIdentifier(tableName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid table name identifier"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	sql := `
		SELECT 
			c.column_name,
			c.data_type,
			c.udt_name,
			(c.is_nullable = 'YES') AS is_nullable,
			COALESCE(c.column_default, '') AS column_default,
			COALESCE(pk.is_pk, false) AS is_primary_key
		FROM information_schema.columns c
		LEFT JOIN (
			SELECT kcu.column_name, true AS is_pk
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu 
				ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
			WHERE tc.constraint_type = 'PRIMARY KEY' 
			  AND tc.table_schema = 'public' 
			  AND tc.table_name = $1
		) pk ON c.column_name = pk.column_name
		WHERE c.table_schema = 'public' AND c.table_name = $1
		ORDER BY c.ordinal_position ASC;
	`

	rows, err := pool.Query(ctx, sql, tableName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to query schema: %v", err)})
		return
	}
	defer rows.Close()

	columns := []ColumnMeta{}
	for rows.Next() {
		var col ColumnMeta
		if err := rows.Scan(&col.Name, &col.DataType, &col.UDTName, &col.IsNullable, &col.DefaultValue, &col.IsPrimaryKey); err != nil {
			continue
		}
		columns = append(columns, col)
	}

	// Query indexes
	indexSQL := `
		SELECT indexname, indexdef 
		FROM pg_indexes 
		WHERE schemaname = 'public' AND tablename = $1;
	`
	indexRows, _ := pool.Query(ctx, indexSQL, tableName)
	indexes := []gin.H{}
	if indexRows != nil {
		for indexRows.Next() {
			var name, def string
			if err := indexRows.Scan(&name, &def); err == nil {
				indexes = append(indexes, gin.H{"name": name, "definition": def})
			}
		}
		indexRows.Close()
	}

	c.JSON(http.StatusOK, gin.H{
		"database": dbName,
		"table":    tableName,
		"columns":  columns,
		"indexes":  indexes,
	})
}

// FilterRule definition for custom queries
type FilterRule struct {
	Column   string `json:"column"`
	Operator string `json:"operator"` // eq, neq, gt, lt, gte, lte, contains, is_null, is_not_null
	Value    string `json:"value"`
}

// GetRowsRequest payload
type GetRowsRequest struct {
	Page       int          `json:"page"`
	Limit      int          `json:"limit"`
	SortColumn string       `json:"sort_column"`
	SortOrder  string       `json:"sort_order"` // asc, desc
	Search     string       `json:"search"`
	Filters    []FilterRule `json:"filters"`
}

// GetRows returns paginated rows with sorting and filter evaluation
func (em *ExplorerManager) GetRows(c *gin.Context) {
	dbName := c.Query("db")
	tableName := c.Query("table")
	if dbName == "" || tableName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query params 'db' and 'table' are required"})
		return
	}

	if !sanitizeIdentifier(tableName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid table identifier"})
		return
	}

	var req GetRowsRequest
	_ = c.ShouldBindJSON(&req)

	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 || req.Limit > 200 {
		req.Limit = 50
	}
	offset := (req.Page - 1) * req.Limit

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 1. Build WHERE conditions safely
	var whereClauses []string
	var args []interface{}
	argIdx := 1

	for _, f := range req.Filters {
		col := strings.TrimSpace(f.Column)
		if !sanitizeIdentifier(col) {
			continue
		}

		switch f.Operator {
		case "eq":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
			args = append(args, f.Value)
			argIdx++
		case "neq":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" != $%d`, col, argIdx))
			args = append(args, f.Value)
			argIdx++
		case "gt":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" > $%d`, col, argIdx))
			args = append(args, f.Value)
			argIdx++
		case "lt":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" < $%d`, col, argIdx))
			args = append(args, f.Value)
			argIdx++
		case "gte":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" >= $%d`, col, argIdx))
			args = append(args, f.Value)
			argIdx++
		case "lte":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" <= $%d`, col, argIdx))
			args = append(args, f.Value)
			argIdx++
		case "contains":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s"::text ILIKE $%d`, col, argIdx))
			args = append(args, "%"+f.Value+"%")
			argIdx++
		case "is_null":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" IS NULL`, col))
		case "is_not_null":
			whereClauses = append(whereClauses, fmt.Sprintf(`"%s" IS NOT NULL`, col))
		}
	}

	whereSQL := ""
	if len(whereClauses) > 0 {
		whereSQL = " WHERE " + strings.Join(whereClauses, " AND ")
	}

	// 2. Count total rows matching filters
	countSQL := fmt.Sprintf(`SELECT count(*) FROM "%s"%s`, tableName, whereSQL)
	var totalCount int64
	if err := pool.QueryRow(ctx, countSQL, args...).Scan(&totalCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to count rows: %v", err)})
		return
	}

	// 3. Order By clause
	orderSQL := ""
	if req.SortColumn != "" && sanitizeIdentifier(req.SortColumn) {
		order := "ASC"
		if strings.EqualFold(req.SortOrder, "desc") {
			order = "DESC"
		}
		orderSQL = fmt.Sprintf(` ORDER BY "%s" %s`, req.SortColumn, order)
	}

	// 4. Query Rows
	querySQL := fmt.Sprintf(`SELECT * FROM "%s"%s%s LIMIT %d OFFSET %d`, tableName, whereSQL, orderSQL, req.Limit, offset)
	rows, err := pool.Query(ctx, querySQL, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to query rows: %v", err)})
		return
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	colNames := make([]string, len(fields))
	for i, f := range fields {
		colNames[i] = string(f.Name)
	}

	records := []map[string]interface{}{}
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			continue
		}
		rowMap := make(map[string]interface{}, len(colNames))
		for i, col := range colNames {
			val := values[i]
			if t, ok := val.(time.Time); ok {
				rowMap[col] = t.Format(time.RFC3339)
			} else {
				rowMap[col] = val
			}
		}
		records = append(records, rowMap)
	}

	c.JSON(http.StatusOK, gin.H{
		"database":    dbName,
		"table":       tableName,
		"page":        req.Page,
		"limit":       req.Limit,
		"total_count": totalCount,
		"columns":     colNames,
		"rows":        records,
	})
}

// InsertRowRequest payload
type InsertRowRequest struct {
	Record map[string]interface{} `json:"record" binding:"required"`
}

// InsertRow handles row creation
func (em *ExplorerManager) InsertRow(c *gin.Context) {
	dbName := c.Query("db")
	tableName := c.Query("table")
	if dbName == "" || tableName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query params 'db' and 'table' are required"})
		return
	}

	if !sanitizeIdentifier(tableName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid table identifier"})
		return
	}

	var req InsertRowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: record object is required"})
		return
	}

	if len(req.Record) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Record cannot be empty"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var cols []string
	var placeholders []string
	var args []interface{}
	idx := 1

	for k, v := range req.Record {
		if !sanitizeIdentifier(k) {
			continue
		}
		cols = append(cols, fmt.Sprintf(`"%s"`, k))
		placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
		args = append(args, v)
		idx++
	}

	insertSQL := fmt.Sprintf(`INSERT INTO "%s" (%s) VALUES (%s) RETURNING *;`,
		tableName,
		strings.Join(cols, ", "),
		strings.Join(placeholders, ", "))

	rows, err := pool.Query(ctx, insertSQL, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Insert failed: %v", err)})
		return
	}
	defer rows.Close()

	if rows.Next() {
		values, err := rows.Values()
		if err == nil {
			fields := rows.FieldDescriptions()
			resMap := make(map[string]interface{})
			for i, f := range fields {
				resMap[string(f.Name)] = values[i]
			}
			c.JSON(http.StatusCreated, gin.H{"success": true, "record": resMap})
			return
		}
	}

	c.JSON(http.StatusCreated, gin.H{"success": true})
}

// UpdateCellRequest payload
type UpdateCellRequest struct {
	PKColumn string                 `json:"pk_column" binding:"required"`
	PKValue  interface{}            `json:"pk_value" binding:"required"`
	Updates  map[string]interface{} `json:"updates" binding:"required"`
}

// UpdateRow handles inline cell updates
func (em *ExplorerManager) UpdateRow(c *gin.Context) {
	dbName := c.Query("db")
	tableName := c.Query("table")
	if dbName == "" || tableName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query params 'db' and 'table' are required"})
		return
	}

	if !sanitizeIdentifier(tableName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid table identifier"})
		return
	}

	var req UpdateCellRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: pk_column, pk_value, and updates are required"})
		return
	}

	if !sanitizeIdentifier(req.PKColumn) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid primary key column name"})
		return
	}

	if len(req.Updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No updates specified"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var setClauses []string
	var args []interface{}
	idx := 1

	for k, v := range req.Updates {
		if !sanitizeIdentifier(k) {
			continue
		}
		setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, k, idx))
		args = append(args, v)
		idx++
	}

	args = append(args, req.PKValue)
	pkArgIdx := idx

	updateSQL := fmt.Sprintf(`UPDATE "%s" SET %s WHERE "%s" = $%d RETURNING *;`,
		tableName,
		strings.Join(setClauses, ", "),
		req.PKColumn,
		pkArgIdx)

	rows, err := pool.Query(ctx, updateSQL, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Update failed: %v", err)})
		return
	}
	defer rows.Close()

	if rows.Next() {
		values, err := rows.Values()
		if err == nil {
			fields := rows.FieldDescriptions()
			resMap := make(map[string]interface{})
			for i, f := range fields {
				resMap[string(f.Name)] = values[i]
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "record": resMap})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DeleteRowsRequest payload for bulk or single row deletion
type DeleteRowsRequest struct {
	PKColumn string        `json:"pk_column" binding:"required"`
	PKValues []interface{} `json:"pk_values" binding:"required"`
}

// DeleteRows handles single and bulk row deletion
func (em *ExplorerManager) DeleteRows(c *gin.Context) {
	dbName := c.Query("db")
	tableName := c.Query("table")
	if dbName == "" || tableName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query params 'db' and 'table' are required"})
		return
	}

	if !sanitizeIdentifier(tableName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid table identifier"})
		return
	}

	var req DeleteRowsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: pk_column and pk_values are required"})
		return
	}

	if !sanitizeIdentifier(req.PKColumn) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid primary key column identifier"})
		return
	}

	if len(req.PKValues) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pk_values array cannot be empty"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	deleteSQL := fmt.Sprintf(`DELETE FROM "%s" WHERE "%s" = ANY($1);`, tableName, req.PKColumn)
	res, err := pool.Exec(ctx, deleteSQL, req.PKValues)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Delete failed: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"deleted_count": res.RowsAffected(),
	})
}

// ColumnSpec for visual table builder
type ColumnSpec struct {
	Name         string `json:"name" binding:"required"`
	Type         string `json:"type" binding:"required"`
	IsPrimaryKey bool   `json:"is_primary_key"`
	IsNullable   bool   `json:"is_nullable"`
	DefaultValue string `json:"default_value"`
}

// CreateTableRequest payload
type CreateTableRequest struct {
	TableName string       `json:"table_name" binding:"required"`
	Columns   []ColumnSpec `json:"columns" binding:"required"`
}

// CreateTable handles visual table schema creation
func (em *ExplorerManager) CreateTable(c *gin.Context) {
	dbName := c.Query("db")
	if dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query param 'db' is required"})
		return
	}

	var req CreateTableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: table_name and columns required"})
		return
	}

	tableName := strings.TrimSpace(req.TableName)
	if !sanitizeIdentifier(tableName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid table name: must contain only letters, numbers, and underscores"})
		return
	}

	if len(req.Columns) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least one column is required"})
		return
	}

	allowedTypes := map[string]string{
		"uuid":        "UUID",
		"text":        "TEXT",
		"varchar":     "VARCHAR(255)",
		"integer":     "INTEGER",
		"bigint":      "BIGINT",
		"boolean":     "BOOLEAN",
		"timestamptz": "TIMESTAMPTZ",
		"timestamp":   "TIMESTAMP",
		"date":        "DATE",
		"jsonb":       "JSONB",
		"json":        "JSON",
		"numeric":     "NUMERIC",
		"float8":      "DOUBLE PRECISION",
		"serial":      "SERIAL",
		"bigserial":   "BIGSERIAL",
	}

	var colDefs []string
	for _, col := range req.Columns {
		cName := strings.TrimSpace(col.Name)
		if !sanitizeIdentifier(cName) {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid column name: %s", cName)})
			return
		}

		cTypeKey := strings.ToLower(strings.TrimSpace(col.Type))
		pgType, ok := allowedTypes[cTypeKey]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Unsupported column type: %s", col.Type)})
			return
		}

		def := fmt.Sprintf(`"%s" %s`, cName, pgType)
		if col.IsPrimaryKey {
			def += " PRIMARY KEY"
		}
		if !col.IsNullable && !col.IsPrimaryKey {
			def += " NOT NULL"
		}
		if col.DefaultValue != "" {
			def += fmt.Sprintf(" DEFAULT %s", col.DefaultValue)
		}

		colDefs = append(colDefs, def)
	}

	createSQL := fmt.Sprintf(`CREATE TABLE "%s" (%s);`, tableName, strings.Join(colDefs, ", "))

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if _, err := pool.Exec(ctx, createSQL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create table: %v", err)})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"table":   tableName,
		"message": fmt.Sprintf("Table '%s' created successfully", tableName),
	})
}

// ExecuteQueryRequest payload for SQL Console
type ExecuteQueryRequest struct {
	SQL string `json:"sql" binding:"required"`
}

// ExecuteQuery handles custom raw SQL query execution with safety timeouts
func (em *ExplorerManager) ExecuteQuery(c *gin.Context) {
	dbName := c.Query("db")
	if dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query param 'db' is required"})
		return
	}

	var req ExecuteQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SQL string is required"})
		return
	}

	query := strings.TrimSpace(req.SQL)
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SQL query cannot be empty"})
		return
	}

	// 5-second strict statement timeout to protect VPS resources
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	pool, err := em.getPool(ctx, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	start := time.Now()

	// Check if query is a SELECT/SHOW/EXPLAIN that returns rows
	isRowReturning := false
	lower := strings.ToLower(query)
	if strings.HasPrefix(lower, "select") || strings.HasPrefix(lower, "show") || strings.HasPrefix(lower, "explain") || strings.Contains(lower, "returning") {
		isRowReturning = true
	}

	if isRowReturning {
		rows, err := pool.Query(ctx, query)
		duration := time.Since(start)

		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":       fmt.Sprintf("%v", err),
				"duration_ms": float64(duration.Microseconds()) / 1000.0,
			})
			return
		}
		defer rows.Close()

		fields := rows.FieldDescriptions()
		columns := make([]string, len(fields))
		for i, f := range fields {
			columns[i] = string(f.Name)
		}

		resultRows := []map[string]interface{}{}
		for rows.Next() {
			values, err := rows.Values()
			if err != nil {
				continue
			}
			rowMap := make(map[string]interface{}, len(columns))
			for i, col := range columns {
				val := values[i]
				if t, ok := val.(time.Time); ok {
					rowMap[col] = t.Format(time.RFC3339)
				} else {
					rowMap[col] = val
				}
			}
			resultRows = append(resultRows, rowMap)
		}

		c.JSON(http.StatusOK, gin.H{
			"success":       true,
			"columns":       columns,
			"rows":          resultRows,
			"row_count":     len(resultRows),
			"duration_ms":   float64(duration.Microseconds()) / 1000.0,
		})
		return
	}

	// Non-row-returning statement (INSERT, UPDATE, DELETE, CREATE, DROP, etc.)
	res, err := pool.Exec(ctx, query)
	duration := time.Since(start)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":       fmt.Sprintf("%v", err),
			"duration_ms": float64(duration.Microseconds()) / 1000.0,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"rows_affected": res.RowsAffected(),
		"duration_ms":   float64(duration.Microseconds()) / 1000.0,
		"message":       "Query executed successfully",
	})
}
