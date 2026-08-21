import os
import sys

# Ensure project root is importable
sys.path.insert(0, os.path.dirname(__file__))

from unittest.mock import patch
from fastapi.testclient import TestClient

with patch("database.init_db"):
    from main import app

client = TestClient(app)


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
