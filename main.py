import os
import sys
import shutil
import io
import re
import time
import gc
import json
import sqlite3
import pdfplumber
from datetime import datetime
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import mysql.connector
from typing import Optional, Union
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import get_db, init_db, get_db_ctx

class CreatePlanFromLoadingEntryRequest(BaseModel):
    disp_plan_no: str
    so_numbers: list[str]

app = FastAPI(title="Store QR Inventory System")

# Setup static folder for saving images
os.makedirs("static/uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
def startup_event():
    init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins
    allow_origin_regex='.*', # Allow all origins via regex for ws/wss
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Enable GZip Compression for fast network transfers (<10ms payload times)
app.add_middleware(GZipMiddleware, minimum_size=500)

# ===============================================
#  WebSocket Connection Manager for Live Updates
# ===============================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "PING":
                await websocket.send_text("PONG")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# -----------------------------------------------
# Helper Function for Log Book
# -----------------------------------------------
def add_log(conn, action: str, details: str, user_name: str = "Admin"):
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO audit_logs (user_name, action, details) VALUES (%s, %s, %s)",
            (user_name, action, details)
        )
    except Exception as e:
        print(f"Log Error: {e}")

# -----------------------------------------------
# Authentication & Security Endpoints
# -----------------------------------------------
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "STORE_SECURE_TOKEN_V1")

class TokenRequest(BaseModel):
    username: Optional[str] = "admin"
    password: Optional[str] = ""

@app.post("/api/auth/token")
def generate_auth_token(req: TokenRequest = None):
    """Generate or retrieve bearer access token"""
    user = req.username if req and req.username else "Admin"
    return {
        "access_token": API_SECRET_KEY,
        "token_type": "bearer",
        "status": "authenticated",
        "user": user
    }

@app.get("/api/auth/verify")
def verify_auth_token():
    """Verify if the token is valid"""
    return {"status": "valid", "authenticated": True}

# Page Routes
@app.get("/")
@app.get("/dashboard")
def read_dashboard():
    if os.path.exists("main_dashboard.html"):
        return FileResponse("main_dashboard.html")
    return FileResponse("index.html")

@app.get("/inward-page")
def get_inward_page():
    return FileResponse("index.html")

@app.get("/scanner")
def read_scanner():
    return FileResponse("scanner.html")

@app.get("/report-page")
def get_report_page():
    return FileResponse("report.html")

@app.get("/logs-page")
def get_logs_page():
    if not os.path.exists("logs.html"):
        raise HTTPException(status_code=404, detail="logs.html file not found in system! Please verify file location.")
    return FileResponse("logs.html")

@app.get("/items-page")
def get_items_page():
    if not os.path.exists("items.html"):
        raise HTTPException(status_code=404, detail="items.html file not found!")
    return FileResponse("items.html")

@app.get("/production-page")
def get_production_page():
    if not os.path.exists("production.html"):
        raise HTTPException(status_code=404, detail="production.html file not found!")
    return FileResponse("production.html")

@app.get("/dispatch-page")
def get_dispatch_page():
    if not os.path.exists("dispatch.html"):
        raise HTTPException(status_code=404, detail="dispatch.html file not found!")
    return FileResponse("dispatch.html")

@app.get("/bom-page")
def get_bom_page():
    if not os.path.exists("bom.html"):
        raise HTTPException(status_code=404, detail="bom.html not found!")
    return FileResponse("bom.html")

@app.get("/challan-page")
@app.get("/delivery-challan-page")
def get_challan_page():
    if not os.path.exists("challan.html"):
        raise HTTPException(status_code=404, detail="challan.html not found!")
    return FileResponse("challan.html")

class VehicleInfoUpdateRequest(BaseModel):
    plan_id: Union[int, str]
    vehicle_no: Optional[str] = ""
    transporter_name: Optional[str] = ""
    driver_info: Optional[str] = ""

# -----------------------------------------------
# Request Models
# -----------------------------------------------
class InwardRequest(BaseModel):
    item_name: str
    total_boxes: int
    qty_per_box: int
    supplier_or_party: Optional[str] = "N/A"
    location: Optional[str] = None
    remark: Optional[str] = ""

class OutwardRequest(BaseModel):
    box_id: str
    qty_issued: int
    issued_to: str
    scanned_by: Optional[str] = "Store Keeper"
    dispatch_plan_id: Optional[Union[int, str]] = None
    dp_number: Optional[str] = None

class StoreKitGenerateRequest(BaseModel):
    so_number: str
    dp_number: Optional[str] = ""
    kit_code: Optional[str] = ""
    items: Optional[list] = None

class NonDpOutwardRequest(BaseModel):
    box_id: str
    qty_issued: Optional[int] = 1
    reason: str
    issued_to: Optional[str] = "Internal Dept"
    scanned_by: Optional[str] = "Store Keeper"
    remark: Optional[str] = ""


class FifoOutwardRequest(BaseModel):
    item_name: str
    qty_issued: int
    issued_to: str
    scanned_by: Optional[str] = "Store Keeper"
    dispatch_plan_id: Optional[Union[int, str]] = None
    dp_number: Optional[str] = None
    reason: Optional[str] = "FIFO Outward"



class ProductionEntryRequest(BaseModel):
    production_date: Optional[str] = None # YYYY-MM-DD format
    machine_name: str
    pipe_type: str  # HDPE, PVC, Emitting, Lateral
    pipe_size: str  # e.g., 16mm 30cm spacing / 50mm PN6
    planned_qty: Optional[float] = 0.0
    actual_qty: Optional[float] = 0.0
    coil_length_meters: Optional[float] = 0.0
    coil_weight_kg: Optional[float] = 0.0
    raw_material_used_kg: Optional[float] = 0.0
    shift_operator: Optional[str] = "Operator"
    bundle_unit: Optional[str] = "MTR"
    status: Optional[str] = "PENDING_APPROVAL" # 'PENDING_APPROVAL' or 'APPROVED'

class ProductionApprovalRequest(BaseModel):
    actual_qty: Optional[float] = None
    approved_by: Optional[str] = "Production Manager"

class InwardBatchUpdateRequest(BaseModel):
    item_name: str
    supplier_or_party: str
    remark: str

class ProductionLogUpdateRequest(BaseModel):
    machine_name: str
    pipe_type: str
    pipe_size: str
    coil_length_meters: float
    coil_weight_kg: float
    raw_material_used_kg: float
    shift_operator: str

class MachineAddRequest(BaseModel):
    machine_name: str
# -----------------------------------------------


# Dispatch Plan Update Models
class DispatchPlanUpdate(BaseModel):
    plan_no: str
    so_no: str

class DispatchPlanItemUpdate(BaseModel):
    item_name: str
    planned_qty: float
    unit: str

class DispatchPlanItemAdd(BaseModel):
    item_name: str
    planned_qty: float
    unit: str

# BOM Models
class BOMComponent(BaseModel):
    component_item_id: int
    quantity: float

class BOMSaveRequest(BaseModel):
    finished_good_item_id: int
    components: list[BOMComponent]

# APIs
# -----------------------------------------------

@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    with get_db_ctx(dictionary=True) as (conn, cursor):
        try:
            # 1. Inward stats today
            cursor.execute("""
                SELECT COUNT(*) as count, COALESCE(SUM(total_qty), 0) as total_qty 
                FROM inward_batches 
                WHERE DATE(inward_date) = CURDATE()
            """)
            inward_res = cursor.fetchone() or {'count': 0, 'total_qty': 0}
            
            # 2. Production stats today
            cursor.execute("""
                SELECT COUNT(*) as count, COALESCE(SUM(coil_weight_kg), 0) as total_weight 
                FROM production_logs 
                WHERE DATE(created_at) = CURDATE()
            """)
            prod_res = cursor.fetchone() or {'count': 0, 'total_weight': 0}
            
            # 3. Pending Dispatch Plans
            cursor.execute("SELECT COUNT(*) as count FROM dispatch_plans WHERE status != 'COMPLETED'")
            dp_res = cursor.fetchone() or {'count': 0}
            
            # 4. Total Items
            cursor.execute("SELECT COUNT(*) as count FROM items")
            item_res = cursor.fetchone() or {'count': 0}

            # 5. Last 7 Days trend for Chart.js
            cursor.execute("""
                SELECT 
                    DATE_FORMAT(d.day, '%Y-%m-%d') as date_label,
                    DATE_FORMAT(d.day, '%d %b') as short_label,
                    COALESCE(i.inward_qty, 0) as inward_qty,
                    COALESCE(p.prod_qty, 0) as prod_qty
                FROM (
                    SELECT CURDATE() - INTERVAL (a.a + b.a*10) DAY as day
                    FROM (SELECT 0 AS a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) AS a
                    CROSS JOIN (SELECT 0 AS a) AS b
                ) d
                LEFT JOIN (
                    SELECT DATE(inward_date) as cdate, SUM(total_qty) as inward_qty 
                    FROM inward_batches 
                    WHERE inward_date >= CURDATE() - INTERVAL 7 DAY 
                    GROUP BY DATE(inward_date)
                ) i ON d.day = i.cdate
                LEFT JOIN (
                    SELECT DATE(created_at) as cdate, SUM(coil_weight_kg) as prod_qty 
                    FROM production_logs 
                    WHERE created_at >= CURDATE() - INTERVAL 7 DAY 
                    GROUP BY DATE(created_at)
                ) p ON d.day = p.cdate
                ORDER BY d.day ASC
            """)
            chart_rows = cursor.fetchall() or []
            
            labels = [r['short_label'] for r in chart_rows]
            inward_data = [float(r['inward_qty']) for r in chart_rows]
            prod_data = [float(r['prod_qty']) for r in chart_rows]

            # 6. Top 5 Item Groups for Doughnut chart
            cursor.execute("SELECT COALESCE(NULLIF(item_group, ''), 'Other') as group_name, COUNT(*) as qty FROM items GROUP BY group_name ORDER BY qty DESC LIMIT 5")
            group_rows = cursor.fetchall() or []
            group_labels = [g['group_name'] for g in group_rows]
            group_counts = [g['qty'] for g in group_rows]

            return {
                "status": "success",
                "today_inward_count": inward_res['count'],
                "today_inward_qty": float(inward_res['total_qty']),
                "today_prod_count": prod_res['count'],
                "today_prod_weight": float(prod_res['total_weight']),
                "pending_dispatch_count": dp_res['count'],
                "total_items_count": item_res['count'],
                "chart": {
                    "labels": labels,
                    "inward": inward_data,
                    "production": prod_data,
                    "group_labels": group_labels,
                    "group_counts": group_counts
                }
            }
        except Exception as e:
            print(f"Dashboard Stats Error: {e}")
            return {
                "status": "error",
                "today_inward_count": 0,
                "today_inward_qty": 0,
                "today_prod_count": 0,
                "today_prod_weight": 0,
                "pending_dispatch_count": 0,
                "total_items_count": 0,
                "chart": {"labels": [], "inward": [], "production": [], "group_labels": [], "group_counts": []}
            }

@app.get("/api/reports/end-to-end-summary")
def get_end_to_end_summary():
    with get_db_ctx(dictionary=True) as (conn, cursor):
        try:
            # 1. Inward Stock vs Scanned DP Outward Quantity Difference (Variance)
            cursor.execute("SELECT COALESCE(SUM(total_qty), 0) as total_inward_qty FROM inward_batches")
            inward_res = cursor.fetchone() or {'total_inward_qty': 0}
            total_inward_qty = float(inward_res['total_inward_qty'])

            cursor.execute("SELECT COALESCE(SUM(dispatched_qty), 0) as total_dp_outward_qty FROM dispatch_plan_items")
            dp_out_res = cursor.fetchone() or {'total_dp_outward_qty': 0}
            total_dp_outward_qty = float(dp_out_res['total_dp_outward_qty'])

            variance_qty = round(total_inward_qty - total_dp_outward_qty, 2)

            # 2. Direct DP Items vs Store Fitting Kit Bag Fulfillment Rate (%)
            # Direct DP Items (Pipes / Bundles)
            cursor.execute("""
                SELECT 
                    COALESCE(SUM(planned_qty), 0) as total_planned,
                    COALESCE(SUM(dispatched_qty), 0) as total_dispatched
                FROM dispatch_plan_items
            """)
            dpi_res = cursor.fetchone() or {'total_planned': 0, 'total_dispatched': 0}
            direct_planned = float(dpi_res['total_planned'])
            direct_dispatched = float(dpi_res['total_dispatched'])
            direct_fulfillment_pct = round((direct_dispatched / direct_planned * 100), 2) if direct_planned > 0 else 100.0

            # Store Fitting Kit Bag
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_kits,
                    COALESCE(SUM(CASE WHEN status IN ('COMPLETED', 'DISPATCHED') THEN 1 ELSE 0 END), 0) as completed_kits
                FROM store_kits
            """)
            sk_res = cursor.fetchone() or {'total_kits': 0, 'completed_kits': 0}
            total_kits = int(sk_res['total_kits'])
            completed_kits = int(sk_res['completed_kits'])
            store_kit_fulfillment_pct = round((completed_kits / total_kits * 100), 2) if total_kits > 0 else 100.0

            # Overall Fulfillment Rate
            if direct_planned > 0 or total_kits > 0:
                overall_fulfillment_pct = round((direct_fulfillment_pct + store_kit_fulfillment_pct) / 2, 2)
            else:
                overall_fulfillment_pct = 100.0

            # 3. Non-DP Outward History & Grouped Breakdown
            cursor.execute("""
                SELECT 
                    COALESCE(NULLIF(REPLACE(issued_to, 'Non-DP: ', ''), ''), 'Internal Factory Use') as reason,
                    COUNT(*) as scan_count,
                    COALESCE(SUM(qty_issued), 0) as total_qty
                FROM outward_logs
                WHERE issued_to LIKE 'Non-DP:%' 
                   OR issued_to LIKE '%Testing%' 
                   OR issued_to LIKE '%Sample%' 
                   OR issued_to LIKE '%Scrap%' 
                   OR issued_to LIKE '%Damage%'
                GROUP BY reason
                ORDER BY total_qty DESC
            """)
            non_dp_reasons = cursor.fetchall() or []

            non_dp_reason_labels = [r['reason'] for r in non_dp_reasons]
            non_dp_reason_qtys = [float(r['total_qty']) for r in non_dp_reasons]

            # Detailed Non-DP Outward Recent History
            cursor.execute("""
                SELECT 
                    id, box_id, item_name, qty_issued, issued_to, scanned_by, 
                    DATE_FORMAT(outward_date, '%d %b %Y %h:%i %p') as formatted_date
                FROM outward_logs
                WHERE issued_to LIKE 'Non-DP:%' 
                   OR issued_to LIKE '%Testing%' 
                   OR issued_to LIKE '%Sample%' 
                   OR issued_to LIKE '%Scrap%' 
                   OR issued_to LIKE '%Damage%'
                ORDER BY outward_date DESC
                LIMIT 50
            """)
            non_dp_history = cursor.fetchall() or []

            total_non_dp_qty = sum([float(r['total_qty']) for r in non_dp_reasons])

            return {
                "status": "success",
                "stock_summary": {
                    "total_inward_qty": total_inward_qty,
                    "total_dp_outward_qty": total_dp_outward_qty,
                    "variance_qty": variance_qty
                },
                "fulfillment_summary": {
                    "direct_pipes": {
                        "planned_qty": direct_planned,
                        "dispatched_qty": direct_dispatched,
                        "fulfillment_rate_pct": direct_fulfillment_pct
                    },
                    "store_kits": {
                        "total_kits": total_kits,
                        "completed_kits": completed_kits,
                        "fulfillment_rate_pct": store_kit_fulfillment_pct
                    },
                    "overall_fulfillment_rate_pct": overall_fulfillment_pct
                },
                "non_dp_summary": {
                    "total_non_dp_qty": total_non_dp_qty,
                    "reason_labels": non_dp_reason_labels,
                    "reason_qtys": non_dp_reason_qtys,
                    "history": non_dp_history
                }
            }
        except Exception as e:
            print(f"End-to-End Summary Error: {e}")
            return {
                "status": "error",
                "detail": str(e),
                "stock_summary": {"total_inward_qty": 0, "total_dp_outward_qty": 0, "variance_qty": 0},
                "fulfillment_summary": {
                    "direct_pipes": {"planned_qty": 0, "dispatched_qty": 0, "fulfillment_rate_pct": 100},
                    "store_kits": {"total_kits": 0, "completed_kits": 0, "fulfillment_rate_pct": 100},
                    "overall_fulfillment_rate_pct": 100
                },
                "non_dp_summary": {"total_non_dp_qty": 0, "reason_labels": [], "reason_qtys": [], "history": []}
            }

# ===============================================
# ITEM MASTER APIs (NEW ADDITION)
# ===============================================

# A1. Single Item Add (Manual Form + Image Upload)
@app.post("/api/items/add")
def add_item(
    item_code: str = Form(...),
    item_name: str = Form(...),
    item_group: str = Form(""),
    hsn_code: str = Form(""),
    unit: str = Form("PCS"),
    rate: float = Form(0.0),
    is_outsource: bool = Form(False),
    image: UploadFile = File(None)
):
    image_path = ""
    if image:
        image_path = f"static/uploads/{image.filename}"
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)

    with get_db_ctx(commit=True) as (conn, cursor):
        try:
            is_own_val = 1 if (item_group == 'Own Production') else 0
            is_out_val = 1 if is_outsource else 0
            cursor.execute('''
                INSERT INTO items (item_code, item_name, item_group, hsn_code, unit, rate, image_url, is_own_production, is_outsource)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (item_code, item_name, item_group, hsn_code, unit, rate, image_path, is_own_val, is_out_val))
            add_log(conn, "ITEM_CREATE", f"New Item Added: {item_name} ({item_code})")
        except mysql.connector.Error as err:
            if err.errno == 1062: # Duplicate entry
                raise HTTPException(status_code=400, detail="Item Code already exists!")
            else:
                raise HTTPException(status_code=500, detail=f"Database error: {err}")
    
    return {"status": "Success", "message": "Item added successfully"}

# A2. Excel Sheet Bulk Import
@app.post("/api/items/upload-excel")
async def upload_excel(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx/.xls) are supported!")

    file_bytes = await file.read()
    header_row = find_excel_header_row(file_bytes)
    df = pd.read_excel(io.BytesIO(file_bytes), header=header_row)
    
    required_cols = ['item_code', 'item_name', 'item_group', 'hsn_code', 'unit', 'rate']
    for col in required_cols:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing required column '{col}' in Excel file!")

    imported_count = 0
    with get_db_ctx(commit=True) as (conn, cursor):
        for _, row in df.iterrows():
            try:
                grp = str(row['item_group']) if pd.notna(row['item_group']) else ''
                is_own = 1 if grp == 'Own Production' else 0
                is_out = 1 if ('is_outsource' in df.columns and pd.notna(row.get('is_outsource')) and str(row.get('is_outsource')).lower() in ('1', 'true', 'yes')) else 0
                cursor.execute('''
                    INSERT INTO items (item_code, item_name, item_group, hsn_code, unit, rate, image_url, is_own_production, is_outsource)
                    VALUES (%s, %s, %s, %s, %s, %s, '', %s, %s)
                ''', (str(row['item_code']), str(row['item_name']), grp, str(row['hsn_code']), str(row['unit']), float(row['rate']), is_own, is_out))
                imported_count += 1
            except mysql.connector.Error as err:
                if err.errno == 1062: # Duplicate entry
                    continue

        add_log(conn, "EXCEL_IMPORT", f"Imported total {imported_count} items from Excel.")

    return {"status": "Success", "message": f"{imported_count} items imported successfully!"}

# A3. List All Items with search & own_production filter
@app.get("/api/items/list")
def list_items(page: int = 1, limit: int = 500, exclude_own: bool = False, only_own: bool = False, search: str = "", group: str = "", exclude_outsource: bool = False, only_outsource: bool = False):
    """Retrieves list of items with search and own production / outsource filter."""
    with get_db_ctx() as (conn, cursor):
        where_clauses = []
        params = []
        
        if exclude_own:
            where_clauses.append("(is_own_production = 0 AND (item_group != 'Own Production' OR item_group IS NULL OR item_group = ''))")
        elif only_own:
            where_clauses.append("(is_own_production = 1 OR item_group = 'Own Production')")

        if exclude_outsource:
            where_clauses.append("(is_outsource = 0 OR is_outsource IS NULL)")
        elif only_outsource:
            where_clauses.append("is_outsource = 1")

        if group:
            where_clauses.append("item_group = %s")
            params.append(group)

        if search:
            where_clauses.append("(item_name LIKE %s OR item_code LIKE %s OR item_group LIKE %s)")
            s_param = f"%{search}%"
            params.extend([s_param, s_param, s_param])

        where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        # 1. Total Count Query for pagination
        count_sql = "SELECT COUNT(*) as total FROM items" + where_sql
        cursor.execute(count_sql, params)
        total_items = cursor.fetchone()['total']

        # 2. Get unique item groups list for filter dropdown
        cursor.execute("SELECT DISTINCT item_group FROM items WHERE item_group IS NOT NULL AND item_group != '' ORDER BY item_group")
        groups = [r['item_group'] for r in cursor.fetchall()]

        # 3. Paginated items Query
        query = "SELECT * FROM items" + where_sql + " ORDER BY id DESC"
        exec_params = list(params)
        if limit and limit > 0:
            offset = max(0, (page - 1) * limit)
            query += " LIMIT %s OFFSET %s"
            exec_params.extend([limit, offset])
            
        cursor.execute(query, exec_params)
        items = cursor.fetchall()
        
    return {
        "status": "Success", 
        "items": items,
        "groups": groups,
        "total_items": total_items,
        "page": page,
        "limit": limit
    }

# A4. Update Item
@app.put("/api/items/update/{item_id}")
def update_item(
    item_id: int,
    item_name: str = Form(...),
    item_group: str = Form(""),
    hsn_code: str = Form(""),
    unit: str = Form("PCS"),
    rate: float = Form(0.0),
    is_own_production: bool = Form(False),
    is_outsource: bool = Form(False)
):
    """Updates item details."""
    is_own_val = 1 if (is_own_production or item_group == 'Own Production') else 0
    is_out_val = 1 if is_outsource else 0
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute('''
            UPDATE items 
            SET item_name=%s, item_group=%s, hsn_code=%s, unit=%s, rate=%s, is_own_production=%s, is_outsource=%s
            WHERE id=%s
        ''', (item_name, item_group, hsn_code, unit, rate, is_own_val, is_out_val, item_id))
        add_log(conn, "ITEM_UPDATE", f"Item updated: ID #{item_id} ({item_name})")
    return {"status": "Success", "message": "Item updated successfully"}

# A5. Toggle Own Production Status for Single Item
@app.post("/api/items/toggle-own/{item_id}")
def toggle_own_production(item_id: int):
    """Toggles Own Production flag for a specific item."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT is_own_production, item_group, item_name FROM items WHERE id = %s", (item_id,))
        item = cursor.fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        curr_is_own = bool(item['is_own_production'] or item['item_group'] == 'Own Production')
        new_status = 0 if curr_is_own else 1
        new_group = 'Own Production' if new_status == 1 else ('General' if item['item_group'] == 'Own Production' else item['item_group'])

        cursor.execute("UPDATE items SET is_own_production = %s, item_group = %s WHERE id = %s", (new_status, new_group, item_id))
        add_log(conn, "ITEM_OWN_TOGGLE", f"Item #{item_id} ({item['item_name']}) Own Production status set to {new_status}")
    return {"status": "Success", "is_own_production": new_status, "item_group": new_group}

