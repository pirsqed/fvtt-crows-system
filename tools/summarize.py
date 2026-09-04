import json, collections, sys
cards=json.load(open('out/cards_raw.json',encoding='utf-8'))
core=[c for c in cards if c['source']=='core']
print("== CORE cards ==")
for c in core:
    w=c['weapon'] and f"{c['weapon'].get('range')} | {c['weapon'].get('attack')} | {c['weapon'].get('tier2')} / {c['weapon'].get('tier3')}"
    ud=c['ud'] and f"UD{c['ud']['max']}{c['ud']['flags']}"
    extra=[]
    if c['qualities']: extra.append(str(c['qualities']))
    if c['armor_ad'] is not None: extra.append(f"AD{c['armor_ad']}")
    if c['magic_slot']: extra.append('slot:'+c['magic_slot'])
    if c['spell']: extra.append('spell:'+json.dumps(c['spell']))
    if c['tiers'] and not c['weapon']: extra.append('tiers:'+json.dumps(c['tiers']))
    if c['variants']: extra.append('var:'+','.join(f"{k}={v['price']}" for k,v in c['variants'].items()))
    print(f"p{c['page']:<2} {c['name'][:24]:<24} st{c['stack']:<2} sl{c['slots']} {str(c['price']):>5} {w or ''} {ud or ''} {' '.join(extra)}")
print("\n== missing price:", [c['name'] for c in core if c['price'] is None])
print("== duplicate names:", [n for n,k in collections.Counter(c['name'] for c in core).items() if k>1])
print("\n== POI cards ==")
for c in cards:
    if c['source']=='poi':
        print(f"p{c['page']} [{c['page_title']}] {c['name']} st{c['stack']} price={c['price']} q={c['qualities']} craft={(c['crafting'] or {}).get('raw')}")
prof=[c for c in cards if c['source']=='profession']
print("\n== profession pages ==")
byp=collections.defaultdict(list)
for c in prof: byp[(c['page'],c['page_title'])].append(c['name']+f"x{c['stack']}")
for k,v in sorted(byp.items()): print(k, v)
