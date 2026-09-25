"""Inject generated data into the page template."""
import io, json

from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
DATA.mkdir(exist_ok=True)

tpl = io.open(HERE / "page.template.html", encoding="utf-8").read()

for token, path in (("/*__LADDERS__*/", "ladders.json"),
                    ("/*__OPENING__*/", "opening.json"),
                    ("/*__PLACEMENT__*/", "placement.json"),
                    ("/*__PLACEMENT_RULES__*/", "placement-rules.json")):
    data = json.load(io.open(DATA / path, encoding="utf-8"))
    blob = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    assert "</script" not in blob and "<!--" not in blob, f"{path} would break out of its tag"
    assert token in tpl, f"{token} missing from template"
    tpl = tpl.replace(token, blob)

assert not any(t in tpl for t in ("__LADDERS__", "__OPENING__", "__PLACEMENT__", "__PLACEMENT_RULES__"))
assert not any(0x400 < ord(c) < 0x500 for c in tpl), "stray Cyrillic character"

io.open(HERE / "reference.html", "w", encoding="utf-8", newline="\n").write(tpl)
print("reference.html", len(tpl), "chars")