# A6.1 Toggle Outsourced Status for Single Item
@app.post("/api/items/toggle-outsourced/{item_id}")
def toggle_outsourced(item_id: int):
    """Toggles Outsourced flag for a specific item."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT is_outsource, item_name FROM items WHERE id = %s", (item_id,))
        item = cursor.fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        curr_is_out = bool(item['is_outsource'])
        new_status = 0 if curr_is_out else 1

        cursor.execute("UPDATE items SET is_outsource = %s WHERE id = %s", (new_status, item_id))
        add_log(conn, "ITEM_OUTSOURCE_TOGGLE", f"Item #{item_id} ({item['item_name']}) Outsourced status set to {new_status}")
    return {"status": "Success", "is_outsource": new_status}

# A6.2 Bulk Update Outsourced Flag by Group
@app.post("/api/items/bulk-outsourced-by-group")
def bulk_outsourced_by_group(group_name: str = Form(...), is_out: bool = Form(True)):
    """Bulk updates Outsourced [Yes / No] flag for an entire Item Group."""
    out_val = 1 if is_out else 0
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("UPDATE items SET is_outsource = %s WHERE item_group = %s", (out_val, group_name))
        affected = cursor.rowcount
        add_log(conn, "ITEM_BULK_OUTSOURCE", f"Group '{group_name}' items ({affected}) updated Outsourced to {out_val}")
    return {"status": "Success", "affected_items": affected}

# A6. Bulk Update Group to Own Production
@app.post("/api/items/bulk-own-by-group")
def bulk_own_by_group(group_name: str = Form(...), is_own: bool = Form(True)):
    """Bulk updates Own Production [Yes / No] flag for an entire Item Group."""
    own_val = 1 if is_own else 0
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("UPDATE items SET is_own_production = %s WHERE item_group = %s", (own_val, group_name))
        affected = cursor.rowcount
        add_log(conn, "ITEM_BULK_OWN", f"Group '{group_name}' items ({affected}) updated Own Production to {own_val}")
    return {"status": "Success", "affected_items": affected}

# A7. Delete Item
@app.delete("/api/items/delete/{item_id}")
def delete_item(item_id: int):
    """Deletes an item."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("DELETE FROM items WHERE id=%s", (item_id,))
    return {"status": "Success", "message": "Item deleted successfully"}

# ===============================================
# QC APPROVAL APIs (For Future Outsourced Items)
# ===============================================

class QcApprovalRequest(BaseModel):
    item_name: str
    item_code: Optional[str] = ""
    qty: float
    supplier_or_party: Optional[str] = "N/A"
    remark: Optional[str] = ""

class QcApprovalAction(BaseModel):
    approved_by: str = "QC Manager"

@app.post("/api/qc/request")
def create_qc_request(req: QcApprovalRequest):
    """Creates a QC approval request for an item (future use for outsourced items)."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute('''
            INSERT INTO qc_approvals (item_name, item_code, qty, supplier_or_party, remark, status)
            VALUES (%s, %s, %s, %s, %s, 'PENDING_QC')
        ''', (req.item_name, req.item_code, req.qty, req.supplier_or_party, req.remark))
        qc_id = cursor.lastrowid
        add_log(conn, "QC_REQUEST", f"QC Approval requested: {req.item_name} ({req.item_code}) | Qty: {req.qty} | Supplier: {req.supplier_or_party}")
    return {"status": "Success", "message": "QC approval request created.", "qc_id": qc_id}

@app.post("/api/qc/approve/{qc_id}")
def approve_qc_request(qc_id: int, req: QcApprovalAction):
    """Approves a pending QC request and adds item to store inventory."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT * FROM qc_approvals WHERE id = %s", (qc_id,))
        qc = cursor.fetchone()
        if not qc:
            raise HTTPException(status_code=404, detail="QC request not found!")
        if qc['status'] != 'PENDING_QC':
            raise HTTPException(status_code=400, detail=f"This QC request is already {qc['status']}!")

        cursor.execute('''
            UPDATE qc_approvals 
            SET status = 'APPROVED', approved_by = %s, approved_at = NOW()
            WHERE id = %s
        ''', (req.approved_by, qc_id))

        item_name = qc['item_name']
        qty = float(qc['qty'])
        supplier = qc['supplier_or_party'] or 'QC Approved Supplier'
        remark = f"QC Approved by {req.approved_by} | {qc['remark'] or ''}"

        cursor.execute('''
            INSERT INTO inward_batches (item_name, total_boxes, total_qty, supplier_or_party, remark)
            VALUES (%s, 1, %s, %s, %s)
        ''', (item_name, int(qty), supplier, remark))
        batch_id = cursor.lastrowid

        # Look up item_code for meaningful box ID
        cursor.execute("SELECT item_code FROM items WHERE item_name = %s", (item_name,))
        item_row = cursor.fetchone()
        item_code = item_row['item_code'] if item_row else item_name
        abbrev = ''.join(c for c in item_code.upper() if c.isalnum())[:20]
        date_suffix = datetime.now().strftime('%y%m%d')

        cursor.execute("SELECT COUNT(*) as cnt FROM boxes WHERE item_name = %s AND DATE(created_at) = CURDATE()", (item_name,))
        existing_count = cursor.fetchone()['cnt'] or 0

        box_id = f"BOX-{abbrev}-{date_suffix}-{existing_count + 1:03d}"
        cursor.execute('''
            INSERT INTO boxes (box_id, batch_id, item_name, qty_in_box, supplier_or_party, status)
            VALUES (%s, %s, %s, %s, %s, 'IN_STORE')
        ''', (box_id, batch_id, item_name, int(qty), supplier))

        add_log(conn, "QC_APPROVED", f"QC Request #{qc_id} approved by {req.approved_by}: {item_name} | Qty: {qty} added to store as {box_id}")
    return {"status": "Success", "message": f"QC approved! Item added to store as {box_id}.", "box_id": box_id, "batch_id": batch_id}

@app.post("/api/qc/reject/{qc_id}")
def reject_qc_request(qc_id: int, req: QcApprovalAction):
    """Rejects a pending QC request."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT * FROM qc_approvals WHERE id = %s", (qc_id,))
        qc = cursor.fetchone()
        if not qc:
            raise HTTPException(status_code=404, detail="QC request not found!")
        if qc['status'] != 'PENDING_QC':
            raise HTTPException(status_code=400, detail=f"This QC request is already {qc['status']}!")

        cursor.execute('''
            UPDATE qc_approvals 
            SET status = 'REJECTED', approved_by = %s, approved_at = NOW()
            WHERE id = %s
        ''', (req.approved_by, qc_id))
        add_log(conn, "QC_REJECTED", f"QC Request #{qc_id} rejected by {req.approved_by}: {qc['item_name']}")
    return {"status": "Success", "message": "QC request rejected."}

@app.get("/api/qc/pending")
def get_pending_qc():
    """Retrieves all pending QC approvals."""
    with get_db_ctx() as (conn, cursor):
        cursor.execute("SELECT * FROM qc_approvals WHERE status = 'PENDING_QC' ORDER BY id DESC")
        pending = cursor.fetchall()
        return {"status": "Success", "pending": pending, "count": len(pending)}

@app.get("/api/qc/list")
def list_qc_approvals(status: Optional[str] = None):
    """Retrieves QC approval history, optionally filtered by status."""
    with get_db_ctx() as (conn, cursor):
        if status:
            cursor.execute("SELECT * FROM qc_approvals WHERE status = %s ORDER BY id DESC LIMIT 200", (status,))
        else:
            cursor.execute("SELECT * FROM qc_approvals ORDER BY id DESC LIMIT 200")
        approvals = cursor.fetchall()
        return {"status": "Success", "approvals": approvals}

# A6. Get Single Inward Batch for Editing
@app.get("/api/inward/batch/{batch_id}")
def get_inward_batch(batch_id: int):
    """Retrieves inward batch details by Batch ID."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, item_name, supplier_or_party, remark FROM inward_batches WHERE id = %s", (batch_id,))
    batch = cursor.fetchone()
    if not batch:
        conn.close()
        raise HTTPException(status_code=404, detail="Inward Batch ID not found!")
    conn.close()
    return {"status": "Success", "batch": batch}

