"""On-disk memo for slow build stages and whole regions, keyed by their inputs and the pipeline source code."""
from __future__ import annotations

import hashlib
import json
import pickle
import shutil
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / ".cache"
REGION_DIR = CACHE_DIR / "regions"
CODE_DIR = Path(__file__).resolve().parent


def _code_digest(modules: tuple[str, ...] | None) -> str:
    h = hashlib.sha256()
    paths = sorted(CODE_DIR.glob("*.py")) if modules is None else [CODE_DIR / f"{m}.py" for m in modules]
    for path in paths:
        h.update(path.read_bytes())
    return h.hexdigest()


def _key(inputs: Any, modules: tuple[str, ...] | None) -> str:
    return hashlib.sha256((_code_digest(modules) + json.dumps(inputs, sort_keys=True, default=str)).encode()).hexdigest()[:16]


def stage(name: str, inputs: Any, compute: Callable[[], Any], enabled: bool = True, modules: tuple[str, ...] | None = None) -> Any:
    """Return compute()'s result, reusing a stored copy when the inputs and the code it depends on are unchanged.

    modules: atlas module names the stage depends on (default: all of them).
    """
    path = CACHE_DIR / f"{name}-{_key(inputs, modules)}.pkl"
    if enabled and path.exists():
        with open(path, "rb") as f:
            return pickle.load(f)
    result = compute()
    CACHE_DIR.mkdir(exist_ok=True)
    for old in CACHE_DIR.glob(f"{name}-*.pkl"):
        old.unlink()
    with open(path, "wb") as f:
        pickle.dump(result, f, protocol=pickle.HIGHEST_PROTOCOL)
    return result


def region(name: str, inputs: Any, compute: Callable[[Path], Any], enabled: bool = True,
           stale_ok: bool = False) -> tuple[Any, Path, str] | None:
    """A whole region's result, the folder holding the files it wrote (compute(folder) writes them) and
    whether it was "built", "cached" or "stale". Rebuilt when its inputs or any atlas code change.

    stale_ok: never compute; take the stored result even if out of date (None if there is none)."""
    path = REGION_DIR / f"{name}-{_key(inputs, None)}"
    stored = path / "result.pkl"
    if stale_ok and not stored.exists():
        older = sorted(REGION_DIR.glob(f"{name}-*/result.pkl"), key=lambda p: p.stat().st_mtime)
        if not older:
            return None
        stored = older[-1]
    if (enabled or stale_ok) and stored.exists():
        with open(stored, "rb") as f:
            return pickle.load(f), stored.parent, "cached" if stored.parent == path else "stale"
    for old in REGION_DIR.glob(f"{name}-*"):
        shutil.rmtree(old)
    path.mkdir(parents=True)
    result = compute(path)
    with open(stored, "wb") as f:
        pickle.dump(result, f, protocol=pickle.HIGHEST_PROTOCOL)
    return result, path, "built"
