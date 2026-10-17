import json, sys
B=json.load(open(sys.argv[1])); CUTOFF=sys.argv[2]
canon=[b for b in B if b['month'][:4]==b['sheet'] and b['month']<=CUTOFF]
alt=[b for b in B if b['month'][:4]!=b['sheet']]
print('canonical months:', len(canon), canon[0]['month'], '→', canon[-1]['month'], '| set aside:', len(alt))
issues=[]
prev=None
for b in canon:
    for c in b['classes']:
        calc=(c['bf'] or 0)+(c['births'] or 0)+(c['grade_in'] or 0)+(c['purchased'] or 0)-(c['deaths'] or 0)-(c['grade_out'] or 0)-(c['sold'] or 0)
        if c['closing'] is None: issues.append((b['month'],c['class'],'closing blank', f"computed {calc:g}"))
        elif abs(calc-c['closing'])>0.01: issues.append((b['month'],c['class'],'arithmetic', f"B/F {c['bf']:g} + in {c['births']+c['grade_in']+c['purchased']:g} − out {c['deaths']+c['grade_out']+c['sold']:g} = {calc:g}, sheet says {c['closing']:g}"))
    if prev:
        pc={c['class']:c for c in prev['classes']}
        for c in b['classes']:
            p=pc.get(c['class'])
            if p and p['closing'] is not None and abs((c['bf'] or 0)-p['closing'])>0.01:
                issues.append((b['month'],c['class'],'carry-forward', f"B/F {c['bf']:g} but {prev['month']} closed at {p['closing']:g}"))
    gi=sum(c['grade_in'] or 0 for c in b['classes']); go=sum(c['grade_out'] or 0 for c in b['classes'])
    if abs(gi-go)>0.01: issues.append((b['month'],'(all classes)','grading', f"graded in {gi:g} but graded out {go:g}"))
    prev=b
from collections import Counter
print('issues:', len(issues), Counter(i[2] for i in issues))
for i in issues: print(' ', *i)
json.dump(issues, open(sys.argv[3],'w'))