# A7. Update Inward Batch
@app.put("/api/inward/update/{batch_id}")
def update_inward_batch(batch_id: int, data: InwardBatchUpdateRequest):
    """Updates Inward Batch details."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Update inward_batches table
        cursor.execute(
            "UPDATE inward_batches SET item_name = %s, supplier_or_party = %s, remark = %s WHERE id = %s",
            (data.item_name, data.supplier_or_party, data.remark, batch_id)
        )
        # Also update the item_name and supplier in the boxes table for consistency
        cursor.execute(
            "UPDATE boxes SET item_name = %s, supplier_or_party = %s WHERE batch_id = %s",
            (data.item_name, data.supplier_or_party, batch_id)
        )
        conn.commit()
        add_log(conn, "INWARD_UPDATE", f"Inward Batch #{batch_id} updated.")
    except mysql.connector.Error as err:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {err}")
    finally:
        conn.close()
    
    return {"status": "Success", "message": f"Batch #{batch_id} updated successfully."}

# A8. Delete Inward Batch (+ associated boxes)
@app.delete("/api/inward/delete/{batch_id}")
def delete_inward_batch(batch_id: int):
    """Deletes an inward batch and its generated inventory boxes."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT * FROM inward_batches WHERE id = %s", (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            raise HTTPException(status_code=404, detail="Inward Batch ID not found!")
            
        cursor.execute("DELETE FROM boxes WHERE batch_id = %s", (batch_id,))
        cursor.execute("DELETE FROM inward_batches WHERE id = %s", (batch_id,))
        
        add_log(conn, "INWARD_DELETE", f"Inward Batch #{batch_id} ({batch['item_name']}) and its boxes were deleted.")
        
        if os.path.exists("inventory.db"):
            try:
                sq_conn = sqlite3.connect("inventory.db")
                sq_cur = sq_conn.cursor()
                sq_cur.execute("DELETE FROM boxes WHERE batch_id = ?", (batch_id,))
                sq_cur.execute("DELETE FROM inward_batches WHERE id = ?", (batch_id,))
                sq_conn.commit()
                sq_conn.close()
            except Exception:
                pass
                
        return {"status": "Success", "message": f"Inward Batch #{batch_id} ({batch['item_name']}) and all its boxes deleted successfully."}


# ===============================================
# INVENTORY APIs (EXISTING)
# ===============================================

# 1. Material IN (Inward + Auto Log)
@app.post("/api/inward")
async def material_inward(data: InwardRequest):
    with get_db_ctx(commit=True) as (conn, cursor):
        total_qty = data.total_boxes * data.qty_per_box
        
        cursor.execute(
            "INSERT INTO inward_batches (item_name, total_boxes, total_qty, supplier_or_party, remark) VALUES (%s, %s, %s, %s, %s)",
            (data.item_name, data.total_boxes, total_qty, data.supplier_or_party, data.remark)
        )
        batch_id = cursor.lastrowid
        
        # Look up item_code for meaningful box ID
        cursor.execute("SELECT item_code FROM items WHERE item_name = %s", (data.item_name,))
        item_row = cursor.fetchone()
        item_code = item_row['item_code'] if item_row else data.item_name
        
        # Create abbreviation: uppercase, remove special chars, max 20 chars
        abbrev = ''.join(c for c in item_code.upper() if c.isalnum())[:20]
        
        # Date suffix YYMMDD
        date_suffix = datetime.now().strftime('%y%m%d')
        
        # Count existing boxes for this item today to determine sequence
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM boxes 
            WHERE item_name = %s AND DATE(created_at) = CURDATE()
        """, (data.item_name,))
        existing_count = cursor.fetchone()['cnt'] or 0
        
        generated_boxes = []
        for i in range(1, data.total_boxes + 1):
            seq = existing_count + i
            box_id = f"BOX-{abbrev}-{date_suffix}-{seq:03d}"
            cursor.execute(
                "INSERT INTO boxes (box_id, batch_id, item_name, qty_in_box, location) VALUES (%s, %s, %s, %s, %s)",
                (box_id, batch_id, data.item_name, data.qty_per_box, data.location)
            )
            generated_boxes.append({
                "box_id": box_id,
                "item_name": data.item_name,
                "qty": data.qty_per_box,
                "supplier": data.supplier_or_party,
                "remark": data.remark
            })
            
        # 📌 Log Entry
        add_log(conn, "INWARD", f"Material received: {data.item_name} | {data.total_boxes} Boxes (Total Qty: {total_qty}) | Batch #{batch_id}")

        # 📢 Broadcast update to all connected clients
        await manager.broadcast("STOCK_UPDATED")

    return {
        "status": "Success",
        "batch_id": batch_id,
        "boxes": generated_boxes
    }

import re

def is_item_match(scanned_name: str, plan_item_name: str) -> bool:
    s1 = scanned_name.lower().strip()
    s2 = plan_item_name.lower().strip()
    if s1 in s2 or s2 in s1: return True
    nums1 = set(re.findall(r'\b\d+(?:mm|kg|cm2|x\d+)?\b', s1))
    nums2 = set(re.findall(r'\b\d+(?:mm|kg|cm2|x\d+)?\b', s2))
    if nums1 and nums2 and not nums1.issubset(nums2) and not nums2.issubset(nums1):
        return False
    w1 = set(re.findall(r'\w+', s1))
    w2 = set(re.findall(r'\w+', s2))
    return len(w1) > 0 and (len(w1.intersection(w2)) / len(w1)) >= 0.5

# 2. Material OUT / DISPATCH (Outward + Auto Log)
@app.post("/api/outward")
async def process_outward(req: OutwardRequest):
    # If DP Plan ID is provided and issued_to is empty, populate DP Plan details into issued_to
    if req.dispatch_plan_id and not req.issued_to:
        with get_db_ctx() as (conn, cursor):
            cursor.execute("SELECT plan_no, so_no FROM dispatch_plans WHERE id = %s", (req.dispatch_plan_id,))
            plan = cursor.fetchone()
            if plan:
                req.issued_to = f"DP: {plan['plan_no']} (SO: {plan['so_no']})"
    # Store Kit Outward Processing (1-Click Completion of all Fittings)
    if req.box_id.startswith("KIT-") or "KIT-" in req.box_id: # This part is async
        with get_db_ctx(commit=True) as (conn, cursor):
            cursor.execute("SELECT * FROM store_kits WHERE kit_code = %s", (req.box_id,))
            kit = cursor.fetchone()
            if not kit:
                raise HTTPException(status_code=404, detail=f"Store Kit QR Code '{req.box_id}' not found in store inventory!")
            if kit["status"] == 'DISPATCHED':
                raise HTTPException(status_code=400, detail="This Store Kit QR Code is already DISPATCHED!")

            cursor.execute("SELECT * FROM store_kit_items WHERE kit_code = %s", (req.box_id,))
            k_items = cursor.fetchall()

            for k_item in k_items:
                cursor.execute("""
                    UPDATE dispatch_verification 
                    SET scanned_qty = required_qty, status = 'COMPLETED' 
                    WHERE (so_number = %s OR dp_number = %s) AND item_name = %s
                """, (kit["so_number"], kit.get("dp_number", ""), k_item["item_name"]))

                if kit.get("dp_number"):
                    cursor.execute("""
                        UPDATE dp_plan_items 
                        SET dispatched_qty = planned_qty 
                        WHERE dp_number = %s AND item_name = %s
                    """, (kit["dp_number"], k_item["item_name"]))

                cursor.execute("""
                    UPDATE dispatch_plan_items 
                    SET dispatched_qty = planned_qty 
                    WHERE item_name = %s AND dispatch_plan_id IN (
                        SELECT id FROM dispatch_plans WHERE so_no = %s OR plan_no = %s
                    )
                """, (k_item["item_name"], kit["so_number"], kit.get("dp_number", "")))

            cursor.execute("UPDATE store_kits SET status = 'DISPATCHED' WHERE kit_code = %s", (req.box_id,))
            add_log(conn, "STORE_KIT_OUTWARD", f"Store Kit {req.box_id} (SO: {kit['so_number']}) scan outward complete. {len(k_items)} fittings COMPLETED.")

        # Sync with SQLite inventory.db
        if os.path.exists("inventory.db"):
            try:
                sq_conn = sqlite3.connect("inventory.db")
                sq_cursor = sq_conn.cursor()
                sq_cursor.execute("UPDATE store_kits SET status = 'DISPATCHED' WHERE kit_code = ?", (req.box_id,))
                for k_item in k_items:
                    sq_cursor.execute("UPDATE dispatch_verification SET scanned_qty = required_qty, status = 'COMPLETED' WHERE (so_number = ? OR dp_number = ?) AND item_name = ?", (kit["so_number"], kit.get("dp_number", ""), k_item["item_name"]))
                    if kit.get("dp_number"):
                        sq_cursor.execute("UPDATE dp_plan_items SET dispatched_qty = planned_qty WHERE dp_number = ? AND item_name = ?", (kit["dp_number"], k_item["item_name"]))
                sq_conn.commit()
                sq_conn.close()
            except Exception as e:
                print(f"[WARNING] SQLite Store Kit Outward Sync Error: {e}")

        # 📢 Broadcast update to all connected clients
        await manager.broadcast("STOCK_UPDATED")

        return {
            "status": "Success",
            "message": f"✅ Store Kit '{req.box_id}' auto-dispatched in 1-click! All {len(k_items)} fittings COMPLETED!",
            "kit_code": req.box_id,
            "completed_items_count": len(k_items),
            "completed_items": k_items
        }

    with get_db_ctx(commit=True) as (conn, cursor): # This part is sync
        cursor.execute("SELECT * FROM boxes WHERE box_id = %s", (req.box_id,))
        box = cursor.fetchone()
        
        if not box:
            raise HTTPException(status_code=404, detail="Box ID not found!")
            
        if box['status'] == 'OUT' or box['status'] == 'DISPATCHED' or box['qty_in_box'] <= 0:
            raise HTTPException(status_code=400, detail="This Box/Coil is empty or has already been DISPATCHED / OUT!")

        current_qty = box['qty_in_box']
        
        cursor.execute("SELECT unit FROM items WHERE item_name = %s", (box['item_name'],))
        itm = cursor.fetchone()
        unit = (itm['unit'] if (itm and itm.get('unit')) else '') or ('MTR' if (req.box_id.startswith('COIL-') or 'Pipe' in box['item_name']) else 'Pcs')

        # 📌 DP Plan Target Identification
        dp_target = req.dp_number or (str(req.dispatch_plan_id) if req.dispatch_plan_id else None)
        dp_item = None
        dpi_type = None  # 'dp_plan_items' or 'dispatch_plan_items'

        if dp_target:
            # 1. Search in dp_plan_items by dp_number
            cursor.execute("SELECT * FROM dp_plan_items WHERE dp_number = %s", (dp_target,))
            items1 = cursor.fetchall()
            for p in items1:
                if is_item_match(box['item_name'], p['item_name']):
                    dp_item = p
                    dpi_type = 'dp_plan_items'
                    break

            # 2. Search in dispatch_plan_items by dispatch_plan_id
            if not dp_item and req.dispatch_plan_id:
                try:
                    cursor.execute("SELECT * FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (int(req.dispatch_plan_id),))
                    items2 = cursor.fetchall()
                    for p in items2:
                        if is_item_match(box['item_name'], p['item_name']):
                            dp_item = p
                            dpi_type = 'dispatch_plan_items'
                            break
                except (ValueError, TypeError):
                    pass

            # 3. Search in dispatch_plan_items by plan_no
            if not dp_item:
                cursor.execute("""
                    SELECT dpi.* FROM dispatch_plan_items dpi
                    JOIN dispatch_plans dp ON dpi.dispatch_plan_id = dp.id
                    WHERE dp.plan_no = %s
                """, (dp_target,))
                items3 = cursor.fetchall()
                for p in items3:
                    if is_item_match(box['item_name'], p['item_name']):
                        dp_item = p
                        dpi_type = 'dispatch_plan_items'
                        break

            # Condition 1: Check if item exists in selected DP Plan
            if not dp_item:
                raise HTTPException(
                    status_code=400,
                    detail=f"❌ This item ('{box['item_name']}') is not in the selected Dispatch Plan ({dp_target}) list!"
                )

        if req.qty_issued > current_qty:
            raise HTTPException(
                status_code=400, 
                detail=f"Only {current_qty} {unit} remaining in box! Cannot issue {req.qty_issued}."
            )

        new_qty = current_qty - req.qty_issued
        new_status = 'DISPATCHED' if new_qty == 0 else 'IN_STORE'

        # Condition 3: Update Box status to DISPATCHED and associate dp_number
        cursor.execute("""
            UPDATE boxes 
            SET qty_in_box = %s, status = %s, dp_number = %s 
            WHERE box_id = %s
        """, (new_qty, new_status, dp_target, req.box_id))

        cursor.execute("""
            INSERT INTO outward_logs (box_id, item_name, qty_issued, issued_to, scanned_by)
            VALUES (%s, %s, %s, %s, %s)
        """, (req.box_id, box['item_name'], req.qty_issued, req.issued_to, req.scanned_by))

        # Condition 3: Atomically update dispatched_qty in dp_plan_items
        if dp_item:
            scanned_q = float(req.qty_issued)
            update_query = ""
            if dpi_type == 'dp_plan_items':
                update_query = "UPDATE dp_plan_items SET dispatched_qty = dispatched_qty + %s WHERE id = %s AND (dispatched_qty + %s) <= planned_qty"
            else:
                update_query = "UPDATE dispatch_plan_items SET dispatched_qty = dispatched_qty + %s WHERE id = %s AND (dispatched_qty + %s) <= planned_qty"

            cursor.execute(update_query, (scanned_q, dp_item['id'], scanned_q))
            
            if cursor.rowcount == 0:
                # The update failed, likely due to overdispatch.
                conn.rollback() # Rollback the outward log and box status update
                cursor.execute("SELECT planned_qty, dispatched_qty FROM {} WHERE id = %s".format(dpi_type), (dp_item['id'],))
                current_state = cursor.fetchone()
                planned_q = float(current_state['planned_qty'])
                disp_q = float(current_state['dispatched_qty'])
                rem_allowed = max(0.0, planned_q - disp_q)
                raise HTTPException(
                    status_code=400,
                    detail=f"⚠️ Overdispatch Warning! Approved quota is {planned_q} {unit}. Remaining allowance is {rem_allowed} {unit}."
                )

            # Check if the plan is now complete
            if dpi_type == 'dp_plan_items':
                cursor.execute("SELECT COUNT(*) as unfulfilled FROM dp_plan_items WHERE dp_number = %s AND dispatched_qty < planned_qty", (dp_item['dp_number'],))
                if cursor.fetchone()['unfulfilled'] == 0:
                    cursor.execute("UPDATE dp_plans SET status = 'COMPLETED' WHERE dp_number = %s", (dp_item['dp_number'],))
            else: # dispatch_plan_items
                cursor.execute("SELECT COUNT(*) as unfulfilled FROM dispatch_plan_items WHERE dispatch_plan_id = %s AND dispatched_qty < planned_qty", (dp_item['dispatch_plan_id'],))
                if cursor.fetchone()['unfulfilled'] == 0:
                    cursor.execute("UPDATE dispatch_plans SET status = 'COMPLETED' WHERE id = %s", (dp_item['dispatch_plan_id'],))


        # 📌 Sync with dispatch_verification for Direct Yard Pipes & Store Kit Items
        if dp_target or (dp_item and (dp_item.get('dp_number') or dp_item.get('dispatch_plan_id'))):
            target_dp = dp_target or (dp_item.get('dp_number') if dp_item else "")
            target_so = (dp_item.get('so_no') if dp_item and 'so_no' in dp_item else "") or target_dp
            
            cursor.execute("""
                UPDATE dispatch_verification 
                SET scanned_qty = LEAST(required_qty, scanned_qty + %s),
                    status = IF(scanned_qty + %s >= required_qty, 'COMPLETED', 'PENDING')
                WHERE (dp_number = %s OR so_number = %s OR dp_number IN (SELECT plan_no FROM dispatch_plans WHERE id = %s) OR so_number IN (SELECT so_no FROM dispatch_plans WHERE id = %s))
                AND (LOWER(item_name) = LOWER(%s) OR LOWER(%s) LIKE CONCAT('%%', LOWER(item_name), '%%') OR LOWER(item_name) LIKE CONCAT('%%', LOWER(%s), '%%'))
            """, (req.qty_issued, req.qty_issued, target_dp, target_so, req.dispatch_plan_id or 0, req.dispatch_plan_id or 0, box['item_name'], box['item_name'], box['item_name']))

        # 📌 Log Entry
        add_log(conn, "OUTWARD", f"Material issued (DISPATCHED): Box ID {req.box_id} ({box['item_name']}) | Qty: {req.qty_issued} {unit} | DP: {dp_target or 'N/A'}", user_name=req.scanned_by or "Store Keeper")

        # Get the final updated quantity for WebSocket broadcast
        updated_qty = 0
        if dp_item:
            cursor.execute(f"SELECT dispatched_qty FROM {dpi_type} WHERE id = %s", (dp_item['id'],))
            res = cursor.fetchone()
            if res:
                updated_qty = float(res['dispatched_qty'])

    # Sync with SQLite inventory.db
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute("UPDATE boxes SET qty_in_box = ?, status = ?, dp_number = ? WHERE box_id = ?", (new_qty, new_status, dp_target, req.box_id))
            if dp_item and dpi_type == 'dp_plan_items':
                sq_cursor.execute("UPDATE dp_plan_items SET dispatched_qty = dispatched_qty + ? WHERE id = ?", (float(req.qty_issued), dp_item['id']))
            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite sync error in outward: {e}")

    # 📢 Broadcast update to all connected clients
    if dp_item:
        await manager.broadcast(json.dumps({
            "event": "DP_PROGRESS_UPDATED",
            "dispatch_plan_id": dp_item.get('dispatch_plan_id') or req.dispatch_plan_id,
            "item_id": dp_item.get('id'),
            "item_name": dp_item.get('item_name'),
            "updated_qty": updated_qty
        }))
    else:
        await manager.broadcast(json.dumps({"event": "STOCK_UPDATED"}))

    status_msg = "Box/Coil fully DISPATCHED!" if new_status == 'DISPATCHED' else f"Box now has {new_qty} {unit} remaining."
    return {
        "status": "Success", 
        "message": f"✅ {req.qty_issued} {unit} dispatched! ({status_msg})", 
        "remaining_qty": new_qty,
        "unit": unit
    }


# 🏭 Non-DP Outward API (Testing, Sample, Scrap, Internal Use)
@app.post("/api/inventory/outward-non-dp")
async def process_non_dp_outward(req: NonDpOutwardRequest):
    qty = req.qty_issued if req.qty_issued and req.qty_issued > 0 else 1 # This part is sync
    reason_text = (req.reason or "Internal Use").strip()
    issued_to_text = (req.issued_to or "Internal Dept").strip()

    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT * FROM boxes WHERE box_id = %s", (req.box_id,))
        box = cursor.fetchone()
        
        if not box:
            raise HTTPException(status_code=404, detail=f"Box/Coil ID ({req.box_id}) not found in store!")
            
        if box['status'] in ['OUT', 'DISPATCHED', 'OUT_NON_DP'] or box['qty_in_box'] <= 0:
            raise HTTPException(status_code=400, detail="This Box/Coil is already OUT / DISPATCHED!")

        current_qty = float(box['qty_in_box'])
        if qty > current_qty:
            raise HTTPException(status_code=400, detail=f"Only {current_qty} remaining in box! Cannot issue {qty}.")

        new_qty = current_qty - qty
        new_status = 'OUT_NON_DP' if new_qty == 0 else 'IN_STORE'

        cursor.execute("""
            UPDATE boxes 
            SET qty_in_box = %s, status = %s 
            WHERE box_id = %s
        """, (new_qty, new_status, req.box_id))

        cursor.execute("""
            INSERT INTO outward_logs (box_id, item_name, qty_issued, issued_to, scanned_by)
            VALUES (%s, %s, %s, %s, %s)
        """, (req.box_id, box['item_name'], qty, f"NON_DP: {reason_text} ({issued_to_text})", req.scanned_by or "Store Keeper"))

        add_log(conn, "NON_DP_OUTWARD", f"Non-DP Outward: Box {req.box_id} ({box['item_name']}) | Qty: {qty} | Reason: {reason_text} | Issued To: {issued_to_text}", user_name=req.scanned_by or "Store Keeper")

    # Sync with SQLite inventory.db
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute("UPDATE boxes SET qty_in_box = ?, status = ? WHERE box_id = ?", (new_qty, new_status, req.box_id))
            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite non-DP outward sync error: {e}")

    # 📢 Broadcast update to all connected clients
    await manager.broadcast("STOCK_UPDATED")

    return {
        "status": "Success",
        "message": f"✅ Non-DP Outward successful! Box '{req.box_id}' status updated to '{new_status}' (Reason: {reason_text}).",
        "box_id": req.box_id,
        "item_name": box['item_name'],
        "reason": reason_text,
        "new_status": new_status,
        "remaining_qty": new_qty
    }


# 🚀 FIFO Outward API - Auto-selects oldest boxes for an item
@app.post("/api/outward/fifo")
async def process_fifo_outward(req: FifoOutwardRequest):
    """
    FIFO Outward: Automatically selects oldest available boxes for the given item.
    Useful for automatic dispatch where oldest stock should be used first.
    """
    if req.qty_issued <= 0:
        raise HTTPException(status_code=400, detail="Quantity issued must be greater than 0!")

    with get_db_ctx(commit=True) as (conn, cursor):
        # Find all available boxes for this item, ordered by oldest first (FIFO)
        cursor.execute("""
            SELECT * FROM boxes 
            WHERE item_name = %s AND status = 'IN_STORE' AND qty_in_box > 0 
            ORDER BY created_at ASC, box_id ASC
        """, (req.item_name,))
        available_boxes = cursor.fetchall()

        if not available_boxes:
            raise HTTPException(status_code=404, detail=f"No available stock found for item '{req.item_name}'!")

        # Calculate total available qty
        total_available = sum(float(b['qty_in_box']) for b in available_boxes)
        if total_available < req.qty_issued:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient stock! Available: {total_available}, Requested: {req.qty_issued}"
            )

        # FIFO: Distribute qty_issued across oldest boxes
        remaining_to_issue = float(req.qty_issued)
        updated_boxes = []
        dp_target = req.dp_number or (str(req.dispatch_plan_id) if req.dispatch_plan_id else None)

        for box in available_boxes:
            if remaining_to_issue <= 0:
                break

            box_qty = float(box['qty_in_box'])
            if box_qty <= 0:
                continue

            issue_from_this_box = min(box_qty, remaining_to_issue)
            new_qty = box_qty - issue_from_this_box
            new_status = 'DISPATCHED' if new_qty == 0 else 'IN_STORE'

            cursor.execute("""
                UPDATE boxes 
                SET qty_in_box = %s, status = %s, dp_number = %s 
                WHERE box_id = %s
            """, (new_qty, new_status, dp_target, box['box_id']))

            cursor.execute("""
                INSERT INTO outward_logs (box_id, item_name, qty_issued, issued_to, scanned_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (box['box_id'], box['item_name'], issue_from_this_box, req.issued_to, req.scanned_by or "Store Keeper"))

            updated_boxes.append({
                "box_id": box['box_id'],
                "issued_qty": issue_from_this_box,
                "remaining_qty": new_qty,
                "status": new_status
            })

            remaining_to_issue -= issue_from_this_box

        # Update DP plan dispatched_qty if applicable
        dp_item = None
        dpi_type = None
        if dp_target:
            cursor.execute("SELECT * FROM dp_plan_items WHERE dp_number = %s", (dp_target,))
            items1 = cursor.fetchall()
            for p in items1:
                if is_item_match(req.item_name, p['item_name']):
                    dp_item = p
                    dpi_type = 'dp_plan_items'
                    break

            if not dp_item and req.dispatch_plan_id:
                try:
                    cursor.execute("SELECT * FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (int(req.dispatch_plan_id),))
                    items2 = cursor.fetchall()
                    for p in items2:
                        if is_item_match(req.item_name, p['item_name']):
                            dp_item = p
                            dpi_type = 'dispatch_plan_items'
                            break
                except (ValueError, TypeError):
                    pass

            if dp_item:
                scanned_q = float(req.qty_issued)
                if dpi_type == 'dp_plan_items':
                    cursor.execute("UPDATE dp_plan_items SET dispatched_qty = dispatched_qty + %s WHERE id = %s AND (dispatched_qty + %s) <= planned_qty", (scanned_q, dp_item['id'], scanned_q))
                else:
                    cursor.execute("UPDATE dispatch_plan_items SET dispatched_qty = dispatched_qty + %s WHERE id = %s AND (dispatched_qty + %s) <= planned_qty", (scanned_q, dp_item['id'], scanned_q))

        add_log(conn, "FIFO_OUTWARD", f"FIFO Outward: {req.item_name} | Qty: {req.qty_issued} | Boxes used: {len(updated_boxes)} | DP: {dp_target or 'N/A'}", user_name=req.scanned_by or "Store Keeper")

    # Broadcast update
    await manager.broadcast("STOCK_UPDATED")

    return {
        "status": "Success",
        "message": f"✅ FIFO Outward successful! {req.qty_issued} units dispatched from {len(updated_boxes)} oldest box(es).",
        "item_name": req.item_name,
        "qty_issued": req.qty_issued,
        "boxes_used": updated_boxes,
        "dp_target": dp_target
    }


# 3. Stock Summary
@app.get("/api/stock")
def get_stock_summary():
    with get_db_ctx() as (conn, cursor):
        cursor.execute("""
            SELECT b.item_name, 
                   COUNT(b.box_id) as total_boxes, 
                   SUM(b.qty_in_box) as total_qty,
                   COALESCE(NULLIF(itm.unit, ''), IF(b.item_name LIKE '%%Pipe%%' OR b.item_name LIKE '%%Coil%%', 'MTR', 'Pcs')) as unit
            FROM boxes b
            LEFT JOIN items itm ON b.item_name = itm.item_name
            WHERE b.status = 'IN_STORE' 
            GROUP BY b.item_name, itm.unit
        """)
        stock = cursor.fetchall()
    return {"current_stock": stock}

# 4. Reports API (with Server-Side Pagination, Search & Item Filtering)
@app.get("/api/reports")
def get_reports(
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    item_filter: Optional[str] = None
):
    page = max(1, page)
    limit = max(1, min(limit, 200))
    offset = (page - 1) * limit

    with get_db_ctx() as (conn, cursor):
        # 1. Base WHERE conditions for Inward
        inward_where = []
        inward_params = []

        if item_filter:
            inward_where.append("b.item_name = %s")
            inward_params.append(item_filter)

        if search:
            search_pattern = f"%{search}%"
            inward_where.append("(b.box_id LIKE %s OR b.item_name LIKE %s OR b.supplier_or_party LIKE %s)")
            inward_params.extend([search_pattern, search_pattern, search_pattern])

        inward_where_clause = ("WHERE " + " AND ".join(inward_where)) if inward_where else ""

        # Count Total Inward
        cursor.execute(f"SELECT COUNT(*) as total FROM boxes b {inward_where_clause}", tuple(inward_params))
        total_inward_row = cursor.fetchone()
        total_inward = total_inward_row['total'] if total_inward_row else 0

        # Fetch Inward Slice
        query_inward = f"""
            SELECT b.box_id, b.item_name, b.qty_in_box, b.status, b.created_at,
                   (b.qty_in_box + COALESCE(os.total_issued, 0)) as initial_qty,
                   COALESCE(ib.supplier_or_party, b.supplier_or_party, 'N/A') as supplier_or_party,
                   COALESCE(ib.remark, 'N/A') as remark,
                   COALESCE(NULLIF(pl.bundle_unit, ''), NULLIF(itm.unit, ''), 'PCS') as unit
            FROM boxes b
            LEFT JOIN (
                SELECT box_id, SUM(qty_issued) as total_issued 
                FROM outward_logs 
                GROUP BY box_id
            ) os ON b.box_id = os.box_id
            LEFT JOIN inward_batches ib ON b.batch_id = ib.id
            LEFT JOIN production_logs pl ON b.box_id = pl.qr_code
            LEFT JOIN items itm ON b.item_name = itm.item_name
            {inward_where_clause}
            ORDER BY b.created_at DESC 
            LIMIT %s OFFSET %s
        """
        cursor.execute(query_inward, tuple(inward_params + [limit, offset]))
        inward_history = cursor.fetchall()

        # 2. Base WHERE conditions for Outward
        outward_where = []
        outward_params = []

        if item_filter:
            outward_where.append("ol.item_name = %s")
            outward_params.append(item_filter)

        if search:
            search_pattern = f"%{search}%"
            outward_where.append("(ol.box_id LIKE %s OR ol.item_name LIKE %s OR ol.issued_to LIKE %s)")
            outward_params.extend([search_pattern, search_pattern, search_pattern])

        outward_where_clause = ("WHERE " + " AND ".join(outward_where)) if outward_where else ""

        # Count Total Outward
        cursor.execute(f"SELECT COUNT(*) as total FROM outward_logs ol {outward_where_clause}", tuple(outward_params))
        total_outward_row = cursor.fetchone()
        total_outward = total_outward_row['total'] if total_outward_row else 0

        # Fetch Outward Slice
        query_outward = f"""
            SELECT ol.*,
                   COALESCE(NULLIF(pl.bundle_unit, ''), NULLIF(itm.unit, ''), 'PCS') as unit
            FROM outward_logs ol
            LEFT JOIN production_logs pl ON ol.box_id = pl.qr_code
            LEFT JOIN items itm ON ol.item_name = itm.item_name
            {outward_where_clause}
            ORDER BY ol.outward_date DESC 
            LIMIT %s OFFSET %s
        """
        cursor.execute(query_outward, tuple(outward_params + [limit, offset]))
        outward_history = cursor.fetchall()

    total_inward_pages = max(1, (total_inward + limit - 1) // limit)
    total_outward_pages = max(1, (total_outward + limit - 1) // limit)

    return {
        "inward_history": inward_history,
        "outward_history": outward_history,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_inward": total_inward,
            "total_outward": total_outward,
            "total_inward_pages": total_inward_pages,
            "total_outward_pages": total_outward_pages
        }
    }

# 5. Audit Logs / Log Book API
@app.get("/api/logs")
def get_logs():
    with get_db_ctx() as (conn, cursor):
        cursor.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 300")
        logs = cursor.fetchall()
    return {"logs": logs}

# 6. Batch Reprint
@app.get("/api/reprint-batch/{batch_id}")
def reprint_batch_qrs(batch_id: int):
    with get_db_ctx() as (conn, cursor):
        cursor.execute("SELECT box_id, item_name, qty_in_box FROM boxes WHERE batch_id = %s", (batch_id,))
        boxes = cursor.fetchall()
    
    if not boxes:
        raise HTTPException(status_code=404, detail="No boxes found for this Batch ID!")
        
    return {"status": "Success", "boxes": boxes}

# 7. Check Box Status & DP Plan Item Pre-Validation
@app.get("/api/check-box/{box_id}")
def check_box_status(box_id: str, dp_number: Optional[str] = None, dispatch_plan_id: Optional[Union[int, str]] = None):
    # Store Kit QR Code Check
    if box_id.startswith("KIT-") or "KIT-" in box_id:
        with get_db_ctx() as (conn, cursor):
            cursor.execute("SELECT * FROM store_kits WHERE kit_code = %s", (box_id,))
            kit = cursor.fetchone()
            if kit:
                if kit["status"] == 'DISPATCHED':
                    raise HTTPException(status_code=400, detail="This Store Kit QR Code is already DISPATCHED!")
                cursor.execute("SELECT * FROM store_kit_items WHERE kit_code = %s", (box_id,))
                k_items = cursor.fetchall()
                return {
                    "box_id": kit["kit_code"],
                    "item_name": f"Store Kit ({kit['so_number']}) - {kit['total_items_count']} Fittings",
                    "qty": kit["total_items_count"],
                    "unit": "Kits",
                    "status": kit["status"],
                    "is_store_kit": True,
                    "items": k_items
                }

    with get_db_ctx() as (conn, cursor):
        cursor.execute("""
            SELECT b.box_id, b.item_name, b.qty_in_box, b.status,
                   COALESCE(NULLIF(itm.unit, ''), IF(b.box_id LIKE 'COIL-%%' OR b.item_name LIKE '%%Pipe%%', 'MTR', 'Pcs')) as unit
            FROM boxes b
            LEFT JOIN items itm ON b.item_name = itm.item_name
            WHERE b.box_id = %s
        """, (box_id,))
        box = cursor.fetchone()
    
    if not box:
        raise HTTPException(status_code=404, detail="This Box/Coil/Store Kit ID was not found in store inventory!")
    if box["status"] == 'OUT' or box["status"] == 'DISPATCHED':
        raise HTTPException(status_code=400, detail="This Box/Coil has already been DISPATCHED / ISSUED OUT!")

    dp_target = dp_number or (str(dispatch_plan_id) if dispatch_plan_id else None)
    if dp_target:
        with get_db_ctx() as (conn, cursor):
            dpi_items = []
            cursor.execute("SELECT * FROM dp_plan_items WHERE dp_number = %s", (dp_target,))
            dpi_items = cursor.fetchall()
            
            if not dpi_items and dispatch_plan_id:
                try:
                    cursor.execute("SELECT * FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (int(dispatch_plan_id),))
                    dpi_items = cursor.fetchall()
                except (ValueError, TypeError):
                    pass

            if not dpi_items:
                cursor.execute("""
                    SELECT dpi.* FROM dispatch_plan_items dpi
                    JOIN dispatch_plans dp ON dpi.dispatch_plan_id = dp.id
                    WHERE dp.plan_no = %s
                """, (dp_target,))
                dpi_items = cursor.fetchall()

            if dpi_items:
                matched_item = None
                for p_item in dpi_items:
                    if is_item_match(box['item_name'], p_item['item_name']):
                        matched_item = p_item
                        break

                if not matched_item:
                    raise HTTPException(
                        status_code=400,
                        detail=f"❌ This item ('{box['item_name']}') is not in the selected Dispatch Plan ({dp_target}) list!"
                    )

                planned_q = float(matched_item['planned_qty'])
                disp_q = float(matched_item['dispatched_qty'])
                if disp_q >= planned_q:
                    raise HTTPException(
                        status_code=400,
                        detail=f"⚠️ Overdispatch Warning! This item ('{box['item_name']}') planned quantity ({planned_q} {box['unit']}) is already fully dispatched!"
                    )

    return {
        "status": "Success",
        "item_name": box["item_name"],
        "qty": box["qty_in_box"],
        "unit": box["unit"]
    }

# 8. Search QR Codes
@app.get("/api/search-qrs")
def search_qrs(
    search_date: Optional[str] = None, 
    batch_id: Optional[str] = None, 
    item_name: Optional[str] = None,
    q: Optional[str] = None,
    supplier_only: bool = False
):
    query = """
        SELECT b.box_id, b.item_name, b.qty_in_box, b.status, b.created_at, b.batch_id,
               COALESCE(ib.supplier_or_party, 'N/A') as supplier_or_party,
               COALESCE(ib.remark, 'N/A') as remark,
               COALESCE(NULLIF(itm.unit, ''), IF(b.box_id LIKE 'COIL-%%' OR b.item_name LIKE '%%Pipe%%', 'MTR', 'Pcs')) as unit,
               pl.machine_name, pl.pipe_type, pl.pipe_size, pl.coil_length_meters, pl.coil_weight_kg, pl.shift_operator
        FROM boxes b
        LEFT JOIN inward_batches ib ON b.batch_id = ib.id
        LEFT JOIN items itm ON b.item_name = itm.item_name
        LEFT JOIN production_logs pl ON b.box_id = pl.qr_code
        WHERE 1=1
    """
    params = []

    # The inward screen must show only supplier-received boxes, never production coils.
    if supplier_only:
        query += " AND b.box_id NOT LIKE 'COIL-%%' AND pl.qr_code IS NULL"
    
    if q:
        query += " AND (b.box_id LIKE %s OR b.item_name LIKE %s OR CAST(b.batch_id AS CHAR) = %s OR ib.supplier_or_party LIKE %s)"
        pattern = f"%{q}%"
        params.extend([pattern, pattern, q, pattern])
        
    if search_date:
        query += " AND DATE(b.created_at) = DATE(%s)"
        params.append(search_date)
        
    if batch_id:
        query += " AND (b.batch_id = %s OR b.box_id LIKE %s)"
        params.extend([batch_id, f"%{batch_id}%"])
        
    if item_name:
        query += " AND b.item_name LIKE %s"
        params.append(f"%{item_name}%")
        
    query += " ORDER BY b.created_at DESC LIMIT 100"
    
    with get_db_ctx() as (conn, cursor):
        cursor.execute(query, params)
        boxes = cursor.fetchall()
        
    return {"status": "Success", "boxes": boxes}

# 9. Date-Wise Ledger
@app.get("/api/date-wise-stock")
def get_date_wise_stock(report_date: str):
    query = """
        WITH outward_sum AS (
            SELECT box_id, SUM(qty_issued) as total_issued
            FROM outward_logs
            GROUP BY box_id
        ),
        box_initial AS (
            SELECT b.item_name,
                   DATE(b.created_at) as created_date,
                   (b.qty_in_box + COALESCE(os.total_issued, 0)) as initial_qty
            FROM boxes b
            LEFT JOIN outward_sum os ON b.box_id = os.box_id
        ),
        item_in AS (
            SELECT item_name,
                   SUM(CASE WHEN created_date < DATE(%s) THEN initial_qty ELSE 0 END) as prev_in,
                   SUM(CASE WHEN created_date = DATE(%s) THEN initial_qty ELSE 0 END) as today_in
            FROM box_initial
            GROUP BY item_name
        ),
        item_out AS (
            SELECT item_name,
                   SUM(CASE WHEN DATE(outward_date) < DATE(%s) THEN qty_issued ELSE 0 END) as prev_out,
                   SUM(CASE WHEN DATE(outward_date) = DATE(%s) THEN qty_issued ELSE 0 END) as today_out
            FROM outward_logs
            GROUP BY item_name
        )
        SELECT i.item_name,
               COALESCE(
                   (SELECT pl.bundle_unit FROM production_logs pl WHERE pl.pipe_size = i.item_name OR CONCAT(pl.pipe_type, ' ', pl.pipe_size) = i.item_name OR pl.qr_code IN (SELECT b2.box_id FROM boxes b2 WHERE b2.item_name = i.item_name) ORDER BY pl.id DESC LIMIT 1),
                   NULLIF(itm.unit, ''),
                   'PCS'
               ) as unit,
               (COALESCE(b.prev_in, 0) - COALESCE(o.prev_out, 0)) as opening_qty,
               COALESCE(b.today_in, 0) as in_qty,
               COALESCE(o.today_out, 0) as out_qty,
               ((COALESCE(b.prev_in, 0) - COALESCE(o.prev_out, 0)) + COALESCE(b.today_in, 0) - COALESCE(o.today_out, 0)) as closing_qty
        FROM (
            SELECT item_name FROM boxes
            UNION
            SELECT item_name FROM outward_logs
        ) i
        LEFT JOIN items itm ON i.item_name = itm.item_name
        LEFT JOIN item_in b ON i.item_name = b.item_name
        LEFT JOIN item_out o ON i.item_name = o.item_name
        WHERE (COALESCE(b.prev_in, 0) - COALESCE(o.prev_out, 0)) > 0 
           OR COALESCE(b.today_in, 0) > 0 
           OR COALESCE(o.today_out, 0) > 0 
           OR ((COALESCE(b.prev_in, 0) - COALESCE(o.prev_out, 0)) + COALESCE(b.today_in, 0) - COALESCE(o.today_out, 0)) > 0
    """
    with get_db_ctx() as (conn, cursor):
        cursor.execute(query, (report_date, report_date, report_date, report_date,))
        report_data = cursor.fetchall()
    return {"date": report_date, "stock_ledger": report_data}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

# 10. Data Reset (+ Auto Log)
@app.get("/api/reset-all-data")
@app.delete("/api/reset-all-data")
def reset_all_data():
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
    except Exception:
        pass
    
    tables_to_clear = [
        "boxes",
        "inward_batches",
        "outward_logs",
        "production_logs",
        "dispatch_plan_items",
        "dispatch_plans",
        "store_kit_items",
        "store_kits",
        "challan_items",
        "delivery_challans",
        "activity_logs"
    ]
    
    for tbl in tables_to_clear:
        try:
            cursor.execute(f"TRUNCATE TABLE {tbl};")
        except Exception:
            try:
                cursor.execute(f"DELETE FROM {tbl};")
            except Exception as e:
                print(f"Reset error for {tbl}: {e}")
                
    try:
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")
    except Exception:
        pass
    
    add_log(conn, "RESET", "System factory reset executed: All operational stock, production, DP plans, challans and history cleared. Master Items preserved.")

    conn.commit()
    conn.close()
    
    # Sync with SQLite if present
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cur = sq_conn.cursor()
            for tbl in tables_to_clear:
                try:
                    sq_cur.execute(f"DELETE FROM {tbl};")
                except Exception:
                    pass
            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"SQLite reset error: {e}")
            
    return {"status": "Success", "message": "All operational stock, production logs, DP plans, store kits, challans, and transaction logs have been reset! Master Items catalog remains intact."}
    
# Item Master Protected Page Route
@app.get("/items-page")
def get_items_page():
    if not os.path.exists("items.html"):
        raise HTTPException(status_code=404, detail="items.html file not found!")
    return FileResponse("items.html")

# ===============================================
# MANUFACTURING & PRODUCTION APIs
# ===============================================

# 1. Get Machine List
@app.get("/api/machines")
@app.get("/api/machines/list")
def get_machines():
    """Retrieves list of machines."""
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM machines WHERE status='ACTIVE'")
        machines = cursor.fetchall()
        conn.close()
        return {"status": "Success", "machines": machines}
    except Exception as e:
        if os.path.exists("inventory.db"):
            try:
                sq_conn = sqlite3.connect("inventory.db")
                sq_conn.row_factory = sqlite3.Row
                sq_cursor = sq_conn.cursor()
                sq_cursor.execute("SELECT * FROM machines WHERE status='ACTIVE'")
                machines = [dict(row) for row in sq_cursor.fetchall()]
                sq_conn.close()
                return {"status": "Success", "machines": machines}
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))

# 1.5 Get Single Production Log for Editing
@app.get("/api/production/log/{qr_code}")
def get_production_log_by_qr(qr_code: str):
    """Retrieves production log details by QR Code."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM production_logs WHERE qr_code = %s", (qr_code,))
    log = cursor.fetchone()
    if not log:
        conn.close()
        raise HTTPException(status_code=404, detail="This QR Code/Coil ID was not found!")
    conn.close()
    return {"status": "Success", "log": log}

# 2. Add Machine
@app.post("/api/machines/add")
def add_machine(machine_name: Optional[str] = Form(None), req: Optional[MachineAddRequest] = None):
    """Adds a new machine."""
    m_name = machine_name or (req.machine_name if req else None)
    if not m_name or not m_name.strip():
        raise HTTPException(status_code=400, detail="Machine name is required!")
    
    m_name = m_name.strip()
    
    # 1. Save to MySQL
    with get_db_ctx(commit=True) as (conn, cursor):
        try:
            cursor.execute("INSERT INTO machines (machine_name) VALUES (%s)", (m_name,))
            add_log(conn, "MACHINE_ADD", f"New machine added: {m_name}")
        except mysql.connector.Error as err:
            if err.errno == 1062:
                raise HTTPException(status_code=400, detail="Machine already exists!")
            else:
                raise HTTPException(status_code=500, detail=f"Database error: {err}")

    # 2. Sync to SQLite
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute("INSERT OR IGNORE INTO machines (machine_name, status) VALUES (?, 'ACTIVE')", (m_name,))
            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite machine sync error: {e}")

    return {"status": "Success", "message": f"Machine '{m_name}' added successfully"}


# 2.5 Update & Delete Machine
@app.put("/api/machines/update/{machine_id}")
def update_machine(machine_id: int, machine_name: str = Form(...)):
    """Updates machine name.""" # This is for machine master, not production log
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("UPDATE machines SET machine_name = %s WHERE id = %s", (machine_name, machine_id))
        conn.commit()
        add_log(conn, "MACHINE_UPDATE", f"Machine updated: ID #{machine_id} -> {machine_name}")
    except mysql.connector.Error as err:
        conn.close()
        if err.errno == 1062:
            raise HTTPException(status_code=400, detail="A machine with this name already exists!")
        else:
            raise HTTPException(status_code=500, detail=f"Database error: {err}")
    conn.close()
    return {"status": "Success", "message": "Machine updated successfully"}

def format_production_item_name(pipe_type: str, pipe_size: str) -> str:
    p_type = (pipe_type or "").strip()
    p_size = (pipe_size or "").strip()
    if not p_type:
        return p_size
    if not p_size:
        return p_type
    if p_type.lower() in p_size.lower():
        return p_size
    return f"{p_type} {p_size}"

@app.put("/api/production/update/{log_id}")
def update_production_log(log_id: int, data: ProductionLogUpdateRequest):
    """Updates production log details."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT qr_code FROM production_logs WHERE id = %s", (log_id,))
        old_log = cursor.fetchone()
        if not old_log:
            raise HTTPException(status_code=404, detail="Production log not found.")
        
        old_qr_code = old_log['qr_code']

        # Update production_logs table
        cursor.execute("""
            UPDATE production_logs SET
                machine_name = %s, pipe_type = %s, pipe_size = %s,
                coil_length_meters = %s, coil_weight_kg = %s,
                raw_material_used_kg = %s, shift_operator = %s
            WHERE id = %s
        """, (
            data.machine_name, data.pipe_type, data.pipe_size,
            data.coil_length_meters, data.coil_weight_kg,
            data.raw_material_used_kg, data.shift_operator,
            log_id
        ))

        # Update corresponding entry in boxes table
        new_item_name = format_production_item_name(data.pipe_type, data.pipe_size)
        new_qty = int(data.coil_length_meters)
        party_name = f"Own Production ({data.machine_name})"
        remark_text = f"Operator: {data.shift_operator} | Wt: {data.coil_weight_kg}KG | RM: {data.raw_material_used_kg}KG"

        cursor.execute("SELECT batch_id FROM boxes WHERE box_id = %s", (old_qr_code,))
        b_res = cursor.fetchone()
        if b_res and b_res['batch_id'] and b_res['batch_id'] > 0:
            batch_id = b_res['batch_id']
            cursor.execute(
                "UPDATE inward_batches SET item_name = %s, total_qty = %s, supplier_or_party = %s, remark = %s WHERE id = %s",
                (new_item_name, new_qty, party_name, remark_text, batch_id)
            )

        cursor.execute(
            "UPDATE boxes SET item_name = %s, qty_in_box = %s, supplier_or_party = %s WHERE box_id = %s",
            (new_item_name, new_qty, party_name, old_qr_code)
        )

        add_log(conn, "PRODUCTION_UPDATE", f"Production Log #{log_id} ({old_qr_code}) updated.")

    return {"status": "Success", "message": "Production log successfully updated."}

