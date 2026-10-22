"""Compare an extracted MonStats.txt with its shipped MonStats.bin.

Layout: https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Common/include/DataTbls/MonsterTbls.h#L322
Run against the fresh output directory from extract-combat-data.ps1.
"""
import argparse
import csv
import struct
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("extract", type=Path)
args = parser.parse_args()
with (args.extract / "MonStats.txt").open(encoding="utf-8-sig", newline="") as source:
    rows = [row for row in csv.DictReader(source, delimiter="\t")
            if row["Id"] and row["Id"] != "Expansion"]
binary = (args.extract / "MonStats.bin").read_bytes()
count, = struct.unpack_from("<I", binary)
if count != len(rows) or len(binary) != 4 + count * 424:
    raise ValueError("Unexpected record count or MonStats.bin layout")

fields = {name: (0x144 + index * 6, 2) for index, name in
          enumerate(["ResDm", "ResMa", "ResFi", "ResLi", "ResCo", "ResPo"])}
fields.update({name: (offset, 2) for name, offset in [
    ("Level", 0xAA), ("MinHP", 0xB0), ("MaxHP", 0xB6), ("AC", 0xBC),
    ("A1MinD", 0xDA), ("A1MaxD", 0xE0), ("A2MinD", 0xE6), ("A2MaxD", 0xEC),
]})
fields["ToBlock"] = (0xA3, 1)
checked = 0
for index, row in enumerate(rows):
    for name, (offset, width) in fields.items():
        for difficulty, suffix in enumerate(["", "(N)", "(H)"]):
            column = name + suffix
            if difficulty == 0 and name in ["MinHP", "MaxHP"]:
                column = name[0].lower() + name[1:]
            expected = int(row.get(column) or 0) % (2 ** (width * 8))
            start = 4 + index * 424 + offset + difficulty * width
            actual = int.from_bytes(binary[start:start + width], "little")
            if actual != expected:
                raise ValueError(f"{row['Id']} {column}: text {expected}, binary {actual}")
            checked += 1
print(f"Verified {checked} values across {count} compiled monster records.")
