import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

LAUNCHER = Path(__file__).resolve().parents[1] / "build-playtest-content.sh"
SHELL = shutil.which("sh")
if not SHELL and Path("C:/Program Files/Git/usr/bin/sh.exe").exists():
    SHELL = "C:/Program Files/Git/usr/bin/sh.exe"


@unittest.skipUnless(SHELL, "A POSIX shell is required")
class ShellLauncherTests(unittest.TestCase):
    def test_syntax(self):
        subprocess.run([SHELL, "-n", LAUNCHER.as_posix()], check=True)

    def launch(self, args, status=0):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            system = root / "system with spaces"
            environment = system / "tools/.venv/bin"
            environment.mkdir(parents=True)
            launcher = system / LAUNCHER.name
            shutil.copyfile(LAUNCHER, launcher)
            python = environment / "python"
            python.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$LAUNCHER_TEST_LOG"\nexit "$LAUNCHER_TEST_STATUS"\n', encoding="utf-8", newline="\n")
            python.chmod(0o755)
            log = root / "args.txt"
            result = subprocess.run([SHELL, launcher.as_posix(), *args], cwd=root,
                                    stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                    env={**os.environ, "PATH": str(Path(SHELL).parent) + os.pathsep + os.environ.get("PATH", ""),
                                         "LAUNCHER_TEST_LOG": log.as_posix(),
                                         "LAUNCHER_TEST_STATUS": str(status)})
            self.assertTrue(log.exists(), result.stderr)
            return result, log.read_text().splitlines()

    def test_arguments_and_relative_packet_path_survive_another_working_directory(self):
        args = ["--setup", "--check", "--packet", "relative packet with spaces"]
        result, received = self.launch(args)
        self.assertEqual(result.returncode, 0)
        self.assertTrue(received[0].endswith("/system with spaces/tools/build_all.py"))
        self.assertEqual(received[1:], args)

    def test_failure_exit_status_is_preserved(self):
        result, _ = self.launch(["--check"], status=7)
        self.assertEqual(result.returncode, 7)

    def test_unattended_bare_invocation_does_not_prompt(self):
        result, received = self.launch([])
        self.assertEqual(result.returncode, 0)
        self.assertEqual(len(received), 1)


if __name__ == "__main__":
    unittest.main()
