"""Encode an avatar received on stdin. Requires Pillow; emits only the data URL."""
import base64
import io
import sys
from PIL import Image, ImageOps

source = sys.stdin.read()
image = Image.open(io.BytesIO(base64.b64decode(source.split(",", 1)[1])))
image = ImageOps.exif_transpose(image).convert("RGBA")
image.thumbnail((256, 256), Image.Resampling.LANCZOS)
output = io.BytesIO()
image.save(output, format="WEBP", quality=78, method=6)
print("data:image/webp;base64," + base64.b64encode(output.getvalue()).decode("ascii"))
