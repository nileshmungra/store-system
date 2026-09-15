import sqlite3

import mysql.connector
from mysql.connector import Error

from database import MYSQL_CONFIG

# --- Configuration ---
SQLITE_DB_FILE = 'inventory.db'
TABLES_TO_MIGRATE = [
    'items',
    'inward_batches',
    'boxes',
    'outward_logs',
    'audit_logs',
    'machines',
    'production_logs',
    'dp_plans',
    'dp_plan_items'
]

# --- Main Migration Logic ---

def migrate_data():
    """
    Migrates data from SQLite (inventory.db) to MySQL.
    """
    try:
        # SQLite connection
        sqlite_conn = sqlite3.connect(SQLITE_DB_FILE)
        sqlite_conn.row_factory = sqlite3.Row
        sqlite_cursor = sqlite_conn.cursor()
        logging.debug("Connected to SQLite database:", SQLITE_DB_FILE)

        # MySQL connection
        mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
        mysql_cursor = mysql_conn.cursor()
        logging.debug("Connected to MySQL database.")

    except Error as e:
        logging.debug(f"MySQL connection error: {e}")
        return
    except sqlite3.Error as e:
        logging.debug(f"SQLite connection error: {e}")
        return

    # Disable Foreign Key checks for smooth migration
    mysql_cursor.execute("SET FOREIGN_KEY_CHECKS=0;")
    logging.debug("\nMySQL foreign key checks disabled.")

    for table_name in TABLES_TO_MIGRATE:
        try:
            logging.debug(f"\n--- Migrating table: {table_name} ---")

            # 1. Read all rows from SQLite
            sqlite_cursor.execute(f"SELECT * FROM {table_name}")
            rows = sqlite_cursor.fetchall()

            if not rows:
                logging.debug(f"  - SQLite table '{table_name}' is empty. Skipping.")
                continue

            # 2. Truncate the MySQL table (clear existing data)
            mysql_cursor.execute(f"TRUNCATE TABLE `{table_name}`")
            logging.debug(f"  - Truncated MySQL table '{table_name}'.")

            # 2. Prepare insert: build column list and placeholders
            columns = rows[0].keys()
            column_list = ', '.join(f"`{col}`" for col in columns)
            placeholders = ', '.join(['%s'] * len(columns))

            data_to_insert = [tuple(row) for row in rows]

            # 3. Insert rows into MySQL
            insert_query = f"INSERT INTO {table_name} ({column_list}) VALUES ({placeholders})"
            mysql_cursor.executemany(insert_query, data_to_insert)
            mysql_conn.commit()

            logging.debug(f"  - Successfully migrated {mysql_cursor.rowcount} rows into '{table_name}'.")

        except (sqlite3.Error, Error, IndexError) as e:
            logging.debug(f"  - Error migrating '{table_name}': {e}")
            mysql_conn.rollback()

    # Re-enable Foreign Key checks
    mysql_cursor.execute("SET FOREIGN_KEY_CHECKS=1;")
    logging.debug("\nMySQL foreign key checks re-enabled.")

    sqlite_conn.close()
    mysql_conn.close()
    logging.debug("\nMigration complete! All tables processed successfully.")

if __name__ == "__main__":
    logging.debug("Starting SQLite to MySQL data migration...")
    logging.debug("=" * 50)
    migrate_data()
