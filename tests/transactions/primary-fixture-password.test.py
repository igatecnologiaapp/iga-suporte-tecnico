import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

script = Path(__file__).resolve().parents[1] / "homologation/sync-primary-fixture-password.py"
spec = importlib.util.spec_from_file_location("primary_fixture_sync", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrimaryFixtureSync(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.config = self.root / "local-config.json"
        self.config.write_text(json.dumps({"API_URL": "http://127.0.0.1:55421", "ANON_KEY": "synthetic-public"}))
        self.fixture = self.root / "fixtures.json"
        self.original = {"users": {"primary": {"id": "primary-id", "email": "primary@iga-homologation.example", "password": "synthetic-old-password"}, "admin": {"password": "unchanged-admin"}}, "companies": ["unchanged"]}
        self.fixture.write_text(json.dumps(self.original))
        self.fixture.chmod(0o600)
        self.calls = []

    def run_sync(self, old_valid=False, new_valid=True, wrong_identity=False, remote=False, provider_error=False, tty=True, conflict=False):
        if remote:
            self.config.write_text(json.dumps({"API_URL": "https://remote.example.test", "ANON_KEY": "synthetic-public"}))
        outer = self

        class Opener:
            def open(self, request, timeout):
                outer.calls.append(request)
                if "/logout" in request.full_url:
                    return io.BytesIO(b"{}")
                attrs = json.loads(request.data)
                old = attrs["password"] == "synthetic-old-password"
                if provider_error or not (old_valid if old else new_valid):
                    code = 500 if provider_error else 400
                    raise urllib.error.HTTPError(request.full_url, code, "synthetic", {}, io.BytesIO(json.dumps({"code": "unexpected" if provider_error else "invalid_credentials"}).encode()))
                if conflict and not old:
                    changed = json.loads(outer.fixture.read_text())
                    changed["companies"].append("concurrent-write")
                    outer.fixture.write_text(json.dumps(changed))
                return io.BytesIO(json.dumps({"user": {"id": "wrong-id" if wrong_identity else "primary-id", "email": "primary@iga-homologation.example"}, "access_token": "synthetic-token"}).encode())

        output = io.StringIO()
        with patch.dict(os.environ, {"IGA_HOMO_PRIVATE": str(self.root)}), patch.object(module.urllib.request, "build_opener", return_value=Opener()), patch.object(module.getpass, "getpass", return_value="synthetic-new-password") as prompt, patch.object(module.sys.stdin, "isatty", return_value=tty), contextlib.redirect_stdout(output):
            try:
                module.main()
            finally:
                self.output = output.getvalue()
                self.prompt_count = prompt.call_count

    def test_valid_old_password_does_not_write_or_prompt(self):
        before = self.fixture.read_bytes()
        self.run_sync(old_valid=True)
        self.assertEqual(before, self.fixture.read_bytes())
        self.assertEqual(self.prompt_count, 0)
        self.assertIn("scope=local", self.calls[-1].full_url)

    def test_verified_new_password_updates_only_primary_without_auth_password_mutation(self):
        self.run_sync()
        expected = self.original.copy()
        expected = json.loads(json.dumps(expected))
        expected["users"]["primary"]["password"] = "synthetic-new-password"
        self.assertEqual(json.loads(self.fixture.read_text()), expected)
        self.assertEqual(self.fixture.stat().st_mode & 0o777, 0o600)
        self.assertNotIn("synthetic-new-password", self.output)
        self.assertTrue(all("/token?grant_type=password" in call.full_url or "/logout?scope=local" in call.full_url for call in self.calls))
        self.assertEqual(len(list(self.root.glob(".primary-fixture-*"))), 0)

    def test_invalid_new_password_preserves_fixture(self):
        before = self.fixture.read_bytes()
        with self.assertRaises(RuntimeError):
            self.run_sync(new_valid=False)
        self.assertEqual(before, self.fixture.read_bytes())

    def test_remote_destination_rejected_before_network(self):
        with self.assertRaises(RuntimeError):
            self.run_sync(remote=True)
        self.assertEqual(self.calls, [])

    def test_mismatched_identity_preserves_fixture(self):
        before = self.fixture.read_bytes()
        with self.assertRaises(RuntimeError):
            self.run_sync(old_valid=True, wrong_identity=True)
        self.assertEqual(before, self.fixture.read_bytes())
        self.assertEqual(self.prompt_count, 0)

    def test_provider_failure_is_not_treated_as_a_wrong_password(self):
        with self.assertRaises(RuntimeError):
            self.run_sync(provider_error=True)
        self.assertEqual(self.prompt_count, 0)
        self.assertEqual(json.loads(self.fixture.read_text()), self.original)

    def test_noninteractive_input_never_prompts(self):
        with self.assertRaises(RuntimeError):
            self.run_sync(tty=False)
        self.assertEqual(self.prompt_count, 0)
        self.assertEqual(json.loads(self.fixture.read_text()), self.original)

    def test_concurrent_fixture_write_is_not_overwritten(self):
        with self.assertRaises(RuntimeError):
            self.run_sync(conflict=True)
        current = json.loads(self.fixture.read_text())
        self.assertEqual(current["users"]["primary"]["password"], "synthetic-old-password")
        self.assertIn("concurrent-write", current["companies"])


if __name__ == "__main__":
    unittest.main()
