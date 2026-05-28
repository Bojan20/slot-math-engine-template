"""Deterministic ZIP packer.

Every entry is written with:
  • a single pinned `date_time` (default = epoch 1700000000 → 2023-11-14
    22:13:20 UTC) so the local DOS-time field of each ZipInfo is fixed
  • create_system = 3 (UNIX) so the platform-specific byte is fixed
  • compression = ZIP_DEFLATED at a single fixed level
  • external_attr = 0o644 << 16 (regular file, rw-r--r--)
  • a stable iteration order (sorted by arcname)

Result: the same `(arcname -> blob)` map produces the same bytes — and
therefore the same sha256 — on every machine, every run.
"""
from __future__ import annotations

import io
import time
import zipfile
from pathlib import Path
from typing import Iterable


def _epoch_to_zip_dt(epoch: int) -> tuple[int, int, int, int, int, int]:
    """ZipInfo.date_time uses a (Y,M,D,h,m,s) 6-tuple. Convert from epoch
    via gmtime so the same epoch picks the same wall-clock tuple in any
    timezone."""
    t = time.gmtime(epoch)
    # ZIP can't store years < 1980 — clamp.
    y = max(t.tm_year, 1980)
    return (y, t.tm_mon, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec)


def pack_bundle(
    files: dict[str, bytes],
    *,
    epoch: int,
    compression: int = zipfile.ZIP_DEFLATED,
    compresslevel: int = 6,
) -> bytes:
    """Pack a name -> blob map into deterministic ZIP bytes."""
    dt = _epoch_to_zip_dt(epoch)
    buf = io.BytesIO()
    # We open the ZipFile ourselves rather than using `write()` so we
    # can hand-roll every ZipInfo field that influences the final bytes.
    with zipfile.ZipFile(
        buf, mode="w", compression=compression, allowZip64=True,
    ) as zf:
        for arcname in sorted(files):
            blob = files[arcname]
            info = zipfile.ZipInfo(filename=arcname, date_time=dt)
            info.compress_type = compression
            info.external_attr = (0o644 << 16)
            info.create_system = 3   # UNIX
            # CRC and sizes are computed by writestr below.
            zf.writestr(info, blob, compresslevel=compresslevel)
    return buf.getvalue()


def write_bundle(out_path: Path, files: dict[str, bytes], *, epoch: int) -> bytes:
    """Pack + write to disk. Returns the bytes for sha256 / size logging."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    blob = pack_bundle(files, epoch=epoch)
    out_path.write_bytes(blob)
    return blob


def unpack_bundle(zip_bytes: bytes) -> dict[str, bytes]:
    """Inverse of `pack_bundle`, used by acceptance tests."""
    out: dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes), mode="r") as zf:
        for name in zf.namelist():
            out[name] = zf.read(name)
    return out
