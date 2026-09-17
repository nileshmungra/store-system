"""
Standalone CLI Backup Tool for Store QR Inventory System.
Run:
    python take_backup.py
Output:
    Creates a timestamped backup in the ./backups/ folder with .sql, .json, and .zip formats.
"""

import datetime
import os
import sys

from backup_manager import (
    export_database_to_json,
    export_database_to_sql,
    export_database_to_zip,
    get_database_info,
)
from database import MYSQL_CONFIG, get_db_ctx


def main():
    print("=" * 60)
    print("📦  Bhumi Factory & Dispatch Manager - Database Backup Tool")
    print("=" * 60)

    backup_dir = os.path.join(os.path.dirname(__file__), "backups")
    os.makedirs(backup_dir, exist_ok=True)

    db_name = MYSQL_CONFIG.get("database", "inventory_db")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    sql_filename = f"backup_{db_name}_{timestamp}.sql"
    json_filename = f"backup_{db_name}_{timestamp}.json"
    zip_filename = f"backup_{db_name}_{timestamp}.zip"

    sql_path = os.path.join(backup_dir, sql_filename)
    json_path = os.path.join(backup_dir, json_filename)
    zip_path = os.path.join(backup_dir, zip_filename)

    print(f"Connecting to database: {db_name} on {MYSQL_CONFIG.get('host')}:{MYSQL_CONFIG.get('port')}...")

    try:
        with get_db_ctx(commit=False, dictionary=True) as (conn, cursor):
            info = get_database_info(cursor, db_name)
            print(f"Connected successfully!")
            print(f"Total Tables: {info['total_tables']} | Total Records: {info['total_records']}")
            print("-" * 60)

            # 1. Export SQL
            print("1. Generating SQL Dump (.sql)...")
            sql_data = export_database_to_sql(cursor, db_name)
            with open(sql_path, "w", encoding="utf-8") as f:
                f.write(sql_data)
            print(f"   ✓ Saved: {sql_path} ({os.path.getsize(sql_path):,} bytes)")

            # 2. Export JSON
            print("2. Generating Universal JSON Backup (.json)...")
            import json
            json_data = export_database_to_json(cursor, db_name)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            print(f"   ✓ Saved: {json_path} ({os.path.getsize(json_path):,} bytes)")

            # 3. Export ZIP
            print("3. Generating Compressed Bundle (.zip)...")
            zip_bytes = export_database_to_zip(cursor, db_name)
            with open(zip_path, "wb") as f:
                f.write(zip_bytes)
            print(f"   ✓ Saved: {zip_path} ({os.path.getsize(zip_path):,} bytes)")

            print("=" * 60)
            print("🎉 Database Backup Completed Successfully!")
            print(f"All backups saved safely in: {backup_dir}")
            print("=" * 60)

    except Exception as e:
        print(f"\n❌ Backup Failed with error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
