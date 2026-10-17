"""Create PhoneCam's simple, original Windows icon."""

from pathlib import Path
from PIL import Image, ImageDraw

size = 1024
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((38, 38, 986, 986), radius=212, fill=(34, 148, 216, 255))
draw.rounded_rectangle((210, 300, 695, 700), radius=72, fill=(255, 255, 255, 255))
draw.polygon([(690, 414), (829, 333), (829, 671), (690, 590)], fill=(255, 255, 255, 255))
draw.ellipse((377, 440, 557, 620), fill=(34, 148, 216, 255))
path = Path(__file__).resolve().parent.parent / "assets" / "phonecam.ico"
path.parent.mkdir(parents=True, exist_ok=True)
image.save(path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(path)
