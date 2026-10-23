"""Generate the small combat catalog from an extracted PD2 install (no game modifications)."""
import argparse
import csv
import json
import re
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--extract", type=Path, required=True)
parser.add_argument("--d2common", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()

# AnimData consists of 256 buckets: uint32 count, then 160-byte records.
blob = (args.extract / "AnimData.d2").read_bytes()
position = 0
animations = {}
tokens = {"AM", "SO", "NE", "PA", "BA", "DZ", "AI", "40", "TG"}
modes = {"A1", "A2", "SC", "TH", "KK", "S1", "S2", "S3", "S4", "NU"}
for _ in range(256):
    count, = struct.unpack_from("<I", blob, position)
    position += 4
    for _ in range(count):
        key = blob[position:position + 8].split(b"\0")[0].decode("ascii")
        if key[:2] in tokens and key[2:4] in modes:
            frames, speed = struct.unpack_from("<II", blob, position + 8)
            animations[key] = {"frames": frames, "speed": speed, "events": [i for i, event in enumerate(blob[position + 16:position + 160]) if 1 <= event <= 4]}
        position += 160
assert position == len(blob)

# Stock 1.13c D2Common's sequence table; each weapon-class entry is three uint32s.
blob = args.d2common.read_bytes()
pe, = struct.unpack_from("<I", blob, 60)
section_count, = struct.unpack_from("<H", blob, pe + 6)
optional_size, = struct.unpack_from("<H", blob, pe + 20)
base, = struct.unpack_from("<I", blob, pe + 52)
sections = [struct.unpack_from("<8sIIII", blob, pe + 24 + optional_size + i * 40) for i in range(section_count)]
def file_offset(address):
    rva = address - base
    for _, virtual_size, virtual_address, raw_size, raw_offset in sections:
        if virtual_address <= rva < virtual_address + max(virtual_size, raw_size):
            return raw_offset + rva - virtual_address
    raise ValueError(f"Unmapped address {address:#x}; expected 1.13c D2Common")
weapon_classes = ["hth", "1ht", "2ht", "1hs", "2hs", "bow", "xbw", "stf", "1js", "1jt", "1ss", "1st", "ht1", "ht2"]
sequences = {}
for number in range(1, 24):
    pointer, = struct.unpack_from("<I", blob, file_offset(0x6FDECF40) + number * 4)
    start = file_offset(pointer)
    sequences[str(number)] = {weapon: struct.unpack_from("<I", blob, start + i * 12 + 4)[0] for i, weapon in enumerate(weapon_classes)}
assert sequences["11"]["hth"] == 17 and sequences["16"]["ht2"] == 16

# TBL hash entries contain offsets to null-terminated keys and display values.
def read_strings(filename):
    data = filename.read_bytes()
    elements, slots = struct.unpack_from("<HI", data, 2)
    start = 21 + elements * 2
    values = {}
    for i in range(slots):
        active, _, _, key_offset, value_offset, length = struct.unpack_from("<BHIIIH", data, start + i * 17)
        if not active:
            continue
        key = data[key_offset:data.index(b"\0", key_offset)].decode("ascii")
        value = data[value_offset:value_offset + length].rstrip(b"\0")
        try:
            text = value.decode("utf-8")
        except UnicodeDecodeError:
            text = value.decode("cp1252")
        values[key] = re.sub(r"(?:ÿ|Ã¿)c[0-9a-z]", "", text, flags=re.I)
    return values
strings = {}
for filename in ["string.tbl", "expansionstring.tbl", "patchstring.tbl"]:
    strings.update(read_strings(args.extract / filename))
keys = set()
for filename, column in [("MonStats.txt", "NameStr"), ("Levels.txt", "LevelName"), ("SuperUniques.txt", "Name")]:
    with (args.extract / filename).open(encoding="utf-8", newline="") as file:
        keys.update(row[column] for row in csv.DictReader(file, delimiter="\t") if row.get(column))
args.output.mkdir(parents=True, exist_ok=True)
(args.output / "CombatAnimations.json").write_text(json.dumps({"animations": animations, "sequences": sequences}, separators=(",", ":")) + "\n", encoding="utf-8")
(args.output / "TargetNames.json").write_text(json.dumps({key: strings[key] for key in sorted(keys) if key in strings}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Generated {len(animations)} animations and {len(sequences)} sequences")
