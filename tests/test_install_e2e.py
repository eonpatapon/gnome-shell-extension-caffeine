#!/usr/bin/env python3
"""End-to-end tests for the README installation flow.

Exercises the exact steps documented in README.md ("Installation from source"):

    make build
    make install
    restart the shell
    enable the extension

The extension is installed into a throwaway XDG_DATA_HOME so the developer's
real session is never touched, then a headless nested GNOME Shell is booted and
asked to load it.  That last step is what proves a new GNOME Shell major version
actually works, rather than merely being listed in metadata.json.

Run with:

    make test
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = REPO_ROOT / "caffeine@patapon.info"
METADATA = EXTENSION_DIR / "metadata.json"
BUNDLE = REPO_ROOT / "caffeine@patapon.info.zip"
UUID = "caffeine@patapon.info"
SCHEMA = "org.gnome.shell.extensions.caffeine"

SHELL_BOOT_TIMEOUT = 60  # seconds to wait for the nested shell's D-Bus service
SHELL_LOAD_TIMEOUT = 30  # seconds to wait for the shell to finish loading the JS


def run(cmd, *, env=None, cwd=REPO_ROOT, check=True):
    """Run a command, merging stderr into stdout."""
    return subprocess.run(
        cmd, cwd=cwd, env=env, check=check,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )


def shell_major_version():
    """Major version of the installed GNOME Shell, e.g. '51'."""
    out = run(["gnome-shell", "--version"]).stdout.strip()
    # "GNOME Shell 51.0" -> "51"
    return out.split()[-1].split(".")[0]


class ReadmeInstallTest(unittest.TestCase):
    """Build, install and load the extension the way the README documents."""

    @classmethod
    def setUpClass(cls):
        cls.workdir = Path(tempfile.mkdtemp(prefix="caffeine-e2e-"))
        cls.data_home = cls.workdir / "data"
        cls.config_home = cls.workdir / "config"
        cls.cache_home = cls.workdir / "cache"
        cls.runtime_dir = cls.workdir / "run"
        for path in (cls.data_home, cls.config_home, cls.cache_home, cls.runtime_dir):
            path.mkdir(parents=True)
        cls.runtime_dir.chmod(0o700)

        # An isolated environment: the extension, its dconf state and the
        # nested shell's sockets all land under the temp dir.
        cls.env = dict(os.environ)
        cls.env.update({
            "XDG_DATA_HOME": str(cls.data_home),
            "XDG_CONFIG_HOME": str(cls.config_home),
            "XDG_CACHE_HOME": str(cls.cache_home),
            "XDG_RUNTIME_DIR": str(cls.runtime_dir),
        })
        cls.env.pop("DBUS_SESSION_BUS_ADDRESS", None)

        cls.installed = cls.data_home / "gnome-shell" / "extensions" / UUID

        # The README's install steps, run once for the whole case.
        cls.shell_log = cls.workdir / "shell.log"
        cls.info_path = cls.workdir / "shell-info.txt"
        cls.shell_stdout = None
        cls.shell_stderr = None
        cls._build()
        cls._install()
        cls._load_in_shell()

    @classmethod
    def _build(cls):
        run(["make", "build"], env=cls.env)

    @classmethod
    def _install(cls):
        run(["make", "install"], env=cls.env)

    @classmethod
    def _load_in_shell(cls):
        """Boot a headless nested shell and enable the extension in it.

        One dbus session holds both the shell and the gext CLI that talks to
        it, mirroring "restart the shell, then enable the extension".
        """
        script = f"""
set -u
gnome-shell --headless --wayland --no-x11 > {cls.shell_log} 2>&1 &
shell_pid=$!
trap 'kill $shell_pid 2>/dev/null' EXIT

# The shell registers org.gnome.Shell.Extensions partway through startup.
for _ in $(seq 1 {SHELL_BOOT_TIMEOUT}); do
    if gnome-extensions list >/dev/null 2>&1; then break; fi
    sleep 1
