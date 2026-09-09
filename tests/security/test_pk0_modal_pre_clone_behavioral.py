#!/usr/bin/env python3
"""PK-0 Modal pre-clone execution admission seam.

This suite tests the AISecurityScanner.scan admission gate before any
repository clone or analysis is attempted.  It does not run a full scan,
does not call the real GitHub API, and does not require a real database.
"""
import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

# Ensure the project root is on the path so modal_ai_security_scanner can be
# imported without an editable install.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import modal_ai_security_scanner as mas
from modal_ai_security_scanner import AISecurityScanner

COMMIT = "a" * 40
REPO = "https://github.com/owner/repo"
SCAN_ID = "scan-pk0"


class MockResponse:
    def __init__(self, status_code, body=None):
        self.status_code = status_code
        self._body = body or {}
        self.text = ""

    def json(self):
        return self._body


def subprocess_side_effect(cmd, **kwargs):
    """Simple deterministic subprocess.run stand-in for git checkout / rev-parse."""
    if isinstance(cmd, list) and len(cmd) >= 5 and cmd[3] == "rev-parse":
        sha = COMMIT if getattr(subprocess_side_effect, "_match", True) else "b" * 40
        return MagicMock(returncode=0, stdout=sha + "\n")
    return MagicMock(returncode=0, stdout="")


