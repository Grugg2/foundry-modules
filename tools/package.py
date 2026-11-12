"""Package only checked-in module code. Does not read/write any live Foundry install."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://grugg2.github.io/foundry-modules"
SOURCE = ROOT / "modules/gm-deck"
FILES = ("module.json", "README.md", "scripts/main.mjs", "styles/gm-deck.css")


def main():
    manifest = json.loads((SOURCE / "module.json").read_text(encoding="utf-8"))
    assert manifest["id"] == "gm-deck"
    version = manifest["version"]
    assert version and all(c.isalnum() or c in ".-_" for c in version)
    assert "verified" not in manifest["compatibility"], "No runtime verification yet"
    for name in [*manifest.get("esmodules", []), *manifest.get("styles", [])]:
        assert name in FILES and (SOURCE / name).is_file(), name
    assert manifest["manifest"] == SITE + "/modules/gm-deck/module.json"
    assert manifest["download"] == SITE + f"/downloads/gm-deck-{version}.zip"
    output = ROOT / "docs/downloads" / f"gm-deck-{version}.zip"
    output.parent.mkdir(parents=True, exist_ok=True)
    # Fixed timestamps give identical packages for identical source bytes.
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            info = zipfile.ZipInfo("gm-deck/" + name, date_time=(2026, 11, 12, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (SOURCE / name).read_bytes())
    destination = ROOT / "docs/modules/gm-deck/module.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes((SOURCE / "module.json").read_bytes())
    sha = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(".zip.sha256").write_text(f"{sha}  {output.name}\n", encoding="utf-8")
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {"gm-deck/" + name for name in FILES}
        assert json.loads(archive.read("gm-deck/module.json")) == manifest
    index = ROOT / "docs/index.html"
    if index.is_file():
        class Links(HTMLParser):
            def handle_starttag(self, tag, attrs):
                for key, value in attrs:
                    if key not in {"href", "src"} or not value:
                        continue
                    parsed = urlsplit(value)
                    if parsed.scheme or parsed.netloc or not parsed.path:
                        continue
                    target = (index.parent / unquote(parsed.path)).resolve()
                    assert target.is_relative_to(ROOT.resolve()), value
                    assert target.is_file(), f"Missing local page resource: {value}"
        Links().feed(index.read_text(encoding="utf-8"))
    print(json.dumps({"module": manifest["id"], "version": version, "zipBytes": output.stat().st_size,
                      "sha256": sha, "status": "package and local links checked; runtime untested"}, indent=2))


if __name__ == "__main__":
    main()