@app.delete("/api/production/delete/{log_id}")
async def delete_production_log(log_id: int):
    """Deletes a production log, its corresponding inventory box, and inward batch."""
    batch_id_to_del = None
    qr_code = ""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT * FROM production_logs WHERE id = %s", (log_id,))
        log = cursor.fetchone()
        if not log:
            raise HTTPException(status_code=404, detail="Production Log not found or already deleted!")
            
        qr_code = log.get('qr_code') or ''
        
        if qr_code:
            cursor.execute("SELECT batch_id FROM boxes WHERE box_id = %s", (qr_code,))
            b_row = cursor.fetchone()
            if b_row and b_row.get('batch_id'):
                batch_id_to_del = b_row['batch_id']
            cursor.execute("DELETE FROM boxes WHERE box_id = %s", (qr_code,))
            
        if batch_id_to_del:
            cursor.execute("DELETE FROM inward_batches WHERE id = %s", (batch_id_to_del,))
            
        cursor.execute("DELETE FROM production_logs WHERE id = %s", (log_id,))
        
        add_log(conn, "PRODUCTION_DELETE", f"Production Entry #{log_id} ({qr_code}) was deleted.")
        
        if os.path.exists("inventory.db"):
            try:
                sq_conn = sqlite3.connect("inventory.db")
                sq_cur = sq_conn.cursor()
                if qr_code:
                    sq_cur.execute("DELETE FROM boxes WHERE box_id = ?", (qr_code,))
                if batch_id_to_del:
                    sq_cur.execute("DELETE FROM inward_batches WHERE id = ?", (batch_id_to_del,))
                sq_cur.execute("DELETE FROM production_logs WHERE id = ?", (log_id,))
                sq_conn.commit()
                sq_conn.close()
            except Exception:
                pass

    try:
        await manager.broadcast("STOCK_UPDATED")
    except Exception:
        pass
                
    return {"status": "Success", "message": f"Production Entry #{log_id} deleted successfully."}

