"""Build all Crows exporters. Run with --help for setup and preflight options."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import venv
from common import SYSTEM, find_pdf

TOOLS = Path(__file__).resolve().parent
STEPS = ["extract_cards.py", "extract_backgrounds.py", "build_packs.py", "extract_traits.py", "extract_monsters.py"]
INSTALL = {"equipment.new.json": "equipment.json", "dungeon-loot.new.json": "dungeon-loot.json",
           "traits.new.json": "traits.json", "monsters.new.json": "monsters.json", "backgrounds.json": "backgrounds.json",
           "connections.json": "connections.json"}
REQUIRED = [("Characters book", ["characters"], []), ("Ref book", ["ref book"], []),
            ("Inventory cards", ["cards"], ["profession", "poi", "annotated", "sheet"]),
            ("Profession cards", ["cards", "profession"], []), ("POI cards", ["cards", "poi"], [])]


def check_packet(packet):
    if not packet.is_dir():
        raise ValueError(f"Packet folder does not exist: {packet}. Extract the ZIP first.")
    errors = []
    for label, include, exclude in REQUIRED:
        try:
            print(f"  {label}: {find_pdf(packet, include, exclude).relative_to(packet)}")
        except SystemExit as error:
            errors.append(f"{label}: {error}")
    if errors:
        raise ValueError("\n".join(errors))


def check_dependencies():
    missing = [package for module, package in [("fitz", "PyMuPDF"), ("PIL", "Pillow")]
               if importlib.util.find_spec(module) is None]
    if missing:
        raise ValueError(f"Missing dependencies: {', '.join(missing)}.\nRun again with --setup to install them into tools/.venv.")


def setup_environment(args, packet):
    environment = TOOLS / ".venv"
    executable = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not executable.exists():
        print("Creating tools/.venv...", flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)
    print("Installing dependencies (internet required)...", flush=True)
    subprocess.run([str(executable), "-m", "pip", "install", "-r", str(TOOLS / "requirements.txt")], check=True)
    command = [str(executable), str(Path(__file__).resolve()), "--packet", str(packet)]
    if args.check:
        command.append("--check")
    return subprocess.run(command).returncode


def validate_outputs(folder):
    counts = {}
    for source, destination in INSTALL.items():
        path = folder / source
        if not path.is_file():
            raise ValueError(f"Missing build output: {source}")
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list) or not data:
            raise ValueError(f"{source}: expected a non-empty list")
        if any(not isinstance(entry, dict) or not entry.get("name") for entry in data):
            raise ValueError(f"{source}: an entry is missing its name")
        counts[destination] = len(data)
    return counts


def build(packet):
    output = TOOLS / "out"
    output.mkdir(parents=True, exist_ok=True)
    log_path = output / "build.log"
    with tempfile.TemporaryDirectory(prefix="crows-build-", dir=output) as stage:
        stage = Path(stage)
        intermediate, art = stage / "out", stage / "assets"
        intermediate.mkdir()
        env = {**os.environ, "CROWS_BUILD_OUT": str(intermediate), "CROWS_BUILD_ASSETS": str(art),
               "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
        with log_path.open("w", encoding="utf-8") as log:
            for index, step in enumerate(STEPS, 1):
                print(f"\n[{index}/{len(STEPS)}] {step}", flush=True)
                log.write(f"\n{step}\n")
                with subprocess.Popen([sys.executable, str(TOOLS / step), "--packet", str(packet)],
                                      cwd=TOOLS, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                      text=True, encoding="utf-8", errors="replace") as process:
                    for line in process.stdout:
                        print(line, end="")
                        log.write(line)
                    if process.wait() != 0:
                        raise ValueError(f"{step} failed. Installed files were not changed.\nLog: {log_path}")
        counts = validate_outputs(intermediate)
        files = [(intermediate / source, SYSTEM / "packs" / destination) for source, destination in INSTALL.items()]
        if art.exists():
            files += [(path, SYSTEM / "assets" / path.relative_to(art)) for path in art.rglob("*") if path.is_file()]
        for source, destination in files:
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_name(destination.name + ".building")
            try:
                shutil.copyfile(source, temporary)
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
        for source in intermediate.iterdir():
            if source.is_file():
                shutil.copyfile(source, output / source.name)
    print("\nBuild complete:")
    for name, count in counts.items():
        print(f"  {name}: {count} entries")
    print(f"\nLog: {log_path}\nIn Foundry: Settings > System Settings > Import Playtest Content.")


def main(argv=None):
    # Windows consoles may not support every character emitted by the PDFs.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="Export all Crows playtest PDFs and install the generated content.")
    parser.add_argument("--packet", type=Path, help="Extracted playtest folder (subfolders are searched)")
    parser.add_argument("--setup", action="store_true", help="Install dependencies in tools/.venv, then run")
    parser.add_argument("--check", action="store_true", help="Check PDFs and dependencies without exporting content")
    parser.add_argument("--interactive", action="store_true", help="Prompt for the packet folder")
    args = parser.parse_args(argv)
    if sys.version_info < (3, 10):
        parser.exit(1, "Python 3.10 or newer is required.\n")
    default = args.packet or Path(os.environ.get("CROWS_PACKET", SYSTEM / "pdfs"))
    if args.interactive:
        entered = input(f"\nExtracted playtest folder [{default}]: ").strip().strip('"')
        if entered:
            default = Path(entered)
    packet = default.expanduser().resolve()
    try:
        print(f"Checking playtest packet: {packet}")
        check_packet(packet)
        if args.setup:
            return setup_environment(args, packet)
        check_dependencies()
        if args.check:
            print("All required PDFs and dependencies are available. No content was changed.")
        else:
            build(packet)
        return 0
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"\nBuild stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        sys.exit("\nBuild cancelled.")
