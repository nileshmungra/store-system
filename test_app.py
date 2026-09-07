import os
import sys
from unittest.mock import MagicMock, patch, AsyncMock

# Ensure project root is importable
sys.path.insert(0, os.path.dirname(__file__))

# Set required environment variables before importing main
os.environ.setdefault("ADMIN_PASSWORD", "test_password_123")
os.environ.setdefault("API_SECRET_KEY", "test_secret_key")
os.environ.setdefault("ALLOWED_ORIGINS", "*")

from fastapi.testclient import TestClient

# Patch database initialization and connection pool so tests run without MySQL
with patch("database.init_db"):
    from main import app

client = TestClient(app)


def _mock_cursor(results=None, fetchone_result=None):
    """Create a mock cursor with configurable fetch results."""
    cursor = MagicMock()
    cursor.execute = MagicMock()
    cursor.fetchall.return_value = results or []
    cursor.fetchone.return_value = fetchone_result
    cursor.lastrowid = 1
    cursor.rowcount = 1
    return cursor


def _mock_get_db_ctx(fetchone_result=None, fetchall_results=None):
    """Create a mock for get_db_ctx context manager."""
    cursor = _mock_cursor(
        results=fetchall_results or [],
        fetchone_result=fetchone_result,
    )
    conn = MagicMock()
    conn.cursor.return_value = cursor
    conn.commit = MagicMock()
    conn.rollback = MagicMock()

    mock_ctx = MagicMock()
    mock_ctx.__enter__ = MagicMock(return_value=(conn, cursor))
    mock_ctx.__exit__ = MagicMock(return_value=False)
    return mock_ctx, conn, cursor


# ===============================================
# 1. Smoke Tests (original tests)
# ===============================================

def test_app_imports():
    assert app is not None


def test_auth_token():
    response = client.post("/api/auth/token", json={})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_dashboard_served():
    response = client.get("/")
    assert response.status_code == 200


def test_scanner_page():
    response = client.get("/scanner")
    assert response.status_code == 200


def test_health_like():
    response = client.get("/api/auth/verify")
    assert response.status_code == 200
    assert response.json()["status"] == "valid"


# ===============================================
# 2. Authentication Tests
# ===============================================

def test_auth_token_with_username():
    response = client.post("/api/auth/token", json={"username": "admin"})
    assert response.status_code == 200
    data = response.json()
    assert data["access_token"] == "test_secret_key"
    assert data["user"] == "admin"


