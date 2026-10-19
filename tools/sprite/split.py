import sys, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
for i in range(1,5):
    Image.open(f"{src}/{i}.jpg").convert("RGB").save(f"{out}/s{i}.png")
g = Image.open(f"{src}/5.jpg").convert("RGB")
boxes = {"g1":(0,0,523,510),"g2":(523,0,1024,510),"g3":(0,510,536,1024),"g4":(536,510,1024,1024)}
for k,b in boxes.items(): g.crop(b).save(f"{out}/{k}.png")