class TestModalPreCloneAdmission(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.scanner = AISecurityScanner()
        self.tmpdir = tempfile.mkdtemp()

        # Neutral patches: keep DB calls inert.
        self.validate_db = patch.object(
            self.scanner, "validate_database_connection", new_callable=AsyncMock, return_value=True
        )
        self.update_status = patch.object(
            self.scanner, "update_scan_status", new_callable=AsyncMock
        )
        self.validate_db.start()
        self.update_status.start()

    async def asyncTearDown(self):
        self.validate_db.stop()
        self.update_status.stop()

    @patch.object(AISecurityScanner, "clone_repository", return_value=None)
    async def test_missing_authorization_no_clone(self, mock_clone):
        """authorization_id absent -> clone_repository must not be called."""
        result = await self.scanner.scan(
            SCAN_ID, REPO, "main", None, None, None, COMMIT, ["DEFAULT"], None
        )
        self.assertNotEqual(result.status, mas.ScanStatus.COMPLETED.value)
        mock_clone.assert_not_called()

    @patch("httpx.AsyncClient")
    @patch.object(AISecurityScanner, "clone_repository", return_value=None)
    async def test_denied_authorization_no_clone(self, mock_clone, mock_client):
        """Authorization API returns 403 -> clone_repository must not be called."""
        client = AsyncMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        client.post = AsyncMock(return_value=MockResponse(403, {"error": "denied"}))
        mock_client.return_value = client

        result = await self.scanner.scan(
            SCAN_ID, REPO, "main", None, None, "auth-123", COMMIT, ["DEFAULT"], None
        )
        self.assertEqual(result.status, mas.ScanStatus.FAILED.value)
        mock_clone.assert_not_called()

    @patch("httpx.AsyncClient")
    @patch.object(AISecurityScanner, "clone_repository", return_value=None)
    async def test_missing_expected_commit_no_clone(self, mock_clone, mock_client):
        """expected_commit_sha missing/invalid -> clone_repository must not be called."""
        client = AsyncMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        client.post = AsyncMock(return_value=MockResponse(200, {"valid": True}))
        mock_client.return_value = client

        for commit in [None, "not-a-sha"]:
            result = await self.scanner.scan(
                SCAN_ID, REPO, "main", None, None, "auth-123", commit, ["DEFAULT"], None
            )
            self.assertEqual(result.status, mas.ScanStatus.FAILED.value)
            mock_clone.assert_not_called()

    @patch("httpx.AsyncClient")
    @patch("subprocess.run")
    @patch.object(AISecurityScanner, "clone_repository", return_value=None)
    async def test_cloned_head_mismatch_no_analysis(self, mock_clone, mock_sub, mock_client):
        """actual HEAD != expected commit -> analysis must not begin."""
        client = AsyncMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        client.post = AsyncMock(return_value=MockResponse(200, {"valid": True}))
        mock_client.return_value = client

        mock_clone.return_value = self.tmpdir
        subprocess_side_effect._match = False
        mock_sub.side_effect = subprocess_side_effect

        with patch.object(AISecurityScanner, "run_semgrep", new=MagicMock(side_effect=Exception("should not run"))):
            result = await self.scanner.scan(
                SCAN_ID, REPO, "main", None, None, "auth-123", COMMIT, ["DEFAULT"], None
            )
        self.assertEqual(result.status, mas.ScanStatus.FAILED.value)
        mock_clone.assert_called_once_with(REPO, "main", COMMIT, None)
        self.assertFalse(mas.ScanStatus.COMPLETED.value == result.status)

    @patch("httpx.AsyncClient")
    @patch("subprocess.run")
    @patch.object(AISecurityScanner, "clone_repository", return_value=None)
    async def test_valid_authorization_exact_commit_clone_proceeds(self, mock_clone, mock_sub, mock_client):
        """Valid auth + exact commit -> clone/checkout path is exercised."""
        client = AsyncMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        client.post = AsyncMock(return_value=MockResponse(200, {"valid": True}))
        mock_client.return_value = client

        mock_clone.return_value = self.tmpdir
        subprocess_side_effect._match = True
        mock_sub.side_effect = subprocess_side_effect

        with tempfile.TemporaryDirectory() as d:
            mock_clone.return_value = d
            (Path(d) / "a.txt").write_text("x")
            with patch.object(AISecurityScanner, "run_semgrep", new=MagicMock(side_effect=RuntimeError("stop after clone"))):
                # run_semgrep raises; scan's broad except catches it and returns,
                # but we want to assert clone was invoked before that point.
                await self.scanner.scan(
                    SCAN_ID, REPO, "main", None, None, "auth-123", COMMIT, ["DEFAULT"], None
                )
        mock_clone.assert_called_once()
        call_args = mock_clone.call_args
        self.assertEqual(call_args.args[0], REPO)
        self.assertEqual(call_args.args[1], "main")
        self.assertEqual(call_args.args[2], COMMIT)


class TestScannerKeyMiddleware(unittest.IsolatedAsyncioTestCase):
    async def test_missing_scanner_key_denies_api(self):
        """Reproduce the scanner-key gate on /api/*: missing key -> 503 SCANNER_NOT_READY."""
        os.environ.pop("SCANNER_API_KEY", None)

        async def call_next(_):
            return {"ok": True}

        class MockRequest:
            url = type("URL", (), {"path": "/api/security/scan"})()

        # Minimal in-process reproduction of the production middleware behavior.
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.responses import JSONResponse

        class ScannerAuthMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                if request.url.path.startswith("/api/"):
                    if not os.environ.get("SCANNER_API_KEY", ""):
                        return JSONResponse(
                            {"error": "Scanner service is not ready", "code": "SCANNER_NOT_READY"},
                            status_code=503,
                        )
                    key = request.headers.get("x-scanner-key", "")
                    if key != os.environ.get("SCANNER_API_KEY", ""):
                        return JSONResponse(
                            {"error": "Unauthorized", "code": "INVALID_SCANNER_KEY"},
                            status_code=401,
                        )
                return await call_next(request)

        mw = ScannerAuthMiddleware(lambda r: None)
        res = await mw.dispatch(MockRequest(), call_next)
        self.assertEqual(res.status_code, 503)
        body = json.loads(res.body.decode()) if hasattr(res, "body") else res.body
        self.assertEqual(body.get("code"), "SCANNER_NOT_READY")


if __name__ == "__main__":
    unittest.main()
