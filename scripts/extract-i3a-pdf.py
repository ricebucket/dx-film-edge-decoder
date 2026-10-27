#!/usr/bin/env python3
"""Transcribe the I3A "DX Codes for 135-Size Film" list (February 2008) to CSV.

Input: a copy of the PDF, as linked from
https://aurelien.lawley.com.au/posts/decoding_35mm_dx_film_edge_barcodes/
(file /pdf/I3A_DX_codes.pdf); the document is also viewable on Yumpu:
https://www.yumpu.com/it/document/view/3454560/
The copy used (SHA-256 ed4a1acb0db40dc77a45781dcdddf8309189cec54957bb8ed03fd35968b04ede)
is archived at
https://web.archive.org/web/20221222115315/https://aurelien.lawley.com.au/pdf/I3A_DX_codes.pdf

This script documents exactly how data/i3a-2008/*.csv were produced. It reads
the PDF's text layer with word coordinates (PyMuPDF), which keeps wrapped
product names and the two-column Part 1 table intact, and cross-checks the
Part 1 table against the PDF's own "Assignment Summary" page.

Usage:
    pip install pymupdf
    python3 scripts/extract-i3a-pdf.py I3A_DX_codes.pdf data/i3a-2008
"""
import csv
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

PAGE_HEADER_Y, PAGE_FOOTER_Y = 50, 730


def visual_lines(page):
    """Group a page's words into visual lines: {y: [(x, word), ...]}."""
    lines = {}
    for x0, y0, _x1, _y1, word, *_ in page.get_text('words'):
        y = round(y0)
        key = next((k for k in lines if abs(k - y) <= 2), y)
        lines.setdefault(key, []).append((x0, word))
    return {y: sorted(ws) for y, ws in sorted(lines.items()) if PAGE_HEADER_Y < y < PAGE_FOOTER_Y}


def parse_part1_table(doc):
    """Pages titled "DX Part 1 Number Assignment": two number/assignee column pairs."""
    # The contents page repeats the section titles, so also require the table header.
    first = next(i for i, p in enumerate(doc)
                 if 'DX Part 1 Number Assignment' in p.get_text() and 'Assignee' in p.get_text())
    entries: dict[int, dict] = {}
    last: dict[str, dict | None] = {'left': None, 'right': None}
    for pno in range(first, len(doc)):
        for _y, words in visual_lines(doc[pno]).items():
            line = ' '.join(w for _, w in words)
            if line.startswith('NOTE'):  # end of the table
                return [entries[n] for n in sorted(entries)]
            if line.startswith('DX Part 1'):  # page title
                continue
            for half in ('left', 'right'):
                ws = [w for x, w in words if (x < 315) == (half == 'left')]
                if not ws or ws[0] in ('Part', 'Number', 'Assignee'):
                    continue
                if re.fullmatch(r'\d{1,3}', ws[0]):
                    aps = ws[1:3] == ['(APS', 'Film)']
                    name = ' '.join(ws[3:] if aps else ws[1:])
                    last[half] = entries[int(ws[0])] = {'part1': int(ws[0]), 'assignee': name, 'aps': aps}
                elif (entry := last[half]) is not None:  # assignee name wrapped onto the next line
                    entry['assignee'] = f"{entry['assignee']} {' '.join(ws)}"
    raise ValueError('end of the Part 1 table (NOTE) not found')


def parse_history(doc):
    """The NOTE under the Part 1 table: numbers that were assigned in the past."""
    text = ' '.join(page.get_text() for page in doc)
    match = re.search(r'NOTE - Five of the present unassigned.*?(?=February 2008|$)', text, re.S)
    if match is None:
        raise ValueError('history NOTE under the Part 1 table not found')
    note = re.sub(r'\s+', ' ', match.group(0)).strip()
    numbers = r'(?:\d{1,3},\s*)*\d{1,3}'
    history = {}
    for nums, what in re.findall(rf'({numbers})\s+(Assigned to .*?)(?=\s+{numbers}\s+Assigned to|$)', note):
        for n in re.findall(r'\d+', nums):
            history[int(n)] = what.strip().rstrip(';.') + '.'
    return history


