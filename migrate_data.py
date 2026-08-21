import sqlite3
import mysql.connector
from mysql.connector import Error
from database import MYSQL_CONFIG # database.py  MySQL   

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
    SQLite       MySQL    .
    """
    try:
        # SQLite    
        sqlite_conn = sqlite3.connect(SQLITE_DB_FILE)
        sqlite_conn.row_factory = sqlite3.Row
        sqlite_cursor = sqlite_conn.cursor()
        print("✅ SQLite     .")

        # MySQL    
        mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
        mysql_cursor = mysql_conn.cursor()
        print("✅ MySQL     .")

    except Error as e:
        print(f"❌   : {e}")
        return
    except sqlite3.Error as e:
        print(f"❌ SQLite  : {e}")
        return

    #    Foreign Key   
    mysql_cursor.execute("SET FOREIGN_KEY_CHECKS=0;")
    print("\nℹ️ MySQL foreign key checks      .")

    for table_name in TABLES_TO_MIGRATE:
        try:
            print(f"\n---     : {table_name} ---")

            # 1. SQLite    
            sqlite_cursor.execute(f"SELECT * FROM {table_name}")
            rows = sqlite_cursor.fetchall()

            if not rows:
                print(f"  - SQLite  '{table_name}'     .    .")
                continue

            # 2.   MySQL   
            mysql_cursor.execute(f"TRUNCATE TABLE `{table_name}`")
            print(f"  - ℹ️ MySQL  '{table_name}'   .")

            # 2. MySQL      
            columns = rows[0].keys()
            column_list = ', '.join(f"`{col}`" for col in columns)
            placeholders = ', '.join(['%s'] * len(columns))
            
            data_to_insert = [tuple(row) for row in rows]

            # 3. MySQL    
            insert_query = f"INSERT INTO {table_name} ({column_list}) VALUES ({placeholders})"
            mysql_cursor.executemany(insert_query, data_to_insert)
            mysql_conn.commit()

            print(f"  - ✅ {mysql_cursor.rowcount}  MySQL  '{table_name}'    .")

        except (sqlite3.Error, Error, IndexError) as e:
            print(f"  - ❌  '{table_name}'   : {e}")
            mysql_conn.rollback()

    # Foreign Key    
    mysql_cursor.execute("SET FOREIGN_KEY_CHECKS=1;")
    print("\nℹ️ MySQL foreign key checks     .")

    sqlite_conn.close()
    mysql_conn.close()
    print("\n🎉   !      .")

if __name__ == "__main__":
    print("SQLite  MySQL       ...")
    print("="*50)
    migrate_data()