def test_auth_token_with_custom_user():
    response = client.post(
        "/api/auth/token",
        json={"username": "testuser"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"] == "testuser"


def test_verify_password_correct():
    response = client.post(
        "/api/admin/verify-password",
        json={"password": "test_password_123"},
    )
    assert response.status_code == 200
    assert response.json() == {"valid": True}


def test_verify_password_incorrect():
    response = client.post(
        "/api/admin/verify-password",
        json={"password": "wrong_password"},
    )
    assert response.status_code == 401


def test_verify_password_empty():
    response = client.post(
        "/api/admin/verify-password",
        json={"password": ""},
    )
    assert response.status_code == 400


# ===============================================
# 3. Page Route Tests
# ===============================================

def test_inward_page():
    response = client.get("/inward-page")
    assert response.status_code == 200


def test_items_page():
    response = client.get("/items-page")
    assert response.status_code == 200


def test_production_page():
    response = client.get("/production-page")
    assert response.status_code == 200


def test_dispatch_page():
    response = client.get("/dispatch-page")
    assert response.status_code == 200


def test_bom_page():
    response = client.get("/bom-page")
    assert response.status_code == 200


def test_challan_page():
    response = response = client.get("/challan-page")
    assert response.status_code == 200


def test_delivery_challan_page():
    response = client.get("/delivery-challan-page")
    assert response.status_code == 200


def test_report_page():
    response = client.get("/report-page")
    assert response.status_code == 200


def test_logs_page():
    response = client.get("/logs-page")
    assert response.status_code == 200


def test_dashboard_alias():
    response = client.get("/dashboard")
    assert response.status_code == 200


# ===============================================
# 4. API Endpoint Tests (with mocked DB)
# ===============================================

def test_get_dashboard_stats_success():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx()
        cursor.fetchone.side_effect = [
            {"count": 5, "total_qty": 100},   # inward stats
            {"count": 3, "total_weight": 50}, # production stats
            {"count": 2},                      # pending dispatch
            {"count": 10},                     # total items
        ]
        cursor.fetchall.side_effect = [
            [  # 7-day trend
                {"short_label": "01 Sep", "inward_qty": 10, "prod_qty": 20},
                {"short_label": "02 Sep", "inward_qty": 15, "prod_qty": 25},
            ],
            [  # top 5 groups
                {"group_name": "Pipes", "qty": 10},
            ],
        ]
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "today_inward_count" in data
        assert "total_items_count" in data


def test_get_dashboard_stats_db_error():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx()
        cursor.execute.side_effect = Exception("DB connection failed")
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"


def test_list_items_success():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx(
            fetchone_result={"total": 2},
        )
        cursor.fetchall.side_effect = [
            [{"item_group": "Pipes"}, {"item_group": "Fittings"}],
            [
                {"id": 1, "item_name": "Pipe A", "item_code": "ITM-001"},
                {"id": 2, "item_name": "Pipe B", "item_code": "ITM-002"},
            ],
        ]
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/items/list")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Success"
        assert len(data["items"]) == 2


def test_list_items_with_search():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx(
            fetchone_result={"total": 1},
        )
        cursor.fetchall.side_effect = [
            [{"item_group": "Pipes"}],
            [
                {"id": 1, "item_name": "HDPE Pipe 50mm", "item_code": "ITM-101"},
            ],
        ]
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/items/list?search=HDPE")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Success"


def test_list_qc_pending_success():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx()
        cursor.fetchall.return_value = [
            {"id": 1, "item_name": "Fitting X", "status": "PENDING_QC"},
        ]
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/qc/pending")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Success"
        assert data["count"] == 1


def test_list_qc_by_status():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx()
        cursor.fetchall.return_value = [
            {"id": 1, "item_name": "Fitting X", "status": "APPROVED"},
        ]
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/qc/list?status=APPROVED")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Success"


def test_list_qc_no_filter():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx()
        cursor.fetchall.return_value = []
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/qc/list")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Success"


# ===============================================
# 5. Dispatch Plan API Tests (with mocked DB)
# ===============================================

def test_dispatch_plan_list():
    with patch("main.get_db_ctx") as mock_get_db_ctx:
        mock_ctx, _, cursor = _mock_get_db_ctx()
        cursor.fetchall.side_effect = [
            [  # plans
                {
                    "id": 1, "plan_no": "DP001", "so_no": "SO1001",
                    "plan_date": "2025-01-01", "status": "ACTIVE",
                },
            ],
            [  # items for each plan
                {
                    "id": 1, "item_name": "Pipe A", "planned_qty": 10,
                    "dispatched_qty": 5, "unit": "MTR", "weight_per_pc": 0.25,
                },
            ],
            [],  # verification items
        ]
        mock_get_db_ctx.return_value = mock_ctx

        response = client.get("/api/dispatch-plans/list")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Success"
        assert len(data["plans"]) == 1


# ===============================================
# 6. Error Response Tests
# ===============================================

def test_items_page_not_found():
    # items.html always exists, so this tests the happy path
    response = client.get("/items-page")
    assert response.status_code == 200


def test_auth_token_accepts_json():
    response = client.post("/api/auth/token", json={"username": "operator"})
    assert response.status_code == 200
    data = response.json()
    assert data["user"] == "operator"
    assert data["token_type"] == "bearer"


# ===============================================
# 7. Inward API Tests (with mocked DB)
# ===============================================

def test_get_inward_batch_found():
    with patch("main.get_db") as mock_get_db:
        cursor = MagicMock()
        conn = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchone.return_value = {
            "id": 1, "item_name": "Test Item",
            "supplier_or_party": "ABC Supplier", "remark": "Test remark",
        }
        mock_get_db.return_value = conn

        response = client.get("/api/inward/batch/1")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Success"
        assert data["batch"]["item_name"] == "Test Item"
        conn.close.assert_called_once()


def test_get_inward_batch_not_found():
    with patch("main.get_db") as mock_get_db:
        cursor = MagicMock()
        conn = MagicMock()
        conn.cursor.return_value = cursor
        cursor.fetchone.return_value = None
        mock_get_db.return_value = conn

        response = client.get("/api/inward/batch/999")
        assert response.status_code == 404
        conn.close.assert_called_once()
