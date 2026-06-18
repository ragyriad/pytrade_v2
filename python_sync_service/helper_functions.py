import random
import string
import json
import os
import math
from typing import Any


# ── Primitive anonymisers ─────────────────────────────────────────────────────

def _anonymise_str(value: str) -> str:
    """
    Replace every character with a random character of the same class:
      - letters  → random letter (case preserved)
      - digits   → random digit
      - anything else (punctuation, whitespace, etc.) → kept as-is
        so that patterns like emails/phones stay recognisable in shape.
    """
    result = []
    for ch in value:
        if ch.isupper():
            result.append(random.choice(string.ascii_uppercase))
        elif ch.islower():
            result.append(random.choice(string.ascii_lowercase))
        elif ch.isdigit():
            result.append(random.choice(string.digits))
        else:
            result.append(ch)          # preserve separators: @ . - _ space …
    return "".join(result)


def _anonymise_int(value: int) -> int:
    """
    Return a random integer with the same number of digits.
    Preserves sign; single-digit 0 stays 0.
    """
    if value == 0:
        return 0
    negative = value < 0
    digits = len(str(abs(value)))                       # count digits
    low  = 10 ** (digits - 1) if digits > 1 else 0     # e.g. 100 for 3-digit
    high = (10 ** digits) - 1                           # e.g. 999 for 3-digit
    result = random.randint(low, high)
    return -result if negative else result


def _anonymise_float(value: float) -> float:
    """
    Return a random float with the same number of decimal places and
    the same order of magnitude.
    """
    if math.isnan(value) or math.isinf(value):
        return value                                    # keep special values
    negative = value < 0
    abs_val  = abs(value)
    str_val  = f"{abs_val}"                             # e.g. "3.14"
    if "." in str_val:
        decimal_places = len(str_val.split(".")[1])
    else:
        decimal_places = 0
    integer_digits = len(str(int(abs_val))) if abs_val >= 1 else 1
    high   = 10 ** integer_digits
    result = round(random.uniform(0, high), decimal_places)
    return -result if negative else result


def _anonymise_bool(_: bool) -> bool:
    return random.choice([True, False])


# ── Core recursive anonymiser ─────────────────────────────────────────────────

def _anonymise_value(value: Any) -> Any:
    """Dispatch to the correct anonymiser based on runtime type."""
    if value is None:
        return None
    if isinstance(value, bool):          # ← must come before int (bool is int)
        return _anonymise_bool(value)
    if isinstance(value, int):
        return _anonymise_int(value)
    if isinstance(value, float):
        return _anonymise_float(value)
    if isinstance(value, str):
        return _anonymise_str(value)
    if isinstance(value, dict):
        return _anonymise_dict(value)
    if isinstance(value, list):
        return _anonymise_list(value)
    if isinstance(value, tuple):
        return tuple(_anonymise_value(v) for v in value)
    if isinstance(value, set):
        return {_anonymise_value(v) for v in value}
    # Fallback: return type name so nothing is silently swallowed
    return f"<unsupported:{type(value).__name__}>"


def _anonymise_dict(data: dict) -> dict:
    """Anonymise every value in a dict; keys are intentionally preserved."""
    return {key: _anonymise_value(val) for key, val in data.items()}


def _anonymise_list(data: list) -> list:
    """Anonymise every element in a list."""
    return [_anonymise_value(item) for item in data]


# ── Public API ────────────────────────────────────────────────────────────────

def anonymise(data: list) -> list:
    """
    Anonymise a list of arbitrary data.

    Rules
    -----
    - str   → same-length string, character class preserved (letter/digit/symbol)
    - int   → same digit count, sign preserved
    - float → same decimal places and order of magnitude, sign preserved
    - bool  → random True / False
    - None  → None  (no information to anonymise)
    - dict  → recursed; keys kept, values anonymised
    - list  → recursed
    - tuple → recursed (returned as tuple)
    - set   → recursed (returned as set)

    Parameters
    ----------
    data : list
        The source list. Can contain any mix of the types above, nested
        to any depth.

    Returns
    -------
    list
        A new list with all primitive values replaced. The original is
        never mutated.
    """
    if not isinstance(data, list):
        raise TypeError(f"Expected a list, got {type(data).__name__}.")
    return _anonymise_list(data)


def save_list_to_json(data: list, filename: str, directory: str = "") -> str:
    """
    Saves a list to a JSON file inside a 'data' folder located in the same
    directory as the running script.
 
    Args:
        data      : The list to save (will be converted to JSON if needed).
        filename  : Desired filename, with or without the '.json' extension.
        directory : Optional subdirectory inside 'data/' (e.g. "reports/2024").
                    Leave empty to save directly into 'data/'.
 
    Returns:
        The full path to the file that was written.
    """
    # ── Validate input ────────────────────────────────────────────────────────
    if not isinstance(data, list):
        raise TypeError(f"Expected a list, got {type(data).__name__}.")
 
    # ── Build the target folder ───────────────────────────────────────────────
    # Root is the directory that contains the script calling this function.
    script_root = os.path.dirname(os.path.abspath(__file__))
    target_folder = os.path.join(script_root, "data", directory)
    os.makedirs(target_folder, exist_ok=True)
 
    # ── Normalise the filename ────────────────────────────────────────────────
    if not filename.endswith(".json"):
        filename += ".json"
 
    # ── ✨ AUTO-INCREMENT LOGIC ───────────────────────────────────────────────
    # If a file with the requested name already exists we append an incrementing
    # counter (_1, _2, _3 …) to the stem until we find a free slot.
    #
    #   data/results.json        ← first save
    #   data/results_1.json      ← second save (original still intact)
    #   data/results_2.json      ← third save
    #
    base_name, ext = os.path.splitext(filename)   # e.g. ("results", ".json")
    candidate = os.path.join(target_folder, filename)
 
    counter = 1
    while os.path.exists(candidate):              # keep trying until name is free
        candidate = os.path.join(
            target_folder, f"{base_name}_{counter}{ext}"
        )
        counter += 1
    # ── END AUTO-INCREMENT LOGIC ─────────────────────────────────────────────
 
    # ── Serialise & write ─────────────────────────────────────────────────────
    with open(candidate, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
 
    print(f"[save_list_to_json] Saved → {candidate}")
    return candidate
