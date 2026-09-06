"""Validate compiled monster stats and compile target names from game strings.

Usage: python scripts/compile-monster-names.py EXTRACTED_DIRECTORY
Output: EXTRACTED_DIRECTORY/MonsterNames.json. No third-party dependencies.
"""
import argparse
import csv
import json
import re
import struct
from pathlib import Path


def read_strings(path):
    data = path.read_bytes()
    count, hash_size = struct.unpack_from('<HI', data, 2)
    result = {}
    for slot in range(hash_size):
        active, _, _, key_offset, value_offset, _ = struct.unpack_from(
            '<BHIIIH', data, 21 + count * 2 + slot * 17)
        if not active:
            continue
        key = data[key_offset:data.index(b'\0', key_offset)].decode('cp1252')
        raw = data[value_offset:data.index(b'\0', value_offset)]
        try:
            value = raw.decode('utf8')
        except UnicodeDecodeError:
            value = raw.decode('cp1252')
        result[key] = re.sub('\u00ffc.', '', value).strip()
    return result


def compile_names(directory):
    validate_monster_stats(directory)
    strings = {}
    for filename in ['string.tbl', 'expansionstring.tbl', 'patchstring.tbl']:
        strings.update(read_strings(directory / filename))
    keys = set()
    for table, column in [('MonStats', 'NameStr'), ('SuperUniques', 'Name'), ('Levels', 'LevelName')]:
        with (directory / f'{table}.txt').open(encoding='utf-8-sig', newline='') as source:
            keys.update(row[column] for row in csv.DictReader(source, delimiter='\t') if row[column])
    names = {key: strings.get(key, key) for key in sorted(keys)}
    (directory / 'MonsterNames.json').write_text(json.dumps(names, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def validate_monster_stats(directory):
    # D2MonStatsTxt layout and field linker:
    # https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Common/src/DataTbls/MonsterTbls.cpp
    binary = (directory / 'MonStats.bin').read_bytes()
    with (directory / 'MonStats.txt').open(encoding='utf-8-sig', newline='') as source:
        rows = [row for row in csv.DictReader(source, delimiter='\t') if row['Id'] and row['Id'] != 'Expansion']
    count = struct.unpack_from('<I', binary)[0]
    if count != len(rows) or len(binary) != 4 + count * 424:
        raise ValueError('MonStats text/binary row count or binary layout differs; review the game version before importing.')
    columns = {'ResDm': 324, 'ResMa': 330, 'ResFi': 336, 'ResLi': 342, 'ResCo': 348,
               'ResPo': 354, 'A1MinD': 218, 'A1MaxD': 224, 'A2MinD': 230, 'A2MaxD': 236}
    for index, row in enumerate(rows):
        for column, offset in columns.items():
            for difficulty, suffix in enumerate(['', '(N)', '(H)']):
                value = struct.unpack_from('<H', binary, 4 + index * 424 + offset + difficulty * 2)[0]
                if value != (int(row[column + suffix] or 0) & 65535):
                    raise ValueError(f'Compiled monster data differs: {row["Id"]} {column}{suffix}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    compile_names(parser.parse_args().directory)
