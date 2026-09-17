"""
Database Backup & Migration Manager for Bhumi Factory & Dispatch Manager.
Supports:
1. Exporting full database to universal JSON (portable across any SQL/NoSQL database).
2. Exporting full database to standard MySQL SQL dump (.sql).
3. Exporting bundled ZIP archive (.zip) with both formats + metadata.
4. Restoring database from JSON or SQL backup with safe foreign key handling.
"""

import datetime
import decimal
import io
import json
import logging
import os
import zipfile
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("backup_manager")

def serialize_value(val: Any) -> Any:
    """Serializes date, time, decimal, memoryview, and bytes for JSON output."""
    if val is None:
        return None
    if isinstance(val, (datetime.date, datetime.datetime, datetime.time)):
        return val.isoformat()
    if isinstance(val, decimal.Decimal):
        return float(val)
    if isinstance(val, (bytes, bytearray, memoryview)):
        try:
            return bytes(val).decode("utf-8")
        except Exception:
            return bytes(val).hex()
    return val

def sql_escape_string(val: str) -> str:
    """Safely escapes strings for SQL INSERT statements."""
    return (
        val.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
        .replace("\0", "\\0")
        .replace("\x1a", "\\Z")
    )

def format_sql_value(val: Any) -> str:
    """Formats a Python value as a raw SQL literal."""
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "1" if val else "0"
    if isinstance(val, (int, float, decimal.Decimal)):
        return str(val)
    if isinstance(val, (datetime.date, datetime.datetime, datetime.time)):
        return f"'{val.isoformat()}'"
    if isinstance(val, (bytes, bytearray, memoryview)):
        try:
            val_str = bytes(val).decode("utf-8")
            return f"'{sql_escape_string(val_str)}'"
        except Exception:
            return f"X'{bytes(val).hex()}'"
    return f"'{sql_escape_string(str(val))}'"


def get_all_tables(cursor) -> List[str]:
    """Retrieves list of all table names from the active database."""
    cursor.execute("SHOW TABLES")
    rows = cursor.fetchall()
    tables = []
    for r in rows:
        if isinstance(r, dict):
            tables.append(list(r.values())[0])
        else:
            tables.append(r[0])
    return tables


def get_database_info(cursor, db_name: Optional[str] = None) -> Dict[str, Any]:
    """Returns database summary: table names, row counts, and column counts."""
    tables = get_all_tables(cursor)
    table_stats = []
    total_records = 0

    for table in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
            cnt_res = cursor.fetchone()
            count = list(cnt_res.values())[0] if isinstance(cnt_res, dict) else cnt_res[0]
            total_records += count

            cursor.execute(f"SHOW COLUMNS FROM `{table}`")
            cols = cursor.fetchall()
            col_names = [c["Field"] if isinstance(c, dict) else c[0] for c in cols]

            table_stats.append({
                "table_name": table,
                "row_count": count,
                "column_count": len(col_names),
                "columns": col_names
            })
        except Exception as e:
            logger.warning(f"Could not read metadata for table {table}: {e}")

    return {
        "database_name": db_name or "inventory_db",
        "timestamp": datetime.datetime.now().isoformat(),
        "total_tables": len(tables),
        "total_records": total_records,
        "tables": table_stats,
    }


