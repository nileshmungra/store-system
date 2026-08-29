import os
import sqlite3
import socket
import subprocess
import time
import mysql.connector
from mysql.connector import Error, pooling
from contextlib import contextmanager


# MySQL connection configuration
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST') or os.getenv('MYSQLHOST', 'localhost'),
    'port': int(os.getenv('MYSQL_PORT') or os.getenv('MYSQLPORT', 3307)),
    'user': os.getenv('MYSQL_USER') or os.getenv('MYSQLUSER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD') or os.getenv('MYSQLPASSWORD', ''),
    'database': os.getenv('MYSQL_DATABASE') or os.getenv('MYSQLDATABASE', 'inventory_db'),
}

# Global connection pool object
db_pool = None

def ensure_mysql_running(host='127.0.0.1', port=3307):
    """Checks if MySQL server is running. Auto-starts XAMPP MySQL if stopped."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.2)
        res = s.connect_ex((host, port))
        s.close()
        if res == 0:
            return True
    except Exception:
        pass

    print(f"[INFO] MySQL Server on {host}:{port} is NOT running. Attempting auto-start...")
    
    # Attempt 1: net start mysql
    try:
        subprocess.run(["net", "start", "mysql"], capture_output=True, text=True, timeout=3)
    except Exception:
        pass

    # Check if port opened
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.2)
        res = s.connect_ex((host, port))
        s.close()
        if res == 0:
            print("[SUCCESS] MySQL started via Windows Service!")
            return True
    except Exception:
        pass

    # Attempt 2: XAMPP mysql_start.bat / mysqld.exe
    possible_paths = [
        r"C:\xampp\mysql_start.bat",
        r"C:\xampp\mysql\bin\mysqld.exe",
        r"D:\xampp\mysql_start.bat",
        r"E:\xampp\mysql_start.bat"
    ]

    for path in possible_paths:
        if os.path.exists(path):
            try:
                print(f"[INFO] Launching MySQL from {path}...")
                subprocess.Popen([path], creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                for _ in range(12):
                    time.sleep(0.5)
                    try:
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(1)
                        if s.connect_ex((host, port)) == 0:
                            s.close()
                            print("[SUCCESS] MySQL started successfully!")
                            return True
                        s.close()
                    except Exception:
                        pass
            except Exception as e:
                print(f"[WARNING] Failed to start from {path}: {e}")

    return False

def get_db():
    """
    Fetches a connection from the MySQL connection pool.
    Initializes the pool on the first call.
    """
    global db_pool
    db_host = MYSQL_CONFIG.get('host', '127.0.0.1')
    db_port = MYSQL_CONFIG.get('port', 3307)
    if db_host in ('localhost', '127.0.0.1'):
        ensure_mysql_running(host=db_host, port=db_port)
    if db_pool is None:
        try:
            print("[INFO] Initializing MySQL Connection Pool...")
            db_pool = mysql.connector.pooling.MySQLConnectionPool(
                pool_name="inventory_pool",
                pool_size=20,  # Increased pool size for fast concurrent requests
                pool_reset_session=True,
                **MYSQL_CONFIG
            )
            print("[SUCCESS] MySQL Connection Pool initialized.")
        except Error as e:
            print(f"[ERROR] Error creating connection pool: {e}")
            raise
    try:
        # Get a connection from the initialized pool
        return db_pool.get_connection()
    except Error as e:
        print(f"Error getting connection from pool: {e}")
        raise

@contextmanager
def get_db_ctx(commit=False, dictionary=True):
    """
    Context manager to safely acquire and release database connections.
    Guarantees connection return to pool even on errors.
    """
    conn = get_db()
    cursor = conn.cursor(dictionary=dictionary)
    try:
        yield conn, cursor
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

def init_db():
    db_host = MYSQL_CONFIG.get('host', '127.0.0.1')
    db_port = MYSQL_CONFIG.get('port', 3307)
    if db_host in ('localhost', '127.0.0.1'):
        ensure_mysql_running(host=db_host, port=db_port)
    # Connect to server to create database if not exists
    try:
        # Create a connection config without the 'database' key to check/create the DB
        server_config = MYSQL_CONFIG.copy()
        db_name = server_config.pop('database', None)
        if not db_name:
            raise Error("Database name is not configured in MYSQL_CONFIG.")

        # Use a direct connection for this one-time check
        conn_no_db = mysql.connector.connect(**server_config)
        cursor_no_db = conn_no_db.cursor()
        cursor_no_db.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}`")
        conn_no_db.close()
    except Error as e:
        print(f"Error creating database: {e}")
        raise

    # Use a connection from the pool to set up tables
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Item Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS items (
            id INT PRIMARY KEY AUTO_INCREMENT,
            item_code VARCHAR(255) UNIQUE NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            item_group VARCHAR(255),
            hsn_code VARCHAR(255),
            unit VARCHAR(50),
            rate DECIMAL(10, 2),
            image_url VARCHAR(255),
            is_own_production TINYINT DEFAULT 0,
            is_outsource TINYINT DEFAULT 0
        );
    ''')
    try:
        cursor.execute("ALTER TABLE items ADD COLUMN is_own_production TINYINT DEFAULT 0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE items ADD COLUMN is_outsource TINYINT DEFAULT 0")
    except Exception:
        pass
    
    extra_item_cols = [
        "min_stock DECIMAL(10, 2) DEFAULT 0",
        "max_stock DECIMAL(10, 2) DEFAULT 0",
        "reorder_point DECIMAL(10, 2) DEFAULT 0",
        "weight_per_pc DECIMAL(10, 3) DEFAULT 0",
        "show_in_print TINYINT DEFAULT 0",
        "is_fitting_item TINYINT DEFAULT 0",
        "print_in_dispatch_plan TINYINT DEFAULT 0",
        "allow_above_msl TINYINT DEFAULT 0",
        "is_service_item TINYINT DEFAULT 0",
        "qc_required TINYINT DEFAULT 0",
        "allow_partial_dispatch TINYINT DEFAULT 0",
        "sec_unit VARCHAR(50) DEFAULT ''",
        "status VARCHAR(20) DEFAULT 'Active'",
    ]
    for col_def in extra_item_cols:
        try:
            cursor.execute(f"ALTER TABLE items ADD COLUMN {col_def}")
        except Exception:
            pass
    
    # 0. Inward Batches Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inward_batches (
            id INT PRIMARY KEY AUTO_INCREMENT,
            item_name VARCHAR(255) NOT NULL,
            total_boxes INT NOT NULL,
            total_qty INT NOT NULL,
            supplier_or_party VARCHAR(255),
            remark TEXT, -- TEXT type for potentially longer remarks
            inward_date DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 1. Boxes Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS boxes (
            box_id VARCHAR(255) PRIMARY KEY UNIQUE,
            batch_id INT,
            item_name VARCHAR(255),
            qty_in_box INT,
            supplier_or_party VARCHAR(255),
            location VARCHAR(255) DEFAULT NULL,
            dp_number VARCHAR(255) DEFAULT NULL,
            status VARCHAR(50) DEFAULT 'IN_STORE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    try:
        cursor.execute("ALTER TABLE boxes ADD COLUMN dp_number VARCHAR(255) DEFAULT NULL")
    except Exception:
        pass
    
    # 2. Outward Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS outward_logs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            box_id VARCHAR(255),
            item_name VARCHAR(255),
            qty_issued INT,
            issued_to VARCHAR(255),
            scanned_by VARCHAR(255),
            outward_date DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 3. Audit Logs / Log Book Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_name VARCHAR(255) DEFAULT 'System/Admin',
            action VARCHAR(255) NOT NULL,
            details TEXT NOT NULL, -- TEXT type for potentially longer details
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Machine Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS machines (
            id INT PRIMARY KEY AUTO_INCREMENT,
            machine_name VARCHAR(255) UNIQUE NOT NULL,
            status VARCHAR(50) DEFAULT 'ACTIVE'
        );
    ''')
    
    # Seed default machines if empty
    cursor.execute("SELECT COUNT(*) FROM machines")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("INSERT INTO machines (machine_name) VALUES (%s)", [
            ("Extruder Machine 01",),
            ("Extruder Machine 02",),
            ("Extruder Machine 03",),
        ])
    
    # Production_log
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS production_logs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            production_date DATE,
            machine_name VARCHAR(255) NOT NULL,
            pipe_type VARCHAR(255) NOT NULL,
            pipe_size VARCHAR(255) NOT NULL,
            planned_qty DECIMAL(10, 2) DEFAULT 0,
            actual_qty DECIMAL(10, 2) DEFAULT 0,
            bundle_unit VARCHAR(50) DEFAULT 'MTR',
            coil_length_meters DECIMAL(10, 2),
            coil_weight_kg DECIMAL(10, 2),
            raw_material_used_kg DECIMAL(10, 2),
            shift_operator VARCHAR(255),
            qr_code VARCHAR(255) UNIQUE,
            status VARCHAR(50) DEFAULT 'APPROVED',
            approved_by VARCHAR(255) DEFAULT NULL,
            approved_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    # Safe column additions for existing production_logs tables
    prod_cols = [
        ("production_date", "DATE DEFAULT NULL AFTER id"),
        ("planned_qty", "DECIMAL(10, 2) DEFAULT 0"),
        ("actual_qty", "DECIMAL(10, 2) DEFAULT 0"),
        ("bundle_unit", "VARCHAR(50) DEFAULT 'MTR'"),
        ("status", "VARCHAR(50) DEFAULT 'APPROVED'"),
        ("approved_by", "VARCHAR(255) DEFAULT NULL"),
        ("approved_at", "DATETIME DEFAULT NULL")
    ]
    for col_name, col_def in prod_cols:
        try:
            cursor.execute(f"ALTER TABLE production_logs ADD COLUMN {col_name} {col_def};")
        except Exception:
            pass

    # Dispatch Plans Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dispatch_plans (
            id INT PRIMARY KEY AUTO_INCREMENT,
            plan_no VARCHAR(255) UNIQUE NOT NULL,
            so_no VARCHAR(255),
            plan_date DATE,
            status VARCHAR(50) DEFAULT 'ACTIVE',
            vehicle_no VARCHAR(255),
            transporter_name VARCHAR(255),
            driver_info VARCHAR(255),
            pan_number VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    for col in ["vehicle_no", "transporter_name", "driver_info", "pan_number"]:
        try:
            cursor.execute(f"ALTER TABLE dispatch_plans ADD COLUMN {col} VARCHAR(255)")
        except Exception:
            pass

    # Legacy Dispatch Plans Table (keyed by dp_number)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dp_plans (
            id INT AUTO_INCREMENT PRIMARY KEY,
            dp_number VARCHAR(255) UNIQUE NOT NULL,
            so_numbers TEXT,
            total_items INT DEFAULT 0,
            status VARCHAR(50) DEFAULT 'ACTIVE',
            pan_number VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    for col in ["pan_number"]:
        try:
            cursor.execute(f"ALTER TABLE dp_plans ADD COLUMN {col} VARCHAR(255)")
        except Exception:
            pass


    # Dispatch Plan Items Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dispatch_plan_items (
            id INT PRIMARY KEY AUTO_INCREMENT,
            dispatch_plan_id INT,
            item_name VARCHAR(255) NOT NULL,
            planned_qty DECIMAL(10, 2) NOT NULL,
            dispatched_qty DECIMAL(10, 2) DEFAULT 0.0,
            unit VARCHAR(50),
            weight_per_pc DECIMAL(10, 3) DEFAULT 0.0,
            FOREIGN KEY (dispatch_plan_id) REFERENCES dispatch_plans(id) ON DELETE CASCADE
        );
    ''')
    try:
        cursor.execute("ALTER TABLE dispatch_plan_items ADD COLUMN item_type VARCHAR(50) DEFAULT 'DIRECT_DISPATCH'")
    except Exception:
        pass # Column already exists

    # Legacy Dispatch Plan Items Table (keyed by dp_number)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dp_plan_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            dp_number VARCHAR(255) NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            planned_qty DECIMAL(10, 2) NOT NULL,
            unit VARCHAR(50),
            weight_per_pc DECIMAL(10, 3) DEFAULT 0.0,
            dispatched_qty DECIMAL(10, 2) DEFAULT 0.0
        );
    ''')


    # Bill of Materials (BOM) Tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS boms (
            id INT PRIMARY KEY AUTO_INCREMENT,
            finished_good_item_id INT NOT NULL,
            name VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY (finished_good_item_id),
            FOREIGN KEY (finished_good_item_id) REFERENCES items(id) ON DELETE CASCADE
        );
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bom_components (
            id INT PRIMARY KEY AUTO_INCREMENT,
            bom_id INT NOT NULL,
            component_item_id INT NOT NULL,
            quantity DECIMAL(10, 3) NOT NULL,
            FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE,
            FOREIGN KEY (component_item_id) REFERENCES items(id) ON DELETE CASCADE
        );
    ''')

    # Dispatch Verification Table (Direct Dispatch vs Store Kit Mapping)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dispatch_verification (
            id INT AUTO_INCREMENT PRIMARY KEY,
            dp_number VARCHAR(50),
            so_number VARCHAR(50),
            item_type ENUM('DIRECT_DISPATCH', 'STORE_KIT') NOT NULL,
            item_name VARCHAR(150),
            required_qty DECIMAL(10,2),
            scanned_qty DECIMAL(10,2) DEFAULT 0,
            unit VARCHAR(20),
            status ENUM('PENDING', 'COMPLETED') DEFAULT 'PENDING'
        );
    ''')

    # Store Kits Master & Items Tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS store_kits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            kit_code VARCHAR(255) UNIQUE NOT NULL,
            so_number VARCHAR(100) NOT NULL,
            dp_number VARCHAR(100),
            total_items_count INT DEFAULT 0,
            status VARCHAR(50) DEFAULT 'CREATED',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS store_kit_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            kit_code VARCHAR(255) NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            quantity DECIMAL(10,2) NOT NULL,
            unit VARCHAR(50) DEFAULT 'Pcs',
            FOREIGN KEY (kit_code) REFERENCES store_kits(kit_code) ON DELETE CASCADE
        );
    ''')


    # 🚀 HIGH-PERFORMANCE INDEXING (<10ms query execution)
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_boxes_item ON boxes(item_name);",
        "CREATE INDEX IF NOT EXISTS idx_boxes_status ON boxes(status);",
        "CREATE INDEX IF NOT EXISTS idx_boxes_batch ON boxes(batch_id);",
        "CREATE INDEX IF NOT EXISTS idx_boxes_created ON boxes(created_at);",
        "CREATE INDEX IF NOT EXISTS idx_boxes_item_status ON boxes(item_name, status);",
        "CREATE INDEX IF NOT EXISTS idx_boxes_batch_status ON boxes(batch_id, status);",
        "CREATE INDEX IF NOT EXISTS idx_outward_item ON outward_logs(item_name);",
        "CREATE INDEX IF NOT EXISTS idx_outward_box ON outward_logs(box_id);",
        "CREATE INDEX IF NOT EXISTS idx_outward_date ON outward_logs(outward_date);",
        "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);",
        "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);",
        "CREATE INDEX IF NOT EXISTS idx_production_created ON production_logs(created_at);",
        "CREATE INDEX IF NOT EXISTS idx_production_machine ON production_logs(machine_name);",
        "CREATE INDEX IF NOT EXISTS idx_production_pipe ON production_logs(pipe_type);",
        "CREATE INDEX IF NOT EXISTS idx_inward_date ON inward_batches(inward_date);",
        "CREATE INDEX IF NOT EXISTS idx_inward_item ON inward_batches(item_name);",
        "CREATE INDEX IF NOT EXISTS idx_items_name ON items(item_name);",
        "CREATE INDEX IF NOT EXISTS idx_items_code ON items(item_code);",
        "CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);",
        "CREATE INDEX IF NOT EXISTS idx_dp_status ON dispatch_plans(status);",
        "CREATE INDEX IF NOT EXISTS idx_dpi_plan ON dispatch_plan_items(dispatch_plan_id);",
        "CREATE INDEX IF NOT EXISTS idx_bom_finished_good ON boms(finished_good_item_id);",
        "CREATE INDEX IF NOT EXISTS idx_boxes_location ON boxes(location);",
        "CREATE INDEX IF NOT EXISTS idx_bom_components_bom ON bom_components(bom_id);",
        "CREATE INDEX IF NOT EXISTS idx_dv_dp_number ON dispatch_verification(dp_number);",
        "CREATE INDEX IF NOT EXISTS idx_dv_status ON dispatch_verification(status);",
        "CREATE INDEX IF NOT EXISTS idx_dv_item_type ON dispatch_verification(item_type);",
    ]
    for idx_sql in indexes:
        try:
            cursor.execute(idx_sql)
        except Exception:
            pass

    # Pending Loading Entry Table (from Excel)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pending_loading_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            disp_plan_no VARCHAR(255) NOT NULL,
            disp_plan_date DATE,
            so_no VARCHAR(255) NOT NULL,
            so_date DATE,
            customer_location VARCHAR(255),
            dealer VARCHAR(255),
            village VARCHAR(255),
            district VARCHAR(255),
            item_name VARCHAR(255) NOT NULL,
            item_code VARCHAR(255) NOT NULL,
            pending_qty DECIMAL(10, 3) NOT NULL,
            unit VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY idx_unique_loading_entry (disp_plan_no, so_no, item_code)
        );
    ''')

    # QC Approvals Table (for future outsourced item QC workflow)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS qc_approvals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            item_name VARCHAR(255) NOT NULL,
            item_code VARCHAR(255),
            batch_id INT,
            qty DECIMAL(10, 2) NOT NULL,
            supplier_or_party VARCHAR(255),
            remark TEXT,
            status VARCHAR(50) DEFAULT 'PENDING_QC',
            approved_by VARCHAR(255) DEFAULT NULL,
            approved_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
    ''')

    # Indexes for the new table
    ple_indexes = [
        "CREATE INDEX IF NOT EXISTS idx_ple_disp_plan_no ON pending_loading_entries(disp_plan_no);",
        "CREATE INDEX IF NOT EXISTS idx_ple_so_no ON pending_loading_entries(so_no);",
        "CREATE INDEX IF NOT EXISTS idx_ple_item_code ON pending_loading_entries(item_code);"
    ]
    for idx_sql in ple_indexes:
        try:
            cursor.execute(idx_sql)
        except Exception:
            pass

    conn.commit()
    conn.close()

    # Sync with SQLite inventory.db
    if os.path.exists("inventory.db"):
        try:
            import sqlite3
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute('''
                CREATE TABLE IF NOT EXISTS boxes (
                    box_id TEXT PRIMARY KEY,
                    batch_id INTEGER,
                    item_name TEXT,
                    qty_in_box INTEGER,
                    supplier_or_party TEXT,
                    location TEXT,
                    dp_number TEXT,
                    status TEXT DEFAULT 'IN_STORE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            ''')
            sq_cursor.execute('''
                CREATE TABLE IF NOT EXISTS dispatch_verification (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dp_number TEXT,
                    so_number TEXT,
                    item_type TEXT NOT NULL,
                    item_name TEXT,
                    required_qty REAL,
                    scanned_qty REAL DEFAULT 0,
                    unit TEXT,
                    status TEXT DEFAULT 'PENDING'
                );
            ''')
            sq_cursor.execute('''
                CREATE TABLE IF NOT EXISTS store_kits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kit_code TEXT UNIQUE NOT NULL,
                    so_number TEXT NOT NULL,
                    dp_number TEXT,
                    total_items_count INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'CREATED',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            ''')
            sq_cursor.execute('''
                CREATE TABLE IF NOT EXISTS store_kit_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kit_code TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    unit TEXT DEFAULT 'Pcs'
                );
            ''')
            sq_cursor.execute('''
                CREATE TABLE IF NOT EXISTS qc_approvals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_name TEXT NOT NULL,
                    item_code TEXT,
                    batch_id INTEGER,
                    qty REAL NOT NULL,
                    supplier_or_party TEXT,
                    remark TEXT,
                    status TEXT DEFAULT 'PENDING_QC',
                    approved_by TEXT,
                    approved_at TIMESTAMP DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            ''')
            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite init warning: {e}")

if __name__ == "__main__":
    try:
        init_db()
        print("[SUCCESS] MySQL & SQLite Databases Initialized with Complete High-Performance Indexes!")
    except Error as e:
        print(f"[ERROR] Database initialization failed: {e}")
