"""On-disk memo for slow build stages, keyed by their inputs and the pipeline source code."""
from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / ".cache"
CODE_DIR = Path(__file__).resolve().parent


def _code_digest() -> str:
    h = hashlib.sha256()
    for path in sorted(CODE_DIR.glob("*.py")):
        h.update(path.read_bytes())
    return h.hexdigest()


def stage(name: str, inputs: Any, compute: Callable[[], Any], enabled: bool = True) -> Any:
    """Return compute()'s result, reusing a stored copy when the inputs and the atlas modules are unchanged."""
    key = hashlib.sha256((_code_digest() + json.dumps(inputs, sort_keys=True, default=str)).encode()).hexdigest()[:16]
    path = CACHE_DIR / f"{name}-{key}.pkl"
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
