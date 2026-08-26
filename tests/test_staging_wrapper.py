from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
STAGING = ROOT / "deployment" / "staging"


class StagingWrapperTests(unittest.TestCase):
    def setUp(self) -> None:
        self.compose = (STAGING / "docker-compose.staging.yml").read_text()

    def test_only_web_is_published_on_the_required_loopback_port(self) -> None:
        self.assertEqual(self.compose.count("ports:"), 1)
        self.assertIn('"127.0.0.1:${ZUNO_WEB_HOST_PORT:-3100}:3000"', self.compose)
        self.assertNotIn(":8100", self.compose)
        self.assertNotIn(":5432", self.compose)
        self.assertNotIn(":6379", self.compose)

    def test_data_services_are_project_private_and_use_distinct_storage(self) -> None:
        self.assertIn("  postgres:\n", self.compose)
        self.assertIn("  redis:\n", self.compose)
        self.assertIn("    internal: true", self.compose)
        self.assertIn("postgres-data:/var/lib/postgresql/data", self.compose)
        self.assertIn("redis-data:/data", self.compose)

    def test_staging_secrets_are_ignored(self) -> None:
        self.assertEqual((STAGING / ".gitignore").read_text().strip(), ".env.staging")
        tracked_example = (STAGING / ".env.staging.example").read_text()
        self.assertNotIn("sk_live_", tracked_example)
        self.assertNotIn("whsec_", tracked_example)

    def test_nginx_uses_an_isolated_hostname_and_loopback_upstream(self) -> None:
        nginx = (STAGING / "nginx" / "zunopixel-staging.conf").read_text()
        self.assertIn("server_name staging.zunopixel.com.au;", nginx)
        self.assertIn("proxy_pass http://127.0.0.1:3100;", nginx)
        self.assertNotIn("siteforge", nginx.lower())


if __name__ == "__main__":
    unittest.main()