@app.delete("/api/machines/delete/{machine_id}")
def delete_machine(machine_id: int):
    """Deletes machine."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("DELETE FROM machines WHERE id = %s", (machine_id,))
        add_log(conn, "MACHINE_DELETE", f"Machine deleted: ID #{machine_id}")
    return {"status": "Success", "message": "Machine deleted successfully"}

# 3. Save Production Entry (Pending Approval or Direct Approved)
@app.post("/api/production/add")
async def add_production(req: ProductionEntryRequest):
    """Saves new production entry. Can be saved as PENDING_APPROVAL (draft/queue) or APPROVED directly."""
    with get_db_ctx(commit=True) as (conn, cursor):
        try:
            planned_val = float(req.planned_qty if (req.planned_qty and req.planned_qty > 0) else (req.coil_length_meters or 0))
            actual_val = float(req.actual_qty if (req.actual_qty and req.actual_qty > 0) else planned_val)
            bundle_unit = req.bundle_unit or "MTR"
            prefix = req.pipe_type[:3].upper().replace(" ", "") if req.pipe_type else "PRD"
            if not prefix:
                prefix = "PRD"

            # Strict Plan vs Actual: Default is ALWAYS PENDING_APPROVAL unless explicitly APPROVED
            if req.status != "APPROVED":
                cursor.execute('''
                    INSERT INTO production_logs 
                    (production_date, machine_name, pipe_type, pipe_size, planned_qty, actual_qty, bundle_unit, coil_length_meters, coil_weight_kg, raw_material_used_kg, shift_operator, qr_code, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, 'PENDING_APPROVAL')
                ''', (
                    req.production_date,
                    req.machine_name, req.pipe_type, req.pipe_size,
                    planned_val, actual_val, bundle_unit,
                    actual_val, req.coil_weight_kg or 0.0, req.raw_material_used_kg or 0.0,
                    req.shift_operator or "Operator"
                ))
                log_id = cursor.lastrowid
                add_log(conn, "PRODUCTION_PLAN", f"New production entry logged (Pending Approval): {req.pipe_type} {req.pipe_size} | Planned: {planned_val} {bundle_unit} | Machine: {req.machine_name}")
                return {
                    "status": "Success",
                    "message": "Production entry logged successfully in Pending Approval Queue. It will not be in Store Stock until approved.",
                    "log_id": log_id,
                    "is_approved": False
                }

            # Direct Approved Mode
            cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM production_logs")
            next_num = cursor.fetchone()['next_id']

            while True:
                qr_code = f"COIL-{prefix}-{next_num:05d}"
                cursor.execute("SELECT 1 FROM production_logs WHERE qr_code = %s", (qr_code,))
                if not cursor.fetchone():
                    cursor.execute("SELECT 1 FROM boxes WHERE box_id = %s", (qr_code,))
                    if not cursor.fetchone():
                        break
                next_num += 1

            cursor.execute('''
                INSERT INTO production_logs 
                (production_date, machine_name, pipe_type, pipe_size, planned_qty, actual_qty, bundle_unit, coil_length_meters, coil_weight_kg, raw_material_used_kg, shift_operator, qr_code, status, approved_by, approved_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'APPROVED', %s, NOW())
            ''', (
                req.production_date,
                 req.machine_name, req.pipe_type, req.pipe_size,
                planned_val, actual_val, bundle_unit,
                actual_val, req.coil_weight_kg or 0.0, req.raw_material_used_kg or 0.0,
                req.shift_operator or "Operator", qr_code, "System/Direct"
            ))
            log_id = cursor.lastrowid

            # Auto-ensure item exists in items master table
            item_full_name = format_production_item_name(req.pipe_type, req.pipe_size)
            party_name = f"Own Production ({req.machine_name})"
            remark_text = f"Operator: {req.shift_operator} | Qty: {actual_val} {bundle_unit}"
            coil_qty = int(actual_val)
            item_code_gen = f"ITM-{prefix}-{req.pipe_size.replace(' ', '')[:10]}"

            cursor.execute("SELECT id FROM items WHERE item_name = %s", (item_full_name,))
            if not cursor.fetchone():
                try:
                    cursor.execute('''
                        INSERT INTO items (item_code, item_name, item_group, hsn_code, unit, rate, image_url)
                        VALUES (%s, %s, 'Own Production', '', %s, 0, '')
                    ''', (item_code_gen, item_full_name, bundle_unit))
                except mysql.connector.Error:
                    pass

            # Insert into Inward Batches table
            cursor.execute('''
                INSERT INTO inward_batches (item_name, total_boxes, total_qty, supplier_or_party, remark)
                VALUES (%s, 1, %s, %s, %s)
            ''', (item_full_name, coil_qty, party_name, remark_text))
            batch_id = cursor.lastrowid

            # Insert into boxes table
            cursor.execute('''
                INSERT INTO boxes (box_id, batch_id, item_name, qty_in_box, supplier_or_party, status)
                VALUES (%s, %s, %s, %s, %s, 'IN_STORE')
            ''', (qr_code, batch_id, item_full_name, coil_qty, party_name))

            # BOM Consumption
            cursor.execute("SELECT id FROM items WHERE item_name = %s", (item_full_name,))
            finished_good_item = cursor.fetchone()
            if finished_good_item:
                finished_good_item_id = finished_good_item['id']
                cursor.execute("""
                    SELECT c.quantity, i.item_name
                    FROM bom_components c
                    JOIN boms b ON c.bom_id = b.id
                    JOIN items i ON c.component_item_id = i.id
                    WHERE b.finished_good_item_id = %s
                """, (finished_good_item_id,))
                components_to_consume = cursor.fetchall()
                if components_to_consume:
                    for comp in components_to_consume:
                        required_qty = float(comp['quantity'])
                        component_name = comp['item_name']
                        cursor.execute("SELECT box_id, qty_in_box FROM boxes WHERE item_name = %s AND status = 'IN_STORE' ORDER BY created_at ASC", (component_name,))
                        boxes_to_consume_from = cursor.fetchall()
                        qty_left_to_consume = required_qty
                        for box in boxes_to_consume_from:
                            if qty_left_to_consume <= 0: break
                            qty_in_this_box = float(box['qty_in_box'])
                            qty_to_take = min(qty_left_to_consume, qty_in_this_box)
                            cursor.execute("INSERT INTO outward_logs (box_id, item_name, qty_issued, issued_to, scanned_by) VALUES (%s, %s, %s, %s, %s)", (box['box_id'], component_name, qty_to_take, f"Prod of {qr_code}", "System"))
                            new_box_qty = qty_in_this_box - qty_to_take
                            new_status = 'OUT' if new_box_qty <= 0 else 'IN_STORE'
                            cursor.execute("UPDATE boxes SET qty_in_box = %s, status = %s WHERE box_id = %s", (new_box_qty, new_status, box['box_id']))
                            qty_left_to_consume -= qty_to_take

            add_log(conn, "PRODUCTION", f"New coil produced and entered in store (Batch #{batch_id}): {item_full_name} | Qty: {actual_val} {bundle_unit}")

            # SQLite sync
            if os.path.exists("inventory.db"):
                try:
                    sq_conn = sqlite3.connect("inventory.db")
                    sq_cursor = sq_conn.cursor()
                    sq_cursor.execute('''
                        INSERT OR IGNORE INTO production_logs 
                        (production_date, machine_name, pipe_type, pipe_size, coil_length_meters, coil_weight_kg, raw_material_used_kg, shift_operator, qr_code)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (req.machine_name, req.pipe_type, req.pipe_size, actual_val, req.coil_weight_kg or 0, req.raw_material_used_kg or 0, req.shift_operator, qr_code))
                    sq_cursor.execute('''
                        INSERT OR IGNORE INTO boxes (box_id, batch_id, item_name, qty_in_box, supplier_or_party, status)
                        VALUES (?, ?, ?, ?, ?, 'IN_STORE')
                    ''', (qr_code, batch_id, item_full_name, coil_qty, party_name))
                    sq_conn.commit()
                    sq_conn.close()
                except Exception:
                    pass

            await manager.broadcast("STOCK_UPDATED")

            return {
                "status": "Success",
                "message": "Production approved and stored in inventory.",
                "qr_code": qr_code,
                "batch_id": batch_id,
                "log_id": log_id,
                "is_approved": True,
                "details": req.dict()
            }

        except mysql.connector.Error as err:
            raise HTTPException(status_code=500, detail=f"Database error: {err}")

# 4. Get Pending Production Approvals (Queue)
@app.get("/api/production/pending")
def get_pending_production():
    """Retrieves all pending production entries waiting for approval."""
    with get_db_ctx(commit=False) as (conn, cursor):
        cursor.execute("""
            SELECT * FROM production_logs 
            WHERE status = 'PENDING_APPROVAL' 
            ORDER BY id DESC
        """)
        pending = cursor.fetchall()
        return {"status": "Success", "pending": pending, "count": len(pending)}

# 5. Approve Pending Production Entry
@app.post("/api/production/approve/{log_id}")
async def approve_production_entry(log_id: int, req: ProductionApprovalRequest):
    """Approves a pending production entry, enters it into store inventory and generates QR code."""
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT * FROM production_logs WHERE id = %s", (log_id,))
        log = cursor.fetchone()
        if not log:
            raise HTTPException(status_code=404, detail="Production entry not found.")

        if log.get('status') == 'APPROVED' and log.get('qr_code'):
            return {
                "status": "Success",
                "message": "Entry is already approved.",
                "qr_code": log.get('qr_code'),
                "log": log
            }

        pipe_type = log['pipe_type']
        pipe_size = log['pipe_size']
        machine_name = log['machine_name']
        operator_name = log.get('shift_operator', 'Operator')
        bundle_unit = log.get('bundle_unit') or 'MTR'
        
        # Determine final actual qty
        actual_val = float(req.actual_qty if (req.actual_qty is not None and req.actual_qty > 0) else (log.get('actual_qty') or log.get('planned_qty') or log.get('coil_length_meters') or 0))
        approver = req.approved_by or "Production Incharge"

        prefix = pipe_type[:3].upper().replace(" ", "") if pipe_type else "PRD"
        if not prefix:
            prefix = "PRD"

        # Generate Unique QR Code
        cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM production_logs")
        next_num = cursor.fetchone()['next_id']

        while True:
            qr_code = f"COIL-{prefix}-{next_num:05d}"
            cursor.execute("SELECT 1 FROM production_logs WHERE qr_code = %s", (qr_code,))
            if not cursor.fetchone():
                cursor.execute("SELECT 1 FROM boxes WHERE box_id = %s", (qr_code,))
                if not cursor.fetchone():
                    break
            next_num += 1

        # Update production log status to APPROVED
        cursor.execute("""
            UPDATE production_logs SET
                actual_qty = %s,
                coil_length_meters = %s,
                qr_code = %s,
                status = 'APPROVED',
                approved_by = %s,
                approved_at = NOW()
            WHERE id = %s
        """, (actual_val, actual_val, qr_code, approver, log_id))

        # Auto-ensure item exists in items master table
        item_full_name = format_production_item_name(pipe_type, pipe_size)
        party_name = f"Own Production ({machine_name})"
        remark_text = f"Operator: {operator_name} | Qty: {actual_val} {bundle_unit} | Approved by {approver}"
        coil_qty = int(actual_val)
        item_code_gen = f"ITM-{prefix}-{pipe_size.replace(' ', '')[:10]}"

        cursor.execute("SELECT id, unit FROM items WHERE item_name = %s", (item_full_name,))
        existing_item = cursor.fetchone()
        if not existing_item:
            try:
                cursor.execute('''
                    INSERT INTO items (item_code, item_name, item_group, hsn_code, unit, rate, image_url, is_own_production)
                    VALUES (%s, %s, 'Own Production', '', %s, 0, '', 1)
                ''', (item_code_gen, item_full_name, bundle_unit))
            except mysql.connector.Error:
                pass
        else:
            if bundle_unit:
                cursor.execute("UPDATE items SET unit = %s, is_own_production = 1 WHERE id = %s", (bundle_unit, existing_item['id']))

        # Insert into Inward Batches table
        cursor.execute('''
            INSERT INTO inward_batches (item_name, total_boxes, total_qty, supplier_or_party, remark)
            VALUES (%s, 1, %s, %s, %s)
        ''', (item_full_name, coil_qty, party_name, remark_text))
        batch_id = cursor.lastrowid

        # Insert into boxes table
        cursor.execute('''
            INSERT INTO boxes (box_id, batch_id, item_name, qty_in_box, supplier_or_party, status)
            VALUES (%s, %s, %s, %s, %s, 'IN_STORE')
        ''', (qr_code, batch_id, item_full_name, coil_qty, party_name))

        # BOM Consumption
        cursor.execute("SELECT id FROM items WHERE item_name = %s", (item_full_name,))
        finished_good_item = cursor.fetchone()
        if finished_good_item:
            finished_good_item_id = finished_good_item['id']
            cursor.execute("""
                SELECT c.quantity, i.item_name
                FROM bom_components c
                JOIN boms b ON c.bom_id = b.id
                JOIN items i ON c.component_item_id = i.id
                WHERE b.finished_good_item_id = %s
            """, (finished_good_item_id,))
            components_to_consume = cursor.fetchall()
            if components_to_consume:
                for comp in components_to_consume:
                    required_qty = float(comp['quantity'])
                    component_name = comp['item_name']
                    cursor.execute("SELECT box_id, qty_in_box FROM boxes WHERE item_name = %s AND status = 'IN_STORE' ORDER BY created_at ASC", (component_name,))
                    boxes_to_consume_from = cursor.fetchall()
                    qty_left_to_consume = required_qty
                    for box in boxes_to_consume_from:
                        if qty_left_to_consume <= 0: break
                        qty_in_this_box = float(box['qty_in_box'])
                        qty_to_take = min(qty_left_to_consume, qty_in_this_box)
                        cursor.execute("INSERT INTO outward_logs (box_id, item_name, qty_issued, issued_to, scanned_by) VALUES (%s, %s, %s, %s, %s)", (box['box_id'], component_name, qty_to_take, f"Prod of {qr_code}", "System"))
                        new_box_qty = qty_in_this_box - qty_to_take
                        new_status = 'OUT' if new_box_qty <= 0 else 'IN_STORE'
                        cursor.execute("UPDATE boxes SET qty_in_box = %s, status = %s WHERE box_id = %s", (new_box_qty, new_status, box['box_id']))
                        qty_left_to_consume -= qty_to_take

        add_log(conn, "PRODUCTION_APPROVED", f"Production Entry #{log_id} approved ({qr_code} - {item_full_name}): Qty {actual_val} {bundle_unit} entered into store.")

        # SQLite sync
        if os.path.exists("inventory.db"):
            try:
                sq_conn = sqlite3.connect("inventory.db")
                sq_cursor = sq_conn.cursor()
                sq_cursor.execute('''
                    INSERT OR IGNORE INTO boxes (box_id, batch_id, item_name, qty_in_box, supplier_or_party, status)
                    VALUES (?, ?, ?, ?, ?, 'IN_STORE')
                ''', (qr_code, batch_id, item_full_name, coil_qty, party_name))
                sq_conn.commit()
                sq_conn.close()
            except Exception:
                pass

        await manager.broadcast("STOCK_UPDATED")

        # Prepare response data
        log['qr_code'] = qr_code
        log['actual_qty'] = actual_val
        log['status'] = 'APPROVED'

        return {
            "status": "Success",
            "message": f"Production entry #{log_id} approved! Added to store inventory.",
            "qr_code": qr_code,
            "batch_id": batch_id,
            "log": log
        }

# 6. Plan vs Actual Analytics Summary
@app.get("/api/production/plan-vs-actual-summary")
def get_plan_vs_actual_summary():
    """Returns aggregated KPIs for Plan vs Actual production."""
    with get_db_ctx(commit=False) as (conn, cursor):
        cursor.execute("""
            SELECT 
                COUNT(*) as total_entries,
                COALESCE(SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END), 0) as pending_count,
                COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END), 0) as approved_count,
                COALESCE(SUM(planned_qty), 0) as total_planned_qty,
                COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN actual_qty ELSE 0 END), 0) as total_actual_qty
            FROM production_logs
        """)
        summary = cursor.fetchone() or {}
        
        total_entries = int(summary.get('total_entries') or 0)
        pending_count = int(summary.get('pending_count') or 0)
        approved_count = int(summary.get('approved_count') or 0)
        planned = float(summary.get('total_planned_qty') or 0.0)
        actual = float(summary.get('total_actual_qty') or 0.0)
        achievement_rate = round((actual / planned * 100), 1) if planned > 0 else 100.0

        return {
            "status": "Success",
            "summary": {
                "total_entries": total_entries,
                "pending_count": pending_count,
                "approved_count": approved_count,
                "total_planned_qty": planned,
                "total_actual_qty": actual,
                "achievement_rate": achievement_rate
            }
        }

# 7. Get Production Logs History (All or Approved)
@app.get("/api/production/logs")
def get_production_logs(status: Optional[str] = None):
    """Retrieves recent production logs (optionally filtered by status)."""
    with get_db_ctx(commit=False) as (conn, cursor):
        if status:
            cursor.execute("SELECT * FROM production_logs WHERE status = %s ORDER BY id DESC LIMIT 200", (status,))
        else:
            cursor.execute("SELECT * FROM production_logs ORDER BY id DESC LIMIT 200")
        logs = cursor.fetchall()
        return {"status": "Success", "logs": logs}

# -----------------------------------------------
# 🚚 Dispatch Plan PDF/Excel Parser & APIs
# -----------------------------------------------

try:
    import pymupdf as fitz
except ImportError:
    import fitz

def parse_dispatch_plan_bytes(file_bytes: bytes, filename: str):
    items = []
    plan_no = ""
    so_no = ""
    plan_date = ""
    
    if filename.lower().endswith(".pdf"):
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        reconstructed_lines = []

        for page in doc:
            text += page.get_text() + "\n"
            words = page.get_text("words")
            if words:
                lines_dict = {}
                for w in words:
                    y_bucket = round(w[1] / 3.5) * 3.5
                    if y_bucket not in lines_dict: lines_dict[y_bucket] = []
                    lines_dict[y_bucket].append(w)
                for y in sorted(lines_dict.keys()):
                    sorted_words = sorted(lines_dict[y], key=lambda w: w[0])
                    reconstructed_lines.append(" ".join(w[4] for w in sorted_words))
            
        m_plan = re.search(r"Disp\.?\s*Plan\s*No\.?\s*:\s*([^\n\r]+)", text, re.IGNORECASE)
        if m_plan:
            plan_no = m_plan.group(1).strip()
            
        m_so = re.search(r"SO\s*No\.?\s*:\s*([^,\n\r]+)", text, re.IGNORECASE)
        if m_so:
            so_no = m_so.group(1).strip()
            
        m_date = re.search(r"Disp\.?\s*Plan\s*Date\s*:\s*([^\n\r]+)", text, re.IGNORECASE)
        if m_date:
            plan_date = m_date.group(1).strip()
            
        # Strategy 1: Y-Coordinate Reconstructed Lines
        pattern_full = re.compile(r'^\s*(?:\d+\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z\.]+)\s+(\d+(?:\.\d+)?)\s*')
        pattern_flex = re.compile(r'^\s*(?:\d+\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z\.]+)\s*')

        for line in reconstructed_lines:
            l = line.strip()
            if not l or 'TOTAL' in l or 'Description' in l or 'Disp. Plan' in l or 'Page' in l or 'SO No' in l or 'Powered by' in l or 'Vehicle No' in l or 'Transporter' in l or 'No. Description' in l:
                continue
            m = pattern_full.match(l)
            if m:
                desc = re.sub(r'^\d+\s+', '', m.group(1).strip())
                items.append({
                    "item_name": desc,
                    "planned_qty": float(m.group(2)),
                    "unit": m.group(3).strip(),
                    "weight_per_pc": float(m.group(4))
                })
            else:
                m2 = pattern_flex.match(l)
                if m2:
                    desc = re.sub(r'^\d+\s+', '', m2.group(1).strip())
                    items.append({
                        "item_name": desc,
                        "planned_qty": float(m2.group(2)),
                        "unit": m2.group(3).strip(),
                        "weight_per_pc": 0.0
                    })

        # Strategy 2 Fallback: Sequential Token Stream
        if not items:
            raw_lines = [l.strip() for l in text.splitlines() if l.strip()]
            i = 0
            while i < len(raw_lines):
                l = raw_lines[i]
                if l.isdigit() and (i + 3) < len(raw_lines):
                    desc = raw_lines[i+1]
                    qty_s = raw_lines[i+2]
                    unit_s = raw_lines[i+3]
                    try:
                        # Basic validation to avoid parsing headers/footers or bad data
                        if 'description' in desc.lower() or 'total' in desc.lower() or not qty_s.replace('.','',1).isdigit():
                            i += 1
                            continue

                        q_val = float(qty_s)
                        # Check if unit is a valid unit (not a number or long text)
                        if unit_s.isalpha() and len(unit_s) < 7 and not desc.isdigit():
                            has_weight = (i + 4 < len(raw_lines) and raw_lines[i+4].replace('.','',1).isdigit())
                            wt_val = float(raw_lines[i+4]) if has_weight else 0.0
                            items.append({
                                "item_name": desc,
                                "planned_qty": q_val,
                                "unit": unit_s,
                                "weight_per_pc": wt_val
                            })
                            i += (5 if has_weight else 4)
                            continue
                    except (ValueError, IndexError):
                        pass
                i += 1
    elif filename.lower().endswith((".xlsx", ".xls")):
        try:
            header_row = find_excel_header_row(file_bytes)
            df = pd.read_excel(io.BytesIO(file_bytes), header=header_row)
        except Exception:
            df = pd.read_csv(io.BytesIO(file_bytes))

        df.columns = [str(c).strip() for c in df.columns]
        cols_lower = [str(c).strip().lower() for c in df.columns]
        
        so_col = next((c for c in df.columns if 'so' in c.lower() or 'order' in c.lower()), None)
        desc_col = next((c for c in df.columns if 'item' in c.lower() or 'desc' in c.lower() or 'product' in c.lower() or 'name' in c.lower()), None)
        qty_col = next((c for c in df.columns if 'qty' in c.lower() or 'disp' in c.lower() or 'quantity' in c.lower() or 'planned' in c.lower() or 'pend' in c.lower()), None)
        unit_col = next((c for c in df.columns if 'unit' in c.lower() or 'uom' in c.lower()), None)
        wt_col = next((c for c in df.columns if 'wt' in c.lower() or 'weight' in c.lower()), None)

        if so_col and not so_no:
            first_so = df[so_col].dropna().astype(str).tolist()
            if first_so:
                so_no = first_so[0].strip()
        
        if desc_col and qty_col:
            for _, row in df.iterrows():
                if pd.notna(row[desc_col]) and pd.notna(row[qty_col]):
                    raw_desc = str(row[desc_col]).strip()
                    if not raw_desc or 'total' in raw_desc.lower() or 'description' in raw_desc.lower():
                        continue
                    try:
                        raw_q_str = re.sub(r"[^\d\.]", "", str(row[qty_col]))
                        q_val = float(raw_q_str) if raw_q_str else 0.0
                    except Exception:
                        q_val = 0.0

                    if q_val <= 0:
                        continue

                    items.append({
                        "item_name": raw_desc,
                        "planned_qty": q_val,
                        "unit": str(row[unit_col]).strip() if unit_col and pd.notna(row[unit_col]) else "Pcs",
                        "weight_per_pc": float(row[wt_col]) if wt_col and pd.notna(row[wt_col]) and str(row[wt_col]).replace('.', '').isdigit() else 0.0
                    })

    if not plan_no:
        clean_name = os.path.splitext(filename)[0].replace(" ", "_")
        plan_no = f"DP-{clean_name}"
        
    return {
        "plan_no": plan_no,
        "so_no": so_no or "N/A",
        "plan_date": plan_date or "Today",
        "items": items
    }

# -----------------------------------------------
# PDFPlumber DP Plan PDF Parser & Endpoint
# -----------------------------------------------
def parse_dp_plan_pdf_bytes_pdfplumber(file_bytes: bytes, filename: str):
    dp_number = ""
    so_numbers = ""
    items = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        full_text = ""
        all_tables = []
        for page in pdf.pages:
            t = page.extract_text() or ""
            full_text += t + "\n"
            page_tables = page.extract_tables()
            if page_tables:
                all_tables.extend(page_tables)

        # Extract DP Plan No / Disp Plan No / DP No
        m_dp = re.search(r"(?:Disp\.?\s*Plan\s*No\.?|DP\s*Plan\s*No\.?|DP\s*No\.?|Plan\s*No\.?)\s*:\s*([^\n\r,]+)", full_text, re.IGNORECASE)
        if m_dp:
            dp_number = m_dp.group(1).strip()

        # Extract SO No / SO Numbers
        m_so = re.search(r"(?:SO\s*No\.?|SO\s*Numbers?|Sales\s*Order\s*No\.?)\s*:\s*([^\n\r]+)", full_text, re.IGNORECASE)
        if m_so:
            so_numbers = m_so.group(1).strip()

        # 1. Parse using pdfplumber extracted tables
        if all_tables:
            for tbl in all_tables:
                if not tbl or len(tbl) < 2:
                    continue
                header_idx = -1
                for idx, row in enumerate(tbl):
                    row_str = " ".join([str(c or "").lower() for c in row if c])
                    if 'description' in row_str or 'item' in row_str or 'qty' in row_str:
                        header_idx = idx
                        break

                if header_idx != -1:
                    headers = [str(c or "").strip().lower() for c in tbl[header_idx]]
                    desc_i = next((i for i, h in enumerate(headers) if 'desc' in h or 'item' in h or 'name' in h), None)
                    qty_i = next((i for i, h in enumerate(headers) if 'qty' in h or 'disp' in h or 'quantity' in h or 'planned' in h), None)
                    unit_i = next((i for i, h in enumerate(headers) if 'unit' in h or 'uom' in h), None)
                    wt_i = next((i for i, h in enumerate(headers) if 'wt' in h or 'weight' in h), None)

                    if desc_i is not None and qty_i is not None:
                        for row in tbl[header_idx + 1:]:
                            if not row or len(row) <= max(desc_i, qty_i):
                                continue
                            raw_desc = str(row[desc_i] or "").strip()
                            raw_qty = str(row[qty_i] or "").strip()
                            if not raw_desc or not raw_qty or 'total' in raw_desc.lower() or 'description' in raw_desc.lower():
                                continue
                            try:
                                clean_qty_str = re.sub(r"[^\d\.]", "", raw_qty)
                                if not clean_qty_str:
                                    continue
                                qty_val = float(clean_qty_str)
                            except ValueError:
                                continue

                            unit_val = str(row[unit_i] or "").strip() if unit_i is not None and len(row) > unit_i and row[unit_i] else "Pcs"
                            wt_val = 0.0
                            if wt_i is not None and len(row) > wt_i and row[wt_i]:
                                try:
                                    clean_wt = re.sub(r"[^\d\.]", "", str(row[wt_i]))
                                    wt_val = float(clean_wt) if clean_wt else 0.0
                                except ValueError:
                                    wt_val = 0.0

                            items.append({
                                "item_name": raw_desc,
                                "planned_qty": qty_val,
                                "unit": unit_val,
                                "weight_per_pc": wt_val
                            })

        # 2. Line-by-line regex parsing fallback
        if not items:
            pattern_full = re.compile(r'^\s*(?:\d+\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z\.]+)\s+(\d+(?:\.\d+)?)\s*')
            pattern_flex = re.compile(r'^\s*(?:\d+\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z\.]+)\s*')

            for line in full_text.splitlines():
                l = line.strip()
                if not l or 'TOTAL' in l or 'Description' in l or 'Disp. Plan' in l or 'Page' in l or 'SO No' in l or 'Vehicle No' in l or 'Transporter' in l:
                    continue
                m = pattern_full.match(l)
                if m:
                    desc = re.sub(r'^\d+\s+', '', m.group(1).strip())
                    items.append({
                        "item_name": desc,
                        "planned_qty": float(m.group(2)),
                        "unit": m.group(3).strip(),
                        "weight_per_pc": float(m.group(4))
                    })
                else:
                    m2 = pattern_flex.match(l)
                    if m2:
                        desc = re.sub(r'^\d+\s+', '', m2.group(1).strip())
                        items.append({
                            "item_name": desc,
                            "planned_qty": float(m2.group(2)),
                            "unit": m2.group(3).strip(),
                            "weight_per_pc": 0.0
                        })

    if not dp_number:
        clean_name = os.path.splitext(filename)[0].replace(" ", "_")
        dp_number = f"DP-{clean_name}"

    return {
        "dp_number": dp_number,
        "so_numbers": so_numbers or "N/A",
        "total_items": len(items),
        "items": items
    }

@app.post("/api/dp-plan/upload-pdf")
async def upload_dp_plan_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="⚠️ Only PDF (.pdf) files can be uploaded!")

    file_bytes = await file.read()
    try:
        parsed_data = parse_dp_plan_pdf_bytes_pdfplumber(file_bytes, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"⚠️ Error processing PDF: {str(e)}")

    if not parsed_data["items"]:
        raise HTTPException(status_code=400, detail="⚠️ No item records found in PDF! Please check the DP Plan file format.")

    dp_number = parsed_data["dp_number"]
    so_numbers = parsed_data["so_numbers"]
    total_items = parsed_data["total_items"]
    items = parsed_data["items"]

    # 1. Update MySQL database
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT dp_number FROM dp_plans WHERE dp_number = %s", (dp_number,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE dp_plans 
                SET so_numbers = %s, total_items = %s, status = 'ACTIVE' 
                WHERE dp_number = %s
            """, (so_numbers, total_items, dp_number))
            cursor.execute("DELETE FROM dp_plan_items WHERE dp_number = %s", (dp_number,))
        else:
            cursor.execute("""
                INSERT INTO dp_plans (dp_number, so_numbers, total_items, status) 
                VALUES (%s, %s, %s, 'ACTIVE')
            """, (dp_number, so_numbers, total_items))

        for item in items:
            cursor.execute("""
                INSERT INTO dp_plan_items (dp_number, item_name, planned_qty, unit, weight_per_pc, dispatched_qty)
                VALUES (%s, %s, %s, %s, %s, 0.0)
            """, (dp_number, item["item_name"], item["planned_qty"], item["unit"], item["weight_per_pc"]))

        add_log(conn, "DP_PLAN_PDF", f"New DP Plan PDF uploaded: {dp_number} (SO: {so_numbers}) | Items: {total_items}")

    # 2. Update SQLite database (inventory.db)
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute("SELECT dp_number FROM dp_plans WHERE dp_number = ?", (dp_number,))
            sq_existing = sq_cursor.fetchone()

            if sq_existing:
                sq_cursor.execute("""
                    UPDATE dp_plans 
                    SET so_numbers = ?, total_items = ?, status = 'ACTIVE' 
                    WHERE dp_number = ?
                """, (so_numbers, total_items, dp_number))
                sq_cursor.execute("DELETE FROM dp_plan_items WHERE dp_number = ?", (dp_number,))
            else:
                sq_cursor.execute("""
                    INSERT INTO dp_plans (dp_number, so_numbers, total_items, status) 
                    VALUES (?, ?, ?, 'ACTIVE')
                """, (dp_number, so_numbers, total_items))

            for item in items:
                sq_cursor.execute("""
                    INSERT INTO dp_plan_items (dp_number, item_name, planned_qty, unit, weight_per_pc, dispatched_qty)
                    VALUES (?, ?, ?, ?, ?, 0.0)
                """, (dp_number, item["item_name"], item["planned_qty"], item["unit"], item["weight_per_pc"]))

            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite sync error: {e}")

    return {
        "status": "Success",
        "message": f"✅ DP Plan PDF '{dp_number}' uploaded successfully!",
        "dp_number": dp_number,
        "so_numbers": so_numbers,
        "total_items": total_items,
        "items": items
    }


