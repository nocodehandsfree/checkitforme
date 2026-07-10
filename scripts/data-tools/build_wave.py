import csv, os, shutil
done=set()
try:
    done={int(x) for x in open("hobby_done_ids.txt").read().split(",") if x.strip()}
except: pass
US={'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR'}
rows=[r for r in csv.DictReader(open("hobby_nohours.csv"))
      if r["state"] in US and r["city"].strip() and r["phone"] and int(r["id"]) not in done]
rows.sort(key=lambda r:(r["state"],r["city"],r["name"]))
shutil.rmtree("hobbybatches",ignore_errors=True); os.makedirs("hobbybatches")
WAVE=14; PER=30
wave=rows[:WAVE*PER]
for b in range(WAVE):
    chunk=wave[b*PER:(b+1)*PER]
    with open(f"hobbybatches/hb{b}.txt","w") as f:
        for r in chunk: f.write(f'{r["id"]} | {r["name"]}, {r["address"]}, {r["city"]}, {r["state"]}\n')
print(f"done so far: {len(done)} | remaining: {len(rows)} | this wave: {len(wave)}, states: {sorted({r['state'] for r in wave})}")
