"""Pipeline stage modules — Make.com replacements."""

from stages import r2, r3, r4, r5, rr1, smv1
from stages.registry import STAGE_NAMES, get_handler, is_implemented

__all__ = ["STAGE_NAMES", "get_handler", "is_implemented", "r2", "r3", "r4", "r5", "rr1", "smv1"]