def classify_item_type(item_name: str) -> str:
    """
    Classifies an item into DIRECT_DISPATCH or STORE_KIT.
    Direct Dispatch: Pipes, Sand Filters, Screen Filters, Bundles, Coils, Large Drip Lines.
    Store Kit: Poly Fittings, Compression Fittings, Valves, Joiners, PVC Fittings, Accessories.
    """
    name = (item_name or "").lower().strip()
    direct_keywords = ["pipe", "hdpe", "pvc pipe", "emitting", "lateral", "sand filter", "screen filter", "filter station", "bundle", "coil", "drip line"]
    store_keywords = ["fitting", "valve", "joiner", "coupling", "elbow", "tee", "adapter", "nipple", "clamp", "connector", "end cap", "grommet", "take off", "ball valve", "flush valve", "air valve", "mini valve"]

    for sk in store_keywords:
        if sk in name:
            return "STORE_KIT"

    for dk in direct_keywords:
        if dk in name:
            return "DIRECT_DISPATCH"

    return "STORE_KIT" if ("pc" in name or "pcs" in name or "nos" in name) else "DIRECT_DISPATCH"


@app.post("/api/dispatch/auto-connect-so-dp")
async def auto_connect_so_dp(
    dp_pdf: Optional[UploadFile] = File(None),
    so_excel: Optional[UploadFile] = File(None),
    dp_number: Optional[str] = Form(None),
    so_number: Optional[str] = Form(None)
):
    """
    Links DP Plan PDF (Direct Items) and Pending SO Excel (Store Kit Items) 
    into dispatch_verification with DIRECT_DISPATCH & STORE_KIT tags.
    """
    if not dp_pdf and not so_excel and not dp_number:
        raise HTTPException(status_code=400, detail="⚠️ Please select at least 1 DP Plan PDF or SO Excel file!")

    extracted_dp_number = (dp_number or "").strip()
    extracted_so_number = (so_number or "").strip()
    
    direct_items = []
    store_kit_items = []

    # 1. Process DP Plan PDF for DIRECT_DISPATCH Items (Pipes, Filters, Bundles)
    if dp_pdf:
        pdf_bytes = await dp_pdf.read()
        try:
            parsed_pdf = parse_dp_plan_pdf_bytes_pdfplumber(pdf_bytes, dp_pdf.filename)
            if not extracted_dp_number and parsed_pdf.get("dp_number"):
                extracted_dp_number = parsed_pdf["dp_number"]
            if not extracted_so_number and parsed_pdf.get("so_numbers"):
                extracted_so_number = parsed_pdf["so_numbers"]

            pdf_items = parsed_pdf.get("items", [])
            for itm in pdf_items:
                name = itm.get("item_name", "").strip()
                qty = float(itm.get("planned_qty", 0.0))
                unit = itm.get("unit", "Mtr")
                wt = float(itm.get("weight_per_pc", 0.0))
                if name and qty > 0:
                    item_type = classify_item_type(name)
                    if item_type == "DIRECT_DISPATCH":
                        direct_items.append({
                            "item_name": name,
                            "required_qty": qty,
                            "unit": unit,
                            "weight_per_pc": wt,
                            "item_type": "DIRECT_DISPATCH"
                        })
                    else:
                        store_kit_items.append({
                            "item_name": name,
                            "required_qty": qty,
                            "unit": unit,
                            "weight_per_pc": wt,
                            "item_type": "STORE_KIT"
                        })
        except Exception as e:
            print(f"[WARNING] DP Plan PDF Parsing Error: {e}")

    # 2. Process Pending SO Excel for STORE_KIT Items (Poly Fittings, Valves, Joiners)
    if so_excel:
        excel_bytes = await so_excel.read()
        try:
            try:
                header_row = find_excel_header_row(excel_bytes)
                df = pd.read_excel(io.BytesIO(excel_bytes), header=header_row)
            except Exception:
                df = pd.read_csv(io.BytesIO(excel_bytes))

            df.columns = [str(c).strip() for c in df.columns]
            so_col = next((c for c in df.columns if 'so' in c.lower() or 'order' in c.lower()), None)
            item_col = next((c for c in df.columns if 'item' in c.lower() or 'desc' in c.lower() or 'name' in c.lower() or 'particular' in c.lower()), None)
            qty_col = next((c for c in df.columns if 'qty' in c.lower() or 'quantity' in c.lower() or 'plan' in c.lower()), None)
            unit_col = next((c for c in df.columns if 'unit' in c.lower() or 'uom' in c.lower()), None)

            if item_col and qty_col:
                for idx, row in df.iterrows():
                    row_so = str(row[so_col]).strip() if so_col and pd.notna(row[so_col]) else ""
                    row_item = str(row[item_col]).strip() if pd.notna(row[item_col]) else ""
                    
                    if extracted_so_number and row_so and (extracted_so_number.lower() not in row_so.lower() and row_so.lower() not in extracted_so_number.lower()):
                        continue

                    if not row_item or 'total' in row_item.lower() or 'description' in row_item.lower():
                        continue

                    try:
                        raw_q = str(row[qty_col]) if pd.notna(row[qty_col]) else "0"
                        clean_q = re.sub(r"[^\d\.]", "", raw_q)
                        q_val = float(clean_q) if clean_q else 0.0
                    except Exception:
                        q_val = 0.0

                    if q_val <= 0:
                        continue

                    unit_val = str(row[unit_col]).strip() if unit_col and pd.notna(row[unit_col]) else "Pcs"
                    item_type = "STORE_KIT"
                    if "pipe" in row_item.lower() or "hdpe" in row_item.lower():
                        item_type = "DIRECT_DISPATCH"
                        direct_items.append({
                            "item_name": row_item,
                            "required_qty": q_val,
                            "unit": unit_val,
                            "weight_per_pc": 0.0,
                            "item_type": "DIRECT_DISPATCH"
                        })
                    else:
                        store_kit_items.append({
                            "item_name": row_item,
                            "required_qty": q_val,
                            "unit": unit_val,
                            "weight_per_pc": 0.0,
                            "item_type": "STORE_KIT"
                        })
        except Exception as e:
            print(f"[WARNING] Pending SO Excel Parsing Error: {e}")

    if not extracted_dp_number:
        clean_ts = int(time.time())
        extracted_dp_number = f"DP-LINK-{clean_ts}"

    if not extracted_so_number:
        extracted_so_number = "N/A"

    all_mapped_items = direct_items + store_kit_items

    if not all_mapped_items:
        raise HTTPException(status_code=400, detail="⚠️ No items found in PDF or Excel! Please check the file format.")

    # 3. Save into MySQL dispatch_verification table
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("DELETE FROM dispatch_verification WHERE dp_number = %s", (extracted_dp_number,))

        for item in all_mapped_items:
            cursor.execute("""
                INSERT INTO dispatch_verification 
                (dp_number, so_number, item_type, item_name, required_qty, scanned_qty, unit, status)
                VALUES (%s, %s, %s, %s, %s, 0.0, %s, 'PENDING')
            """, (
                extracted_dp_number,
                extracted_so_number,
                item["item_type"],
                item["item_name"],
                item["required_qty"],
                item["unit"]
            ))

        cursor.execute("SELECT dp_number FROM dp_plans WHERE dp_number = %s", (extracted_dp_number,))
        ex_dp = cursor.fetchone()
        if ex_dp:
            cursor.execute("UPDATE dp_plans SET so_numbers = %s, total_items = %s, status = 'ACTIVE' WHERE dp_number = %s",
                           (extracted_so_number, len(all_mapped_items), extracted_dp_number))
            cursor.execute("DELETE FROM dp_plan_items WHERE dp_number = %s", (extracted_dp_number,))
        else:
            cursor.execute("INSERT INTO dp_plans (dp_number, so_numbers, total_items, status) VALUES (%s, %s, %s, 'ACTIVE')",
                           (extracted_dp_number, extracted_so_number, len(all_mapped_items)))

        for item in all_mapped_items:
            cursor.execute("""
                INSERT INTO dp_plan_items (dp_number, item_name, planned_qty, unit, weight_per_pc, dispatched_qty)
                VALUES (%s, %s, %s, %s, %s, 0.0)
            """, (extracted_dp_number, item["item_name"], item["required_qty"], item["unit"], item.get("weight_per_pc", 0.0)))

        add_log(conn, "AUTO_CONNECT_SO_DP", f"DP {extracted_dp_number} and SO {extracted_so_number} linked: {len(direct_items)} Direct + {len(store_kit_items)} Store Kit items.")

    # 4. Sync with SQLite inventory.db
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute("DELETE FROM dispatch_verification WHERE dp_number = ?", (extracted_dp_number,))
            for item in all_mapped_items:
                sq_cursor.execute("""
                    INSERT INTO dispatch_verification 
                    (dp_number, so_number, item_type, item_name, required_qty, scanned_qty, unit, status)
                    VALUES (?, ?, ?, ?, ?, 0.0, ?, 'PENDING')
                """, (extracted_dp_number, extracted_so_number, item["item_type"], item["item_name"], item["required_qty"], item["unit"]))
            
            sq_cursor.execute("SELECT dp_number FROM dp_plans WHERE dp_number = ?", (extracted_dp_number,))
            if sq_cursor.fetchone():
                sq_cursor.execute("UPDATE dp_plans SET so_numbers = ?, total_items = ?, status = 'ACTIVE' WHERE dp_number = ?",
                                   (extracted_so_number, len(all_mapped_items), extracted_dp_number))
                sq_cursor.execute("DELETE FROM dp_plan_items WHERE dp_number = ?", (extracted_dp_number,))
            else:
                sq_cursor.execute("INSERT INTO dp_plans (dp_number, so_numbers, total_items, status) VALUES (?, ?, ?, 'ACTIVE')",
                                   (extracted_dp_number, extracted_so_number, len(all_mapped_items)))

            for item in all_mapped_items:
                sq_cursor.execute("""
                    INSERT INTO dp_plan_items (dp_number, item_name, planned_qty, unit, weight_per_pc, dispatched_qty)
                    VALUES (?, ?, ?, ?, ?, 0.0)
                """, (extracted_dp_number, item["item_name"], item["required_qty"], item["unit"], item.get("weight_per_pc", 0.0)))

            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite auto_connect_so_dp sync error: {e}")

    return {
        "status": "Success",
        "message": f"✅ DP Plan '{extracted_dp_number}' and SO '{extracted_so_number}' connected successfully!",
        "dp_number": extracted_dp_number,
        "so_number": extracted_so_number,
        "direct_dispatch_count": len(direct_items),
        "store_kit_count": len(store_kit_items),
        "total_mapped_items": len(all_mapped_items),
        "items": all_mapped_items
    }


