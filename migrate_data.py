import sqlite3
import mysql.connector
from mysql.connector import Error
from database import MYSQL_CONFIG # database.py માંથી MySQL કન્ફિગરેશન ઈમ્પોર્ટ કરો

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
    SQLite માંથી ડેટા વાંચે છે અને તેને MySQL માં દાખલ કરે છે.
    """
    try:
        # SQLite ડેટાબેઝ સાથે કનેક્ટ કરો
        sqlite_conn = sqlite3.connect(SQLITE_DB_FILE)
        sqlite_conn.row_factory = sqlite3.Row
        sqlite_cursor = sqlite_conn.cursor()
        print("✅ SQLite ડેટાબેઝ સાથે સફળતાપૂર્વક કનેક્ટ થયા.")

        # MySQL ડેટાબેઝ સાથે કનેક્ટ કરો
        mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
        mysql_cursor = mysql_conn.cursor()
        print("✅ MySQL ડેટાબેઝ સાથે સફળતાપૂર્વક કનેક્ટ થયા.")

    except Error as e:
        print(f"❌ ડેટાબેઝ કનેક્શનમાં ભૂલ: {e}")
        return
    except sqlite3.Error as e:
        print(f"❌ SQLite કનેક્શનમાં ભૂલ: {e}")
        return

    # ડેટા ઈમ્પોર્ટ દરમિયાન Foreign Key ચેક્સ બંધ કરો
    mysql_cursor.execute("SET FOREIGN_KEY_CHECKS=0;")
    print("\nℹ️ MySQL foreign key checks અસ્થાયી રૂપે બંધ કરવામાં આવ્યા છે.")

    for table_name in TABLES_TO_MIGRATE:
        try:
            print(f"\n--- ટેબલ માઇગ્રેટ કરી રહ્યા છીએ: {table_name} ---")

            # 1. SQLite ટેબલમાંથી બધો ડેટા મેળવો
            sqlite_cursor.execute(f"SELECT * FROM {table_name}")
            rows = sqlite_cursor.fetchall()

            if not rows:
                print(f"  - SQLite ટેબલ '{table_name}' માં કોઈ ડેટા મળ્યો નથી. આગળ વધી રહ્યા છીએ.")
                continue

            # 2. માઇગ્રેશન પહેલાં MySQL ટેબલને ખાલી કરો
            mysql_cursor.execute(f"TRUNCATE TABLE `{table_name}`")
            print(f"  - ℹ️ MySQL ટેબલ '{table_name}' ખાલી કરવામાં આવ્યું.")

            # 2. MySQL માં ડેટા દાખલ કરવાની તૈયારી કરો
            columns = rows[0].keys()
            column_list = ', '.join(f"`{col}`" for col in columns)
            placeholders = ', '.join(['%s'] * len(columns))
            
            data_to_insert = [tuple(row) for row in rows]

            # 3. MySQL ટેબલમાં ડેટા દાખલ કરો
            insert_query = f"INSERT INTO {table_name} ({column_list}) VALUES ({placeholders})"
            mysql_cursor.executemany(insert_query, data_to_insert)
            mysql_conn.commit()

            print(f"  - ✅ {mysql_cursor.rowcount} રેકોર્ડ્સ MySQL ટેબલ '{table_name}' માં સફળતાપૂર્વક માઇગ્રેટ થયા.")

        except (sqlite3.Error, Error, IndexError) as e:
            print(f"  - ❌ ટેબલ '{table_name}' માઇગ્રેટ કરવામાં ભૂલ: {e}")
            mysql_conn.rollback()

    # Foreign Key ચેક્સ ફરીથી ચાલુ કરો
    mysql_cursor.execute("SET FOREIGN_KEY_CHECKS=1;")
    print("\nℹ️ MySQL foreign key checks ફરીથી ચાલુ કરવામાં આવ્યા છે.")

    sqlite_conn.close()
    mysql_conn.close()
    print("\n🎉 માઇગ્રેશન પૂર્ણ થયું! બધા કનેક્શન્સ બંધ કરવામાં આવ્યા છે.")

if __name__ == "__main__":
    print("SQLite થી MySQL માં ડેટા માઇગ્રેશન શરૂ કરી રહ્યા છીએ...")
    print("="*50)
    migrate_data()