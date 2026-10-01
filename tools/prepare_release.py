"""Validate built release assets and extract the matching changelog section."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from zipfile import ZipFile


def release_notes(changelog, version):
    sections = re.split(r"(?m)^## ", changelog)
    matches = []
    for section in sections[1:]:
        heading, _, body = section.partition("\n")
        if re.match(rf"^v?{re.escape(version)}(?:\s|$)", heading.strip()):
            matches.append(body.strip())
    if len(matches) != 1 or not matches[0]:
        raise ValueError(f"Expected one nonempty changelog section for {version}")
    return f"## {version}\n\n{matches[0]}\n"


def prepare(root, output, manifest_name, repository, tag):
    root, output = Path(root), Path(output)
    manifest_path = output / manifest_name
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version) or tag != f"v{version}":
        raise ValueError("Tag must match the manifest version (vX.Y.Z)")
    package_path = root / "package.json"
    if package_path.exists() and json.loads(package_path.read_text())["version"] != version:
        raise ValueError("Package and manifest versions must match")
    archive_path = output / f"{manifest['id']}.zip"
    expected = f"https://github.com/{repository}/releases/download/{tag}/{archive_path.name}"
    if manifest.get("download") != expected:
        raise ValueError("Manifest download URL must match the repository, tag and ZIP")
    notes = release_notes((root / "CHANGELOG.md").read_text(encoding="utf-8"), version)
    with ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity check failed")
        if archive.read(manifest_name) != manifest_path.read_bytes():
            raise ValueError("Embedded and external manifests must match")
        required = manifest.get("esmodules", []) + manifest.get("styles", [])
        required += [manifest["readme"], manifest["license"]]
        required += [language["path"] for language in manifest.get("languages", [])]
        missing = set(required) - set(archive.namelist())
        if missing:
            raise ValueError(f"Unpackaged manifest references: {sorted(missing)}")
    (output / "RELEASE-NOTES.md").write_text(notes, encoding="utf-8")
    sums = "".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
                   for path in (archive_path, manifest_path))
    (output / "SHA256SUMS.txt").write_text(sums, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    prepare(Path(__file__).resolve().parents[1], args.output, args.manifest, args.repository, args.tag)