def process_excel_in_background(file_bytes: bytes, filename: str):
    """
    This function runs in the background. It contains the original heavy processing logic.
    """
    try:
        header_row = find_excel_header_row(file_bytes)
        df = pd.read_excel(io.BytesIO(file_bytes), header=header_row)
        df.columns = [str(c).strip() for c in df.columns]
    except Exception as e:
        # Since this is a background task, we log the error instead of returning an HTTPException
        print(f"BACKGROUND_TASK_ERROR: Failed to read Excel file {filename}: {e}")
        return

    col_map = {
        'plan_no': next((c for c in df.columns if 'disp. plan no' in c.lower()), None),
        'so_no': next((c for c in df.columns if 'so no' in c.lower()), None),
        'item_name': next((c for c in df.columns if 'item' in c.lower()), None),
        'item_code': next((c for c in df.columns if 'code' in c.lower()), None),
        'planned_qty': next((c for c in df.columns if 'pend. qty' in c.lower()), None),
        'unit': next((c for c in df.columns if 'unit' in c.lower()), None),
    }

    if not all(col_map.values()):
        missing = [k for k, v in col_map.items() if v is None]
        print(f"BACKGROUND_TASK_ERROR: Missing required columns in {filename}: {', '.join(missing)}")
        return

    grouped = df.groupby([col_map['plan_no'], col_map['so_no']])
    processed_plans_count = 0

    with get_db_ctx(commit=True) as (conn, cursor):
        for (plan_no, so_no), group in grouped:
            if not plan_no or pd.isna(plan_no):
                continue

            plan_no = str(plan_no).strip()
            so_no = str(so_no).strip() if pd.notna(so_no) else 'N/A'
            
            items = []
            for _, row in group.iterrows():
                item_code = str(row[col_map['item_code']]).strip().upper()
                item_name = str(row[col_map['item_name']]).strip()
                planned_qty = pd.to_numeric(row[col_map['planned_qty']], errors='coerce')
                unit = str(row[col_map['unit']]).strip()

                if not item_name or pd.isna(planned_qty) or planned_qty <= 0:
                    continue

                fitting_prefixes = ('PVF', 'NOZ', 'VLV', 'PFT', 'GI', 'FAC', 'HEA', 'MAP')
                item_type = 'STORE_KIT' if item_code.startswith(fitting_prefixes) else 'DIRECT_DISPATCH'
                
                items.append({
                    "item_name": item_name,
                    "planned_qty": planned_qty,
                    "unit": unit,
                    "item_type": item_type
                })

            if not items:
                continue

            cursor.execute("SELECT id FROM dispatch_plans WHERE plan_no = %s", (plan_no,))
            existing_plan = cursor.fetchone()

            if existing_plan:
                plan_id = existing_plan['id']
                cursor.execute("UPDATE dispatch_plans SET so_no = %s, status = 'ACTIVE' WHERE id = %s", (so_no, plan_id))
                cursor.execute("DELETE FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (plan_id,))
            else:
                cursor.execute("INSERT INTO dispatch_plans (plan_no, so_no, status) VALUES (%s, %s, 'ACTIVE')", (plan_no, so_no))
                plan_id = cursor.lastrowid

            for item in items:
                cursor.execute(
                    "INSERT INTO dispatch_plan_items (dispatch_plan_id, item_name, planned_qty, unit, item_type) VALUES (%s, %s, %s, %s, %s)",
                    (plan_id, item['item_name'], item['planned_qty'], item['unit'], item['item_type'])
                )
            
            processed_plans_count += 1

        add_log(conn, "EXCEL_PLAN_UPLOAD", f"Processed {processed_plans_count} dispatch plans from Excel file: {filename}")

    # Explicitly free up memory
    del df
    del grouped
    gc.collect()
    print(f"BACKGROUND_TASK_SUCCESS: Successfully processed {filename}.")


@app.post("/api/dispatch/upload-excel-plan")
async def upload_excel_dispatch_plan(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Accepts an Excel file, validates it, and passes it to a background task for processing.
    Returns an immediate response to the user.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported.")

    # Read file into memory to pass to the background task
    file_bytes = await file.read()

    # Add the heavy processing function to the background tasks
    background_tasks.add_task(process_excel_in_background, file_bytes, file.filename)

    return {
        "status": "Processing",
        "message": f"File '{file.filename}' has been received and is being processed in the background. The UI will update automatically upon completion."
    }

def find_excel_header_row(file_bytes: bytes, max_scan_rows: int = 10) -> int:
    """
    Scan the first few rows of an Excel file to find the actual header row.
    Returns the 0-based row index that looks most like a header row.
    """
    try:
        df_raw = pd.read_excel(io.BytesIO(file_bytes), header=None)
    except Exception:
        return 0

    header_keywords = [
        'disp. plan no', 'dispatch plan no', 'dp no', 'plan no',
        'so no', 'sales order no', 'sales order',
        'item name', 'item code', 'product name', 'product code',
        'pending qty', 'pend. qty', 'qty',
        'unit', 'uom'
    ]

    best_row = 0
    best_score = -1

    for i in range(min(max_scan_rows, len(df_raw))):
        row_values = [str(v).strip().lower() for v in df_raw.iloc[i]]
        score = sum(1 for kw in header_keywords if any(kw in val for val in row_values))
        if score > best_score:
            best_score = score
            best_row = i

    return best_row


def process_loading_entry_excel(file_bytes: bytes, filename: str):
    """
    Background task to process 'Pending Loading Entry' Excel file.
    It inserts or updates records in the `pending_loading_entries` table.
    """
    try:
        header_row = find_excel_header_row(file_bytes)
        df = pd.read_excel(io.BytesIO(file_bytes), header=header_row)
        df.columns = [str(c).strip().lower() for c in df.columns]
    except Exception as e:
        print(f"BACKGROUND_TASK_ERROR: Failed to read loading entry Excel file {filename}: {e}")
        return {
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "errors": 0,
            "filename": filename,
            "fatal_error": f"Failed to read Excel file: {e}"
        }

    # Map columns based on expected names
    col_map = {
        'disp_plan_no': next((c for c in df.columns if 'disp. plan no' in c or 'dispatch plan no' in c or 'dp no' in c), None),
        'disp_plan_date': next((c for c in df.columns if 'disp. plan date' in c or 'dispatch plan date' in c or 'dp date' in c), None),
        'so_no': next((c for c in df.columns if 'so no' in c or 'sales order no' in c), None),
        'so_date': next((c for c in df.columns if 'so date' in c or 'sales order date' in c), None),
        'customer_location': next((c for c in df.columns if 'cust./location' in c or 'customer' in c and 'location' in c), None),
        'dealer': next((c for c in df.columns if 'dealer' in c), None),
        'village': next((c for c in df.columns if 'village' in c), None),
        'district': next((c for c in df.columns if 'district' in c), None),
        'item_name': next((c for c in df.columns if c == 'item' or 'item' in c and 'name' in c or 'product' in c and 'name' in c), None),
        'item_code': next((c for c in df.columns if c == 'code' or 'item' in c and 'code' in c or 'product' in c and 'code' in c or 'item code' in c or 'product code' in c), None),
        'pending_qty': next((c for c in df.columns if 'pend. qty' in c or 'pending qty' in c or 'pending' in c and 'qty' in c), None),
        'unit': next((c for c in df.columns if 'unit' == c or c == 'uom' or 'unit' in c), None),
    }

    required_cols = ['disp_plan_no', 'so_no', 'item_name', 'item_code', 'pending_qty', 'unit']
    missing = [k for k in required_cols if col_map[k] is None]
    if missing:
        error_msg = f"Missing required columns in {filename}: {', '.join(missing)}. Detected columns: {df.columns.tolist()}. Column map: {col_map}"
        print(f"BACKGROUND_TASK_ERROR: {error_msg}")
        return {
            "inserted": 0,
            "updated": 0,
            "skipped": 0,
            "errors": 0,
            "filename": filename,
            "fatal_error": error_msg
        }

    inserted_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    with get_db_ctx(commit=True) as (conn, cursor):
        for idx, (_, row) in enumerate(df.iterrows(), start=1):
            try:
                disp_plan_no = str(row[col_map['disp_plan_no']]).strip()
                so_no = str(row[col_map['so_no']]).strip()
                item_code = str(row[col_map['item_code']]).strip()
                pending_qty = pd.to_numeric(row[col_map['pending_qty']], errors='coerce')

                if not all([disp_plan_no, so_no, item_code]) or pd.isna(pending_qty):
                    skipped_count += 1
                    print(f"[LOADING_ENTRY] Skipped row {idx}: missing required values "
                          f"disp_plan_no='{disp_plan_no}', so_no='{so_no}', item_code='{item_code}', pending_qty={pending_qty}")
                    continue

                # Prepare data for insertion/update
                data = {
                    "disp_plan_no": disp_plan_no,
                    "so_no": so_no,
                    "item_code": item_code,
                    "pending_qty": float(pending_qty),
                    "item_name": str(row.get(col_map['item_name'], '')).strip(),
                    "unit": str(row.get(col_map['unit'], '')).strip(),
                    "disp_plan_date": pd.to_datetime(row.get(col_map['disp_plan_date']), errors='coerce').date() if col_map.get('disp_plan_date') and pd.notna(row.get(col_map['disp_plan_date'])) else None,
                    "so_date": pd.to_datetime(row.get(col_map['so_date']), errors='coerce').date() if col_map.get('so_date') and pd.notna(row.get(col_map['so_date'])) else None,
                    "customer_location": str(row.get(col_map['customer_location'], '')).strip(),
                    "dealer": str(row.get(col_map['dealer'], '')).strip(),
                    "village": str(row.get(col_map['village'], '')).strip(),
                    "district": str(row.get(col_map['district'], '')).strip(),
                }

                # Use INSERT ... ON DUPLICATE KEY UPDATE for atomicity
                insert_query = """
                    INSERT INTO pending_loading_entries (disp_plan_no, so_no, item_code, pending_qty, item_name, unit, disp_plan_date, so_date, customer_location, dealer, village, district)
                    VALUES (%(disp_plan_no)s, %(so_no)s, %(item_code)s, %(pending_qty)s, %(item_name)s, %(unit)s, %(disp_plan_date)s, %(so_date)s, %(customer_location)s, %(dealer)s, %(village)s, %(district)s)
                    ON DUPLICATE KEY UPDATE
                        pending_qty = VALUES(pending_qty),
                        item_name = VALUES(item_name),
                        unit = VALUES(unit),
                        disp_plan_date = VALUES(disp_plan_date),
                        so_date = VALUES(so_date),
                        customer_location = VALUES(customer_location),
                        dealer = VALUES(dealer),
                        village = VALUES(village),
                        district = VALUES(district)
                """
                cursor.execute(insert_query, data)

                # MySQL Connector rowcount behavior for ON DUPLICATE KEY UPDATE:
                # 1 = new row inserted
                # 2 = existing row updated
                # 0 = duplicate with identical values (no-op, still counts as processed)
                if cursor.rowcount == 1:
                    inserted_count += 1
                elif cursor.rowcount >= 2:
                    updated_count += 1
                else:
                    updated_count += 1

            except Exception as e:
                error_count += 1
                print(f"[LOADING_ENTRY] Error processing row {idx}: {row.to_dict()}. Error: {e}")

        log_message = f"Processed '{filename}': {inserted_count} inserted, {updated_count} updated, {skipped_count} skipped, {error_count} errors."
        add_log(conn, "LOADING_ENTRY_UPLOAD", log_message)

    print(f"BACKGROUND_TASK_SUCCESS: {log_message}")
    return {
        "inserted": inserted_count,
        "updated": updated_count,
        "skipped": skipped_count,
        "errors": error_count,
        "filename": filename
    }

@app.post("/api/dispatch/upload-loading-entry")
async def upload_loading_entry_excel(file: UploadFile = File(...)):
    """
    Accepts a 'Pending Loading Entry' Excel file and processes it synchronously.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported.")

    file_bytes = await file.read()
    result = process_loading_entry_excel(file_bytes, file.filename)

    if result.get("fatal_error"):
        raise HTTPException(status_code=400, detail=result["fatal_error"])

    return {
        "status": "Success",
        "message": f"Processed '{result['filename']}': {result['inserted']} inserted, {result['updated']} updated, {result['skipped']} skipped, {result['errors']} errors.",
        "details": result
    }

@app.get("/api/loading-entry/dp-plans")
def get_loading_entry_dp_plans():
    """Return unique Dispatch Plan numbers from pending_loading_entries."""
    with get_db_ctx() as (conn, cursor):
        cursor.execute("""
            SELECT DISTINCT disp_plan_no
            FROM pending_loading_entries
            ORDER BY disp_plan_no
        """)
        plans = [row["disp_plan_no"] for row in cursor.fetchall()]

    return {
        "status": "Success",
        "dp_plans": plans
    }

@app.get("/api/loading-entry/so-numbers/{dp_plan_no:path}")
def get_loading_entry_so_numbers(dp_plan_no: str):
    """Return unique SO numbers for the selected Dispatch Plan."""
    with get_db_ctx() as (conn, cursor):
        cursor.execute(
            """
            SELECT DISTINCT so_no
            FROM pending_loading_entries
            WHERE disp_plan_no = %s
            ORDER BY so_no
            """,
            (dp_plan_no,)
        )

        so_numbers = [row["so_no"] for row in cursor.fetchall()]

    return {
        "status": "Success",
        "so_numbers": so_numbers
    }

@app.get("/api/loading-entry/items")
def get_loading_entry_items(dp_plan_no: str, so_numbers: str):
    """
    Return pending loading items for the selected Dispatch Plan
    and comma-separated SO numbers.
    """

    so_list = [s.strip() for s in so_numbers.split(",") if s.strip()]

    if not so_list:
        return {
            "status": "Success",
            "items": []
        }

    placeholders = ",".join(["%s"] * len(so_list))

    query = f"""
        SELECT
            item_name,
            item_code,
            pending_qty,
            unit
        FROM pending_loading_entries
        WHERE disp_plan_no = %s
          AND so_no IN ({placeholders})
        ORDER BY item_name
    """

    params = [dp_plan_no] + so_list

    with get_db_ctx() as (conn, cursor):
        cursor.execute(query, tuple(params))
        items = cursor.fetchall()

    return {
        "status": "Success",
        "items": items
    }

def ensure_items_exist(conn, items):
    """
    Ensures all items from the given list exist in the `items` table.
    Missing items are inserted with sensible defaults.
    """
    if not items:
        return 0

    inserted_count = 0
    cursor = conn.cursor()
    for item in items:
        item_code = str(item.get('item_code', '')).strip()
        item_name = str(item.get('item_name', '')).strip()
        unit = str(item.get('unit', 'PCS')).strip()

        if not item_code or not item_name:
            continue

        try:
            cursor.execute(
                """
                INSERT IGNORE INTO items (item_code, item_name, item_group, hsn_code, unit, rate, image_url, is_own_production, is_outsource)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (item_code, item_name, '', '', unit, 0.0, '', 0, 0)
            )
            if cursor.rowcount > 0:
                inserted_count += 1
        except mysql.connector.Error:
            continue

    return inserted_count


@app.post("/api/dispatch/create-from-loading-entry")
async def create_dispatch_plan_from_loading_entry(req: CreatePlanFromLoadingEntryRequest):
    """
    Creates a permanent dispatch plan in `dispatch_plans` from the temporary
    `pending_loading_entries` table based on user selection.
    """
    if not req.disp_plan_no or not req.so_numbers:
        raise HTTPException(status_code=400, detail="Dispatch Plan number and SO numbers are required.")

    so_placeholders = ",".join(["%s"] * len(req.so_numbers))
    query = f"""
        SELECT item_name, item_code, SUM(pending_qty) as total_qty, unit
        FROM pending_loading_entries
        WHERE disp_plan_no = %s AND so_no IN ({so_placeholders})
        GROUP BY item_name, item_code, unit
    """
    params = [req.disp_plan_no] + req.so_numbers

    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute(query, tuple(params))
        items_to_add = cursor.fetchall()

        if not items_to_add:
            raise HTTPException(status_code=404, detail="No items found for the selected DP and SOs.")

        plan_no = req.disp_plan_no
        so_no_str = ", ".join(req.so_numbers)

        # Check if a plan with this plan_no already exists
        cursor.execute("SELECT id FROM dispatch_plans WHERE plan_no = %s", (plan_no,))
        existing_plan = cursor.fetchone()

        if existing_plan:
            plan_id = existing_plan['id']
            # Update SO number and reset items
            cursor.execute("UPDATE dispatch_plans SET so_no = %s, status = 'ACTIVE' WHERE id = %s", (so_no_str, plan_id))
            cursor.execute("DELETE FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (plan_id,))
        else:
            # Create a new plan
            cursor.execute(
                "INSERT INTO dispatch_plans (plan_no, so_no, status) VALUES (%s, %s, 'ACTIVE')",
                (plan_no, so_no_str)
            )
            plan_id = cursor.lastrowid

        # Add items to the plan
        for item in items_to_add:
            cursor.execute(
                """
                INSERT INTO dispatch_plan_items (dispatch_plan_id, item_name, planned_qty, unit, item_type)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (plan_id, item['item_name'], item['total_qty'], item['unit'], classify_item_type(item['item_name']))
            )

        # Auto-sync new items into Item Master
        new_items_count = ensure_items_exist(conn, items_to_add)
        if new_items_count > 0:
            add_log(conn, "ITEM_AUTO_SYNC", f"Auto-synced {new_items_count} new items from Plan '{plan_no}' into Item Master.")

        add_log(conn, "PLAN_CREATED_FROM_EXCEL", f"Plan '{plan_no}' created for SO(s) '{so_no_str}' with {len(items_to_add)} items.")

    await manager.broadcast("STOCK_UPDATED") # To refresh the plan list on the UI

    return {"status": "Success", "message": f"Dispatch Plan '{plan_no}' created successfully and is now available for scanning."}

# 🎁 Store Kit QR Generation & Management APIs
@app.get("/api/store-kit/so-list")
def get_store_kit_so_list():
    with get_db_ctx() as (conn, cursor):
        cursor.execute("""
            SELECT DISTINCT so_number, dp_number 
            FROM dispatch_verification 
            WHERE item_type = 'STORE_KIT' AND status != 'COMPLETED'
        """)
        so_list = cursor.fetchall()
        
        if not so_list:
            cursor.execute("SELECT DISTINCT so_no as so_number, plan_no as dp_number FROM dispatch_plans WHERE status != 'COMPLETED'")
            so_list = cursor.fetchall()

    return {"status": "Success", "so_list": so_list}


@app.get("/api/store-kit/so-items/{so_number}")
def get_store_kit_so_items(so_number: str):
    with get_db_ctx() as (conn, cursor):
        cursor.execute("""
            SELECT id, dp_number, so_number, item_name, required_qty, scanned_qty, unit, status 
            FROM dispatch_verification 
            WHERE so_number = %s AND item_type = 'STORE_KIT'
        """, (so_number,))
        items = cursor.fetchall()

        if not items:
            cursor.execute("""
                SELECT dpi.id, dp.plan_no as dp_number, dp.so_no as so_number, dpi.item_name, dpi.planned_qty as required_qty, dpi.dispatched_qty as scanned_qty, dpi.unit, 'PENDING' as status
                FROM dispatch_plan_items dpi
                JOIN dispatch_plans dp ON dpi.dispatch_plan_id = dp.id
                WHERE dp.so_no = %s
            """, (so_number,))
            items = cursor.fetchall()

    return {"status": "Success", "so_number": so_number, "items": items}


@app.post("/api/store-kit/generate")
def generate_store_kit(req: StoreKitGenerateRequest):
    so_num = req.so_number.strip()
    if not so_num:
        raise HTTPException(status_code=400, detail="⚠️ SO Number is required!")

    clean_so = re.sub(r"[^\w\-]", "", so_num)
    if clean_so.upper().startswith("SO-"):
        clean_so = clean_so[3:]
    kit_code = req.kit_code.strip() if req.kit_code else f"KIT-SO-{clean_so}-FITTINGS"

    with get_db_ctx(commit=True) as (conn, cursor):
        kit_items = req.items
        if not kit_items:
            cursor.execute("""
                SELECT item_name, required_qty as quantity, unit 
                FROM dispatch_verification 
                WHERE so_number = %s AND item_type = 'STORE_KIT'
            """, (so_num,))
            kit_items = cursor.fetchall()

        if not kit_items:
            cursor.execute("""
                SELECT dpi.item_name, dpi.planned_qty as quantity, dpi.unit 
                FROM dispatch_plan_items dpi
                JOIN dispatch_plans dp ON dpi.dispatch_plan_id = dp.id
                WHERE dp.so_no = %s
            """, (so_num,))
            kit_items = cursor.fetchall()

        if not kit_items:
            raise HTTPException(status_code=404, detail=f"No fittings found for SO Number '{so_num}'!")

        dp_num = req.dp_number or (kit_items[0].get('dp_number', '') if kit_items else '')

        cursor.execute("SELECT kit_code FROM store_kits WHERE kit_code = %s", (kit_code,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("DELETE FROM store_kit_items WHERE kit_code = %s", (kit_code,))
            cursor.execute("UPDATE store_kits SET so_number = %s, dp_number = %s, total_items_count = %s, status = 'CREATED' WHERE kit_code = %s",
                           (so_num, dp_num, len(kit_items), kit_code))
        else:
            cursor.execute("""
                INSERT INTO store_kits (kit_code, so_number, dp_number, total_items_count, status)
                VALUES (%s, %s, %s, %s, 'CREATED')
            """, (kit_code, so_num, dp_num, len(kit_items)))

        for itm in kit_items:
            q_val = float(itm.get('quantity') or itm.get('required_qty') or 1.0)
            u_val = itm.get('unit', 'Pcs')
            cursor.execute("""
                INSERT INTO store_kit_items (kit_code, item_name, quantity, unit)
                VALUES (%s, %s, %s, %s)
            """, (kit_code, itm['item_name'], q_val, u_val))

        add_log(conn, "STORE_KIT_GENERATE", f"Store Kit QR jenerate thayo: {kit_code} for SO {so_num} with {len(kit_items)} fittings.")

    # Sync with SQLite inventory.db
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            sq_cursor.execute("SELECT kit_code FROM store_kits WHERE kit_code = ?", (kit_code,))
            if sq_cursor.fetchone():
                sq_cursor.execute("DELETE FROM store_kit_items WHERE kit_code = ?", (kit_code,))
                sq_cursor.execute("UPDATE store_kits SET so_number = ?, dp_number = ?, total_items_count = ?, status = 'CREATED' WHERE kit_code = ?",
                                   (so_num, dp_num, len(kit_items), kit_code))
            else:
                sq_cursor.execute("INSERT INTO store_kits (kit_code, so_number, dp_number, total_items_count, status) VALUES (?, ?, ?, ?, 'CREATED')",
                                   (kit_code, so_num, dp_num, len(kit_items)))

            for itm in kit_items:
                q_val = float(itm.get('quantity') or itm.get('required_qty') or 1.0)
                u_val = itm.get('unit', 'Pcs')
                sq_cursor.execute("INSERT INTO store_kit_items (kit_code, item_name, quantity, unit) VALUES (?, ?, ?, ?)",
                                   (kit_code, itm['item_name'], q_val, u_val))

            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite Store Kit Sync Error: {e}")

    return {
        "status": "Success",
        "message": f"✅ Store Kit QR '{kit_code}' generated successfully!",
        "kit_code": kit_code,
        "so_number": so_num,
        "dp_number": dp_num,
        "total_items_count": len(kit_items),
        "items": kit_items
    }




@app.post("/api/dispatch-plan/upload")
async def upload_dispatch_plan(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".pdf", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="⚠️ Only PDF or Excel (.xlsx, .xls) files can be uploaded!")
        
    file_bytes = await file.read()
    parsed_data = parse_dispatch_plan_bytes(file_bytes, file.filename)
    
    if not parsed_data["items"]:
        raise HTTPException(status_code=400, detail="⚠️ No item records found in file! Please check the dispatch plan format.")
        
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT id FROM dispatch_plans WHERE plan_no = %s", (parsed_data["plan_no"],))
        existing = cursor.fetchone()
        
        if existing:
            plan_id = existing["id"]
            cursor.execute("UPDATE dispatch_plans SET so_no = %s, status = 'ACTIVE' WHERE id = %s", (parsed_data["so_no"], plan_id))
            cursor.execute("DELETE FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (plan_id,))
        else:
            cursor.execute(
                "INSERT INTO dispatch_plans (plan_no, so_no, status) VALUES (%s, %s, 'ACTIVE')",
                (parsed_data["plan_no"], parsed_data["so_no"])
            )
            plan_id = cursor.lastrowid
            
        for item in parsed_data["items"]:
            cursor.execute("""
                INSERT INTO dispatch_plan_items (dispatch_plan_id, item_name, planned_qty, dispatched_qty, unit, weight_per_pc)
                VALUES (%s, %s, %s, 0.0, %s, %s)
            """, (plan_id, item["item_name"], item["planned_qty"], item["unit"], item["weight_per_pc"]))
            
        add_log(conn, "DISPATCH_PLAN", f"New Dispatch Plan uploaded: {parsed_data['plan_no']} (SO: {parsed_data['so_no']}) | Items: {len(parsed_data['items'])}")

    return {
        "status": "Success",
        "message": f"✅ Dispatch Plan '{parsed_data['plan_no']}' uploaded successfully!",
        "plan_id": plan_id,
        "plan_no": parsed_data["plan_no"],
        "so_no": parsed_data["so_no"],
        "total_items": len(parsed_data["items"]),
        "items": parsed_data["items"]
    }

@app.get("/api/dispatch-plans/list")
def list_dispatch_plans():
    with get_db_ctx() as (conn, cursor):
        cursor.execute("SELECT * FROM dispatch_plans ORDER BY created_at DESC LIMIT 50")
        plans = cursor.fetchall()
        
        for plan in plans:
            cursor.execute("""
                SELECT id, item_name, planned_qty, dispatched_qty, unit, weight_per_pc 
                FROM dispatch_plan_items 
                WHERE dispatch_plan_id = %s
            """, (plan["id"],))
            items = cursor.fetchall()
            
            for item in items:
                item['locations'] = 'STORE'
            
            plan["items"] = items
            
            total_planned = sum(float(i["planned_qty"]) for i in plan["items"])
            total_dispatched = sum(float(i["dispatched_qty"]) for i in plan["items"])
            
            # Query dispatch_verification for Direct vs Store Kit breakdown
            cursor.execute("""
                SELECT item_type, required_qty, scanned_qty, status 
                FROM dispatch_verification 
                WHERE dp_number = %s OR so_number = %s
            """, (plan.get("plan_no"), plan.get("so_no")))
            ver_items = cursor.fetchall()

            direct_tot = sum(float(v["required_qty"]) for v in ver_items if v["item_type"] == "DIRECT_DISPATCH")
            direct_disc = sum(float(v["scanned_qty"]) for v in ver_items if v["item_type"] == "DIRECT_DISPATCH")
            
            store_tot = sum(float(v["required_qty"]) for v in ver_items if v["item_type"] == "STORE_KIT")
            store_disc = sum(float(v["scanned_qty"]) for v in ver_items if v["item_type"] == "STORE_KIT")

            if not ver_items:
                for itm in plan["items"]:
                    if classify_item_type(itm["item_name"]) == "DIRECT_DISPATCH":
                        direct_tot += float(itm["planned_qty"])
                        direct_disc += float(itm["dispatched_qty"])
                    else:
                        store_tot += float(itm["planned_qty"])
                        store_disc += float(itm["dispatched_qty"])

            plan["direct_progress_pct"] = 100.0 if direct_tot == 0 else round(min(100.0, direct_disc / direct_tot * 100), 1)
            plan["store_kit_progress_pct"] = 100.0 if store_tot == 0 else round(min(100.0, store_disc / store_tot * 100), 1)
            plan["challan_unlocked"] = (plan["direct_progress_pct"] >= 100.0 and plan["store_kit_progress_pct"] >= 100.0)

            is_completed = (total_planned > 0 and total_dispatched >= total_planned) or plan["challan_unlocked"]
            if is_completed and plan["status"] != "COMPLETED":
                cursor.execute("UPDATE dispatch_plans SET status = 'COMPLETED' WHERE id = %s", (plan["id"],))
                plan["status"] = "COMPLETED"

            plan["progress_pct"] = 100.0 if is_completed else (round((total_dispatched / total_planned * 100), 1) if total_planned > 0 else 0)
            
    return {"status": "Success", "plans": plans}

@app.get("/api/dispatch-plan/{plan_id}")
def get_dispatch_plan_details(plan_id: int):
    with get_db_ctx() as (conn, cursor):
        cursor.execute("SELECT * FROM dispatch_plans WHERE id = %s", (plan_id,))
        plan = cursor.fetchone()
        if not plan:
            raise HTTPException(status_code=404, detail="Dispatch Plan not found!")
            
        cursor.execute("SELECT * FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (plan_id,))
        plan["items"] = cursor.fetchall()
        
    return {"status": "Success", "plan": plan}

@app.delete("/api/dispatch-plan/{plan_id}")
def delete_dispatch_plan(plan_id: int):
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT plan_no FROM dispatch_plans WHERE id = %s", (plan_id,))
        plan = cursor.fetchone()
        if not plan:
            raise HTTPException(status_code=404, detail="Dispatch Plan not found!")
            
        cursor.execute("DELETE FROM dispatch_plans WHERE id = %s", (plan_id,))
        add_log(conn, "DISPATCH_PLAN", f"Dispatch Plan deleted: {plan['plan_no']}")
        
    return {"status": "Success", "message": f"🗑️ Dispatch Plan '{plan['plan_no']}' deleted successfully."}

@app.put("/api/dispatch-plan/{plan_id}")
def update_dispatch_plan(plan_id: int, plan_data: DispatchPlanUpdate):
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT plan_no FROM dispatch_plans WHERE id = %s", (plan_id,))
        db_plan = cursor.fetchone()
        if not db_plan:
            raise HTTPException(status_code=404, detail="Dispatch plan not found.")

        try:
            cursor.execute(
                "UPDATE dispatch_plans SET plan_no = %s, so_no = %s WHERE id = %s",
                (plan_data.plan_no, plan_data.so_no, plan_id)
            )
        except mysql.connector.Error as err:
            if err.errno == 1062: # Duplicate entry for plan_no
                raise HTTPException(status_code=400, detail=f"Plan No '{plan_data.plan_no}' already exists.")
            raise

        add_log(conn, "DISPATCH_PLAN_UPDATE", f"Dispatch Plan #{plan_id} updated. Old No: '{db_plan['plan_no']}', New No: '{plan_data.plan_no}'")

    return {"status": "Success", "message": "Dispatch plan details updated successfully."}

@app.put("/api/dispatch-plan/item/{item_id}")
def update_dispatch_plan_item(item_id: int, item_data: DispatchPlanItemUpdate):
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT dispatch_plan_id, item_name FROM dispatch_plan_items WHERE id = %s", (item_id,))
        db_item = cursor.fetchone()
        if not db_item:
            raise HTTPException(status_code=404, detail="Dispatch plan item not found.")

        cursor.execute(
            """
            UPDATE dispatch_plan_items
            SET item_name = %s, planned_qty = %s, unit = %s
            WHERE id = %s
            """,
            (item_data.item_name, item_data.planned_qty, item_data.unit, item_id)
        )

        add_log(conn, "DISPATCH_ITEM_UPDATE", f"Dispatch Plan Item #{item_id} updated. Old name: '{db_item['item_name']}', New name: '{item_data.item_name}'")

    return {"status": "Success", "message": "Dispatch plan item updated successfully."}

@app.post("/api/dispatch-plan/{plan_id}/add-item")
def add_item_to_dispatch_plan(plan_id: int, item_data: DispatchPlanItemAdd):
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT id FROM dispatch_plans WHERE id = %s", (plan_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Dispatch Plan not found.")
        
        cursor.execute("""
            INSERT INTO dispatch_plan_items (dispatch_plan_id, item_name, planned_qty, unit, weight_per_pc)
            VALUES (%s, %s, %s, %s, 0.0)
        """, (plan_id, item_data.item_name, item_data.planned_qty, item_data.unit))
        
        item_id = cursor.lastrowid
        add_log(conn, "DISPATCH_ITEM_ADD", f"New item '{item_data.item_name}' added to Plan ID #{plan_id}")

    return {"status": "Success", "message": "Item added to plan successfully.", "item_id": item_id}

# ===============================================
# BOM (Bill of Materials) APIs
# ===============================================

@app.get("/api/boms/list")
def list_boms():
    with get_db_ctx() as (conn, cursor):
        cursor.execute("""
            SELECT b.id as bom_id, b.finished_good_item_id, i.item_name as finished_good_name
            FROM boms b
            JOIN items i ON b.finished_good_item_id = i.id
            ORDER BY i.item_name
        """)
        boms = cursor.fetchall()

        for bom in boms:
            cursor.execute("""
                SELECT bc.component_item_id, i.item_name as component_name, bc.quantity, i.unit
                FROM bom_components bc
                JOIN items i ON bc.component_item_id = i.id
                WHERE bc.bom_id = %s
            """, (bom['bom_id'],))
            bom['components'] = cursor.fetchall()
    
    return {"status": "Success", "boms": boms}

@app.post("/api/boms/save")
def save_bom(req: BOMSaveRequest):
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT id FROM boms WHERE finished_good_item_id = %s", (req.finished_good_item_id,))
        existing_bom = cursor.fetchone()

        if existing_bom:
            bom_id = existing_bom['id']
            cursor.execute("DELETE FROM bom_components WHERE bom_id = %s", (bom_id,))
        else:
            cursor.execute("SELECT item_name FROM items WHERE id = %s", (req.finished_good_item_id,))
            item = cursor.fetchone()
            bom_name = item['item_name'] if item else f"BOM for Item ID {req.finished_good_item_id}"
            cursor.execute(
                "INSERT INTO boms (finished_good_item_id, name) VALUES (%s, %s)",
                (req.finished_good_item_id, bom_name)
            )
            bom_id = cursor.lastrowid

        for comp in req.components:
            cursor.execute(
                "INSERT INTO bom_components (bom_id, component_item_id, quantity) VALUES (%s, %s, %s)",
                (bom_id, comp.component_item_id, comp.quantity)
            )
        
        add_log(conn, "BOM_SAVE", f"BOM for Item ID #{req.finished_good_item_id} was saved with {len(req.components)} components.")

    return {"status": "Success", "message": "BOM saved successfully."}

@app.delete("/api/boms/delete/{bom_id}")
def delete_bom(bom_id: int):
    with get_db_ctx(commit=True) as (conn, cursor):
        cursor.execute("SELECT finished_good_item_id FROM boms WHERE id = %s", (bom_id,))
        bom = cursor.fetchone()
        if not bom:
            raise HTTPException(status_code=404, detail="BOM not found.")
        
        cursor.execute("DELETE FROM boms WHERE id = %s", (bom_id,))
        add_log(conn, "BOM_DELETE", f"BOM for Item ID #{bom['finished_good_item_id']} was deleted.")
    
    return {"status": "Success", "message": "BOM deleted successfully."}


# 🚚 Delivery Challan APIs
@app.get("/api/delivery-challan/{plan_id}")
def get_delivery_challan(plan_id: str):
    with get_db_ctx() as (conn, cursor):
        plan = None
        dpi_items = []
        is_numeric = plan_id.isdigit()

        # 1. Try finding in dispatch_plans by ID or plan_no
        if is_numeric:
            cursor.execute("SELECT * FROM dispatch_plans WHERE id = %s", (int(plan_id),))
            plan = cursor.fetchone()

        if not plan:
            cursor.execute("SELECT * FROM dispatch_plans WHERE plan_no = %s", (plan_id,))
            plan = cursor.fetchone()

        if plan:
            cursor.execute("SELECT * FROM dispatch_plan_items WHERE dispatch_plan_id = %s", (plan['id'],))
            dpi_items = cursor.fetchall()
            plan_no = plan['plan_no']
            so_no = plan.get('so_no', 'N/A')
            plan_status = plan.get('status', 'ACTIVE')
            vehicle_no = plan.get('vehicle_no', '')
            transporter_name = plan.get('transporter_name', '')
            driver_info = plan.get('driver_info', '')
            created_at = str(plan.get('created_at', ''))
        else:
            # 2. Try finding in dp_plans by dp_number
            cursor.execute("SELECT * FROM dp_plans WHERE dp_number = %s", (plan_id,))
            plan = cursor.fetchone()
            if not plan:
                raise HTTPException(status_code=404, detail=f"DP Plan '{plan_id}' not found for Delivery Challan!")

            cursor.execute("SELECT * FROM dp_plan_items WHERE dp_number = %s", (plan_id,))
            dpi_items = cursor.fetchall()
            plan_no = plan['dp_number']
            so_no = plan.get('so_numbers', 'N/A')
            plan_status = plan.get('status', 'ACTIVE')
            vehicle_no = plan.get('vehicle_no', '')
            transporter_name = plan.get('transporter_name', '')
            driver_info = plan.get('driver_info', '')
            created_at = str(plan.get('created_at', ''))

        # Process item list & calculate weights
        processed_items = []
        grand_total_weight = 0.0
        total_dispatched_qty = 0.0

        for item in dpi_items:
            planned_q = float(item.get('planned_qty', 0))
            dispatched_q = float(item.get('dispatched_qty', 0))
            unit = item.get('unit', 'Pcs')
            wt_per_pc = float(item.get('weight_per_pc', 0.0))

            # Auto fallback weight calculation if 0
            if wt_per_pc == 0.0:
                cursor.execute("""
                    SELECT coil_weight_kg, coil_length_meters 
                    FROM production_logs 
                    WHERE pipe_size = %s OR pipe_type = %s 
                    ORDER BY id DESC LIMIT 1
                """, (item['item_name'], item['item_name']))
                pl = cursor.fetchone()
                if pl and pl.get('coil_length_meters') and float(pl['coil_length_meters']) > 0:
                    wt_per_pc = float(pl['coil_weight_kg']) / float(pl['coil_length_meters'])

            total_item_wt = round(dispatched_q * wt_per_pc, 2)
            grand_total_weight += total_item_wt
            total_dispatched_qty += dispatched_q

            processed_items.append({
                "id": item.get('id'),
                "item_name": item.get('item_name'),
                "planned_qty": planned_q,
                "dispatched_qty": dispatched_q,
                "unit": unit,
                "weight_per_pc": round(wt_per_pc, 3),
                "total_weight_kg": total_item_wt
            })

            # Verification Breakdown Check
            cursor.execute("""
                SELECT item_type, required_qty, scanned_qty, status 
                FROM dispatch_verification 
                WHERE dp_number = %s OR so_number = %s
            """, (plan_no, so_no))
            ver_items = cursor.fetchall()

            direct_tot = sum(float(v["required_qty"]) for v in ver_items if v["item_type"] == "DIRECT_DISPATCH")
            direct_disc = sum(float(v["scanned_qty"]) for v in ver_items if v["item_type"] == "DIRECT_DISPATCH")
            
            store_tot = sum(float(v["required_qty"]) for v in ver_items if v["item_type"] == "STORE_KIT")
            store_disc = sum(float(v["scanned_qty"]) for v in ver_items if v["item_type"] == "STORE_KIT")

            if not ver_items:
                for itm in processed_items:
                    if classify_item_type(itm["item_name"]) == "DIRECT_DISPATCH":
                        direct_tot += float(itm["planned_qty"])
                        direct_disc += float(itm["dispatched_qty"])
                    else:
                        store_tot += float(itm["planned_qty"])
                        store_disc += float(itm["dispatched_qty"])

            direct_progress_pct = 100.0 if direct_tot == 0 else round(min(100.0, direct_disc / direct_tot * 100), 1)
            store_kit_progress_pct = 100.0 if store_tot == 0 else round(min(100.0, store_disc / store_tot * 100), 1)
            challan_unlocked = (direct_progress_pct >= 100.0 and store_kit_progress_pct >= 100.0)

    return {
        "status": "Success",
        "plan_no": plan_no,
        "so_no": so_no,
        "plan_status": plan_status,
        "vehicle_no": vehicle_no or "",
        "transporter_name": transporter_name or "",
        "driver_info": driver_info or "",
        "created_at": created_at,
        "items": processed_items,
        "total_items": len(processed_items),
        "total_dispatched_qty": total_dispatched_qty,
        "grand_total_weight_kg": round(grand_total_weight, 2),
        "direct_progress_pct": direct_progress_pct,
        "store_kit_progress_pct": store_kit_progress_pct,
        "challan_unlocked": challan_unlocked
    }


@app.post("/api/delivery-challan/update-vehicle")
def update_vehicle_info(req: VehicleInfoUpdateRequest):
    plan_target = str(req.plan_id)
    updated = False

    with get_db_ctx(commit=True) as (conn, cursor):
        if plan_target.isdigit():
            cursor.execute("""
                UPDATE dispatch_plans 
                SET vehicle_no = %s, transporter_name = %s, driver_info = %s 
                WHERE id = %s
            """, (req.vehicle_no, req.transporter_name, req.driver_info, int(plan_target)))
            if cursor.rowcount > 0:
                updated = True

        if not updated:
            cursor.execute("""
                UPDATE dispatch_plans 
                SET vehicle_no = %s, transporter_name = %s, driver_info = %s 
                WHERE plan_no = %s
            """, (req.vehicle_no, req.transporter_name, req.driver_info, plan_target))
            if cursor.rowcount > 0:
                updated = True

        if not updated:
            cursor.execute("""
                UPDATE dp_plans 
                SET vehicle_no = %s, transporter_name = %s, driver_info = %s 
                WHERE dp_number = %s
            """, (req.vehicle_no, req.transporter_name, req.driver_info, plan_target))
            if cursor.rowcount > 0:
                updated = True

    # Sync with SQLite inventory.db
    if os.path.exists("inventory.db"):
        try:
            sq_conn = sqlite3.connect("inventory.db")
            sq_cursor = sq_conn.cursor()
            if plan_target.isdigit():
                sq_cursor.execute("UPDATE dispatch_plans SET vehicle_no = ?, transporter_name = ?, driver_info = ? WHERE id = ?", (req.vehicle_no, req.transporter_name, req.driver_info, int(plan_target)))
            sq_cursor.execute("UPDATE dispatch_plans SET vehicle_no = ?, transporter_name = ?, driver_info = ? WHERE plan_no = ?", (req.vehicle_no, req.transporter_name, req.driver_info, plan_target))
            sq_cursor.execute("UPDATE dp_plans SET vehicle_no = ?, transporter_name = ?, driver_info = ? WHERE dp_number = ?", (req.vehicle_no, req.transporter_name, req.driver_info, plan_target))
            sq_conn.commit()
            sq_conn.close()
        except Exception as e:
            print(f"[WARNING] SQLite vehicle sync error: {e}")

    return {"status": "Success", "message": "✅ Vehicle and transporter details saved successfully!"}


@app.get("/api/health-check")
def health_check():
    """
    Checks server and database connection status.
    """
    db_status = "error"
    try:
        # Attempts to acquire database connection from pool.
        # If successful, database is connected.
        with get_db_ctx() as (conn, cursor):
            cursor.execute("SELECT 1")
            if cursor.fetchone():
                db_status = "connected"
    except Exception as e:
        print(f"Health Check DB Error: {e}")
        db_status = "error"

    return {"server_status": "connected", "db_status": db_status}
    return {"server_status": "connected", "db_status": db_status}
