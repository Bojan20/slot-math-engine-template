"""SLOT-MATH Faza 2 — PAR → Game IR mapper.

Pure-copy transformation (no design, no inference). Every PAR field maps
to exactly one IR slot via 1:1 lookup tables; engine never invents data.

Pipeline:
    canonical PAR YAML  →  map()  →  game.ir.json
                              ↓
                       validate() gate
                              ↓
                  dispatcher() — pick W244 kernels
                              ↓
                  rng_bind() — jurisdiction → RNG
"""
from tools.par_to_ir.map import map_par_to_ir
from tools.par_to_ir.validate import validate_ir, IrValidationError
from tools.par_to_ir.dispatcher import dispatch_kernels
from tools.par_to_ir.rng_bind import bind_rng_profile

__all__ = [
    "map_par_to_ir",
    "validate_ir",
    "IrValidationError",
    "dispatch_kernels",
    "bind_rng_profile",
]