def parse_summary(doc):
    """Page "DX Part 1 Assignment Summary": assignee -> set of Part 1 numbers."""
    page = next(p for p in doc if 'DX Part 1 Assignment Summary' in p.get_text() and 'Total' in p.get_text())
    summary, current = {}, None
    for _y, words in visual_lines(page).items():
        name = ' '.join(w for x, w in words if x < 230)
        nums = ' '.join(w for x, w in words if 230 <= x < 460)
        if name in ('Asignee', 'Assignee') or 'Summary' in nums:  # column header, page title
            continue
        if name:
            current = summary.setdefault(name, set())
        if current is not None:
            current.update(int(n) for n in re.findall(r'\d+', nums))
    return summary


def parse_products(doc):
    """Pages titled "DX Numbers - <company>": Part 1 | Part 2 | Product Name."""
    rows, company, status, last = [], None, None, None
    for pno, page in enumerate(doc, start=1):
        for _y, words in visual_lines(page).items():
            text = ' '.join(w for _, w in words)
            m = re.match(r'DX Numbers\s*[-–]\s*(.+)$', text)
            if m:
                company, status, last = m.group(1).strip(), 'in-use', None
                continue
            if company is None:
                continue
            if re.match(r'A\.\s+DX numbers that are currently', text):
                status = 'in-use'
                continue
            if re.match(r'B\.\s+The following list', text):
                status, last = 'discontinued', None
                continue
            c1 = ' '.join(w for x, w in words if x < 160)
            c2 = ' '.join(w for x, w in words if 160 <= x < 225)
            c3 = ' '.join(w for x, w in words if x >= 225)
            if re.fullmatch(r'\d{1,3}', c1) and re.fullmatch(r'\d{1,2}|\*', c2) and c3:
                last = {'part1': int(c1), 'part2': '' if c2 == '*' else int(c2), 'product': c3,
                        'sensitizer': company, 'status': status, 'page': pno}
                assert last['part1'] <= 127 and (last['part2'] == '' or last['part2'] <= 15), text
                rows.append(last)
            elif c3 and not c1 and not c2 and last is not None and last['page'] == pno \
                    and not c3.startswith(('Product Name', 'Number')):
                last['product'] = f"{last['product']} {c3}"  # wrapped product name
    for r in rows:
        r['product'] = re.sub(r'\s+', ' ', r['product']).strip()
    return rows


def parse_augmented(doc):
    """Kodak's note on augmented magazine (cassette) bar code numbers, ISO 1007 Annex A.4."""
    text = '\n'.join(page.get_text() for page in doc)
    out = []
    for codes, product in re.findall(r'Magazine Bar Code Nos?\.\s*\n\s*([\d ]+(?:and [\d ]+)?)\s*\n\s*([^\n]+)', text):
        for code in re.findall(r'\d{6}', codes):
            out.append({'cassette_code': code, 'product': product.strip(), 'sensitizer': 'Eastman Kodak Company'})
    return out


def write_csv(path, rows, fields):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, '') for k in fields})


def main(pdf_path, out_dir):
    doc = fitz.open(pdf_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    table = parse_part1_table(doc)
    assert [e['part1'] for e in table] == list(range(128)), 'Part 1 table must list 0..127'
    history = parse_history(doc)
    for e in table:
        e['aps'] = 'yes' if e['aps'] else ''
        e['previously'] = history.get(e['part1'], '')

    # Cross-check against the summary page (its assignee labels are abbreviated).
    summary = parse_summary(doc)
    by_label = {}
    for e in table:
        if e['assignee']:
            by_label.setdefault(e['assignee'], set()).add(e['part1'])
    aliases = {'ERA': 'ERA Photo', 'SVEMA Production Assoc.': 'SVEMA Production'}
    summary = {aliases.get(label, label): numbers for label, numbers in summary.items()}
    assert set(summary) == set(by_label), f'assignees differ: {set(summary) ^ set(by_label)}'
    for label, numbers in summary.items():
        assert by_label[label] == numbers, f'summary mismatch for {label}'
    print(f'Part 1 table: {sum(1 for e in table if e["assignee"])} assigned numbers, '
          f'matches summary for {len(summary)} assignees', file=sys.stderr)

    products = parse_products(doc)
    print(f'Products: {len(products)} rows', file=sys.stderr)
    augmented = parse_augmented(doc)
    print(f'Augmented cassette codes: {len(augmented)}', file=sys.stderr)

    write_csv(out / 'part1-assignments.csv', table, ['part1', 'assignee', 'aps', 'previously'])
    write_csv(out / 'products.csv', products, ['part1', 'part2', 'product', 'sensitizer', 'status', 'page'])
    write_csv(out / 'augmented-cassette-codes.csv', augmented, ['cassette_code', 'product', 'sensitizer'])


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