def export_database_to_json(cursor, db_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Exports all database tables and rows to a universal JSON structure.
    Safe for cross-database migrations (MySQL -> Postgres/SQLite/Cloud DB).
    """
    info = get_database_info(cursor, db_name)
    tables_data: Dict[str, List[Dict[str, Any]]] = {}

    for t_info in info["tables"]:
        table_name = t_info["table_name"]
        try:
            cursor.execute(f"SELECT * FROM `{table_name}`")
            rows = cursor.fetchall()
            clean_rows = []
            for r in rows:
                if isinstance(r, dict):
                    row_dict = {k: serialize_value(v) for k, v in r.items()}
                else:
                    cols = t_info["columns"]
                    row_dict = {cols[i]: serialize_value(r[i]) for i in range(len(cols))}
                clean_rows.append(row_dict)
            tables_data[table_name] = clean_rows
        except Exception as e:
            logger.error(f"Error exporting table {table_name} to JSON: {e}")
            tables_data[table_name] = []

    return {
        "system": "Bhumi Factory & Dispatch Manager",
        "backup_version": "2.0",
        "exported_at": datetime.datetime.now().isoformat(),
        "database_name": db_name or "inventory_db",
        "total_tables": info["total_tables"],
        "total_records": info["total_records"],
        "table_metadata": info["tables"],
        "data": tables_data,
    }


def export_database_to_sql(cursor, db_name: Optional[str] = None) -> str:
    """
    Generates a full MySQL-compatible SQL dump containing:
    1. Foreign key checks disabled during import.
    2. CREATE TABLE statements for every table.
    3. Multi-row batch INSERT INTO statements for all data.
    """
    info = get_database_info(cursor, db_name)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    sql_lines = [
        "-- ========================================================",
        "-- Bhumi Factory & Dispatch Manager Database Backup",
        f"-- Generated At: {now_str}",
        f"-- Database Name: {info['database_name']}",
        f"-- Total Tables: {info['total_tables']} | Total Records: {info['total_records']}",
        "-- ========================================================",
        "",
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS = 0;",
        "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
        "SET AUTOCOMMIT = 0;",
        "START TRANSACTION;",
        ""
    ]

    for t_info in info["tables"]:
        table_name = t_info["table_name"]
        sql_lines.append(f"-- --------------------------------------------------------")
        sql_lines.append(f"-- Table structure & data for `{table_name}`")
        sql_lines.append(f"-- --------------------------------------------------------")
        sql_lines.append(f"DROP TABLE IF EXISTS `{table_name}`;")

        # Get CREATE TABLE statement
        try:
            cursor.execute(f"SHOW CREATE TABLE `{table_name}`")
            create_res = cursor.fetchone()
            if isinstance(create_res, dict):
                create_sql = create_res.get("Create Table") or list(create_res.values())[1]
            else:
                create_sql = create_res[1]
            sql_lines.append(f"{create_sql};")
            sql_lines.append("")
        except Exception as e:
            logger.warning(f"Could not fetch CREATE TABLE for `{table_name}`: {e}")

        # Fetch and write table rows
        try:
            cursor.execute(f"SELECT * FROM `{table_name}`")
            rows = cursor.fetchall()
            if rows:
                cols = t_info["columns"]
                col_list_str = ", ".join(f"`{c}`" for c in cols)

                # Batch inserts in chunks of 200 rows for high performance
                chunk_size = 200
                for i in range(0, len(rows), chunk_size):
                    chunk = rows[i:i + chunk_size]
                    values_clauses = []
                    for r in chunk:
                        if isinstance(r, dict):
                            vals = [format_sql_value(r.get(c)) for c in cols]
                        else:
                            vals = [format_sql_value(r[idx]) for idx in range(len(cols))]
                        values_clauses.append(f"({', '.join(vals)})")
                    
                    sql_lines.append(
                        f"INSERT INTO `{table_name}` ({col_list_str}) VALUES\n"
                        + ",\n".join(values_clauses)
                        + ";"
                    )
                sql_lines.append("")
        except Exception as e:
            logger.error(f"Error generating INSERT statements for `{table_name}`: {e}")

    sql_lines.extend([
        "-- --------------------------------------------------------",
        "COMMIT;",
        "SET FOREIGN_KEY_CHECKS = 1;",
        "-- ========================================================",
        "-- End of Backup",
        "-- ========================================================"
    ])

    return "\n".join(sql_lines)


def export_database_to_zip(cursor, db_name: Optional[str] = None) -> bytes:
    """
    Creates a ZIP archive in memory containing:
    1. backup_{db}_{timestamp}.sql
    2. backup_{db}_{timestamp}.json
    3. metadata.json
    """
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    db_label = db_name or "inventory_db"

    json_data = export_database_to_json(cursor, db_name)
    sql_data = export_database_to_sql(cursor, db_name)
    metadata_data = {
        "database": db_label,
        "timestamp": timestamp,
        "exported_at": json_data["exported_at"],
        "total_tables": json_data["total_tables"],
        "total_records": json_data["total_records"],
        "tables": json_data["table_metadata"],
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"backup_{db_label}_{timestamp}.sql", sql_data)
        zf.writestr(
            f"backup_{db_label}_{timestamp}.json",
            json.dumps(json_data, indent=2, ensure_ascii=False)
        )
        zf.writestr(
            "metadata.json",
            json.dumps(metadata_data, indent=2, ensure_ascii=False)
        )

    zip_buffer.seek(0)
    return zip_buffer.getvalue()


def restore_database_from_json(conn, cursor, json_content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Restores database tables from a JSON backup.
    Clears target tables and inserts rows with Foreign Key checks disabled.
    """
    if "data" not in json_content:
        raise ValueError("Invalid backup format: missing 'data' key")

    data = json_content["data"]
    restored_tables = 0
    total_restored_rows = 0

    cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")

    for table_name, rows in data.items():
        if not rows:
            continue
        try:
            # Check if table exists
            cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
            if not cursor.fetchone():
                logger.warning(f"Table `{table_name}` does not exist in target DB. Skipping.")
                continue

            # Clear existing data in table
            cursor.execute(f"TRUNCATE TABLE `{table_name}`")

            # Prepare insert
            columns = list(rows[0].keys())
            col_names_str = ", ".join(f"`{c}`" for c in columns)
            placeholders = ", ".join(["%s"] * len(columns))
            insert_query = f"INSERT INTO `{table_name}` ({col_names_str}) VALUES ({placeholders})"

            data_tuples = []
            for r in rows:
                data_tuples.append(tuple(r.get(c) for c in columns))

            cursor.executemany(insert_query, data_tuples)
            restored_tables += 1
            total_restored_rows += len(data_tuples)
        except Exception as e:
            logger.error(f"Error restoring table `{table_name}`: {e}")
            raise

    conn.commit()
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")

    return {
        "status": "success",
        "message": f"Successfully restored {restored_tables} tables with {total_restored_rows} total rows.",
        "restored_tables": restored_tables,
        "total_restored_rows": total_restored_rows
    }


def restore_database_from_sql(conn, cursor, sql_script: str) -> Dict[str, Any]:
    """
    Restores database from an SQL dump script.
    Executes statements sequentially with error handling.
    """
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
    statements = sql_script.split(";\n")
    executed_count = 0

    for stmt in statements:
        cleaned = stmt.strip()
        if not cleaned or cleaned.startswith("--") or cleaned.startswith("/*"):
            continue
        try:
            cursor.execute(cleaned)
            executed_count += 1
        except Exception as e:
            logger.warning(f"Warning on SQL restore statement: {e}")

    conn.commit()
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")

    return {
        "status": "success",
        "message": f"Executed {executed_count} SQL statements from backup script.",
        "executed_statements": executed_count
    }
