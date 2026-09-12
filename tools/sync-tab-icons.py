from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
out = root / 'miniprogram/images/tab'
out.mkdir(parents=True, exist_ok=True)
for name in ['quadrant', 'timeblock', 'elder', 'capture', 'settings']:
    icon = Image.open(root / f'tidebalance/public/icons/{name}.png').convert('RGBA').resize((70,70), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (81,81))
    canvas.alpha_composite(icon, (5,5))
    for suffix in ['', '-on']:
        canvas.save(out / f'{name}{suffix}.png')
print('Synchronized 10 bundled Magnific tab icons.')
