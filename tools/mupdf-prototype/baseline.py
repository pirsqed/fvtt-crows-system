"""Developer-only oracle using the existing parsers; never used by the browser."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract_cards as cards
import extract_traits as traits
import fitz

cases = []
def font_summary(page):
    spans=[s for b in page.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']]
    return dict(bold=sum(len(''.join(s['text'].split())) for s in spans if s['flags'] & 16),italic=sum(len(''.join(s['text'].split())) for s in spans if s['flags'] & 2))
for source, path in cards.SOURCES.items():
    with fitz.open(path) as doc:
        for index, page in enumerate(doc):
            cols = cards.detect_columns(page)
            records = []
            for ci, col in enumerate(cols):
                for lines in cards.split_cards(cards.group_lines(cards.spans_in(page, col))):
                    records.append(dict(column=ci, raw_lines=[cards.norm(l['text']) for l in lines]))
            if records:
                cases.append(dict(file=str(path), page=index+1, kind='cards', expected=dict(columns=[list(c) for c in cols], records=records, fontSummary=font_summary(page))))
with fitz.open(traits.BOOK) as doc:
    for index, page in enumerate(doc):
        if 'XP Cost' not in page.get_text():
            continue
        boxes=traits.page_boxes(page)
        segments=traits.page_connectors(page)
        groups=sorted([sorted(g) for g in traits.connected_groups(segments,boxes)], key=lambda g:(g[0],len(g)))
        records=[dict(zip(['name','cost','starting','desc'],traits.box_text(page,b))) for b in boxes]
        cases.append(dict(file=str(traits.BOOK),page=index+1,kind='traits',expected=dict(boxes=[list(b) for b in boxes],segments=[[list(a),list(b)] for a,b in segments],groups=groups,records=records,fontSummary=font_summary(page))))
output=Path(__file__).resolve().parents[1]/'out'/'mupdf-prototype'
output.mkdir(parents=True,exist_ok=True)
(output/'baseline.json').write_text(json.dumps(cases,ensure_ascii=False),encoding='utf-8')
print(f'Wrote {len(cases)} page cases; PyMuPDF {fitz.VersionBind}')