done

gnome-extensions enable {UUID}

# Enabling is asynchronous; wait for the shell to finish loading the JS.
for _ in $(seq 1 {SHELL_LOAD_TIMEOUT}); do
    gnome-extensions info {UUID} > {cls.info_path} 2>&1 || true
    if grep -qE "^  State: (ACTIVE|ERROR)$" {cls.info_path}; then break; fi
    sleep 1
done
"""
        proc = subprocess.run(
            ["dbus-run-session", "--", "bash", "-c", script],
            cwd=REPO_ROOT, env=cls.env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        cls.shell_stdout = proc.stdout
        cls.shell_stderr = proc.stderr

    def shell_context(self):
        """Everything useful for diagnosing a shell failure."""
        log = self.shell_log.read_text() if self.shell_log.is_file() else "<no log>"
        info = self.info_path.read_text() if self.info_path.is_file() else "<no info>"
        return (
            f"--- gnome-extensions info ---\n{info}\n"
            f"--- gext stderr ---\n{self.shell_stderr}\n"
            f"--- shell log ---\n{log}"
        )

    @classmethod
    def tearDownClass(cls):
        run(["make", "clean"], check=False)
        shutil.rmtree(cls.workdir, ignore_errors=True)

    def test_install_shares_the_repo_extension_path(self):
        """Guard: the isolated install must not be the developer's real one."""
        real = Path(os.path.expanduser("~/.local/share/gnome-shell/extensions"))
        self.assertNotEqual(self.installed, real / UUID)

    def test_build_produces_an_installable_bundle(self):
        """`make build` (README step 1) packs the extension."""
        self.assertTrue(BUNDLE.is_file(), f"{BUNDLE} was not created")

    def test_metadata_version_and_shell_version_match_this_release(self):
        """v61 must advertise support for the shell that is actually running."""
        metadata = json.loads(METADATA.read_text())
        self.assertEqual(metadata["version"], 61)
        self.assertIn(
            shell_major_version(), metadata["shell-version"],
            f"metadata.json does not claim support for GNOME Shell "
            f"{shell_major_version()}",
        )

    def test_install_unpacks_into_xdg_data_home(self):
        """`make install` (README step 2) unpacks the bundle."""
        self.assertTrue(
            (self.installed / "extension.js").is_file(),
            f"extension not installed to {self.installed}",
        )
        self.assertTrue((self.installed / "metadata.json").is_file())

    def test_installed_schemas_are_compiled_and_readable(self):
        """The README's command-line section must work on a fresh install."""
        self.assertTrue(
            (self.installed / "schemas" / "gschemas.compiled").is_file(),
            "gschemas.compiled missing: gnome-extensions pack did not compile it",
        )
        result = run([
            "gsettings", "--schemadir", str(self.installed / "schemas"),
            "get", SCHEMA, "cli-toggle",
        ], env=self.env)
        self.assertIn(result.stdout.strip(), ("true", "false"))

    def test_extension_reaches_active_state_in_headless_shell(self):
        """The real test: boot GNOME Shell and make it load the extension."""
        self.assertTrue(
            self.info_path.is_file(),
            f"gnome-extensions info produced no output.\n{self.shell_context()}",
        )
        info = self.info_path.read_text()
        self.assertIn(
            UUID, info,
            f"extension is unknown to the nested shell.\n{self.shell_context()}",
        )
        self.assertIn(
            "State: ACTIVE", info,
            f"extension did not finish loading.\n{self.shell_context()}",
        )

    def test_no_extension_js_errors_in_shell_log(self):
        """A load that throws would still report ACTIVE without this check."""
        log = self.shell_log.read_text() if self.shell_log.is_file() else ""
        errors = [
            line for line in log.splitlines()
            if "JS ERROR" in line and "caffeine" in line.lower()
        ]
        self.assertEqual(
            errors, [],
            f"the shell reported JS errors for the extension.\n{self.shell_context()}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
