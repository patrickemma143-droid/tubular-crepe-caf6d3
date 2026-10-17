import openpyxl, datetime, json, sys, re
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
COLS = {'bf':2,'unit_bf':3,'births':5,'grade_in':6,'purchased':7,'deaths':9,'grade_out':10,'sold':11,'closing':13,'unit_value':14,'remarks':17}
def num(v):
    if v is None or v == '': return 0
    if isinstance(v,(int,float)): return v
    try: return float(str(v).replace(',','').strip())
    except: return None
blocks=[]
for ws in wb.worksheets:
    rows=list(ws.iter_rows(values_only=True))
    i=0
    while i < len(rows):
        r=rows[i]
        if isinstance(r[1], datetime.datetime):
            month=r[1].strftime('%Y-%m'); classes=[]; total=None; j=i+1
            while j < len(rows) and j < i+20:
                rr=rows[j]
                name=(str(rr[1]).strip() if rr[1] else '')
                if name.lower()=='total': total={k:num(rr[c]) for k,c in COLS.items() if k not in('remarks',)}; break
                if rr[0] is not None and re.match(r'^\d+$', str(rr[0]).strip()) and name:
                    d={k:(rr[c] if k=='remarks' else num(rr[c])) for k,c in COLS.items()}
                    d['class']=name; classes.append(d)
                j+=1
            blocks.append({'sheet':ws.title,'month':month,'row':i+1,'classes':classes,'total':total})
            i=j
        i+=1
json.dump(blocks, open(sys.argv[2],'w'), default=str, indent=0)
print(len(blocks),'blocks')
from collections import Counter
print(Counter(c['class'] for b in blocks for c in b['classes']))
print(Counter(b['sheet'] for b in blocks))
print('months:', blocks[0]['month'], '...', blocks[-1]['month'])
bad=[b for b in blocks if b['month'][:4]!=b['sheet']]
print('month/sheet mismatch:', [(b['sheet'],b['month'],b['row']) for b in bad])
